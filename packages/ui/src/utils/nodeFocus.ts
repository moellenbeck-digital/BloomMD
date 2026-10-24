/** Focus the rendered node element without moving the browser's page scroll position. */
export function focusNodeElement(nodeId: string): boolean {
  if (typeof document === "undefined") return false;
  const element = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  if (!element) return false;
  if (element.getAttribute("tabindex") === "-1") return false;
  element.focus({ preventScroll: true });
  return true;
}

export interface NodeFocusRequest {
  nodeId: string;
  requestId: number;
  reveal?: boolean;
}

let latestRequestId = 0;
let pendingFrame: number | null = null;
let pendingTimer: number | null = null;

/** Cancel focus retries when the active document or workspace changes. */
export function cancelPendingNodeFocus(): void {
  latestRequestId += 1;
  if (pendingFrame !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(pendingFrame);
  }
  if (pendingTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(pendingTimer);
  }
  pendingFrame = null;
  pendingTimer = null;
}

/** Used by the canvas to ignore a center/focus callback from an older mutation. */
export function isCurrentNodeFocusRequest(requestId: number): boolean {
  return requestId === latestRequestId;
}

/**
 * Request focus after a state mutation. React Flow may need several render frames before the
 * target exists and becomes selected. A newer request invalidates the complete previous request.
 */
export function requestNodeFocus(nodeId: string, reveal = true): void {
  if (typeof window === "undefined") return;

  cancelPendingNodeFocus();
  const requestId = latestRequestId;

  window.dispatchEvent(new window.CustomEvent<NodeFocusRequest>("bloommd:focus-node", {
    detail: { nodeId, requestId, reveal },
  }));

  let attempts = 0;
  const tryFocus = () => {
    pendingFrame = null;
    pendingTimer = null;
    if (!isCurrentNodeFocusRequest(requestId)) return;
    if (focusNodeElement(nodeId) || attempts >= 4) return;
    attempts += 1;
    pendingTimer = window.setTimeout(tryFocus, 50);
  };

  if (typeof window.requestAnimationFrame === "function") {
    pendingFrame = window.requestAnimationFrame(tryFocus);
  } else {
    pendingTimer = window.setTimeout(tryFocus, 0);
  }
}

/** Keep visible nodes stationary; reveal keyboard targets only when outside the usable canvas. */
export function isNodeVisibleInViewport(
  node: { x: number; y: number; width: number; height: number },
  viewport: { x: number; y: number; zoom: number },
  canvas: { width: number; height: number },
): boolean {
  const left = node.x * viewport.zoom + viewport.x;
  const top = node.y * viewport.zoom + viewport.y;
  return left >= 16 && top >= 16 &&
    left + node.width * viewport.zoom <= canvas.width - 16 &&
    top + node.height * viewport.zoom <= canvas.height - 16;
}
