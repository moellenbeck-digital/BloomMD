const RELEASE_REPOSITORIES = ["moellenbeck-digital/BloomMD", "moellenbeck-digital/BloomMD-archiv"] as const;
const RELEASE_TAG_PATTERN = /^cli-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const TOOL_ARTIFACT_PATTERN =
  /^bloommd-(agent|wiki)-(darwin-arm64|linux-arm64|linux-x64)$/;
const CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=60";

const FORWARDED_REQUEST_HEADERS = [
  "range",
  "if-none-match",
  "if-modified-since",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

type GitHubReleaseAsset = { id: number; name: string };
type GitHubRelease = { draft: boolean; tag_name: string; assets: unknown };
type ResolvedCommandTool = { url: string; headers: Headers; version: string; filename: string };

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
    "User-Agent": "BloomMD Marketing Command Tool Proxy",
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
  return typeof asset.id === "number" && Number.isInteger(asset.id) && asset.id > 0 && typeof asset.name === "string";
}

function isGitHubRelease(value: unknown): value is GitHubRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Record<string, unknown>;
  return typeof release.draft === "boolean" && typeof release.tag_name === "string" && "assets" in release;
}

function forwardedHeaders(request: Request, target: Headers): Headers {
  const headers = new Headers(target);
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function versionedAssetName(assetName: string, version: string): string | null {
  const match = TOOL_ARTIFACT_PATTERN.exec(assetName);
  if (!match) return null;
  return `bloommd-${match[1]}-${version}-${match[2]}`;
}

async function resolveCommandTool(assetName: string, repository: string): Promise<ResolvedCommandTool | null> {
  if (!TOOL_ARTIFACT_PATTERN.test(assetName)) return null;
  const apiBase = `https://api.github.com/repos/${repository}`;
  const releases = await fetch(`${apiBase}/releases?per_page=100`, {
    headers: githubHeaders("application/vnd.github+json"),
    cache: "no-store",
  });
  if (!releases.ok) return null;
  const payload: unknown = await releases.json();
  if (!Array.isArray(payload)) return null;

  for (const release of payload) {
    if (!isGitHubRelease(release) || release.draft || !Array.isArray(release.assets)) continue;
    const version = RELEASE_TAG_PATTERN.exec(release.tag_name)?.[1];
    if (!version) continue;
    const expectedAssetName = versionedAssetName(assetName, version);
    if (!expectedAssetName) continue;
    const asset = release.assets.find(
      (candidate): candidate is GitHubReleaseAsset =>
        isGitHubReleaseAsset(candidate) && candidate.name === expectedAssetName,
    );
    if (asset) {
      return {
        url: `${apiBase}/releases/assets/${asset.id}`,
        headers: githubHeaders("application/octet-stream"),
        version,
        filename: expectedAssetName,
      };
    }
  }
  return null;
}

/** Streams the latest published native BloomMD command-tool binary through bloommd.io. */
export async function fetchCommandTool(request: Request, assetName: string): Promise<Response> {
  try {
    for (const repository of RELEASE_REPOSITORIES) {
      const target = await resolveCommandTool(assetName, repository);
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
      const headers = new Headers({
        "Cache-Control": CACHE_CONTROL,
        "Content-Disposition": `attachment; filename="${target.filename}"`,
        "X-Content-Type-Options": "nosniff",
        "X-BloomMD-Command-Tools-Version": target.version,
      });
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    }
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[BloomMD] command tool proxy failed:", error);
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
}
