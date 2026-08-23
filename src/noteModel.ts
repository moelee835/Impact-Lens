export type NoteSource = 'personal' | 'shared' | 'sourceComment';

export interface NoteIdentity {
  readonly workspace: string;
  readonly file: string;
  readonly symbol: string;
  readonly kind: number;
  readonly detail: string;
  readonly line: number;
  readonly character: number;
}

export interface StoredNote extends NoteIdentity {
  readonly text: string;
  readonly updatedAt: string;
}

export interface NoteLayers {
  readonly personal?: string;
  readonly shared?: string;
  readonly sourceComment?: string;
}

export interface ResolvedFunctionNote extends NoteLayers {
  readonly text: string;
  readonly source?: NoteSource;
}

export interface SharedNoteDocument {
  readonly version: 1;
  readonly notes: readonly StoredNote[];
}

export function resolveNote(layers: NoteLayers): ResolvedFunctionNote {
  if (layers.personal) {
    return { ...layers, text: layers.personal, source: 'personal' };
  }
  if (layers.shared) {
    return { ...layers, text: layers.shared, source: 'shared' };
  }
  if (layers.sourceComment) {
    return { ...layers, text: layers.sourceComment, source: 'sourceComment' };
  }
  return { ...layers, text: '' };
}

export function findStoredNote(
  notes: readonly StoredNote[],
  identity: NoteIdentity,
): StoredNote | undefined {
  const candidates = notes.filter(note => (
    note.workspace === identity.workspace
    && note.file === identity.file
    && note.symbol === identity.symbol
    && note.kind === identity.kind
  ));
  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort((left, right) => (
    matchScore(right, identity) - matchScore(left, identity)
  ))[0];
}

export function upsertStoredNote(
  notes: readonly StoredNote[],
  identity: NoteIdentity,
  text: string,
  updatedAt: string,
): StoredNote[] {
  const existing = findStoredNote(notes, identity);
  const remaining = existing ? notes.filter(note => note !== existing) : [...notes];
  return [
    ...remaining,
    { ...identity, text, updatedAt },
  ].sort(compareNotes);
}

export function removeStoredNote(
  notes: readonly StoredNote[],
  identity: NoteIdentity,
): StoredNote[] {
  const existing = findStoredNote(notes, identity);
  return existing ? notes.filter(note => note !== existing) : [...notes];
}

function matchScore(note: StoredNote, identity: NoteIdentity): number {
  let score = 0;
  if (note.detail === identity.detail) {
    score += 100;
  }
  if (note.character === identity.character) {
    score += 20;
  }
  score += Math.max(0, 10 - Math.abs(note.line - identity.line));
  return score;
}

function compareNotes(left: StoredNote, right: StoredNote): number {
  return left.file.localeCompare(right.file)
    || left.symbol.localeCompare(right.symbol)
    || left.line - right.line;
}
