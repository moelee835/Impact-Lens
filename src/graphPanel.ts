import * as vscode from 'vscode';
import {
  CANDIDATE_LABEL_TEXT,
  resolveCandidateEdgeEndpoints,
  resolveSyntheticNode,
} from './candidateGraphResolution';
import {
  calculateFitZoom,
  calculateGraphLayout,
  calculateViewportSurface,
  DEFAULT_GRAPH_LAYOUT,
  shouldRestoreViewport,
} from './graphLayout';
import {
  completenessInput,
  headerSegments,
  providerLabel,
  stateBadge,
  summarizeCompleteness,
} from './completeness';
import { ImpactResult } from './types';
// M4 gate 2 UI lane (docs/work/task-m4-gate2-shared-adapter.md). `AugmentedEdge` (and everything inside
// it - `AugmentedEndpoint`, `SourceRange`) is already plain, JSON-safe data (strings/numbers only, no
// `vscode.Uri`/`vscode.Range`) - unlike `ImpactNode`/`ImpactEdge` above, it needs NO conversion before
// `JSON.stringify(payload)` below, so `toPayload()` passes `result.augmentedEdges` straight through.
// Type-only import (erased at compile time, no require() emitted).
import type { AugmentedEdge } from '../cli/dist/types';

interface GraphPayload {
  readonly rootId: string;
  readonly rootName: string;
  readonly state: {
    readonly label: string;
    readonly className: string;
  };
  // Coverage used to arrive here as three bare strings, which meant the webview could not draw anything
  // the Extension had not already decided. advertised, observed, lifecycle and the reason codes now reach
  // the panel, which is the surface that has room for them.
  readonly provider: {
    readonly host: string;
    readonly name: string;
    readonly version?: string;
    readonly selectedBy: string;
    readonly languageMatch: boolean | 'unknown';
    readonly requestedLanguageId: string;
    readonly detectedLanguageId: string;
    readonly callHierarchy: boolean;
    readonly diagnostics: boolean;
    readonly advertised: {
      readonly callHierarchy: boolean | 'unknown';
      readonly diagnostics: boolean | 'unknown';
    };
    readonly observed: {
      readonly prepareCallHierarchy: boolean;
      readonly incomingCalls: boolean;
      readonly diagnostics: boolean;
    };
    readonly lifecycle: {
      readonly stage: string;
      readonly status: string;
    };
  };
  readonly coverage: {
    readonly traversal: {
      readonly status: string;
      readonly requestedDepth: number;
      readonly reachedDepth: number;
      readonly maxNodes: number;
    };
    readonly semantic: {
      readonly status: string;
      readonly evidenceSources: readonly string[];
    };
    readonly indexing: { readonly status: string };
    readonly reasons: readonly string[];
  };
  readonly completeness: {
    readonly outcome: string;
    readonly severity: string;
    readonly headline: string;
    readonly action?: string;
    readonly bounded: boolean;
    readonly callerCount: number;
    /** Result count, traversal, semantic scope, action - in that order. */
    readonly segments: readonly string[];
    readonly providerLabel: string;
  };
  readonly detailLevel: string;
  readonly changedAt?: number;
  readonly canGoBack: boolean;
  readonly delta: {
    addedNodeIds: readonly string[];
    removedNodeIds: readonly string[];
    addedEdgeCount: number;
    removedEdgeCount: number;
    addedDiagnosticCount: number;
  };
  readonly nodes: readonly {
    id: string;
    name: string;
    note: string;
    noteSource?: string;
    depth: number;
    relation: string;
    path: string;
    line: number;
    changed: boolean;
    reviewed: boolean;
    testFreshness?: string;
    diagnostics: readonly { severity: string; message: string; line: number }[];
  }[];
  readonly edges: readonly { source: string; target: string }[];
  /** Candidate callers a static Call Hierarchy cannot see on its own - never merged into `edges` above
   * (M4 stage 1's rollback contract, `ImpactResult.augmentedEdges`'s own doc comment). Passed through
   * unconverted (see the `AugmentedEdge` import's own comment). Empty array, not omitted, when
   * augmentation is off or found nothing - the client script's own "any candidates at all?" checks read
   * `.length`, never `in`/`?.`. */
  readonly augmentedEdges: readonly AugmentedEdge[];
  /** `ImpactResult.limitations` (static-coverage reasons AND augmentation limitations, appended - see
   * that field's own doc comment for why they share one array without being merged in meaning). Passed
   * through raw, unlike `coverage`/`completeness` above which are pre-summarized by `completeness.ts` -
   * augmentation-sourced codes have no summarizer of their own yet, so the client renders the augmentation
   * subset directly (`AUGMENTATION_LIMITATION_CODES` in the client script below). */
  readonly limitations: readonly string[];
}

export class GraphPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private result: ImpactResult | undefined;
  private messageSubscription: vscode.Disposable | undefined;

  constructor(
    private readonly onOpenNode: (nodeId: string, result: ImpactResult) => Promise<void>,
    private readonly onEditRootNote: (result: ImpactResult) => Promise<void>,
    private readonly onToggleReviewed: (nodeId: string, result: ImpactResult) => Promise<void>,
    private readonly onClearLiveChanges: () => void,
    private readonly onSetRoot: (nodeId: string, result: ImpactResult) => Promise<void>,
    private readonly onBackRoot: () => Promise<void>,
    private readonly onSetAnalysisDepth: (depth: number) => Promise<void>,
    private readonly canGoBack: () => boolean,
  ) {}

  show(result: ImpactResult): void {
    this.result = result;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'impactLens.graph',
        'Impact Lens Call Graph',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.messageSubscription?.dispose();
        this.messageSubscription = undefined;
        this.panel = undefined;
      });
      this.messageSubscription = this.panel.webview.onDidReceiveMessage(async message => {
        const current = this.result;
        if (!current || !message || typeof message.type !== 'string') {
          return;
        }
        if (message.type === 'open' && typeof message.id === 'string') {
          await this.onOpenNode(message.id, current);
        } else if (message.type === 'editRootNote') {
          await this.onEditRootNote(current);
        } else if (message.type === 'toggleReviewed' && typeof message.id === 'string') {
          await this.onToggleReviewed(message.id, current);
        } else if (message.type === 'clearLiveChanges') {
          this.onClearLiveChanges();
        } else if (message.type === 'setRoot' && typeof message.id === 'string') {
          await this.onSetRoot(message.id, current);
        } else if (message.type === 'backRoot') {
          await this.onBackRoot();
        } else if (message.type === 'setAnalysisDepth' && typeof message.depth === 'number') {
          await this.onSetAnalysisDepth(message.depth);
        }
      });
    }

    this.render(result);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  update(result: ImpactResult): void {
    this.result = result;
    if (this.panel) {
      this.render(result);
    }
  }

  private render(result: ImpactResult): void {
    if (!this.panel) {
      return;
    }
    this.panel.title = `Impact: ${result.root.item.name}`;
    this.panel.webview.html = getHtml(this.panel.webview, toPayload(result, this.canGoBack()));
  }

  dispose(): void {
    this.messageSubscription?.dispose();
    this.panel?.dispose();
  }
}

function toPayload(result: ImpactResult, canGoBack: boolean): GraphPayload {
  const input = completenessInput({
    nodeCount: result.nodes.length,
    truncated: result.truncated,
    traversalLimits: result.traversalLimits,
    requestedDepth: result.requestedDepth,
    reachedDepth: result.reachedDepth,
    maxNodes: result.maxNodes,
    analysisState: result.analysisState,
    coverage: result.coverage,
  });
  const summary = summarizeCompleteness(input);
  const detailLevel = vscode.workspace
    .getConfiguration('impactLens')
    .get<string>('provider.detailLevel', 'summary');
  return {
    rootId: result.root.id,
    rootName: result.root.item.name,
    state: stateBadge(input),
    provider: {
      host: result.provider.host,
      name: result.provider.name,
      version: result.provider.version,
      selectedBy: result.provider.selectedBy,
      languageMatch: result.provider.languageMatch,
      requestedLanguageId: result.provider.requestedLanguageId,
      detectedLanguageId: result.provider.detectedLanguageId,
      callHierarchy: result.provider.callHierarchy,
      diagnostics: result.provider.diagnostics,
      advertised: result.provider.advertised,
      observed: result.provider.observed,
      lifecycle: result.provider.lifecycle,
    },
    coverage: result.coverage,
    completeness: {
      outcome: summary.outcome,
      severity: summary.severity,
      headline: summary.headline,
      action: summary.action,
      bounded: summary.bounded,
      callerCount: input.callerCount,
      segments: headerSegments(input, summary),
      providerLabel: providerLabel(result.provider),
    },
    detailLevel,
    changedAt: result.changedAt,
    canGoBack,
    delta: result.delta,
    nodes: result.nodes.map(node => ({
      id: node.id,
      name: node.item.name,
      note: node.note,
      noteSource: node.noteSource,
      depth: node.depth,
      relation: node.relation,
      path: vscode.workspace.asRelativePath(node.item.uri, false),
      line: node.item.selectionRange.start.line + 1,
      changed: node.changed,
      reviewed: node.reviewed,
      testFreshness: node.testFreshness,
      diagnostics: node.diagnostics,
    })),
    edges: result.edges.map(edge => ({ source: edge.source, target: edge.target })),
    augmentedEdges: result.augmentedEdges,
    limitations: result.limitations,
  };
}

export function getHtml(webview: vscode.Webview, payload: GraphPayload): string {
  const nonce = createNonce();
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  const layoutConfig = JSON.stringify(DEFAULT_GRAPH_LAYOUT);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Impact Lens Call Graph</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { height: 100vh; margin: 0; display: flex; flex-direction: column; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); overflow: hidden; }
    header { min-height: 52px; display: flex; flex-wrap: wrap; align-items: center; gap: 7px; padding: 7px 10px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
    h1 { margin: 0; font-size: 13px; font-weight: 600; }
    .subtitle { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .spacer { flex: 1; }
    .control { display: flex; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    button, select { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 0; border-radius: 2px; padding: 4px 7px; cursor: pointer; font: inherit; }
    button:hover, select:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { cursor: default; opacity: .45; }
    #canvas { width: 100%; flex: 1; min-height: 0; overflow: auto; cursor: grab; }
    #canvas.dragging { cursor: grabbing; user-select: none; }
    svg { display: block; }
    .edge { fill: none; stroke: var(--vscode-descriptionForeground); stroke-width: 1.2; opacity: .58; marker-end: url(#arrow); }
    .edge-test { stroke: var(--vscode-charts-orange, #ea5c00); stroke-dasharray: 4 3; }
    .edge.selected { stroke: var(--vscode-focusBorder); stroke-width: 3; opacity: 1; }
    /* M4 gate 2 UI lane (docs/work/task-m4-gate2-shared-adapter.md). '.edge-candidate' keeps '.edge's
       own neutral stroke/opacity (NOT a color from any palette - a candidate is a difference in evidence
       strength, not a fourth relation kind, and no color here should read as a verdict, the reasoning
       'graphPanel.test.ts's gate-5 tests already enforce for '.node.test'). Only 'marker-end' changes,
       to the second marker defined below - deliberately NOT 'stroke-dasharray' (already three meanings
       in this file: '.edge-test', '.node.related', '.state.partial'). The text label
       ('.edge-candidate-label') is the PRIMARY signal ('response-policy-engine.mjs's
       'CANDIDATE_CALLER_PHRASE' - see the client script below); the marker shape is a secondary,
       reinforcing cue whose actual legibility at this size has NOT been visually verified (no
       real-browser/webview test harness in this repository - recorded here, not assumed). */
    .edge.edge-candidate { marker-end: url(#arrow-candidate); }
    .edge-candidate-label { fill: var(--vscode-descriptionForeground); font-size: 9px; font-weight: 600; pointer-events: none; }
    .edge-candidate-label.selected { font-weight: 700; }
    .node.candidate { opacity: .85; }
    .node { cursor: pointer; outline: none; }
    .node rect { fill: var(--vscode-editorWidget-background); stroke: var(--vscode-panel-border); stroke-width: 1.5; rx: 5; }
    .node:hover rect, .node:focus rect { stroke: var(--vscode-focusBorder); }
    .node.root rect { fill: var(--vscode-button-background); stroke: var(--vscode-button-background); }
    .node.direct rect { stroke: var(--vscode-charts-blue, #3794ff); }
    .node.transitive rect { stroke: var(--vscode-charts-purple, #b180d7); }
    .node.test rect { stroke: var(--vscode-charts-orange, #ea5c00); }
    .node.changed rect { stroke: var(--vscode-editorWarning-foreground); stroke-width: 2; }
    .node.added rect { stroke: var(--vscode-charts-green); stroke-width: 2; }
    .node.diagnostic rect { stroke: var(--vscode-errorForeground); stroke-width: 2; }
    .node.reviewed { opacity: .64; }
    .node.selected { opacity: 1; }
    .node.selected rect { stroke: var(--vscode-focusBorder); stroke-width: 3; }
    .node.related rect { stroke-dasharray: 4 2; }
    .relation-marker { stroke: var(--vscode-editorWidget-background); stroke-width: 1; }
    .node.root .relation-marker { fill: var(--vscode-button-foreground); }
    .node.direct .relation-marker { fill: var(--vscode-charts-blue, #3794ff); }
    .node.transitive .relation-marker { fill: var(--vscode-charts-purple, #b180d7); }
    .node.test .relation-marker { fill: var(--vscode-charts-orange, #ea5c00); }
    .node-name { fill: var(--vscode-foreground); font-size: 11px; font-weight: 600; }
    .node.root .node-name { fill: var(--vscode-button-foreground); }
    .node-relation { fill: var(--vscode-descriptionForeground); font-size: 9px; font-weight: 600; }
    .node.direct .node-relation { fill: var(--vscode-charts-blue, #3794ff); }
    .node.transitive .node-relation { fill: var(--vscode-charts-purple, #b180d7); }
    .node.test .node-relation { fill: var(--vscode-charts-orange, #ea5c00); }
    .node-note, .node-location, .node-status { fill: var(--vscode-descriptionForeground); font-size: 9px; }
    .node-note { font-size: 10px; }
    .legend { position: fixed; left: 10px; bottom: 8px; display: flex; gap: 12px; padding: 5px 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 3px; font-size: 10px; }
    .legend span::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--vscode-charts-blue); }
    .legend .transitive::before { background: var(--vscode-charts-purple); }
    .legend .test::before { background: var(--vscode-charts-orange, #ea5c00); }
    /* Neutral gray, not a palette color - a candidate relationship is a difference in evidence strength,
       not a fourth relation kind, so its legend dot must not read as one more category alongside
       direct/transitive/test's colored ones. */
    .legend .candidate::before { background: var(--vscode-descriptionForeground); }
    .warning { color: var(--vscode-editorWarning-foreground); }
    .state { padding: 2px 6px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .state.stale, .state.analyzing { color: var(--vscode-editorWarning-foreground); }
    .state.partial { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); border-style: dashed; }
    .state.failed { color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
    .subtitle.error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <header>
    <div><h1 id="title"></h1><div class="subtitle" id="summary"></div></div>
    <span class="state" id="state"></span>
    <div class="spacer"></div>
    <label class="control">Analysis <select id="analysis-depth"></select></label>
    <label class="control">Visible <select id="visible-depth"></select></label>
    <div class="control"><button id="zoom-out" title="Zoom out">−</button><span id="zoom-label">100%</span><button id="zoom-in" title="Zoom in">+</button><button id="fit">Fit</button><button id="reset">Reset</button></div>
    <button id="set-root" disabled>Set selected as root</button>
    <button id="back-root" ${payload.canGoBack ? '' : 'disabled'}>Previous root</button>
    <button id="edit-note">Manage root note</button>
    <button id="review-root">Toggle reviewed</button>
    <button id="clear-changes">Clear live changes</button>
  </header>
  <main id="canvas" aria-live="polite"></main>
  <div class="legend"><span id="legend-direct">Direct</span><span class="transitive" id="legend-transitive">Transitive</span><span class="test" id="legend-test">Test</span><span class="candidate" id="legend-candidate">Candidate</span></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const graph = ${serialized};
    const layoutConfig = ${layoutConfig};
    const calculateGraphLayout = ${calculateGraphLayout.toString()};
    const calculateFitZoom = ${calculateFitZoom.toString()};
    const calculateViewportSurface = ${calculateViewportSurface.toString()};
    const shouldRestoreViewport = ${shouldRestoreViewport.toString()};
    // IL-LIM-010-adjacent lane (docs/work/task-refactor-graphpanel-candidate-logic-extraction.md).
    // Real TypeScript now, embedded the same way as the four functions above - see
    // src/candidateGraphResolution.ts for the doc comments, reasoning and unit tests this text used to
    // have no way to carry.
    const CANDIDATE_LABEL_TEXT = ${JSON.stringify(CANDIDATE_LABEL_TEXT)};
    const resolveCandidateEdgeEndpoints = ${resolveCandidateEdgeEndpoints.toString()};
    const resolveSyntheticNode = ${resolveSyntheticNode.toString()};
    const saved = vscode.getState() || {};
    const restoreViewport = shouldRestoreViewport(saved.rootId, graph.rootId, saved.zoom);
    let visibleDepth = clamp(restoreViewport ? saved.visibleDepth ?? graph.coverage.traversal.requestedDepth : graph.coverage.traversal.requestedDepth, 1, graph.coverage.traversal.requestedDepth);
    let selectedNodeId = restoreViewport && graph.nodes.some(node => node.id === saved.selectedNodeId) ? saved.selectedNodeId : undefined;
    let zoom = clamp(restoreViewport ? saved.zoom : 1, .5, 2.5);
    let scrollLeft = restoreViewport ? saved.scrollLeft ?? 0 : 0;
    let scrollTop = restoreViewport ? saved.scrollTop ?? 0 : 0;
    let fitOnNextRender = !restoreViewport;
    let currentLayout;
    const title = document.getElementById('title');
    const summary = document.getElementById('summary');
    const state = document.getElementById('state');
    const analysisDepth = document.getElementById('analysis-depth');
    const visibleDepthSelect = document.getElementById('visible-depth');
    const canvas = document.getElementById('canvas');
    const setRoot = document.getElementById('set-root');
    const zoomLabel = document.getElementById('zoom-label');
    const legendDirect = document.getElementById('legend-direct');
    const legendTransitive = document.getElementById('legend-transitive');
    const legendTest = document.getElementById('legend-test');
    const legendCandidate = document.getElementById('legend-candidate');

    title.textContent = 'Root: ' + graph.rootName;
    const diagnosticCount = graph.nodes.reduce((sum, node) => sum + node.diagnostics.length, 0);
    // Fixed order: result count, traversal, semantic scope, action. The delta and diagnostic counts sit
    // next to the result count because they describe the same thing - what came back - and must not come
    // between the traversal state and the semantic scope, which have to be read together.
    const segments = graph.completeness.segments;
    const details = [segments[0]];
    if (graph.delta.addedNodeIds.length) details.push('+' + graph.delta.addedNodeIds.length + ' affected');
    if (graph.delta.removedNodeIds.length) details.push('-' + graph.delta.removedNodeIds.length + ' affected');
    if (diagnosticCount) details.push(diagnosticCount + ' diagnostics');
    for (let index = 1; index < segments.length; index += 1) {
      if (graph.completeness.action && segments[index] === graph.completeness.action) continue;
      details.push(segments[index]);
    }
    // M4 gate 2 UI lane (docs/work/task-m4-gate2-shared-adapter.md). commander's finding: pushing a code
    // onto result.limitations records it in the data model, it does not by itself show it to a user -
    // this is what actually surfaces augmentation_unsupported_workspace (the ONLY augmentation-sourced
    // code today). Kept as its OWN line, never joined into the coverage.reasons line above - coverage is
    // about what the static traversal could confirm (unaffected by augmentation either way,
    // impactAnalyzer.ts's own comment on why they only share one array without sharing meaning).
    const AUGMENTATION_LIMITATION_CODES = ['augmentation_unsupported_workspace'];
    const augmentationLimitations = graph.limitations.filter(code => AUGMENTATION_LIMITATION_CODES.includes(code));
    if (graph.detailLevel === 'verbose') {
      details.push('provider ' + graph.completeness.providerLabel);
      details.push('lifecycle ' + graph.provider.lifecycle.stage + '/' + graph.provider.lifecycle.status);
      if (graph.coverage.reasons.length) details.push(graph.coverage.reasons.join(', '));
      if (augmentationLimitations.length) details.push('augmentation: ' + augmentationLimitations.join(', '));
    }
    if (graph.completeness.action) details.push(graph.completeness.action);
    summary.textContent = details.join(' · ');
    summary.classList.toggle('warning', graph.completeness.severity === 'warning');
    summary.classList.toggle('error', graph.completeness.severity === 'error');
    summary.title = graph.completeness.headline
      + (graph.completeness.action ? '\\n\\n-> ' + graph.completeness.action : '');
    state.textContent = graph.state.label;
    state.classList.add(graph.state.className);
    state.title = [
      'Provider: ' + graph.completeness.providerLabel,
      'selected by: ' + graph.provider.selectedBy,
      'language: ' + graph.provider.detectedLanguageId
        + ' (requested ' + graph.provider.requestedLanguageId + ', match ' + graph.provider.languageMatch + ')',
      'lifecycle: ' + graph.provider.lifecycle.stage + ' / ' + graph.provider.lifecycle.status,
      'call hierarchy: advertised ' + graph.provider.advertised.callHierarchy
        + ', observed prepare ' + graph.provider.observed.prepareCallHierarchy
        + ', observed incoming ' + graph.provider.observed.incomingCalls,
      'diagnostics: advertised ' + graph.provider.advertised.diagnostics
        + ', observed ' + graph.provider.observed.diagnostics,
      'traversal: ' + graph.coverage.traversal.status
        + ' (depth ' + graph.coverage.traversal.reachedDepth + '/' + graph.coverage.traversal.requestedDepth
        + ', node budget ' + graph.coverage.traversal.maxNodes + ')',
      'semantic: ' + graph.coverage.semantic.status
        + ' from ' + (graph.coverage.semantic.evidenceSources.join(', ') || 'none'),
      'indexing: ' + graph.coverage.indexing.status,
      'reasons: ' + (graph.coverage.reasons.join(', ') || 'none'),
      'augmentation: ' + (augmentationLimitations.join(', ') || 'none'),
    ].join('\\n');

    for (let depth = 1; depth <= 20; depth += 1) addOption(analysisDepth, depth, depth === graph.coverage.traversal.requestedDepth);
    for (let depth = 1; depth <= graph.coverage.traversal.requestedDepth; depth += 1) addOption(visibleDepthSelect, depth, depth === visibleDepth);
    analysisDepth.addEventListener('change', () => vscode.postMessage({ type: 'setAnalysisDepth', depth: Number(analysisDepth.value) }));
    visibleDepthSelect.addEventListener('change', () => {
      visibleDepth = Number(visibleDepthSelect.value);
      if (selectedNodeId && !graph.nodes.some(node => node.id === selectedNodeId && node.depth <= visibleDepth)) selectedNodeId = undefined;
      persist();
      render();
    });
    document.getElementById('edit-note').addEventListener('click', () => vscode.postMessage({ type: 'editRootNote' }));
    document.getElementById('review-root').addEventListener('click', () => vscode.postMessage({ type: 'toggleReviewed', id: graph.rootId }));
    document.getElementById('back-root').addEventListener('click', () => vscode.postMessage({ type: 'backRoot' }));
    setRoot.addEventListener('click', () => {
      if (selectedNodeId && selectedNodeId !== graph.rootId) vscode.postMessage({ type: 'setRoot', id: selectedNodeId });
    });
    const clearChanges = document.getElementById('clear-changes');
    clearChanges.hidden = !graph.changedAt;
    clearChanges.addEventListener('click', () => vscode.postMessage({ type: 'clearLiveChanges' }));
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(zoom + .15));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(zoom - .15));
    document.getElementById('reset').addEventListener('click', () => {
      zoom = 1;
      scrollLeft = 0;
      scrollTop = 0;
      persist();
      render();
    });
    document.getElementById('fit').addEventListener('click', fitGraph);
    canvas.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? .15 : -.15));
    }, { passive: false });
    canvas.addEventListener('scroll', () => {
      scrollLeft = canvas.scrollLeft;
      scrollTop = canvas.scrollTop;
      persist();
    });
    canvas.addEventListener('click', event => {
      if (!event.target.closest?.('.node')) {
        selectedNodeId = undefined;
        persist();
        applySelection();
      }
    });

    let drag;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest?.('.node')) return;
      drag = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
      canvas.classList.add('dragging');
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag) return;
      canvas.scrollLeft = drag.left - (event.clientX - drag.x);
      canvas.scrollTop = drag.top - (event.clientY - drag.y);
    });
    canvas.addEventListener('pointerup', event => {
      drag = undefined;
      canvas.classList.remove('dragging');
      canvas.releasePointerCapture(event.pointerId);
    });
    window.addEventListener('resize', render);

    function render() {
      const nodes = graph.nodes.filter(node => node.depth <= visibleDepth);
      const ids = new Set(nodes.map(node => node.id));
      const edges = graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
      // M4 gate 2 UI lane (docs/work/task-m4-gate2-shared-adapter.md). 'augmentedEdges' never touches
      // 'graph.nodes'/'graph.edges' themselves (M4 stage 1's rollback contract - 'ImpactResult.
      // augmentedEdges's own doc comment) - synthetic endpoints exist ONLY in this render-local
      // 'syntheticNodes' array, never written back into 'graph'. 'calculateGraphLayout()' only reads
      // '{id, depth}' (graphLayout.ts), so passing synthetic entries into the SAME call below needs no
      // change to that function at all.
      //
      // Depth for a synthetic endpoint follows whichever endpoint of its edge IS in 'graph.nodes'
      // ("connected node's depth + 1"), not "always render" - a synthetic node whose anchor is not
      // currently visible (depth-filtered out by 'visibleDepth' above) is skipped the same way, keeping
      // the depth slider's meaning intact for candidates too. Every augmented edge this adapter produces
      // in fact has 'target: {kind:'existing', id: rootId}' (confirmed directly against both 'edges.push'
      // call sites in 'fastapiDependencyAdapter.ts', root is always depth 0), so 'depth + 1' collapses to
      // 1 in practice today - written generically (whichever side is 'existing') rather than hardcoded to
      // root, since nothing in the 'AugmentedEdge' type itself guarantees a future adapter keeps that
      // shape. If the SAME synthetic endpoint is reachable from more than one anchor (two different
      // existing nodes both citing it), the first depth computed wins - a real simplification, not
      // expected to matter for this adapter's own edge shapes today.
      const nodeById = new Map(nodes.map(node => [node.id, node]));
      const syntheticNodesById = new Map();
      const candidateEdges = [];
      for (const augmented of graph.augmentedEdges) {
        const resolved = resolveCandidateEdgeEndpoints(augmented, nodeById, syntheticNodesById);
        if (resolved) candidateEdges.push(resolved);
      }
      const syntheticNodes = [...syntheticNodesById.values()];
      currentLayout = calculateGraphLayout([...nodes, ...syntheticNodes], layoutConfig);
      const surface = calculateViewportSurface(
        currentLayout.width,
        currentLayout.height,
        zoom,
        canvas.clientWidth,
        canvas.clientHeight,
      );

      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + surface.width + ' ' + surface.height);
      svg.setAttribute('width', String(surface.width));
      svg.setAttribute('height', String(surface.height));
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Incoming call impact graph. Single click selects; double click opens code.');
      // M4 gate 2 UI lane. '#arrow-candidate' is deliberately larger AND closed (a hollow triangle, not
      // an open chevron like '#arrow') - two changes together, not one, since a size-only or shape-only
      // change alone was judged unlikely to read as different at this scale. NOT visually verified (no
      // real-browser/webview harness here) - the text label on each candidate edge is the signal this
      // design actually depends on; this marker is a secondary, unverified reinforcement only.
      svg.innerHTML = '<defs>'
        + '<marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="currentColor"></path></marker>'
        + '<marker id="arrow-candidate" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="none" stroke="currentColor"></path></marker>'
        + '</defs>';
      const content = document.createElementNS(ns, 'g');
      content.setAttribute('transform', 'translate(' + surface.offsetX + ',' + surface.offsetY + ') scale(' + zoom + ')');
      svg.appendChild(content);

      for (const edge of edges) {
        const source = currentLayout.positions[edge.source];
        const target = currentLayout.positions[edge.target];
        if (!source || !target) continue;
        const path = document.createElementNS(ns, 'path');
        const midX = (source.x + target.x) / 2;
        const halfWidth = layoutConfig.nodeWidth / 2;
        path.setAttribute('d', 'M' + (source.x + halfWidth) + ',' + source.y + ' C' + midX + ',' + source.y + ' ' + midX + ',' + target.y + ' ' + (target.x - halfWidth) + ',' + target.y);
        const sourceNode = nodes.find(node => node.id === edge.source);
        path.setAttribute('class', 'edge' + (sourceNode?.relation === 'test' ? ' edge-test' : ''));
        path.dataset.source = edge.source;
        path.dataset.target = edge.target;
        content.appendChild(path);
      }

      // M4 gate 2 UI lane. Deliberately NOT folded into the confirmed-edge loop above, and the path here
      // still carries the plain '.edge' class (plus '.edge-candidate') with the SAME 'dataset.source'/
      // 'dataset.target' convention - so 'applySelection()'s existing '.edge' selector, 'related' set
      // computation, and depth-based visibility (a candidate edge whose endpoint position is missing is
      // skipped the same way) all already apply with NO changes to that function. Only the label
      // ('.edge-candidate-label', not '.edge') needs its own small loop in 'applySelection()' below, since
      // text is not what '.edge'-targeted CSS/selectors are for.
      for (const candidate of candidateEdges) {
        const source = currentLayout.positions[candidate.source];
        const target = currentLayout.positions[candidate.target];
        if (!source || !target) continue;
        const path = document.createElementNS(ns, 'path');
        const midX = (source.x + target.x) / 2;
        const halfWidth = layoutConfig.nodeWidth / 2;
        path.setAttribute('d', 'M' + (source.x + halfWidth) + ',' + source.y + ' C' + midX + ',' + source.y + ' ' + midX + ',' + target.y + ' ' + (target.x - halfWidth) + ',' + target.y);
        path.setAttribute('class', 'edge edge-candidate');
        path.dataset.source = candidate.source;
        path.dataset.target = candidate.target;
        content.appendChild(path);
        // Positioned toward the SOURCE end (25% along, not the exact midpoint) - candidate edges
        // converging on the same target from different sources share 'midX' (the midpoint formula above
        // is symmetric in x), but their sources usually differ in y, so a source-biased position is less
        // likely to collide when several candidates point at one target. NOT visually verified for a
        // graph with many simultaneous candidates - a real crowding case may still need a different
        // placement or a dedicated legend-only treatment instead of a per-edge label.
        const labelX = source.x + halfWidth + (midX - (source.x + halfWidth)) * 0.5;
        const labelY = source.y + (target.y - source.y) * 0.25;
        const label = addText(content, CANDIDATE_LABEL_TEXT, labelX, labelY, 'edge-candidate-label');
        label.dataset.source = candidate.source;
        label.dataset.target = candidate.target;
      }

      for (const syntheticNode of syntheticNodes) {
        const position = currentLayout.positions[syntheticNode.id];
        if (!position) continue;
        const group = document.createElementNS(ns, 'g');
        // M4 gate 2 UI lane. Deliberately its OWN small rendering block, not a reuse of the confirmed-
        // node loop below with special-casing bolted on: a synthetic endpoint has no backing ImpactNode
        // (M4 stage 1's rollback contract - result.nodes/edges never gain an entry for it), so it has no
        // note, no diagnostics, no reviewed/changed state, and no real click-to-open target the existing
        // 'onOpenNode' message handler could resolve (it looks up 'result.nodes.find(...)', which would
        // never find a synthetic id) - reusing that loop would mean stripping most of what it does rather
        // than reusing it. 'cursor: default' (no '.node { cursor: pointer }' override) and no 'tabindex'/
        // click listeners are intentional: this element is informational only, not interactive - adding
        // real navigation for it was out of this lane's scope, not an oversight.
        group.setAttribute('class', 'node candidate');
        group.dataset.id = syntheticNode.id;
        group.setAttribute('transform', 'translate(' + (position.x - (layoutConfig.nodeWidth / 2)) + ',' + (position.y - (layoutConfig.nodeHeight / 2)) + ')');
        group.setAttribute('aria-label', syntheticNode.name + '. Candidate caller, not confirmed by static analysis.');
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('width', String(layoutConfig.nodeWidth));
        rect.setAttribute('height', String(layoutConfig.nodeHeight));
        group.appendChild(rect);
        const textCenter = layoutConfig.nodeWidth / 2;
        addText(group, truncate(syntheticNode.name, 26), textCenter, 18, 'node-name');
        addText(group, CANDIDATE_LABEL_TEXT, textCenter, 33, 'node-relation');
        addText(group, truncate(syntheticNode.path + ':' + syntheticNode.line, 36), textCenter, 66, 'node-location');
        content.appendChild(group);
      }

      for (const node of nodes) {
        const position = currentLayout.positions[node.id];
        if (!position) continue;
        const group = document.createElementNS(ns, 'g');
        const classes = ['node', node.relation];
        if (node.changed) classes.push('changed');
        if (graph.delta.addedNodeIds.includes(node.id)) classes.push('added');
        if (node.diagnostics.length) classes.push('diagnostic');
        if (node.reviewed) classes.push('reviewed');
        group.setAttribute('class', classes.join(' '));
        group.dataset.id = node.id;
        group.setAttribute('transform', 'translate(' + (position.x - (layoutConfig.nodeWidth / 2)) + ',' + (position.y - (layoutConfig.nodeHeight / 2)) + ')');
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', node.name + '. ' + (node.note || 'No function note'));
        group.addEventListener('click', event => {
          event.stopPropagation();
          selectedNodeId = node.id;
          persist();
          applySelection();
        });
        group.addEventListener('dblclick', event => {
          event.stopPropagation();
          vscode.postMessage({ type: 'open', id: node.id });
        });
        group.addEventListener('contextmenu', event => {
          event.preventDefault();
          event.stopPropagation();
          vscode.postMessage({ type: 'toggleReviewed', id: node.id });
        });
        group.addEventListener('keydown', event => {
          if (event.key === ' ') {
            event.preventDefault();
            selectedNodeId = node.id;
            persist();
            applySelection();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            vscode.postMessage({ type: 'open', id: node.id });
          }
        });
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('width', String(layoutConfig.nodeWidth));
        rect.setAttribute('height', String(layoutConfig.nodeHeight));
        group.appendChild(rect);
        const marker = document.createElementNS(ns, 'circle');
        marker.setAttribute('cx', '11');
        marker.setAttribute('cy', '14');
        marker.setAttribute('r', '4');
        marker.setAttribute('class', 'relation-marker');
        group.appendChild(marker);
        const textCenter = layoutConfig.nodeWidth / 2;
        addText(group, truncate(node.name, 26), textCenter, 18, 'node-name');
        addText(group, relationLabel(node), textCenter, 33, 'node-relation');
        if (node.note) addText(group, truncate(node.note, 34), textCenter, 50, 'node-note');
        addText(group, truncate(node.path + ':' + node.line, 36), textCenter, 66, 'node-location');
        const statusText = node.diagnostics.length ? node.diagnostics.length + ' diagnostics' : node.reviewed ? 'Reviewed' : node.testFreshness === 'outdated' ? 'Test verification required' : node.changed ? 'Changed · review required' : '';
        if (statusText) addText(group, truncate(statusText, 36), textCenter, 81, 'node-status');
        if (node.diagnostics.length) {
          const tooltip = document.createElementNS(ns, 'title');
          tooltip.textContent = node.diagnostics.map(diagnostic => diagnostic.message).join('\\n');
          group.appendChild(tooltip);
        }
        content.appendChild(group);
      }
      canvas.replaceChildren(svg);
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      const directCount = nodes.filter(node => node.relation === 'direct').length;
      const transitiveCount = nodes.filter(node => node.relation === 'transitive').length;
      const testCount = nodes.filter(node => node.relation === 'test').length;
      legendDirect.textContent = 'Direct (' + directCount + ')';
      legendTransitive.textContent = 'Transitive (' + transitiveCount + ')';
      legendTest.textContent = 'Test (' + testCount + ')';
      // Count of rendered candidate RELATIONSHIPS (edges), not a node count - candidate is a property of
      // an edge, not a node kind (see the CSS comment above '.node.candidate' and 'types.ts's own
      // ImpactResult.augmentedEdges doc comment for why this is not a fourth relation).
      legendCandidate.textContent = 'Candidate (' + candidateEdges.length + ')';
      requestAnimationFrame(() => {
        if (fitOnNextRender) {
          fitOnNextRender = false;
          fitGraph();
          return;
        }
        canvas.scrollLeft = scrollLeft;
        canvas.scrollTop = scrollTop;
        applySelection();
      });
    }

    function applySelection() {
      const selected = selectedNodeId;
      const related = new Set();
      for (const edge of canvas.querySelectorAll('.edge')) {
        const active = !!selected && (edge.dataset.source === selected || edge.dataset.target === selected);
        edge.classList.toggle('selected', active);
        if (active) {
          related.add(edge.dataset.source);
          related.add(edge.dataset.target);
        }
      }
      for (const node of canvas.querySelectorAll('.node')) {
        node.classList.toggle('selected', node.dataset.id === selected);
        node.classList.toggle('related', !!selected && node.dataset.id !== selected && related.has(node.dataset.id));
      }
      // M4 gate 2 UI lane. A candidate edge's label is a plain '<text>', not '.edge' (so it is never
      // matched by '.edge'-targeted CSS/selectors meant for the path's own stroke), so it needs this one
      // extra loop to follow the same selection state the '.edge' loop above already computed for its
      // matching path - everything else in this function (the '.edge'/'related'/'.node' handling) is
      // unchanged.
      for (const label of canvas.querySelectorAll('.edge-candidate-label')) {
        label.classList.toggle('selected', !!selected && (label.dataset.source === selected || label.dataset.target === selected));
      }
      setRoot.disabled = !selected || selected === graph.rootId;
    }

    function fitGraph() {
      if (!currentLayout) return;
      zoom = calculateFitZoom(
        currentLayout.width,
        currentLayout.height,
        canvas.clientWidth,
        canvas.clientHeight,
        24,
        .5,
        2.5,
      );
      scrollLeft = 0;
      scrollTop = 0;
      persist();
      render();
    }

    function setZoom(value) {
      if (!currentLayout) return;
      const oldZoom = zoom;
      const oldSurface = calculateViewportSurface(
        currentLayout.width,
        currentLayout.height,
        oldZoom,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      const centerX = (canvas.scrollLeft + canvas.clientWidth / 2 - oldSurface.offsetX) / oldZoom;
      const centerY = (canvas.scrollTop + canvas.clientHeight / 2 - oldSurface.offsetY) / oldZoom;
      zoom = clamp(value, .5, 2.5);
      const newSurface = calculateViewportSurface(
        currentLayout.width,
        currentLayout.height,
        zoom,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      scrollLeft = clamp(
        newSurface.offsetX + (centerX * zoom) - (canvas.clientWidth / 2),
        0,
        Math.max(0, newSurface.width - canvas.clientWidth),
      );
      scrollTop = clamp(
        newSurface.offsetY + (centerY * zoom) - (canvas.clientHeight / 2),
        0,
        Math.max(0, newSurface.height - canvas.clientHeight),
      );
      persist();
      render();
    }

    function persist() { vscode.setState({ rootId: graph.rootId, visibleDepth, selectedNodeId, zoom, scrollLeft, scrollTop }); }
    function addOption(select, value, selected) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      option.selected = selected;
      select.appendChild(option);
    }
    function addText(parent, value, x, y, className) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', className);
      text.textContent = value;
      parent.appendChild(text);
      // Returning the element is additive - every pre-existing call site here already ignored the return
      // value (a plain statement), so this cannot change their behavior. M4 gate 2 UI lane needs it to
      // attach 'dataset.source'/'dataset.target' to a candidate edge's own label afterward.
      return text;
    }
    function truncate(value, maximum) { return value.length > maximum ? value.slice(0, maximum - 1) + '…' : value; }
    function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
    function relationLabel(node) {
      if (node.relation === 'root') return 'Root';
      if (node.relation === 'test') return node.depth === 1 ? 'Test · direct caller' : 'Test · ' + node.depth + ' hops';
      if (node.relation === 'direct') return 'Direct caller';
      return 'Transitive · ' + node.depth + ' hops';
    }
    render();
  </script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}
