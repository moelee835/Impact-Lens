import { handler } from './handler';
export function pushCaller(): void {
  const items: Array<() => void> = [];
  items.push(handler);
}
