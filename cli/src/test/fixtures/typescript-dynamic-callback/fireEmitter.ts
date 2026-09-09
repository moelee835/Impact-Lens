import { emitter } from './emitter';
export function fire(): void {
  emitter.emit('x');
}
