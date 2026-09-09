import { handler } from './handler';
declare const button: HTMLButtonElement;
export function listenerCaller(): void {
  button.addEventListener('click', handler);
}
