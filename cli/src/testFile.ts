import { isTestFilePath } from './shared/testFileClassifier';
import { ImpactRelation } from './types';

export { isTestFilePath };

/**
 * Classifies a caller. `file` must already be workspace-relative when it is inside the workspace (see
 * `./shared/testFileClassifier`'s contract) - callers are responsible for relativizing before calling
 * this, this function does not do it for them.
 */
export function classifyRelation(depth: number, file: string): ImpactRelation {
  if (depth === 0) {
    // This also happens to be the only thing standing between the classifier and a real typeshed
    // `.pyi` path: reviewer ran bundled pyright directly and confirmed a C-implemented stdlib symbol
    // (`math.sqrt`) resolves its root to `.../pyright/dist/typeshed-fallback/stdlib/math/__init__.pyi`
    // - but only ever at depth 0, since a `.pyi` stub has no function body and can never be an incoming
    // call's caller, so it can never reach this function at any OTHER depth. That is not why this
    // branch exists - it exists so the root node is always `'root'` regardless of its own path - but it
    // is the only thing currently preventing a `.pyi` root from ever reaching the naming-convention
    // classifier below. Do not remove this short-circuit while assuming it is dead code for that reason.
    return 'root';
  }
  if (isTestFilePath(file)) {
    return 'test';
  }
  return depth === 1 ? 'direct' : 'transitive';
}
