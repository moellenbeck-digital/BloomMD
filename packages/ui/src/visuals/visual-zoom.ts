/** Zoom and pan of the enlarged image/diagram view. Pure state transitions, no DOM. */

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;
export const PAN_STEP = 60;

export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export const INITIAL_VIEW: ViewTransform = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/**
 * Zooms by `factor`. With `anchor` (pointer position relative to the viewer centre) the point under
 * the pointer stays where it is, which is what makes wheel zoom feel steady.
 */
export function zoomBy(view: ViewTransform, factor: number, anchor: { x: number; y: number } = { x: 0, y: 0 }): ViewTransform {
  const scale = clampScale(view.scale * factor);
  if (scale === view.scale) return view;
  const ratio = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}

export function panBy(view: ViewTransform, dx: number, dy: number): ViewTransform {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** Wheel delta to zoom factor; one notch (100) is one zoom step. */
export function wheelFactor(deltaY: number): number {
  return Math.pow(ZOOM_STEP, -deltaY / 100);
}

export function zoomPercent(view: ViewTransform): number {
  return Math.round(view.scale * 100);
}

export type ViewerCommand = "zoom-in" | "zoom-out" | "reset" | "pan-left" | "pan-right" | "pan-up" | "pan-down";

/** The viewer command a key stands for, or null when the key is not the viewer's. */
export function viewerCommandForKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): ViewerCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key) {
    case "+":
    case "=":
      return "zoom-in";
    case "-":
    case "_":
      return "zoom-out";
    case "0":
      return "reset";
    case "ArrowLeft":
      return "pan-left";
    case "ArrowRight":
      return "pan-right";
    case "ArrowUp":
      return "pan-up";
    case "ArrowDown":
      return "pan-down";
    default:
      return null;
  }
}

export function applyViewerCommand(view: ViewTransform, command: ViewerCommand): ViewTransform {
  switch (command) {
    case "zoom-in":
      return zoomBy(view, ZOOM_STEP);
    case "zoom-out":
      return zoomBy(view, 1 / ZOOM_STEP);
    case "reset":
      return INITIAL_VIEW;
    case "pan-left":
      return panBy(view, PAN_STEP, 0);
    case "pan-right":
      return panBy(view, -PAN_STEP, 0);
    case "pan-up":
      return panBy(view, 0, PAN_STEP);
    case "pan-down":
      return panBy(view, 0, -PAN_STEP);
  }
}
