import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { pipeline, type Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

// Resolution, address checks, pinning and redirect handling are documented in app/api/link-preview/route.ts.

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 2;
const REQUEST_TIMEOUT_MS = 5000;

export interface LinkPreview {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** A validated URL together with the only addresses the connection may use. */
export interface PinnedTarget {
  url: URL;
  /** Normalized host name (lower case, no trailing dot, no IPv6 brackets): used for SNI, certificate check and Host header. */
  hostname: string;
  addresses: ResolvedAddress[];
}

export interface LinkPreviewResponse {
  status: number;
  headers: Record<string, string | undefined>;
  read(maxBytes: number): Promise<Uint8Array>;
  close(): void;
}

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;
export type LinkPreviewRequest = (target: PinnedTarget, signal: AbortSignal) => Promise<LinkPreviewResponse>;

// IPv4 ranges that are not public unicast (RFC 6890 and successors).
const BLOCKED_IPV4_RANGES = ([
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const).map(([base, length]) => ({ base: parseIpv4(base) ?? 0, length }));

// Only 2000::/3 is global unicast; everything else (::/8 incl. ::1 and IPv4-compatible, 64:ff9b::/96, fc00::/7,
// fe80::/10, fec0::/10, ff00::/8, ...) is refused. Inside 2000::/3 these ranges are refused as well.
const BLOCKED_IPV6_RANGES = ([["2001::", 23], ["2001:db8::", 32], ["3fff::", 20]] as const).map(([base, length]) => ({ base: parseIpv6(base) ?? 0n, length }));

function parseIpv4(address: string): number | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function parseIpv6(address: string): bigint | null {
  let text = (address.toLowerCase().split("%", 1)[0] ?? "");
  if (isIP(text) !== 6) return null;
  if (text.includes(".")) {
    const split = text.lastIndexOf(":") + 1;
    const embedded = parseIpv4(text.slice(split));
    if (embedded === null) return null;
    text = `${text.slice(0, split)}${Math.floor(embedded / 65536).toString(16)}:${(embedded % 65536).toString(16)}`;
  }
  const [head = "", tail, ...extra] = text.split("::");
  if (extra.length > 0) return null;
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const fill = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? fill !== 0 : fill < 1) return null;
  const groups = [...headGroups, ...Array<string>(tail === undefined ? 0 : fill).fill("0"), ...tailGroups];
  return groups.reduce((value, group) => (value << 16n) | BigInt(Number.parseInt(group, 16)), 0n);
}

function formatIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}

function blockedIpv4(address: string): boolean {
  const value = parseIpv4(address);
  if (value === null) return true;
  return BLOCKED_IPV4_RANGES.some(({ base, length }) => Math.floor(value / 2 ** (32 - length)) === Math.floor(base / 2 ** (32 - length)));
}

function blockedIpv6(address: string): boolean {
  const value = parseIpv6(address);
  if (value === null) return true;
  // IPv4-mapped (::ffff:a.b.c.d, also written ::ffff:7f00:1) follows the IPv4 rules.
  if (value >> 32n === 0xffffn) return blockedIpv4(formatIpv4(Number(value & 0xffffffffn)));
  if (value >> 125n !== 1n) return true;
  // 6to4 (2002::/16) embeds an IPv4 address in bits 16..47; it is judged by the IPv4 rules.
  if (value >> 112n === 0x2002n) return blockedIpv4(formatIpv4(Number((value >> 80n) & 0xffffffffn)));
  return BLOCKED_IPV6_RANGES.some(({ base, length }) => value >> BigInt(128 - length) === base >> BigInt(128 - length));
}

/** True for every address that is not public unicast; unparsable input counts as blocked. */
export function isBlockedAddress(address: string): boolean {
  return isIP(address) === 4 ? blockedIpv4(address) : blockedIpv6(address);
}

/** Lower case, no IPv6 brackets, no trailing dot(s): `Localhost.` and `localhost` are the same host. */
export function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  const bare = lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
  return bare.replace(/\.+$/, "");
}

const defaultResolve: HostResolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));

/**
 * Validates the URL and resolves its host exactly once. Every returned address is public; the caller must connect
 * to one of them and must not resolve the name again.
 */
export async function resolvePublicHttpUrl(value: string, resolve: HostResolver = defaultResolve): Promise<PinnedTarget> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS previews are supported.");
  const hostname = normalizeHostname(url.hostname);
  if (url.username || url.password || !hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("This preview URL is not allowed.");
  const ipVersion = isIP(hostname);
  if (ipVersion === 4 || ipVersion === 6) {
    if (isBlockedAddress(hostname)) throw new Error("Private network preview URLs are not allowed.");
    return { url, hostname, addresses: [{ address: hostname, family: ipVersion }] };
  }
  const addresses = await resolve(hostname);
  if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) throw new Error("This preview host resolves to a private network.");
  return { url, hostname, addresses };
}

export async function assertPublicHttpUrl(value: string): Promise<URL> {
  return (await resolvePublicHttpUrl(value, transport.resolve)).url;
}

/** `lookup` for node:http(s): answers with the pre-validated addresses only and never asks DNS. */
function pinnedLookup(addresses: ResolvedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const wanted = typeof options === "number" ? options : options.family;
    const family = wanted === "IPv4" ? 4 : wanted === "IPv6" ? 6 : wanted;
    const matches = addresses.filter((entry) => !family || entry.family === family);
    const first = matches[0];
    if (!first) return callback(Object.assign(new Error("No pinned address for the requested family."), { code: "ENOTFOUND" }) as NodeJS.ErrnoException, "", 0);
    if (typeof options === "object" && options.all) return (callback as unknown as (error: null, all: ResolvedAddress[]) => void)(null, matches);
    return callback(null, first.address, first.family);
  };
}

function readBody(response: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const encoding = String(response.headers["content-encoding"] ?? "identity").trim().toLowerCase();
  const decoder = encoding === "gzip" || encoding === "x-gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null;
  return new Promise((resolve, reject) => {
    if (!decoder && encoding !== "identity" && encoding !== "") {
      response.destroy();
      reject(new Error("The website used an unsupported content encoding."));
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    const source: Readable = decoder ? pipeline(response, decoder, (error) => { if (error) reject(error); }) : response;
    source.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        source.destroy();
        reject(new Error("The HTML page is too large for a preview."));
        return;
      }
      chunks.push(chunk);
    });
    source.on("end", () => resolve(Buffer.concat(chunks)));
    source.on("error", reject);
    response.on("error", reject);
  });
}

/**
 * One GET over node:http(s) whose connection goes to one of `target.addresses` only. The URL is not rewritten:
 * SNI, certificate check and Host header keep the original host name.
 */
export const requestPinned: LinkPreviewRequest = (target, signal) =>
  new Promise((resolve, reject) => {
    const aborted = () => (signal.reason instanceof Error ? signal.reason : new Error("The request was aborted."));
    if (signal.aborted) return reject(aborted());
    const { url } = target;
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = send(
      {
        hostname: target.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        lookup: pinnedLookup(target.addresses),
        headers: { accept: "text/html,application/xhtml+xml", "accept-encoding": "gzip, deflate, br", connection: "close", "user-agent": "BloomMD-LinkPreview/1.0" },
      },
      (response) => {
        const headers: Record<string, string | undefined> = {};
        for (const [name, header] of Object.entries(response.headers)) headers[name] = Array.isArray(header) ? header.join(", ") : header;
        resolve({ status: response.statusCode ?? 0, headers, read: (maxBytes) => readBody(response, maxBytes), close: () => { response.destroy(); } });
      },
    );
    outgoing.on("error", reject);
    // Not the `signal` request option: Bun does not reject an already aborted request with it.
    signal.addEventListener("abort", () => outgoing.destroy(aborted()), { once: true });
    outgoing.end();
  });

const transport: { resolve: HostResolver; request: LinkPreviewRequest } = { resolve: defaultResolve, request: requestPinned };

/** Test hook: replaces DNS resolution and/or the outbound request; `null` restores the real ones. */
export function setLinkPreviewTransportForTests(overrides: Partial<typeof transport> | null): void {
  transport.resolve = overrides?.resolve ?? defaultResolve;
  transport.request = overrides?.request ?? requestPinned;
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
  let target = await resolvePublicHttpUrl(value, transport.resolve);
  for (let redirects = 0; ; redirects += 1) {
    const response = await transport.request(target, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (!location || redirects === MAX_REDIRECTS) throw new Error("Too many redirects.");
        const next = new URL(location, target.url);
        if (target.url.protocol === "https:" && next.protocol === "http:") throw new Error("Redirects from HTTPS to HTTP are not allowed.");
        // Every hop is resolved, checked and pinned from scratch.
        target = await resolvePublicHttpUrl(next.toString(), transport.resolve);
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`Website returned HTTP ${response.status}.`);
      const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("The URL did not return an HTML page.");
      const bytes = await response.read(MAX_HTML_BYTES);
      return { url: value, finalUrl: target.url.toString(), ...parseLinkPreviewHtml(new TextDecoder().decode(bytes), target.url) };
    } finally {
      response.close();
    }
  }
}
