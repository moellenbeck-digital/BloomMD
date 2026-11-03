/**
 * Links into the app. Two carriers, one format:
 *   bloommd://open?path=Schule/Physik.md&node=abc123   a note of the open folder, at a node
 *   bloommd://open?doc=<document-id>&node=abc123       a cloud document, at a node
 *   https://bloommd.io/open?path=…&node=…              universal / app link, same parameters
 *   https://bloommd.io/open/<document-id>?node=…       universal / app link to a cloud document
 *   bloommd://auth?code=…&state=…                      end of the account sign-in (see mobile-auth.ts)
 *   bloommd://selftest                                 simulator self-test (test builds only)
 * `auth` and `selftest` are accepted from the custom scheme only, never from a web link.
 */
export type AppLink =
  | { kind: "open"; path: string; node: string | null }
  | { kind: "doc"; doc: string; node: string | null }
  | { kind: "auth"; url: string }
  | { kind: "selftest" };

/** The one host whose https links open the app; no subdomains, ports or userinfo. */
export const APP_LINK_HOST = "bloommd.io";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function parseAppLink(raw: string): AppLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return parseWebLink(url);
  if (url.protocol !== "bloommd:") return null;
  // `bloommd://open?…` parses with host "open"; `bloommd:open?…` with pathname "open".
  const action = url.host || url.pathname.replace(/^\/+/, "");
  if (action === "selftest") return { kind: "selftest" };
  if (action === "auth") return { kind: "auth", url: raw };
  if (action !== "open") return null;
  const doc = url.searchParams.get("doc");
  if (doc !== null) return docLink(doc, url.searchParams);
  return noteLink(url.searchParams);
}

function parseWebLink(url: URL): AppLink | null {
  if (url.hostname !== APP_LINK_HOST || url.port || url.username || url.password) return null;
  const segments = url.pathname.split("/");
  if (segments[1] !== "open") return null;
  if (segments.length === 2 || (segments.length === 3 && segments[2] === "")) return noteLink(url.searchParams);
  if (segments.length === 3) return docLink(segments[2], url.searchParams);
  return null;
}

function noteLink(params: URLSearchParams): AppLink | null {
  const path = (params.get("path") ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path || path.split("/").some((part) => part === ".." || part === "") || !/\.(md|markdown)$/i.test(path)) return null;
  return { kind: "open", path, node: nodeParam(params) };
}

function docLink(doc: string, params: URLSearchParams): AppLink | null {
  return ID.test(doc) ? { kind: "doc", doc, node: nodeParam(params) } : null;
}

function nodeParam(params: URLSearchParams): string | null {
  const node = params.get("node");
  return node && ID.test(node) ? node : null;
}
