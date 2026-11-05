import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  applyViewportLayout,
  computeViewportLayout,
  trackVisualViewport,
  VIEWPORT_HEIGHT_VAR,
  VIEWPORT_TRANSLATE_VAR,
} from "./visual-viewport";

describe("computeViewportLayout", () => {
  test("leaves the layout alone without a keyboard", () => {
    expect(computeViewportLayout({ layoutHeight: 851, visualHeight: 851, offsetTop: 0, scale: 1 })).toEqual({ height: null, translateY: null });
  });

  test("ignores browser chrome that is smaller than a keyboard", () => {
    expect(computeViewportLayout({ layoutHeight: 851, visualHeight: 800, offsetTop: 0, scale: 1 })).toEqual({ height: null, translateY: null });
  });

  test("sizes the root to the visual viewport when the keyboard only shrinks that (iOS)", () => {
    expect(computeViewportLayout({ layoutHeight: 800, visualHeight: 452.4, offsetTop: 0, scale: 1 })).toEqual({ height: 452, translateY: null });
  });

  test("follows the pan of the visual viewport", () => {
    expect(computeViewportLayout({ layoutHeight: 800, visualHeight: 450, offsetTop: 348.6, scale: 1 })).toEqual({ height: 450, translateY: 349 });
  });

  test("does not mistake a pinch-zoomed page for a keyboard", () => {
    expect(computeViewportLayout({ layoutHeight: 800, visualHeight: 400, offsetTop: 120, scale: 2 })).toEqual({ height: null, translateY: null });
  });

  test("leaves the layout alone when the keyboard resized the layout viewport itself (Android)", () => {
    expect(computeViewportLayout({ layoutHeight: 500, visualHeight: 500, offsetTop: 0, scale: 1 })).toEqual({ height: null, translateY: null });
  });
});

describe("trackVisualViewport", () => {
  let win: Window;
  let root: HTMLElement;
  let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
  let originalHTMLElement: unknown;

  beforeEach(() => {
    originalHTMLElement = globalThis.HTMLElement;
    win = new Window({ url: "https://bloommd.test/app", height: 800 });
    globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
    root = win.document.documentElement as unknown as HTMLElement;
    viewport = Object.assign(new win.EventTarget(), { height: 800, offsetTop: 0, scale: 1 }) as unknown as typeof viewport;
    Object.defineProperty(win, "visualViewport", { configurable: true, value: viewport });
  });

  afterEach(() => {
    globalThis.HTMLElement = originalHTMLElement as typeof HTMLElement;
  });

  test("publishes the visible height while the keyboard is open and clears it afterwards", () => {
    const stop = trackVisualViewport(win as unknown as Window & typeof globalThis, root);
    expect(root.style.getPropertyValue(VIEWPORT_HEIGHT_VAR)).toBe("");

    viewport.height = 450;
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new win.Event("resize"));
    expect(root.style.getPropertyValue(VIEWPORT_HEIGHT_VAR)).toBe("450px");
    expect(root.style.getPropertyValue(VIEWPORT_TRANSLATE_VAR)).toBe("0 120px");

    viewport.height = 800;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new win.Event("resize"));
    expect(root.style.getPropertyValue(VIEWPORT_HEIGHT_VAR)).toBe("");
    expect(root.style.getPropertyValue(VIEWPORT_TRANSLATE_VAR)).toBe("");

    viewport.height = 450;
    stop();
    viewport.dispatchEvent(new win.Event("resize"));
    expect(root.style.getPropertyValue(VIEWPORT_HEIGHT_VAR)).toBe("");
  });

  test("does nothing without visualViewport", () => {
    Object.defineProperty(win, "visualViewport", { configurable: true, value: undefined });
    const stop = trackVisualViewport(win as unknown as Window & typeof globalThis, root);
    expect(root.style.getPropertyValue(VIEWPORT_HEIGHT_VAR)).toBe("");
    stop();
  });

  test("applyViewportLayout removes variables that no longer apply", () => {
    applyViewportLayout(root, { height: 400, translateY: 10 });
    expect(root.style.getPropertyValue(VIEWPORT_HEIGHT_VAR)).toBe("400px");
    applyViewportLayout(root, { height: null, translateY: null });
    expect(root.style.getPropertyValue(VIEWPORT_HEIGHT_VAR)).toBe("");
    expect(root.style.getPropertyValue(VIEWPORT_TRANSLATE_VAR)).toBe("");
  });
});
