import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 2;

export interface LinkPreview {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  image?: string;
}

function blockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a = -1, b = -1] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%", 1)[0] ?? address;
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

export async function assertPublicHttpUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS previews are supported.");
  if (url.username || url.password || !url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) throw new Error("This preview URL is not allowed.");
  const ipVersion = isIP(url.hostname);
  if (ipVersion === 4 && blockedIpv4(url.hostname)) throw new Error("Private network preview URLs are not allowed.");
  if (ipVersion === 6 && blockedIpv6(url.hostname)) throw new Error("Private network preview URLs are not allowed.");
  if (!ipVersion) {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => entry.family === 4 ? blockedIpv4(entry.address) : blockedIpv6(entry.address))) throw new Error("This preview host resolves to a private network.");
  }
  return url;
}

function cleanText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[entity] ?? entity)).replace(/\s+/g, " ").trim();
}

export function parseLinkPreviewHtml(html: string, finalUrl: URL): Omit<LinkPreview, "url" | "finalUrl"> {
  const meta: Record<string, string> = {};
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const raw = tag[0] ?? "";
    const key = raw.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = raw.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    if (key && content) meta[key] = cleanText(content);
  }
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const image = meta["og:image"] || meta["twitter:image"];
  let resolvedImage: string | undefined;
  if (image) {
    try {
      const candidate = new URL(image, finalUrl);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") resolvedImage = candidate.toString();
    } catch { /* Ignore malformed image metadata. */ }
  }
  return {
    ...(meta["og:title"] || meta["twitter:title"] || title ? { title: meta["og:title"] || meta["twitter:title"] || title } : {}),
    ...(meta.description || meta["og:description"] || meta["twitter:description"] ? { description: meta.description || meta["og:description"] || meta["twitter:description"] } : {}),
    ...(resolvedImage ? { image: resolvedImage } : {}),
  };
}

export async function fetchLinkPreview(value: string): Promise<LinkPreview> {
  let current = await assertPublicHttpUrl(value);
  let response: Response | null = null;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { accept: "text/html,application/xhtml+xml", "user-agent": "BloomMD-LinkPreview/1.0" } });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location || redirects === MAX_REDIRECTS) throw new Error("Too many redirects.");
    current = await assertPublicHttpUrl(new URL(location, current).toString());
  }
  if (!response || !response.ok) throw new Error(`Website returned HTTP ${response?.status ?? 0}.`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("The URL did not return an HTML page.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("The HTML page is too large for a preview.");
  return { url: value, finalUrl: current.toString(), ...parseLinkPreviewHtml(new TextDecoder().decode(bytes), current) };
}
