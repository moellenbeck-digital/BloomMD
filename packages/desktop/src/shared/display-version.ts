/**
 * The one place that decides which version string a BloomMD desktop build shows. About, the
 * User-Agent, the build info and the splash all call this, so they cannot drift apart again
 * (the splash used to carry a hand-written `v0.3.0`).
 */

export const DISPLAY_VERSION_PLACEHOLDER = "{{DISPLAY_VERSION}}";

const SHORT_SHA_LENGTH = 7;

type BuildEnv = Record<string, string | undefined>;

/** `BLOOMMD_RELEASE_VERSION` wins; an unset or empty value falls back to the package version. */
export function resolveBuildVersion(env: BuildEnv, packageVersion: string): string {
  return env.BLOOMMD_RELEASE_VERSION || packageVersion;
}

export function shortBuildSha(sha: string | undefined): string {
  return (sha ?? "").slice(0, SHORT_SHA_LENGTH);
}

/** `BloomMD <version> (<short-sha>)`, without the parenthesis when there is no SHA. */
export function formatDisplayVersion(version: string, sha?: string): string {
  const short = shortBuildSha(sha);
  return short ? `BloomMD ${version} (${short})` : `BloomMD ${version}`;
}

export function resolveDisplayVersion(env: BuildEnv, packageVersion: string): string {
  return formatDisplayVersion(resolveBuildVersion(env, packageVersion), env.BLOOMMD_BUILD_SHA);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Fills the splash template. A template without the placeholder is a bug, not a silent no-op. */
export function renderSplashHtml(template: string, displayVersion: string): string {
  if (!template.includes(DISPLAY_VERSION_PLACEHOLDER)) {
    throw new Error(`Splash template has no ${DISPLAY_VERSION_PLACEHOLDER} placeholder.`);
  }
  return template.split(DISPLAY_VERSION_PLACEHOLDER).join(escapeHtml(displayVersion));
}
