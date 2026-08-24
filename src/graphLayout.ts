export interface GraphLayoutNode {
  readonly id: string;
  readonly depth: number;
}

export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

export interface GraphLayoutConfig {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly columnWidth: number;
  readonly rowGap: number;
  readonly paddingX: number;
  readonly paddingY: number;
}

export interface GraphLayout {
  readonly width: number;
  readonly height: number;
  readonly maximumDepth: number;
  readonly positions: Readonly<Record<string, GraphPoint>>;
}

export interface ViewportSurface {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const DEFAULT_GRAPH_LAYOUT: GraphLayoutConfig = {
  nodeWidth: 196,
  nodeHeight: 88,
  columnWidth: 276,
  rowGap: 24,
  paddingX: 36,
  paddingY: 32,
};

/**
 * Lays out only depths that are actually represented by visible nodes. Incoming
 * callers remain on the left and the analyzed root remains on the right.
 *
 * This function is self-contained because its JavaScript source is also used by
 * the Graph Webview.
 */
export function calculateGraphLayout(
  nodes: readonly GraphLayoutNode[],
  config: GraphLayoutConfig,
): GraphLayout {
  const maximumDepth = Math.max(0, ...nodes.map(node => node.depth));
  const groups = new Map<number, GraphLayoutNode[]>();
  for (const node of nodes) {
    const values = groups.get(node.depth) ?? [];
    values.push(node);
    groups.set(node.depth, values);
  }

  const largestColumn = Math.max(1, ...[...groups.values()].map(values => values.length));
  const width = (
    (config.paddingX * 2)
    + config.nodeWidth
    + (maximumDepth * config.columnWidth)
  );
  const height = (
    (config.paddingY * 2)
    + (largestColumn * config.nodeHeight)
    + ((largestColumn - 1) * config.rowGap)
  );
  const positions: Record<string, GraphPoint> = {};

  for (const [depth, values] of groups) {
    const x = (
      config.paddingX
      + (config.nodeWidth / 2)
      + ((maximumDepth - depth) * config.columnWidth)
    );
    const columnHeight = (
      (values.length * config.nodeHeight)
      + ((values.length - 1) * config.rowGap)
    );
    const startY = ((height - columnHeight) / 2) + (config.nodeHeight / 2);
    values.forEach((node, index) => {
      positions[node.id] = {
        x,
        y: startY + (index * (config.nodeHeight + config.rowGap)),
      };
    });
  }

  return { width, height, maximumDepth, positions };
}

/** This function is self-contained because its source also runs in the Webview. */
export function calculateFitZoom(
  graphWidth: number,
  graphHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
  minimumZoom: number,
  maximumZoom: number,
): number {
  if (graphWidth <= 0 || graphHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return Math.max(minimumZoom, Math.min(maximumZoom, 1));
  }
  const availableWidth = Math.max(1, viewportWidth - (padding * 2));
  const availableHeight = Math.max(1, viewportHeight - (padding * 2));
  const fitted = Math.min(availableWidth / graphWidth, availableHeight / graphHeight);
  return Math.max(minimumZoom, Math.min(maximumZoom, fitted));
}

/** This function is self-contained because its source also runs in the Webview. */
export function calculateViewportSurface(
  graphWidth: number,
  graphHeight: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
): ViewportSurface {
  const scaledWidth = graphWidth * zoom;
  const scaledHeight = graphHeight * zoom;
  const width = Math.max(viewportWidth, scaledWidth);
  const height = Math.max(viewportHeight, scaledHeight);
  return {
    width,
    height,
    offsetX: Math.max(0, (width - scaledWidth) / 2),
    offsetY: Math.max(0, (height - scaledHeight) / 2),
  };
}

export function shouldRestoreViewport(
  savedRootId: unknown,
  currentRootId: string,
  savedZoom: unknown,
): boolean {
  return savedRootId === currentRootId && typeof savedZoom === 'number';
}
