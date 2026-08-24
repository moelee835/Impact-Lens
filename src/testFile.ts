const TEST_DIRECTORIES = new Set(['__tests__', 'test', 'tests', 'spec', 'specs']);

/** Returns whether a path follows a common test directory or file naming convention. */
export function isTestFilePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments.at(-1) ?? '';

  if (segments.slice(0, -1).some(segment => TEST_DIRECTORIES.has(segment.toLowerCase()))) {
    return true;
  }

  return (
    /\.(?:test|spec)\.[^/]+$/i.test(fileName)
    || /^(?:test|spec)[_-].+\.[^/]+$/i.test(fileName)
    || /[_-](?:test|spec)\.[^/]+$/i.test(fileName)
    || /(?:Test|Tests)\.[^/]+$/.test(fileName)
  );
}

export function classifyImpactRelation(
  depth: number,
  path: string,
): 'root' | 'direct' | 'transitive' | 'test' {
  if (depth === 0) {
    return 'root';
  }
  if (isTestFilePath(path)) {
    return 'test';
  }
  return depth === 1 ? 'direct' : 'transitive';
}
