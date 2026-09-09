import { emitter } from './emitter';
import { handler } from './handler';
export function subscribe(): void {
  emitter.on('x', handler);
}
