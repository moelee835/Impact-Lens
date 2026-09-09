import { handler } from './handler';
declare const button: HTMLButtonElement;
export function assignOnclick(): void {
  button.onclick = handler;
}
