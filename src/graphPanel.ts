import * as vscode from 'vscode';
import { ImpactResult } from './types';

interface GraphPayload {
  readonly rootId: string;
  readonly truncated: boolean;
  readonly nodes: readonly {
    id: string;
    name: string;
    note: string;
    depth: number;
    relation: string;
    path: string;
    line: number;
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
      this.panel.iconPath = undefined;
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
        }
      });
    }

    this.panel.title = `Impact: ${result.root.item.name}`;
    this.panel.webview.html = getHtml(this.panel.webview, toPayload(result));
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  update(result: ImpactResult): void {
    this.result = result;
    if (this.panel) {
      this.panel.title = `Impact: ${result.root.item.name}`;
      this.panel.webview.html = getHtml(this.panel.webview, toPayload(result));
    }
  }

  dispose(): void {
    this.messageSubscription?.dispose();
    this.panel?.dispose();
  }
}

function toPayload(result: ImpactResult): GraphPayload {
  return {
    rootId: result.root.id,
    truncated: result.truncated,
    nodes: result.nodes.map(node => ({
      id: node.id,
      name: node.item.name,
      note: node.note,
      depth: node.depth,
      relation: node.relation,
      path: vscode.workspace.asRelativePath(node.item.uri, false),
      line: node.item.selectionRange.start.line + 1,
    })),
    edges: result.edges.map(edge => ({ source: edge.source, target: edge.target })),
  };
}

function getHtml(webview: vscode.Webview, payload: GraphPayload): string {
  const nonce = createNonce();
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
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
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    header { min-height: 44px; display: flex; align-items: center; gap: 12px; padding: 7px 12px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
    h1 { margin: 0; font-size: 13px; font-weight: 600; }
    .subtitle { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .spacer { flex: 1; }
    .depth { display: flex; align-items: center; gap: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 0; border-radius: 2px; padding: 4px 8px; cursor: pointer; font: inherit; }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    #canvas { width: 100%; min-height: calc(100vh - 45px); overflow: auto; }
    svg { display: block; min-width: 100%; }
    .edge { fill: none; stroke: var(--vscode-descriptionForeground); stroke-width: 1.2; opacity: .62; marker-end: url(#arrow); }
    .edge-test { stroke: var(--vscode-testing-iconPassed); stroke-dasharray: 4 3; }
    .node { cursor: pointer; }
    .node rect { fill: var(--vscode-editorWidget-background); stroke: var(--vscode-panel-border); stroke-width: 1; rx: 4; }
    .node:hover rect { stroke: var(--vscode-focusBorder); }
    .node.root rect { fill: var(--vscode-button-background); stroke: var(--vscode-button-background); }
    .node.test rect { stroke: var(--vscode-testing-iconPassed); }
    .node-name { fill: var(--vscode-foreground); font-size: 11px; font-weight: 600; }
    .node.root .node-name { fill: var(--vscode-button-foreground); }
    .node-note { fill: var(--vscode-descriptionForeground); font-size: 10px; }
    .node-location { fill: var(--vscode-descriptionForeground); font-size: 9px; }
    .empty-note { opacity: .58; font-style: italic; }
    .legend { position: fixed; left: 10px; bottom: 8px; display: flex; gap: 12px; padding: 5px 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 3px; font-size: 10px; }
    .legend span::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--vscode-charts-blue); }
    .legend .transitive::before { background: var(--vscode-charts-purple); }
    .legend .test::before { background: var(--vscode-testing-iconPassed); }
    .warning { color: var(--vscode-editorWarning-foreground); }
  </style>
</head>
<body>
  <header>
    <div><h1 id="title"></h1><div class="subtitle" id="summary"></div></div>
    <div class="spacer"></div>
    <div class="depth"><span>Depth</span><span id="depth-buttons"></span></div>
    <button id="edit-note" type="button">Edit root note</button>
  </header>
  <main id="canvas" aria-live="polite"></main>
  <div class="legend"><span>Direct</span><span class="transitive">Transitive</span><span class="test">Test</span></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const graph = ${serialized};
    let visibleDepth = Math.max(1, ...graph.nodes.map(node => node.depth));
    const title = document.getElementById('title');
    const summary = document.getElementById('summary');
    const depthButtons = document.getElementById('depth-buttons');
    const canvas = document.getElementById('canvas');
    title.textContent = graph.nodes.find(node => node.id === graph.rootId)?.name ?? 'Impact graph';
    summary.textContent = graph.nodes.length + ' symbols' + (graph.truncated ? ' · result truncated' : '');
    if (graph.truncated) summary.classList.add('warning');

    const maximumDepth = Math.max(1, ...graph.nodes.map(node => node.depth));
    for (let value = 1; value <= maximumDepth; value += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(value);
      button.dataset.depth = String(value);
      button.setAttribute('aria-pressed', String(value === visibleDepth));
      button.addEventListener('click', () => {
        visibleDepth = value;
        [...depthButtons.querySelectorAll('button')].forEach(candidate => candidate.setAttribute('aria-pressed', String(candidate === button)));
        render();
      });
      depthButtons.appendChild(button);
    }
    document.getElementById('edit-note').addEventListener('click', () => vscode.postMessage({ type: 'editRootNote' }));

    function render() {
      const nodes = graph.nodes.filter(node => node.depth <= visibleDepth);
      const ids = new Set(nodes.map(node => node.id));
      const edges = graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
      const groups = new Map();
      for (const node of nodes) {
        const values = groups.get(node.depth) ?? [];
        values.push(node);
        groups.set(node.depth, values);
      }

      const columnWidth = 250;
      const rowHeight = 92;
      const marginX = 125;
      const marginY = 46;
      const width = Math.max(720, (visibleDepth + 1) * columnWidth + 80);
      const largestColumn = Math.max(1, ...[...groups.values()].map(values => values.length));
      const height = Math.max(430, largestColumn * rowHeight + 80);
      const positions = new Map();

      for (const [depth, values] of groups) {
        const x = marginX + (visibleDepth - depth) * columnWidth;
        const totalHeight = (values.length - 1) * rowHeight;
        const startY = Math.max(marginY, (height - totalHeight) / 2);
        values.forEach((node, index) => positions.set(node.id, { x, y: startY + index * rowHeight }));
      }

      const svgNamespace = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNamespace, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Incoming call impact graph with function notes');
      svg.innerHTML = '<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="currentColor"></path></marker></defs>';

      for (const edge of edges) {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) continue;
        const path = document.createElementNS(svgNamespace, 'path');
        const midX = (source.x + target.x) / 2;
        path.setAttribute('d', 'M' + (source.x + 80) + ',' + source.y + ' C' + midX + ',' + source.y + ' ' + midX + ',' + target.y + ' ' + (target.x - 80) + ',' + target.y);
        const sourceNode = nodes.find(node => node.id === edge.source);
        path.setAttribute('class', 'edge' + (sourceNode?.relation === 'test' ? ' edge-test' : ''));
        svg.appendChild(path);
      }

      for (const node of nodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        const group = document.createElementNS(svgNamespace, 'g');
        group.setAttribute('class', 'node ' + node.relation);
        group.setAttribute('transform', 'translate(' + (position.x - 80) + ',' + (position.y - 16) + ')');
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', node.name + '. ' + (node.note || 'No function note'));
        group.addEventListener('click', () => vscode.postMessage({ type: 'open', id: node.id }));
        group.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            vscode.postMessage({ type: 'open', id: node.id });
          }
        });

        const rect = document.createElementNS(svgNamespace, 'rect');
        rect.setAttribute('width', '160');
        rect.setAttribute('height', '32');
        group.appendChild(rect);
        addText(group, node.name.length > 24 ? node.name.slice(0, 23) + '…' : node.name, 80, 20, 'node-name');
        addText(group, node.note ? truncate(node.note, 34) : 'No function note', 80, 49, 'node-note' + (node.note ? '' : ' empty-note'));
        addText(group, node.path + ':' + node.line, 80, 65, 'node-location');
        svg.appendChild(group);
      }

      canvas.replaceChildren(svg);
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

    function truncate(value, maximum) {
      return value.length > maximum ? value.slice(0, maximum - 1) + '…' : value;
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
