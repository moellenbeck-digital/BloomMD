import { afterEach, expect, spyOn, test } from "bun:test";
import { parseFile } from "@bloommd/core/browser";
import { configureLayoutWorker, useMindMapStore } from "./useMindMapStore";
import { computeVisibleLayout } from "./visible-layout";

class ControlledWorker {
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  input: { doc: Parameters<typeof computeVisibleLayout>[0]; collapsedIds: Set<string>; focusNodeId: string | null; edgeMode: Parameters<typeof computeVisibleLayout>[3] } | null = null;
  postMessage(input: NonNullable<ControlledWorker["input"]>) { this.input = input; }
  terminate() { this.terminated = true; }
  complete() {
    const { doc, collapsedIds, focusNodeId, edgeMode } = this.input!;
    this.onmessage?.({ data: computeVisibleLayout(doc, collapsedIds, focusNodeId, edgeMode) } as MessageEvent);
  }
}

const workers: ControlledWorker[] = [];
function install() {
  configureLayoutWorker(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
}
afterEach(() => {
  useMindMapStore.getState().setDocument(null);
  configureLayoutWorker(null);
  workers.length = 0;
});

test("background layout leaves document actions available and publishes geometry when ready", () => {
  install();
  const doc = parseFile("first.md", "# First\n\n## Child\n");
  useMindMapStore.getState().setDocument(doc);
  expect(useMindMapStore.getState().layoutPending).toBe(true);
  expect(useMindMapStore.getState().nodes).toHaveLength(0);
  useMindMapStore.getState().setEditorVisible(true);
  expect(useMindMapStore.getState().editorVisible).toBe(true);
  workers[0].complete();
  expect(useMindMapStore.getState().nodes).toHaveLength(2);
  expect(useMindMapStore.getState().layoutPending).toBe(false);
  expect(workers[0].terminated).toBe(true);
});

test("switch and reset terminate workers and reject late geometry", () => {
  install();
  useMindMapStore.getState().setDocument(parseFile("first.md", "# First\n"));
  useMindMapStore.getState().setDocument(parseFile("second.md", "# Second\n"));
  expect(workers[0].terminated).toBe(true);
  workers[0].complete();
  expect(useMindMapStore.getState().nodes).toHaveLength(0);
  workers[1].complete();
  expect(useMindMapStore.getState().nodes[0].data.label).toBe("Second");
  useMindMapStore.getState().relayout();
  useMindMapStore.getState().setDocument(null);
  expect(workers[2].terminated).toBe(true);
  workers[2].complete();
  expect(useMindMapStore.getState().document).toBeNull();
  expect(useMindMapStore.getState().nodes).toHaveLength(0);
  expect(useMindMapStore.getState().layoutPending).toBe(false);
});

test("collapse supersedes an in-flight layout", () => {
  install();
  const doc = parseFile("first.md", "# First\n\n## Child\n");
  useMindMapStore.getState().setDocument(doc);
  useMindMapStore.getState().toggleCollapse(doc.rootId);
  expect(workers[0].terminated).toBe(true);
  workers[1].complete();
  workers[0].complete();
  expect(useMindMapStore.getState().nodes).toHaveLength(1);
  expect(useMindMapStore.getState().nodes[0].data.collapsed).toBe(true);
});


test("worker errors are visible, late success is discarded, and retry can recover", () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    install();
    useMindMapStore.getState().setDocument(parseFile("error.md", "# Error\n"));
    workers[0].onerror?.({ message: "worker failure" } as ErrorEvent);
    expect(useMindMapStore.getState().layoutPending).toBe(false);
    expect(useMindMapStore.getState().layoutFailed).toBe(true);
    workers[0].complete();
    expect(useMindMapStore.getState().nodes).toHaveLength(0);
    useMindMapStore.getState().relayout();
    workers[1].complete();
    expect(useMindMapStore.getState().layoutFailed).toBe(false);
    expect(useMindMapStore.getState().nodes).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    log.mockRestore();
  }
});
