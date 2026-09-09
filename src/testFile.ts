import { isTestFilePath } from '../cli/dist/shared/testFileClassifier';

export { isTestFilePath };

/**
 * Classifies a caller. `path` must already be workspace-relative when the file is inside the
 * workspace (see `../cli/dist/shared/testFileClassifier`'s contract) - callers are responsible for
 * relativizing before calling this, this function does not do it for them.
 */
export function classifyImpactRelation(
  depth: number,
  path: string,
): 'root' | 'direct' | 'transitive' | 'test' {
  if (depth === 0) {
    // See `cli/src/testFile.ts`'s identical branch for why this incidentally (not by design) also
    // shields the classifier from a real typeshed `.pyi` root path - the same reasoning applies here.
    return 'root';
  }
  if (isTestFilePath(path)) {
    return 'test';
  }
  return depth === 1 ? 'direct' : 'transitive';
}
