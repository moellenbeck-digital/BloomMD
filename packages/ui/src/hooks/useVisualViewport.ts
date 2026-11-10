"use client";

import { useEffect } from "react";
import { trackVisualViewport } from "../utils/visual-viewport";

/**
 * Mount once in an app shell. Publishes the visible height and the keyboard height as CSS variables
 * on `<html>`; see `VIEWPORT_ROOT_CLASS` for the root that uses them.
 */
export function useVisualViewport(): void {
  useEffect(() => trackVisualViewport(window, document.documentElement), []);
}
