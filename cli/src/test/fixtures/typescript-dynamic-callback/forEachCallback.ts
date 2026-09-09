import { handler } from './handler';
export function forEachCaller(): void {
  const items: Array<() => void> = [];
  items.forEach(handler);
}
