/** Focus the rendered node element without moving the browser's page scroll position. */
export function focusNodeElement(nodeId: string): boolean {
  if (typeof document === "undefined") return false;
  const element = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  if (!element) return false;
  if (element.getAttribute("tabindex") === "-1") return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

export interface NodeFocusRequest {
  nodeId: string;
  requestId: number;
  reveal?: boolean;
}

let latestRequestId = 0;
let pendingTimer: number | null = null;

/** Cancel focus retries when the active document or workspace changes. */
export function cancelPendingNodeFocus(): void {
  latestRequestId += 1;
  if (pendingTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(pendingTimer);
  }
  pendingTimer = null;
}

/** Used by the canvas to ignore a center/focus callback from an older mutation. */
export function isCurrentNodeFocusRequest(requestId: number): boolean {
  return requestId === latestRequestId;
}

/**
 * Request focus after a state mutation. Focus an existing selected node immediately, then retry
 * if React Flow still needs to render it. A newer request invalidates the previous request.
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
    pendingTimer = null;
    if (!isCurrentNodeFocusRequest(requestId)) return;
    if (focusNodeElement(nodeId) || attempts >= 4) return;
    attempts += 1;
    pendingTimer = window.setTimeout(tryFocus, 50);
  };

  // The existing selected node can be focused immediately. Waiting for a frame loses the next
  // Tab/Enter/arrow key when someone types directly after closing the editor.
  tryFocus();
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
