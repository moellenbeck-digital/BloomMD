import { useMindMapStore } from "@bloommd/ui";
import { recordE2EState } from "./rpc";

/** Passive native-WebView measurements, included only in explicitly instrumented test builds. */
export function installPerformanceProbe(): void {
  // Observe real input; never synthesize gestures or change the viewport.
  let interactionActive = false;
  let interactionEvents = 0;
  const observeInteraction = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest(".react-flow")) return;
    interactionEvents += 1;
    if (interactionActive || performance.now() - started < 5000) return;
    interactionActive = true;
    interactionEvents = 1;
    const interactionStarted = performance.now();
    let previous = interactionStarted;
    let maximumGap = 0;
    let count = 0;
    let frameId = 0;
    const sample = (now: number) => {
      count += 1;
      maximumGap = Math.max(maximumGap, now - previous);
      previous = now;
      frameId = requestAnimationFrame(sample);
    };
    frameId = requestAnimationFrame(sample);
    setTimeout(() => {
      cancelAnimationFrame(frameId);
      interactionActive = false;
      const state = useMindMapStore.getState();
      void recordE2EState({
        source: "rendererInteraction",
        performance: {
          timeToFirstNodesMs: null,
          visibilityState: document.visibilityState,
          samplingMs: performance.now() - interactionStarted,
          maxFrameGapMs: maximumGap,
          frames: count,
          mountedNodeCount: document.querySelectorAll(".react-flow__node").length,
          graphNodeCount: state.nodes.length,
          documentNodeCount: state.document?.nodes.size ?? 0,
          interactionKind: event.type,
          interactionEvents,
        },
      }).catch((error) => console.error("[BloomMD] Interaction probe could not record its result:", error));
    }, 5000);
  };
  window.addEventListener("pointerdown", observeInteraction, { capture: true, passive: true });
  window.addEventListener("wheel", observeInteraction, { capture: true, passive: true });
  const started = performance.now();
  let firstNodes: number | null = null;
  let previousFrame = started;
  let maxFrameGapMs = 0;
  let frames = 0;
  let stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    frames += 1;
    maxFrameGapMs = Math.max(maxFrameGapMs, now - previousFrame);
    previousFrame = now;
    if (firstNodes === null && document.querySelector(".react-flow__node")) firstNodes = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setTimeout(() => {
    stopped = true;
    const state = useMindMapStore.getState();
    void recordE2EState({
      source: "rendererPerformance",
      performance: {
        timeToFirstNodesMs: firstNodes,
        visibilityState: document.visibilityState,
        samplingMs: performance.now() - started,
        maxFrameGapMs,
        frames,
        mountedNodeCount: document.querySelectorAll(".react-flow__node").length,
        graphNodeCount: state.nodes.length,
        documentNodeCount: state.document?.nodes.size ?? 0,
      },
    }).catch((error) => console.error("[BloomMD] Performance probe could not record its result:", error));
  }, 5000);
}
