import { handler } from './handler';
function setTimeout(fn: () => void, ms: number): void {
  // Not the real setTimeout - a workspace function shadowing the global name.
}
export function fakeTimeoutCaller(): void {
  setTimeout(handler, 0);
}
