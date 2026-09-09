import { handler } from './handler';
export function regexOuterCaller(): void {
  function regexInner(): void {
    const re = /\{/;
    console.log(re);
  }
  setTimeout(handler, 0);
}
