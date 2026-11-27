import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow, useStore, type Node, type Viewport } from "@xyflow/react";

/** Fit once after layout, using seeded sizes for offscreen nodes in a virtualized canvas. */
export function useInitialCanvasViewport(
  documentKey: string | null,
  canvasMode: string,
  overview: boolean,
  nodes: Node[],
  layoutPending: boolean,
  virtualized = false,
): boolean {
  const { fitView, fitBounds, getNodesBounds, getViewport, setViewport } = useReactFlow();
  // A -> B -> A is a new visit even if B was left before its first fit completed.
  const visit = useMemo(() => ({ documentKey, canvasMode }), [documentKey, canvasMode]);
  const [fittedVisit, setFittedVisit] = useState<typeof visit | null>(null);
  const overviewViewports = useRef(new Map<string, Viewport>());
  // Subscribe to the immutable controlled nodes, not the mutable internal nodeLookup Map.
  // Its measurements can change between React's render and subscription without changing identity.
  const renderedNodes = useStore((state) => state.nodes);
  const paneReady = useStore((state) => Boolean(state.panZoom) && state.width > 0 && state.height > 0);
  const renderedById = useMemo(() => new Map(renderedNodes.map((node) => [node.id, node])), [renderedNodes]);
  const ready = paneReady && nodes.length > 0 && renderedNodes.length === nodes.length
    && nodes.every((expected) => {
      const actual = renderedById.get(expected.id);
      const width = actual?.measured?.width ?? (virtualized ? actual?.initialWidth : undefined);
      const height = actual?.measured?.height ?? (virtualized ? actual?.initialHeight : undefined);
      return actual && width && height
        && actual.position.x === expected.position.x && actual.position.y === expected.position.y;
    });
  const fitted = fittedVisit === visit;
  useEffect(() => {
    if (!overview || !documentKey || canvasMode !== "map") return;
    return () => { overviewViewports.current.set(documentKey, getViewport()); };
  }, [canvasMode, documentKey, getViewport, overview]);

  useEffect(() => {
    if (canvasMode !== "map" || !documentKey || !ready || layoutPending || fitted) return;
    let cancelled = false;
    // Native WebViews can suspend animation frames while occluded; navigation must still finish.
    const timer = window.setTimeout(() => {
      const saved = overview ? overviewViewports.current.get(documentKey) : undefined;
      const padding = overview && window.matchMedia?.("(pointer: coarse)").matches ? 0.6 : 0.3;
      const move = saved
        ? setViewport(saved, { duration: 0 })
        // fitView queues until React Flow measures nodes; offscreen nodes may never mount.
        : virtualized
          ? fitBounds(getNodesBounds(nodes), { padding, duration: 0 })
          : fitView({ padding, duration: 0, nodes: nodes.map(({ id }) => ({ id })) });
      void move.then((applied) => {
        // Scheduling is not a completed fit: a new layout may cancel it before it runs.
        if (applied && !cancelled) setFittedVisit(visit);
      }).catch((error: unknown) => console.error("[BloomMD] Initial canvas view failed:", error));
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [canvasMode, documentKey, fitBounds, fitView, fitted, getNodesBounds, layoutPending, nodes, overview, ready, setViewport, virtualized, visit]);

  return fitted;
}
