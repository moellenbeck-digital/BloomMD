import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { Node, Viewport } from "@xyflow/react";
import { installDom } from "../components/test-dom";

type MeasuredNode = { position: { x: number; y: number }; measured: { width?: number; height?: number }; initialWidth?: number; initialHeight?: number };
const flow = { panZoom: {}, width: 800, height: 600, nodes: [] as (MeasuredNode & { id: string })[] };
let viewport: Viewport = { x: 17, y: 29, zoom: 0.6 };
const fitView = mock(() => Promise.resolve(true));
const fitBounds = mock(() => Promise.resolve(true));
const bounds = { x: 0, y: 0, width: 239880, height: 60 };
const getNodesBounds = mock((_nodes: Node[]) => bounds);
const setViewport = mock((_viewport: Viewport) => Promise.resolve(true));
const getViewport = () => viewport;
mock.module("@xyflow/react", () => ({
  useReactFlow: () => ({ fitView, fitBounds, getNodesBounds, setViewport, getViewport }),
  useStore: <T,>(select: (state: typeof flow) => T) => select(flow),
}));
const { useInitialCanvasViewport } = await import("./useInitialCanvasViewport");

let restoreFrames: (() => void) | undefined;
let root: Root;
let container: HTMLElement;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let fitted = false;
function Harness({ name, nodes, overview = false, pending = false, virtualized = false }: { name: string; nodes: Node[]; overview?: boolean; pending?: boolean; virtualized?: boolean }) {
  fitted = useInitialCanvasViewport(name, "map", overview, nodes, pending, virtualized);
  return null;
}
const node = (id: string, x = 0): Node => ({ id, position: { x, y: 0 }, data: {} });
function measured(nodes: Node[]) {
  flow.nodes = nodes.map((n) => ({ id: n.id, position: n.position, measured: { width: 180, height: 54 } }));
}
function show(name: string, nodes: Node[], overview = false, pending = false, virtualized = false) {
  flushSync(() => root.render(<Harness name={name} nodes={nodes} overview={overview} pending={pending} virtualized={virtualized} />));
}
async function frame() {
  const pending = [...frames.values()]; frames.clear();
  pending.forEach((callback) => callback(0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync(() => {});
}

beforeEach(() => {
  installDom();
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  restoreFrames = () => { globalThis.requestAnimationFrame = request; globalThis.cancelAnimationFrame = cancel; };
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  frames = new Map(); nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  flow.width = 800; flow.height = 600; flow.nodes = [];
  fitView.mockClear(); fitBounds.mockClear(); getNodesBounds.mockClear(); setViewport.mockClear();
  viewport = { x: 17, y: 29, zoom: 0.6 };
});
afterEach(() => { flushSync(() => root.unmount()); container.remove(); restoreFrames?.(); });

test("a cancelled initial frame is retried for the new layout, then later edits keep the view", async () => {
  const first = [node("root")]; measured(first); show("file", first);
  expect(fitted).toBe(false);
  const updated = [node("root"), node("child", 250)]; measured(updated); show("file", updated);
  await frame();
  expect(fitView).toHaveBeenCalledTimes(1);
  expect(fitView.mock.calls[0]).toEqual([{ padding: 0.3, duration: 0, nodes: [{ id: "root" }, { id: "child" }] }]);
  expect(fitted).toBe(true);
  const edited = [...updated, node("sibling", 300)]; measured(edited); show("file", edited);
  await frame();
  expect(fitView).toHaveBeenCalledTimes(1);
});

test("waits for the current document, final positions, measurements and a nonzero pane", async () => {
  const nodes = [node("new", 250)]; measured([node("old")]); show("new-file", nodes);
  await frame(); expect(fitView).not.toHaveBeenCalled();
  measured([node("new", 0)]); show("new-file", nodes);
  await frame(); expect(fitView).not.toHaveBeenCalled();
  measured(nodes); flow.nodes[0]!.measured = {}; show("new-file", nodes);
  await frame(); expect(fitView).not.toHaveBeenCalled();
  measured(nodes); flow.width = 0; show("new-file", nodes);
  await frame(); expect(fitView).not.toHaveBeenCalled();
  flow.width = 800; show("new-file", nodes, false, true);
  await frame(); expect(fitView).not.toHaveBeenCalled();
  show("new-file", nodes);
  await frame(); expect(fitView).toHaveBeenCalledTimes(1);
});

test("returning to an overview restores its view even when an intervening file never finished fitting", async () => {
  const overview = [node("folder")]; measured(overview); show("overview", overview, true);
  await frame();
  const file = [node("root")]; measured(file); show("file", file);
  viewport = { x: 500, y: 400, zoom: 2 };
  measured(overview); show("overview", overview, true);
  await frame();
  expect(fitView).toHaveBeenCalledTimes(1);
  expect(setViewport.mock.calls[0]).toEqual([{ x: 17, y: 29, zoom: 0.6 }, { duration: 0 }]);
  expect(fitted).toBe(true);
});

test("virtualized maps fit without mounting every offscreen node and do not refit on later measurements", async () => {
  const nodes = Array.from({ length: 800 }, (_, index) => ({ ...node(`node-${index}`, index * 300), initialWidth: 180, initialHeight: 54 }));
  flow.nodes = nodes.map((n) => ({ ...n, measured: {} }));
  flow.nodes[0]!.measured = { width: 190, height: 60 };
  show("large", nodes, true, false, true);
  await frame();
  expect(fitted).toBe(true);
  expect(fitView).not.toHaveBeenCalled();
  expect(fitBounds.mock.calls).toEqual([[bounds, { padding: 0.3, duration: 0 }]]);
  expect(getNodesBounds.mock.calls).toEqual([[nodes]]);
  flow.nodes[400]!.measured = { width: 200, height: 70 };
  show("large", nodes, true, false, true);
  await frame();
  expect(fitBounds).toHaveBeenCalledTimes(1);
});

test("virtualization still waits for valid dimensions and the final layout", async () => {
  const nodes = [{ ...node("root", 200), initialWidth: 180, initialHeight: 54 }];
  flow.nodes = [{ ...nodes[0]!, measured: {}, initialHeight: undefined }];
  show("large", nodes, true, false, true);
  await frame(); expect(fitBounds).not.toHaveBeenCalled();
  flow.nodes = [{ ...nodes[0]!, measured: {}, position: { x: 0, y: 0 } }];
  show("large", nodes, true, false, true);
  await frame(); expect(fitBounds).not.toHaveBeenCalled();
  flow.nodes = [{ ...nodes[0]!, measured: {} }];
  show("large", nodes, true, true, true);
  await frame(); expect(fitBounds).not.toHaveBeenCalled();
  show("large", nodes, true, false, true);
  await frame(); expect(fitted).toBe(true);
});
