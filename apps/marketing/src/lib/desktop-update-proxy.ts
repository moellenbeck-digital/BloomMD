const RELEASE_REPOSITORIES = ["moellenbeck-digital/BloomMD", "moellenbeck-digital/BloomMD-archiv"] as const;

const UPDATE_JSON_PATTERN = /^stable-macos-arm64-update\.json$/;
const PATCH_PATTERN = /^stable-macos-arm64-[a-z0-9]+\.patch$/i;
const BUNDLE_PATTERN = /^stable-macos-arm64-[a-z0-9._-]+\.tar\.zst$/i;
const DMG_PATTERN = /^stable-macos-arm64-[a-z0-9._-]+\.dmg$/i;
const LINUX_PACMAN_ALIAS_PATTERN = /^stable-linux-(x86_64|aarch64)\.pacman$/;
const LINUX_PACMAN_PATTERN = /^bloommd-desktop-[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-(x86_64|aarch64)\.pacman$/;

const FORWARDED_REQUEST_HEADERS = ["range", "if-none-match", "if-modified-since"] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

export interface DesktopUpdateManifest {
  version: string;
  hash: string;
  platform: "macos";
  arch: "arm64";
}

type GitHubReleaseAsset = {
  id: number;
  name: string;
};

function githubReleaseToken(): string | null {
  return process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN?.trim()
    || process.env.BLOOMMD_ROADMAP_GITHUB_TOKEN?.trim()
    || null;
}

function githubHeaders(token: string | null, accept: string): Headers {
  const headers = new Headers({
    Accept: accept,
    "User-Agent": "BloomMD Marketing Desktop Update Proxy",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (token) headers.set("X-GitHub-Api-Version", "2022-11-28");
  return headers;
}

export function isAllowedDesktopArtifact(artifact: string): boolean {
  return UPDATE_JSON_PATTERN.test(artifact)
    || PATCH_PATTERN.test(artifact)
    || BUNDLE_PATTERN.test(artifact)
    || DMG_PATTERN.test(artifact)
    || LINUX_PACMAN_ALIAS_PATTERN.test(artifact)
    || LINUX_PACMAN_PATTERN.test(artifact);
}

export function desktopArtifactCacheControl(artifact: string): string {
  if (UPDATE_JSON_PATTERN.test(artifact)) return "public, max-age=60, s-maxage=60, stale-while-revalidate=300";
  return "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
}

function proxyHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function responseHeaders(upstream: Response, artifact: string): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", desktopArtifactCacheControl(artifact));
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function isGitHubReleaseAsset(value: unknown): value is GitHubReleaseAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  return typeof asset.id === "number" && Number.isInteger(asset.id) && asset.id > 0 && typeof asset.name === "string";
}

function releaseAssetMatchesArtifact(assetName: string, artifact: string): boolean {
  if (artifact === "stable-linux-x86_64.pacman") return LINUX_PACMAN_PATTERN.test(assetName) && assetName.endsWith("-x86_64.pacman");
  if (artifact === "stable-linux-aarch64.pacman") return LINUX_PACMAN_PATTERN.test(assetName) && assetName.endsWith("-aarch64.pacman");
  return assetName === artifact;
}

async function resolveGitHubArtifact(artifact: string, repository: string): Promise<{ url: string; headers: Headers } | null> {
  const token = githubReleaseToken();
  if (!token) {
    return {
      url: `https://github.com/${repository}/releases/latest/download/${encodeURIComponent(artifact)}`,
      headers: githubHeaders(null, "application/octet-stream"),
    };
  }

  const apiBase = `https://api.github.com/repos/${repository}`;
  const releaseResponse = await fetch(`${apiBase}/releases/latest`, {
    headers: githubHeaders(token, "application/vnd.github+json"),
    redirect: "follow",
    cache: "no-store",
  });
  if (!releaseResponse.ok) return null;

  const payload: unknown = await releaseResponse.json();
  if (!payload || typeof payload !== "object") return null;
  const assetsValue = (payload as Record<string, unknown>).assets;
  if (!Array.isArray(assetsValue)) return null;
  const asset = assetsValue.find((candidate): candidate is GitHubReleaseAsset => isGitHubReleaseAsset(candidate) && releaseAssetMatchesArtifact(candidate.name, artifact));
  if (!asset) return null;

  return {
    url: `${apiBase}/releases/assets/${asset.id}`,
    headers: githubHeaders(token, "application/octet-stream"),
  };
}

export async function fetchDesktopArtifact(request: Request, artifact: string): Promise<Response> {
  if (!isAllowedDesktopArtifact(artifact)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  try {
    for (const repository of RELEASE_REPOSITORIES) {
      const target = await resolveGitHubArtifact(artifact, repository);
      if (!target) continue;

      const requestHeaders = proxyHeaders(request);
      for (const [name, value] of target.headers) requestHeaders.set(name, value);
      const upstream = await fetch(target.url, {
        method: request.method,
        headers: requestHeaders,
        redirect: "follow",
        cache: "no-store",
      });

      if (upstream.status === 404) continue;
      if (!upstream.ok) {
        return new Response(null, {
          status: 502,
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders(upstream, artifact),
      });
    }

    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[BloomMD] Desktop artifact proxy failed for ${artifact}:`, error);
    return new Response(null, {
      status: 502,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}

function isDesktopUpdateManifest(value: unknown): value is DesktopUpdateManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Record<string, unknown>;
  return typeof manifest.version === "string" && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)
    && typeof manifest.hash === "string" && /^[a-z0-9]+$/i.test(manifest.hash)
    && manifest.platform === "macos" && manifest.arch === "arm64";
}

export async function getDesktopUpdateManifest(): Promise<DesktopUpdateManifest | null> {
  try {
    const response = await fetchDesktopArtifact(
      new Request("https://bloommd.io/_desktop-updates/stable-macos-arm64-update.json"),
      "stable-macos-arm64-update.json",
    );
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return isDesktopUpdateManifest(payload) ? payload : null;
  } catch (error) {
    console.error("[BloomMD] Desktop update manifest unavailable:", error);
    return null;
  }
}
