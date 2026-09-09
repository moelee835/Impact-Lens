import { handler } from './handler';
export function outerCaller(): void {
  function inner(): void {
    const msg = "shape: {";
    console.log(msg);
  }
  setTimeout(handler, 0);
}
