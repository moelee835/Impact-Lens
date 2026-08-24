export interface TextPosition {
  readonly line: number;
  readonly character: number;
}

export interface TextRange {
  readonly start: TextPosition;
  readonly end: TextPosition;
}

export interface DeclarationAnchorInput {
  readonly name: string;
  readonly symbolRange: TextRange;
  readonly providerSelection: TextRange;
}

interface Candidate extends TextPosition {
  readonly score: number;
}

const maximumScanLines = 80;
const declarationKeyword = /(?:^|\s)(?:async\s+)?(?:def|function|func|fn|fun|sub|procedure)\s+\**$/i;
const invocationLine = /^\s*(?:return|yield|await|new|throw|raise|if|while|for|switch|case|catch|typeof|delete|void)\b/i;

export function findDeclarationAnchor(
  lines: readonly string[],
  input: DeclarationAnchorInput,
): TextPosition {
  return findDeclarationAnchorWithLineAt(
    line => lines[line] ?? '',
    lines.length,
    input,
  );
}

export function findDeclarationAnchorWithLineAt(
  lineAt: (line: number) => string,
  lineCount: number,
  input: DeclarationAnchorInput,
): TextPosition {
  const provider = input.providerSelection.start;
  const providerLine = provider.line >= 0 && provider.line < lineCount ? lineAt(provider.line) : '';
  if (
    pointsAtName(providerLine, provider.character, input.name)
    && declarationScore(providerLine, provider.character, input.name) > 0
  ) {
    return provider;
  }

  const firstLine = clamp(input.symbolRange.start.line, 0, Math.max(0, lineCount - 1));
  const lastLine = Math.min(
    input.symbolRange.end.line,
    firstLine + maximumScanLines,
    Math.max(0, lineCount - 1),
  );
  const candidates: Candidate[] = [];
  for (let line = firstLine; line <= lastLine; line += 1) {
    const text = lineAt(line);
    for (const character of nameOccurrences(text, input.name)) {
      const score = declarationScore(text, character, input.name);
      if (score > 0) {
        candidates.push({ line, character, score });
      }
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.line - right.line || left.character - right.character);
  const best = candidates[0];
  return best
    ? { line: best.line, character: best.character }
    : input.symbolRange.start;
}

function declarationScore(line: string, character: number, name: string): number {
  const prefix = line.slice(0, character);
  const suffix = line.slice(character + name.length);
  if (declarationKeyword.test(prefix)) {
    return 100;
  }
  if (/\b(?:const|let|var)\s+$/i.test(prefix) && arrowAssignment.test(suffix)) {
    return 95;
  }
  if (invocationLine.test(line)) {
    return 0;
  }
  if (/^\s*(?:<[^>{}]*>)?\s*\(/.test(suffix)) {
    return 70;
  }
  return 0;
}

const arrowAssignment = /^\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;

function pointsAtName(line: string, character: number, name: string): boolean {
  return line.slice(character, character + name.length) === name
    && isBoundary(line[character - 1])
    && isBoundary(line[character + name.length]);
}

function nameOccurrences(line: string, name: string): number[] {
  const result: number[] = [];
  let offset = 0;
  while (offset <= line.length - name.length) {
    const character = line.indexOf(name, offset);
    if (character < 0) {
      break;
    }
    if (isBoundary(line[character - 1]) && isBoundary(line[character + name.length])) {
      result.push(character);
    }
    offset = character + Math.max(1, name.length);
  }
  return result;
}

function isBoundary(value: string | undefined): boolean {
  return value === undefined || !/[\p{L}\p{N}_$]/u.test(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
