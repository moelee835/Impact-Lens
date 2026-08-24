export interface PositionLike {
  readonly line: number;
  readonly character: number;
}

export interface RangeLike {
  readonly start: PositionLike;
  readonly end: PositionLike;
}

export interface PendingNavigation {
  readonly uri: string;
  readonly range: RangeLike;
}

export function matchesPendingNavigation(
  pending: PendingNavigation,
  uri: string,
  selection: RangeLike,
): boolean {
  return pending.uri === uri
    && positionsEqual(pending.range.start, selection.start)
    && positionsEqual(pending.range.end, selection.end);
}

function positionsEqual(left: PositionLike, right: PositionLike): boolean {
  return left.line === right.line && left.character === right.character;
}
