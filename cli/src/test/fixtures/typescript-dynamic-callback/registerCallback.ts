import { handler } from './handler';
declare function register(fn: () => void): void;
export function registerCaller(): void {
  register(handler);
}
