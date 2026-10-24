export interface NodeLinkResource {
  url: string;
  label: string;
  host: string;
  kind: "web" | "image" | "video" | "audio" | "pdf" | "file";
}

export interface MapLinkResource {
  raw: string;
  targetFile: string | null;
  targetNodeId: string | null;
  label: string;
}

export interface LinkTargetNode {
  id: string;
  title: string;
  metadata?: { kind?: string };
}

export type MapLinkResolution =
  | { status: "resolved"; nodeId: string; nodeTitle: string }
  | { status: "external" }
  | { status: "ambiguous"; matches: LinkTargetNode[] }
  | { status: "missing" };

const MARKDOWN_LINK_RE = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const PLAIN_URL_RE = /(^|[\s(])(https?:\/\/[^\s<>)\]]+)/g;
const MAP_LINK_RE = /\\?\[\\?\[([^\]|]+)(?:\|([^\]]+))?\\?\]\\?\]/g;
const RESOURCE_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)/g;

function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

function hostFor(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function kindFor(url: string, image = false): NodeLinkResource["kind"] {
  if (image) return "image";
  const extension = url.split(/[?#]/, 1)[0]?.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(extension)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(extension)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension)) return "audio";
  if (extension === "pdf") return "pdf";
  if (/^https?:\/\//i.test(url)) return "web";
  return "file";
}

export function extractLinksFromMarkdown(markdown: string): NodeLinkResource[] {
  const resources: NodeLinkResource[] = [];
  const seen = new Set<string>();

  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const label = match[1]?.trim() || match[2] || "";
    const url = cleanUrl(match[2] || "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    resources.push({ url, label, host: hostFor(url), kind: "web" });
  }

  for (const match of markdown.matchAll(PLAIN_URL_RE)) {
    if ((match.index ?? 0) > 0 && markdown[(match.index ?? 0) - 1] === "]") continue;
    const url = cleanUrl(match[2] || "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    resources.push({ url, label: hostFor(url), host: hostFor(url), kind: "web" });
  }

  for (const match of markdown.matchAll(RESOURCE_LINK_RE)) {
    const url = cleanUrl(match[3] || "");
    const isImage = match[1] === "!";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    resources.push({
      url,
      label: match[2]?.trim() || match[4]?.trim() || url,
      host: /^https?:\/\//i.test(url) ? hostFor(url) : "local file",
      kind: kindFor(url, isImage),
    });
  }

  return resources;
}

export function extractMapLinksFromMarkdown(markdown: string): MapLinkResource[] {
  const resources: MapLinkResource[] = [];
  const seen = new Set<string>();

  for (const match of markdown.matchAll(MAP_LINK_RE)) {
    const rawTarget = (match[1] ?? "").trim();
    const label = (match[2] ?? rawTarget).trim();
    // `![[Physik ink.svg]]` embeds an attachment (a drawing, an image); it is not a link to a map.
    const embedded = (match.index ?? 0) > 0 && markdown[(match.index ?? 0) - 1] === "!";
    if (embedded && /\.(?!md$|markdown$)[a-z0-9]{1,8}$/i.test(rawTarget.split("#")[0] ?? "")) continue;
    if (!rawTarget || seen.has(`${rawTarget}|${label}`)) continue;
    seen.add(`${rawTarget}|${label}`);

    const hashIndex = rawTarget.indexOf("#");
    const targetFile = hashIndex > 0 ? rawTarget.slice(0, hashIndex) : null;
    const targetNodeId =
      hashIndex >= 0
        ? rawTarget.slice(hashIndex + 1) || null
        : null;

    resources.push({
      raw: rawTarget,
      targetFile,
      targetNodeId,
      label,
    });
  }

  return resources;
}

export function resolveMapLinkInDocument(
  link: MapLinkResource,
  currentFilename: string,
  nodes: Iterable<LinkTargetNode>,
): MapLinkResolution {
  if (link.targetFile && link.targetFile !== currentFilename) {
    return { status: "external" };
  }

  const allNodes = [...nodes];
  if (link.targetNodeId) {
    const target = allNodes.find((node) => node.id === link.targetNodeId);
    return target
      ? { status: "resolved", nodeId: target.id, nodeTitle: target.title }
      : { status: "missing" };
  }

  const normalizedTarget = link.raw.trim().toLowerCase();
  const matches = allNodes.filter((node) => node.title.trim().toLowerCase() === normalizedTarget);
  const semanticMatches = matches.filter((node) => !["workspace", "folder", "file"].includes(node.metadata?.kind ?? "topic"));
  const preferredMatches = semanticMatches.length > 0 ? semanticMatches : matches;
  if (preferredMatches.length === 1) {
    const target = preferredMatches[0]!;
    return { status: "resolved", nodeId: target.id, nodeTitle: target.title };
  }
  if (preferredMatches.length > 1) return { status: "ambiguous", matches: preferredMatches };
  return { status: "missing" };
}
