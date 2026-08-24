import * as vscode from 'vscode';
import {
  calculateFitZoom,
  calculateGraphLayout,
  calculateViewportSurface,
  DEFAULT_GRAPH_LAYOUT,
  shouldRestoreViewport,
} from './graphLayout';
import { ImpactResult } from './types';

interface GraphPayload {
  readonly rootId: string;
  readonly rootName: string;
  readonly truncated: boolean;
  readonly traversalLimits: readonly string[];
  readonly requestedDepth: number;
  readonly reachedDepth: number;
  readonly analysisState: string;
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
  return {
    rootId: result.root.id,
    rootName: result.root.item.name,
    truncated: result.truncated,
    traversalLimits: result.traversalLimits,
    requestedDepth: result.requestedDepth,
    reachedDepth: result.reachedDepth,
    analysisState: result.analysisState,
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
  };
}

function getHtml(webview: vscode.Webview, payload: GraphPayload): string {
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
    .edge-test { stroke: var(--vscode-testing-iconPassed); stroke-dasharray: 4 3; }
    .edge.selected { stroke: var(--vscode-focusBorder); stroke-width: 3; opacity: 1; }
    .node { cursor: pointer; outline: none; }
    .node rect { fill: var(--vscode-editorWidget-background); stroke: var(--vscode-panel-border); stroke-width: 1.5; rx: 5; }
    .node:hover rect, .node:focus rect { stroke: var(--vscode-focusBorder); }
    .node.root rect { fill: var(--vscode-button-background); stroke: var(--vscode-button-background); }
    .node.direct rect { stroke: var(--vscode-charts-blue, #3794ff); }
    .node.transitive rect { stroke: var(--vscode-charts-purple, #b180d7); }
    .node.test rect { stroke: var(--vscode-testing-iconPassed, #73c991); }
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
    .node.test .relation-marker { fill: var(--vscode-testing-iconPassed, #73c991); }
    .node-name { fill: var(--vscode-foreground); font-size: 11px; font-weight: 600; }
    .node.root .node-name { fill: var(--vscode-button-foreground); }
    .node-relation { fill: var(--vscode-descriptionForeground); font-size: 9px; font-weight: 600; }
    .node.direct .node-relation { fill: var(--vscode-charts-blue, #3794ff); }
    .node.transitive .node-relation { fill: var(--vscode-charts-purple, #b180d7); }
    .node.test .node-relation { fill: var(--vscode-testing-iconPassed, #73c991); }
    .node-note, .node-location, .node-status { fill: var(--vscode-descriptionForeground); font-size: 9px; }
    .node-note { font-size: 10px; }
    .legend { position: fixed; left: 10px; bottom: 8px; display: flex; gap: 12px; padding: 5px 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 3px; font-size: 10px; }
    .legend span::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--vscode-charts-blue); }
    .legend .transitive::before { background: var(--vscode-charts-purple); }
    .legend .test::before { background: var(--vscode-testing-iconPassed); }
    .warning { color: var(--vscode-editorWarning-foreground); }
    .state { padding: 2px 6px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .state.stale, .state.analyzing { color: var(--vscode-editorWarning-foreground); }
    .state.failed { color: var(--vscode-errorForeground); }
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
  <div class="legend"><span id="legend-direct">Direct</span><span class="transitive" id="legend-transitive">Transitive</span><span class="test" id="legend-test">Test</span></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const graph = ${serialized};
    const layoutConfig = ${layoutConfig};
    const calculateGraphLayout = ${calculateGraphLayout.toString()};
    const calculateFitZoom = ${calculateFitZoom.toString()};
    const calculateViewportSurface = ${calculateViewportSurface.toString()};
    const shouldRestoreViewport = ${shouldRestoreViewport.toString()};
    const saved = vscode.getState() || {};
    const restoreViewport = shouldRestoreViewport(saved.rootId, graph.rootId, saved.zoom);
    let visibleDepth = clamp(restoreViewport ? saved.visibleDepth ?? graph.requestedDepth : graph.requestedDepth, 1, graph.requestedDepth);
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

    title.textContent = 'Root: ' + graph.rootName;
    const diagnosticCount = graph.nodes.reduce((sum, node) => sum + node.diagnostics.length, 0);
    const details = [graph.nodes.length + ' symbols', 'reached ' + graph.reachedDepth + ' / requested ' + graph.requestedDepth];
    if (graph.delta.addedNodeIds.length) details.push('+' + graph.delta.addedNodeIds.length + ' affected');
    if (graph.delta.removedNodeIds.length) details.push('-' + graph.delta.removedNodeIds.length + ' affected');
    if (diagnosticCount) details.push(diagnosticCount + ' diagnostics');
    if (graph.traversalLimits.includes('depth')) details.push('depth limit reached');
    if (graph.traversalLimits.includes('nodes')) details.push('node limit reached');
    if (!graph.truncated && graph.reachedDepth < graph.requestedDepth) details.push('call hierarchy completed');
    summary.textContent = details.join(' · ');
    summary.classList.toggle('warning', graph.truncated);
    state.textContent = stateLabel(graph.analysisState);
    state.classList.add(graph.analysisState);
    state.title = 'Static Call Hierarchy only; framework and dynamic calls may be missing';

    for (let depth = 1; depth <= 20; depth += 1) addOption(analysisDepth, depth, depth === graph.requestedDepth);
    for (let depth = 1; depth <= graph.requestedDepth; depth += 1) addOption(visibleDepthSelect, depth, depth === visibleDepth);
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
      currentLayout = calculateGraphLayout(nodes, layoutConfig);
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
      svg.innerHTML = '<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="currentColor"></path></marker></defs>';
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
    }
    function truncate(value, maximum) { return value.length > maximum ? value.slice(0, maximum - 1) + '…' : value; }
    function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
    function relationLabel(node) {
      if (node.relation === 'root') return 'Root';
      if (node.relation === 'test') return node.depth === 1 ? 'Test · direct caller' : 'Test · ' + node.depth + ' hops';
      if (node.relation === 'direct') return 'Direct caller';
      return 'Transitive · ' + node.depth + ' hops';
    }
    function stateLabel(value) {
      if (value === 'stale') return 'Editing · stale';
      if (value === 'analyzing') return 'Analyzing…';
      if (value === 'partial') return 'Partial';
      if (value === 'failed') return 'Analysis failed';
      return 'Current';
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
