import * as path from 'node:path';
import { ImpactRelation } from './types';

const testDirectories = new Set(['__tests__', 'test', 'tests', 'spec', 'specs']);

export function isTestFilePath(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some(segment => testDirectories.has(segment.toLowerCase()))) {
    return true;
  }
  const extension = path.extname(normalized);
  const base = path.basename(normalized, extension);
  return /(?:\.test|\.spec)$/i.test(base)
    || /^(?:test|spec)_/i.test(base)
    || /_(?:test|spec)$/i.test(base)
    || /(?:Test|Tests)$/.test(base);
}

export function classifyRelation(depth: number, file: string): ImpactRelation {
  if (depth === 0) {
    return 'root';
  }
  if (isTestFilePath(file)) {
    return 'test';
  }
  return depth === 1 ? 'direct' : 'transitive';
}
