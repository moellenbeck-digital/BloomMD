const RELEASE_REPOSITORIES = ["moellenbeck-digital/BloomMD", "moellenbeck-digital/BloomMD-archiv"] as const;
const OPENCLAW_PLUGIN_PATTERN =
  /^bloommd-openclaw-plugin-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.tgz$/;
const LATEST_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=60";
const VERSIONED_CACHE_CONTROL =
  "public, max-age=31536000, s-maxage=31536000, immutable";

const FORWARDED_REQUEST_HEADERS = [
  "range",
  "if-none-match",
  "if-modified-since",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

type GitHubReleaseAsset = { id: number; name: string };
type GitHubRelease = { draft: boolean; assets: unknown };
type ResolvedOpenClawPlugin = {
  url: string;
  headers: Headers;
  version: string;
};

function githubReleaseToken(): string | null {
  return (
    process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN?.trim() ||
    process.env.BLOOMMD_ROADMAP_GITHUB_TOKEN?.trim() ||
    null
  );
}

function githubHeaders(accept: string): Headers {
  const headers = new Headers({
    Accept: accept,
    "User-Agent": "BloomMD Marketing OpenClaw Plugin Proxy",
  });
  const token = githubReleaseToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-GitHub-Api-Version", "2022-11-28");
  }
  return headers;
}

function isGitHubReleaseAsset(value: unknown): value is GitHubReleaseAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  return (
    typeof asset.id === "number" &&
    Number.isInteger(asset.id) &&
    asset.id > 0 &&
    typeof asset.name === "string"
  );
}

function isGitHubRelease(value: unknown): value is GitHubRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Record<string, unknown>;
  return typeof release.draft === "boolean" && "assets" in release;
}

function pluginVersion(assetName: string): string | null {
  return OPENCLAW_PLUGIN_PATTERN.exec(assetName)?.[1] ?? null;
}

async function resolveOpenClawPlugin(
  repository: string,
  requestedVersion?: string,
): Promise<ResolvedOpenClawPlugin | null> {
  const apiBase = `https://api.github.com/repos/${repository}`;
  const releases = await fetch(`${apiBase}/releases?per_page=100`, {
    headers: githubHeaders("application/vnd.github+json"),
    cache: "no-store",
  });
  if (!releases.ok) return null;
  const payload: unknown = await releases.json();
  if (!Array.isArray(payload)) return null;
  for (const release of payload) {
    if (
      !isGitHubRelease(release) ||
      release.draft ||
      !Array.isArray(release.assets)
    )
      continue;
    const asset = release.assets.find(
      (candidate): candidate is GitHubReleaseAsset =>
        isGitHubReleaseAsset(candidate) &&
        pluginVersion(candidate.name) !== null &&
        (!requestedVersion || pluginVersion(candidate.name) === requestedVersion),
    );
    const version = asset ? pluginVersion(asset.name) : null;
    if (asset && version)
      return {
        url: `${apiBase}/releases/assets/${asset.id}`,
        headers: githubHeaders("application/octet-stream"),
        version,
      };
  }
  return null;
}

function forwardedHeaders(request: Request, target: Headers): Headers {
  const headers = new Headers(target);
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function responseHeaders(
  upstream: Response,
  target: ResolvedOpenClawPlugin,
  isVersioned: boolean,
): Headers {
  const headers = new Headers({
    "Cache-Control": isVersioned ? VERSIONED_CACHE_CONTROL : LATEST_CACHE_CONTROL,
    "Content-Disposition": `attachment; filename="bloommd-openclaw-plugin-${target.version}.tgz"`,
    "X-Content-Type-Options": "nosniff",
    "X-BloomMD-Plugin-Version": target.version,
  });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/** Streams a published BloomMD OpenClaw plugin archive through bloommd.io. */
export async function fetchOpenClawPlugin(
  request: Request,
  requestedVersion?: string,
): Promise<Response> {
  try {
    for (const repository of RELEASE_REPOSITORIES) {
      const target = await resolveOpenClawPlugin(repository, requestedVersion);
      if (!target) continue;
      const upstream = await fetch(target.url, {
        method: request.method,
        headers: forwardedHeaders(request, target.headers),
        redirect: "follow",
        cache: "no-store",
      });
      if (upstream.status === 404) continue;
      if (!upstream.ok) {
        return new Response(null, { status: 502, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders(upstream, target, Boolean(requestedVersion)),
      });
    }
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[BloomMD] OpenClaw plugin proxy failed:", error);
    return new Response(null, {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
