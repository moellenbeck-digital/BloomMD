import { useMindMapStore } from "../hooks/useMindMapStore";
import { captureMap, MapExportError, type MapImageFormat } from "./capture-map";
import { buildExportFile, type ExportFile } from "./export-file";

const MOUNT_TIMEOUT_MS = 5000;

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

/** Waits until the canvas has mounted every node (the desktop canvas only mounts those in view). */
async function waitForAllNodes(shell: HTMLElement, expected: number): Promise<void> {
  const deadline = Date.now() + MOUNT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (shell.querySelectorAll(".react-flow__node").length >= expected) break;
    await nextFrame();
  }
  // One more beat so node sizes and edge paths are measured.
  await nextFrame();
  await nextFrame();
}

/**
 * Exports the map that is open in the canvas as PNG, SVG or PDF. The canvas is switched to the map
 * view and to full rendering for the duration of the export and restored afterwards.
 */
export async function exportMapFile(format: MapImageFormat, shell: HTMLElement | null = window.document.getElementById("mindmap-canvas")): Promise<ExportFile> {
  const store = useMindMapStore.getState();
  const doc = store.document;
  if (!doc || !shell) throw new MapExportError("no-map", "The map view is not mounted.");
  const previousMode = store.canvasMode;
  const previousRenderAll = store.exportRenderAll;
  try {
    if (previousMode !== "map") store.setCanvasMode("map");
    store.setExportRenderAll(true);
    await waitForAllNodes(shell, useMindMapStore.getState().nodes.length);
    const image = await captureMap(shell, format);
    return buildExportFile(format, doc.frontmatter.title, image.data);
  } finally {
    const current = useMindMapStore.getState();
    current.setExportRenderAll(previousRenderAll);
    if (previousMode !== "map") current.setCanvasMode(previousMode);
  }
}
