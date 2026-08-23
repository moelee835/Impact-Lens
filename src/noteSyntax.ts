export const IMPACT_NOTE_TAG = '@impact-note';

const hashCommentLanguages = new Set([
  'python',
  'ruby',
  'shellscript',
  'perl',
  'r',
  'yaml',
  'dockerfile',
]);

const dashCommentLanguages = new Set(['sql', 'lua', 'haskell']);

export function lineCommentPrefix(languageId: string): string {
  if (hashCommentLanguages.has(languageId)) {
    return '#';
  }
  if (dashCommentLanguages.has(languageId)) {
    return '--';
  }
  return '//';
}

export function parseImpactNote(line: string): string | undefined {
  const index = line.indexOf(IMPACT_NOTE_TAG);
  if (index < 0) {
    return undefined;
  }
  return line.slice(index + IMPACT_NOTE_TAG.length).trim();
}

export interface LocatedNote {
  readonly line: number;
  readonly text: string;
}

export function findImpactNote(
  lines: readonly string[],
  declarationLine: number,
  maxDistance = 5,
): LocatedNote | undefined {
  const firstLine = Math.max(0, declarationLine - maxDistance);
  for (let line = declarationLine - 1; line >= firstLine; line -= 1) {
    const source = lines[line] ?? '';
    const text = parseImpactNote(source);
    if (text !== undefined) {
      return { line, text };
    }
    const trimmed = source.trim();
    const canAppearBetweenNoteAndDeclaration = trimmed.length === 0
      || /^(\/\/|#|--|\/\*|\*|\*\/|@)/.test(trimmed);
    if (!canAppearBetweenNoteAndDeclaration) {
      break;
    }
  }
  return undefined;
}

export function formatImpactNote(
  languageId: string,
  text: string,
  indentation = '',
): string {
  return `${indentation}${lineCommentPrefix(languageId)} ${IMPACT_NOTE_TAG} ${text}`;
}
