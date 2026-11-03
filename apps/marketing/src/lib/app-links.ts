/**
 * Universal Links (iOS) and App Links (Android) for https://bloommd.io/open….
 *
 * The app identifiers are public, but the Apple team id and the Android signing-certificate
 * fingerprints are not in the repo: they come from the environment. Without a (valid) value the
 * matching well-known file does not exist (404) — never a placeholder, which would make the
 * platform verify a wrong association and cache the failure.
 */
export const IOS_BUNDLE_ID = "app.bloommd.mobile";
export const ANDROID_PACKAGE = "app.bloommd.mobile";

const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;
const SHA256_FINGERPRINT = /^[0-9A-F]{64}$/;
const NODE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DOC_ID = NODE_ID;

type Env = Record<string, string | undefined>;

export function appleAppSiteAssociation(env: Env = process.env) {
  const teamId = env.APPLE_TEAM_ID?.trim().toUpperCase();
  if (!teamId || !APPLE_TEAM_ID.test(teamId)) return null;
  return {
    applinks: {
      details: [{
        appIDs: [`${teamId}.${IOS_BUNDLE_ID}`],
        components: [{ "/": "/open" }, { "/": "/open/*" }],
      }],
    },
  };
}

/** `ANDROID_CERT_SHA256`: one or more SHA-256 fingerprints, comma or whitespace separated, with or without colons. */
export function androidAssetLinks(env: Env = process.env) {
  const fingerprints = (env.ANDROID_CERT_SHA256 ?? "")
    .split(/[\s,;]+/)
    .map((value) => value.replace(/:/g, "").toUpperCase())
    .filter((value) => SHA256_FINGERPRINT.test(value))
    .map((value) => value.match(/../g)!.join(":"));
  if (fingerprints.length === 0) return null;
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: [...new Set(fingerprints)],
    },
  }];
}

/** The same JSON response for both well-known files: 404 without configuration, otherwise `application/json`. */
export function wellKnownResponse(body: object | null, method: "GET" | "HEAD"): Response {
  if (!body) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  return new Response(method === "HEAD" ? null : JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export interface OpenRequest {
  /** Validated; null when the link carries nothing usable. */
  target: { kind: "note"; path: string } | { kind: "doc"; doc: string } | null;
  node: string | null;
}

/**
 * Validates the parameters of an /open link by the same rules as the app (`parseAppLink` in
 * packages/mobile): no `..`, only .md/.markdown, id patterns. Nothing from here is shown on the
 * page; it only decides whether an "open in app" link is offered.
 */
export function parseOpenRequest(input: { path?: string | string[]; node?: string | string[]; doc?: string }): OpenRequest {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const nodeValue = one(input.node);
  const node = nodeValue && NODE_ID.test(nodeValue) ? nodeValue : null;
  if (input.doc !== undefined) {
    return { target: DOC_ID.test(input.doc) ? { kind: "doc", doc: input.doc } : null, node };
  }
  const path = (one(input.path) ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const valid = path && !path.split("/").some((part) => part === ".." || part === "") && /\.(md|markdown)$/i.test(path);
  return { target: valid ? { kind: "note", path } : null, node };
}

/** `bloommd://open?…` for a validated request, or null. Values are re-encoded, never passed through. */
export function appOpenUrl(request: OpenRequest): string | null {
  if (!request.target) return null;
  const params = new URLSearchParams();
  if (request.target.kind === "doc") params.set("doc", request.target.doc);
  else params.set("path", request.target.path);
  if (request.node) params.set("node", request.node);
  return `bloommd://open?${params.toString().replace(/\+/g, "%20")}`;
}
