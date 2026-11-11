import packageJson from "../../package.json";

export interface CmsBuildInfo {
  product: "BloomMD";
  packageName: string;
  deployment: "cms";
  version: string;
  gitSha: string | null;
  shortSha: string | null;
  gitTag: string | null;
  buildTime: string | null;
  displayVersion: string;
}

function realValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized && !["unknown", "undefined", "null"].includes(normalized)) return normalized;
  }
  return null;
}

/**
 * Build information of the admin app. It is shown inside the admin UI only (login page and
 * navigation); the CMS has no public version endpoint (ADR 2, AGENTS.md "Version und Build-Info").
 * The SemVer version is the one of `apps/cms/package.json`; CI and Docker inject the SHA, tag and
 * build time through the `BLOOMMD_*` variables (same names as app and marketing).
 */
export function getCmsBuildInfo(env: NodeJS.ProcessEnv = process.env): CmsBuildInfo {
  const version = realValue(env.BLOOMMD_RELEASE_VERSION) ?? packageJson.version;
  const gitSha = realValue(env.BLOOMMD_BUILD_SHA, env.GITHUB_SHA);
  const shortSha = gitSha ? gitSha.slice(0, 7) : null;
  const gitTag = realValue(env.BLOOMMD_BUILD_TAG);
  const buildTime = realValue(env.BLOOMMD_BUILD_TIME);
  return {
    product: "BloomMD",
    packageName: packageJson.name,
    deployment: "cms",
    version,
    gitSha,
    shortSha,
    gitTag,
    buildTime,
    displayVersion: `BloomMD ${version}${shortSha ? ` (${shortSha})` : ""}`,
  };
}
