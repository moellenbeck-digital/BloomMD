/**
 * On-screen keyboard handling.
 *
 * Browsers disagree on what the keyboard does to the page: Android Chrome and the Capacitor WebView
 * (`adjustResize`, `interactive-widget=resizes-content`) shrink the layout viewport, so `dvh` follows.
 * iOS Safari and WKWebView keep the layout viewport and only shrink and pan the visual viewport. The
 * `visualViewport` API reports both cases, so the app root is sized from it.
 */

export const VIEWPORT_HEIGHT_VAR = "--bloommd-viewport-height";
export const VIEWPORT_TRANSLATE_VAR = "--bloommd-viewport-translate";

/**
 * Classes for an app root that fills the screen: it takes the variables above and falls back to `dvh`
 * where they are not set (desktop, no `visualViewport`, page pinch-zoomed).
 */
export const VIEWPORT_ROOT_CLASS = "h-[var(--bloommd-viewport-height,100dvh)] [translate:var(--bloommd-viewport-translate,none)]";

/** Like `VIEWPORT_ROOT_CLASS` for a root whose parents already have the screen height (`#root { height: 100% }`). */
export const VIEWPORT_ROOT_FILL_CLASS = "h-[var(--bloommd-viewport-height,100%)] [translate:var(--bloommd-viewport-translate,none)]";

/** The visual viewport must be at least this much smaller than the layout viewport to count as a keyboard. */
export const KEYBOARD_MIN_SHRINK_PX = 80;

export interface ViewportMetrics {
  /** `window.innerHeight`: the layout viewport. */
  layoutHeight: number;
  /** `visualViewport.height`. */
  visualHeight: number;
  /** `visualViewport.offsetTop`: how far the browser panned the visual viewport inside the layout viewport. */
  offsetTop: number;
  /** `visualViewport.scale`: above 1 the user pinch-zoomed the page. */
  scale: number;
}

export interface ViewportLayout {
  /** Height of the visible area in px, or null while the layout viewport is already right. */
  height: number | null;
  /** Offset to follow a pan of the visual viewport, or null when there is none. */
  translateY: number | null;
}

export function computeViewportLayout(metrics: ViewportMetrics): ViewportLayout {
  const { layoutHeight, visualHeight, offsetTop, scale } = metrics;
  // A pinch-zoomed page shrinks the visual viewport too. That is not a keyboard: leave the layout alone.
  if (scale > 1.01) return { height: null, translateY: null };
  // When the keyboard shrinks the layout viewport (Android) the two heights match and `dvh` is right already.
  const shrink = layoutHeight - visualHeight;
  if (shrink < KEYBOARD_MIN_SHRINK_PX) return { height: null, translateY: null };
  return {
    height: Math.round(visualHeight),
    translateY: offsetTop >= 1 ? Math.round(offsetTop) : null,
  };
}

/** Writes the layout to the CSS variables of `root`. */
export function applyViewportLayout(root: HTMLElement, layout: ViewportLayout): void {
  const { style } = root;
  if (layout.height === null) style.removeProperty(VIEWPORT_HEIGHT_VAR);
  else style.setProperty(VIEWPORT_HEIGHT_VAR, `${layout.height}px`);
  if (layout.translateY === null) style.removeProperty(VIEWPORT_TRANSLATE_VAR);
  else style.setProperty(VIEWPORT_TRANSLATE_VAR, `0 ${layout.translateY}px`);
}

/**
 * Keeps the variables on `root` in step with the visual viewport. Returns the cleanup; without
 * `visualViewport` it does nothing.
 */
export function trackVisualViewport(win: Window, root: HTMLElement): () => void {
  const viewport = win.visualViewport;
  if (!viewport) return () => undefined;
  const update = () => {
    applyViewportLayout(root, computeViewportLayout({
      layoutHeight: win.innerHeight,
      visualHeight: viewport.height,
      offsetTop: viewport.offsetTop,
      scale: viewport.scale,
    }));
  };
  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  win.addEventListener("resize", update);
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    win.removeEventListener("resize", update);
    root.style.removeProperty(VIEWPORT_HEIGHT_VAR);
    root.style.removeProperty(VIEWPORT_TRANSLATE_VAR);
  };
}

/** Elements that open the on-screen keyboard. */
export const TEXT_ENTRY_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="file"]), textarea, select, [contenteditable=""], [contenteditable="true"]';

/** Scrolls a focused text field into the visible part of its scroll container. */
export function revealFocusedField(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement) || !target.matches(TEXT_ENTRY_SELECTOR)) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}
