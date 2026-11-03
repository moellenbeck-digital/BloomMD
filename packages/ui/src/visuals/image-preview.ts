import { assetPathCandidates, describeAssetRejection, resolveAssetPath, type AssetPathRejection, type ImageRefSyntax } from "@bloommd/core/browser";

/**
 * Loads the picture behind an image reference of a note.
 *
 * The path is resolved with the shared rule from core, relative to the note. The bytes then come
 * through the same `bloommd:preview-resource` event that file nodes use, so the web workspace and the
 * desktop app (and any later shell) answer it the way they already do — no second mechanism.
 */

export const PREVIEW_RESOURCE_EVENT = "bloommd:preview-resource";

export interface ResourcePreviewDetail {
  kind: "file";
  /** Path relative to the workspace root, already resolved against the note (absolute for notes the shell opens by absolute path). */
  file: string;
  /**
   * The path names exactly this file. Without it a shell may also match by file name (the way Obsidian
   * finds `![[a.png]]`); a Markdown image path is explicit and must not be matched loosely.
   */
  exact?: boolean;
  respond: (result: { url: string; revokeOnCleanup?: boolean } | { error: string }) => void;
}

export type ImagePreviewResult =
  | {
      status: "ready";
      url: string;
      /** Workspace path of the file, or the URL for remote images; names the file when it is saved. */
      path: string;
      /** Frees the object URL the shell created for this preview. */
      release: () => void;
    }
  | { status: "unavailable"; reason: "rejected"; path: string; detail: AssetPathRejection }
  | { status: "unavailable"; reason: "not-found"; path: string; message: string };

export interface ImageReference {
  syntax: ImageRefSyntax;
  target: string;
}

const REQUEST_TIMEOUT_MS = 8000;

function requestResource(file: string, exact: boolean, timeoutMs: number): Promise<{ url: string; release: () => void } | { error: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      settled = true;
      resolve({ error: "No preview is available in this environment." });
    }, timeoutMs);
    const detail: ResourcePreviewDetail = {
      kind: "file",
      file,
      exact,
      respond: (result) => {
        if (settled) {
          // Answered after giving up: nobody will use the object URL, so free it.
          if ("url" in result && result.revokeOnCleanup) URL.revokeObjectURL(result.url);
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        if ("error" in result) resolve({ error: result.error });
        else resolve({ url: result.url, release: () => { if (result.revokeOnCleanup) URL.revokeObjectURL(result.url); } });
      },
    };
    window.dispatchEvent(new CustomEvent<ResourcePreviewDetail>(PREVIEW_RESOURCE_EVENT, { detail }));
  });
}

export async function loadImagePreview(notePath: string, reference: ImageReference, timeoutMs = REQUEST_TIMEOUT_MS): Promise<ImagePreviewResult> {
  const resolved = resolveAssetPath(notePath, reference.target);
  if (resolved.kind === "remote") return { status: "ready", url: resolved.url, path: resolved.url, release: () => undefined };
  if (resolved.kind === "invalid") return { status: "unavailable", reason: "rejected", path: reference.target.trim(), detail: resolved.reason };

  let message = "";
  for (const candidate of assetPathCandidates(notePath, reference.target, reference.syntax)) {
    const answer = await requestResource(candidate, reference.syntax === "markdown", timeoutMs);
    if ("url" in answer) return { status: "ready", url: answer.url, path: candidate, release: answer.release };
    message = answer.error;
  }
  return { status: "unavailable", reason: "not-found", path: resolved.path, message };
}

/** Text for the hint that replaces a broken image icon: what went wrong and which path. */
export function imageProblemText(result: Extract<ImagePreviewResult, { status: "unavailable" }>, copy: { notFound: string; rejected: string }): string {
  return result.reason === "rejected" ? `${copy.rejected} ${result.path} (${describeAssetRejection(result.detail)})` : `${copy.notFound} ${result.path}`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/**
 * An image-shaped hint with the problem text, for places that can only show an `<img>` (the rich-text
 * editor does). A data URL, so it needs no file and carries no markup of the note.
 */
export function problemImageUrl(text: string): string {
  const shown = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  const width = Math.min(560, Math.max(220, shown.length * 7 + 48));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44" role="img" aria-label="${escapeXml(text)}">`,
    `<rect x="1" y="1" width="${width - 2}" height="42" rx="8" fill="#fff4ee" stroke="#ff6b35" stroke-dasharray="4 3"/>`,
    `<text x="14" y="27" font-family="system-ui, sans-serif" font-size="13" fill="#1a1a1a">⚠ ${escapeXml(shown)}</text>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
