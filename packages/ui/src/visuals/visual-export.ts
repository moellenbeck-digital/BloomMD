import { imageMimeType } from "@bloommd/core/browser";
import { dataUrlToBytes, exportSize } from "../export/map-export-core";
import { buildExportFile, downloadExportFile, type ExportFile } from "../export/export-file";

/**
 * Saving what the enlarged view shows.
 *
 * Two things can be saved: the original of an image (its bytes, name and format unchanged) and a
 * Mermaid diagram as SVG or PNG. Both end as an {@link ExportFile}, the same unit the map exports
 * (#6) hand to the platform, so file names, MIME types and the delivery path are shared with them.
 */

export type DiagramFormat = "svg" | "png";

/** Event a shell answers to save an exported file natively; without an answer the browser downloads it. */
export const DELIVER_EXPORT_EVENT = "bloommd:deliver-export";

export interface DeliverExportDetail {
  file: ExportFile;
  /** A shell that takes over the delivery calls this synchronously and returns the result. */
  handle: (delivery: Promise<void>) => void;
}

const PNG_MAX_SIDE = 4096;
const FALLBACK_SIZE = { width: 800, height: 600 };

export function parseSvgSize(svg: string): { width: number; height: number } {
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const viewBox = /\bviewBox\s*=\s*["']\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(open);
  if (viewBox) {
    const width = Number(viewBox[3]);
    const height = Number(viewBox[4]);
    if (width > 0 && height > 0) return { width, height };
  }
  const width = Number(/\swidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(open)?.[1]);
  const height = Number(/\sheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(open)?.[1]);
  return width > 0 && height > 0 ? { width, height } : FALLBACK_SIZE;
}

/**
 * The SVG as a file on its own. Mermaid sizes its SVG with `width="100%"` and a `max-width` style,
 * which only works inside a page; a saved file needs a real size, the SVG namespace and a background.
 */
export function standaloneSvg(svg: string): string {
  const match = /<svg\b[^>]*>/i.exec(svg);
  if (!match) return svg;
  const { width, height } = parseSvgSize(svg);
  const attributes = match[0]
    .replace(/^<svg\b/i, "")
    .replace(/>$/, "")
    .replace(/\s(?:width|height|style)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
  const namespace = /\sxmlns\s*=/i.test(attributes) ? "" : ' xmlns="http://www.w3.org/2000/svg"';
  const open = `<svg${namespace}${attributes} width="${width}" height="${height}" style="background-color:#ffffff">`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg.slice(0, match.index)}${open}${svg.slice(match.index + match[0].length)}`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** PNG pixel size for a diagram: twice its size for sharpness, capped like the map export. */
export function pngSize(svgSize: { width: number; height: number }): { width: number; height: number } {
  const { width, height } = exportSize(svgSize, 0, PNG_MAX_SIDE);
  return { width, height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The diagram could not be rasterized."));
    image.src = url;
  });
}

async function rasterizeSvg(svg: string): Promise<Uint8Array> {
  const source = standaloneSvg(svg);
  const size = pngSize(parseSvgSize(source));
  const canvas = window.document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available for the export.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(await loadImage(svgDataUrl(source)), 0, 0, size.width, size.height);
  return dataUrlToBytes(canvas.toDataURL("image/png"));
}

/** The diagram as `<Title>.svg` or `<Title>.png`. */
export async function diagramExportFile(svg: string, format: DiagramFormat, title: string | undefined): Promise<ExportFile> {
  if (format === "svg") return buildExportFile("svg", title, standaloneSvg(svg));
  return buildExportFile("png", title, await rasterizeSvg(svg));
}

/** File name of an image reference: last path segment, without query or folders. */
export function originalImageFilename(path: string): string {
  const name = decodeURIComponent(escapeLoneSurrogatesAndPercent(path.split(/[?#]/)[0] ?? "")).split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().replace(/^\.+/, "");
  return safe || "image";
}

function escapeLoneSurrogatesAndPercent(value: string): string {
  // A literal % that is not an escape sequence must not make decodeURIComponent throw.
  return value.replace(/%(?![0-9a-fA-F]{2})/g, "%25");
}

/** The original bytes of the image behind `url`, named after `path`. Nothing is converted. */
export async function imageExportFile(url: string, path: string, fetchImage: typeof fetch = fetch): Promise<ExportFile> {
  const response = await fetchImage(url);
  if (!response.ok) throw new Error(`The image could not be read (${response.status}).`);
  const data = new Uint8Array(await response.arrayBuffer());
  const filename = originalImageFilename(path);
  return {
    filename,
    mimeType: imageMimeType(filename) ?? (response.headers.get("content-type") || "application/octet-stream"),
    data,
  };
}

/**
 * Hands the file to the platform: the desktop shell saves it natively, otherwise the browser
 * downloads it. A shell answers by calling `handle` while the event is dispatched.
 */
export async function deliverExportFile(file: ExportFile): Promise<void> {
  const claim: { delivery: Promise<void> | null } = { delivery: null };
  window.dispatchEvent(new CustomEvent<DeliverExportDetail>(DELIVER_EXPORT_EVENT, { detail: { file, handle: (promise) => { claim.delivery = promise; } } }));
  if (claim.delivery) {
    await claim.delivery;
    return;
  }
  downloadExportFile(file);
}
