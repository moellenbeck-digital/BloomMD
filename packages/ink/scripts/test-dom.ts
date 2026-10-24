import { Window } from "happy-dom";

/** The editor tests render InkEditor with React; a small, real DOM stands in for the browser. */
const window = new Window({ url: "https://bloommd.test/ink" });

globalThis.window = window as unknown as Window & typeof globalThis.window;
globalThis.document = window.document as unknown as Document;
globalThis.navigator = window.navigator as unknown as Navigator;
globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
