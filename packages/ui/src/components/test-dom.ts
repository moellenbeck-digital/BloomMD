import { Window } from "happy-dom";

/** Gives a test a browser-like global scope. */
export function installDom() {
  const win = new Window({ url: "https://bloommd.test/app" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.navigator = win.navigator as unknown as Navigator;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
  globalThis.localStorage = win.localStorage as unknown as Storage;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;
}

/** Waits until `check` holds; React updates that follow a promise land after the test's own awaits. */
export async function waitFor(check: () => boolean, message = "condition") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${message}`);
}
