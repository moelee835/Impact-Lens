import { handler } from './handler';
export function timeoutCaller(): void {
  setTimeout(handler, 0);
}
