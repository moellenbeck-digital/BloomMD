/**
 * Controls that sit on a map node are scaled with the map. A 44 px touch target is 13 px on screen
 * once a large map is fitted to the screen (zoom 0.3). On touch screens these controls cancel the
 * zoom, so they keep their on-screen size at any zoom level.
 */

/** Set on the canvas element by `MindMapCanvas` on every viewport change. */
export const CANVAS_ZOOM_VAR = "--bloommd-canvas-zoom";

/** Tailwind classes for a node control that keeps its on-screen size on touch screens (coarse pointer). */
export const COUNTER_ZOOM_CLASS = "pointer-coarse:[scale:calc(1/var(--bloommd-canvas-zoom,1))]";
