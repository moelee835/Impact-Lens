export function shadowedTimeoutCaller(): void {
  function handler(): void {
    console.log('shadowed, not the real target');
  }
  setTimeout(handler, 0);
}
