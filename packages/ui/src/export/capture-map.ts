import {
  boundsOfRects,
  composeMapSvg,
  dataUrlToBytes,
  exportSize,
  exportView,
  jpegToPdf,
  parseNodeTranslate,
  type MapExportEdge,
  type MapExportRect,
} from "./map-export-core";

export type MapImageFormat = "png" | "svg" | "pdf";

export class MapExportError extends Error {
  readonly code: "no-map" | "empty";

  constructor(code: "no-map" | "empty", message: string) {
    super(message);
    this.name = "MapExportError";
    this.code = code;
  }
}

/** Editing chrome that must not appear in an exported map: handles, resize grips, action bars, drop markers. */
export const EXPORT_HIDDEN = [
  ".react-flow__edges",
  ".react-flow__handle",
  ".react-flow__resize-control",
  '[data-testid="node-action-toolbar"]',
  '[data-testid="drop-before"]',
  '[data-testid="drop-after"]',
  '[data-testid="drop-inside"]',
  '[data-testid="node-rename-input"]',
];

const MAX_SIDE = 4096;
const PADDING = 48;

function resolveBackground(shell: HTMLElement): string {
  const transparent = (color: string) => !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
  const flow = shell.querySelector<HTMLElement>(".react-flow") ?? shell;
  for (const element of [flow, shell, window.document.body, window.document.documentElement]) {
    const color = getComputedStyle(element).backgroundColor;
    if (!transparent(color)) return color;
  }
  return "#ffffff";
}

function collectEdges(shell: HTMLElement): MapExportEdge[] {
  const edges: MapExportEdge[] = [];
  for (const path of shell.querySelectorAll<SVGPathElement>(".react-flow__edges .react-flow__edge-path")) {
    const d = path.getAttribute("d");
    const style = getComputedStyle(path);
    if (!d || style.stroke === "none" || style.visibility === "hidden") continue;
    const dash = style.strokeDasharray && style.strokeDasharray !== "none"
      ? style.strokeDasharray.split(/[ ,]+/).map((part) => Number.parseFloat(part)).filter(Number.isFinite)
      : [];
    edges.push({ d, stroke: style.stroke, strokeWidth: Number.parseFloat(style.strokeWidth) || 1, dashArray: dash, lineCap: style.strokeLinecap || undefined });
  }
  return edges;
}

/** Removes the editing chrome from the copy and the selection look from its nodes. */
function stripEditingChrome(clone: HTMLElement) {
  for (const selector of EXPORT_HIDDEN) for (const element of clone.querySelectorAll(selector)) element.remove();
  for (const element of clone.querySelectorAll<HTMLElement>('[data-selected="true"]')) {
    element.setAttribute("data-selected", "false");
    for (const className of Array.from(element.classList)) {
      if (className.startsWith("ring") || className === "shadow-lg") element.classList.remove(className);
    }
    element.classList.add("shadow-sm");
  }
  for (const element of clone.querySelectorAll<HTMLElement>(".react-flow__node.selected")) element.classList.remove("selected");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The rendered map could not be loaded."));
    image.src = url;
  });
}

export interface MapImage {
  format: MapImageFormat;
  data: Uint8Array;
}

/**
 * Renders the map that `shell` (the canvas element) currently shows, without selection and editing
 * chrome, as PNG, SVG or PDF. All nodes must be mounted (see `exportRenderAll` in the store).
 *
 * Nodes and labels come from html-to-image; React Flow draws each edge in its own unsized SVG,
 * which html-to-image loses, so the edges are read from their path data and drawn separately
 * underneath the nodes (canvas for PNG/PDF, `<path>` elements for SVG).
 */
export async function captureMap(shell: HTMLElement, format: MapImageFormat): Promise<MapImage> {
  const viewport = shell.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new MapExportError("no-map", "The map view is not mounted.");

  const rects: MapExportRect[] = [];
  for (const element of viewport.querySelectorAll<HTMLElement>(".react-flow__node")) {
    const position = parseNodeTranslate(element.style.transform);
    if (position) rects.push({ ...position, width: element.offsetWidth, height: element.offsetHeight });
  }
  const bounds = boundsOfRects(rects);
  if (!bounds) throw new MapExportError("empty", "The map has no nodes to export.");

  const size = exportSize(bounds, PADDING, MAX_SIDE);
  const view = exportView(bounds, size, PADDING);
  const edges = collectEdges(shell);
  const background = resolveBackground(shell);

  const clone = viewport.cloneNode(true) as HTMLElement;
  stripEditingChrome(clone);
  const host = window.document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${size.width}px;height:${size.height}px;overflow:hidden;pointer-events:none;`;
  host.appendChild(clone);
  window.document.body.appendChild(host);

  try {
    const { toPng, toSvg } = await import("html-to-image");
    const options = {
      width: size.width,
      height: size.height,
      pixelRatio: 1,
      // System fonts only: scanning web-font stylesheets would fetch them and fail on CORS.
      skipFonts: true,
      style: { width: `${size.width}px`, height: `${size.height}px`, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` },
    };

    if (format === "svg") {
      const url = await toSvg(clone, options);
      const nodesSvg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
      const svg = composeMapSvg({ width: size.width, height: size.height, background, view, edges, nodesSvg });
      return { format, data: new TextEncoder().encode(svg) };
    }

    const nodesUrl = await toPng(clone, options);
    const canvas = window.document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available for the export.");
    context.fillStyle = background;
    context.fillRect(0, 0, size.width, size.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    for (const edge of edges) {
      context.strokeStyle = edge.stroke;
      context.lineWidth = edge.strokeWidth;
      context.lineCap = edge.lineCap === "round" || edge.lineCap === "square" ? edge.lineCap : "butt";
      context.setLineDash(edge.dashArray ?? []);
      context.stroke(new Path2D(edge.d));
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(await loadImage(nodesUrl), 0, 0);
    const data = format === "png"
      ? dataUrlToBytes(canvas.toDataURL("image/png"))
      : jpegToPdf(dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92)), size.width, size.height);
    return { format, data };
  } finally {
    host.remove();
  }
}
