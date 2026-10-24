import packageJson from "../../package.json";

export type BloomMDDeployment = "app" | "marketing" | "sync";

export interface BloomMDBuildInfo {
  product: "BloomMD";
  packageName: string;
  deployment: BloomMDDeployment;
  version: string;
  gitSha: string | null;
  shortSha: string | null;
  gitTag: string | null;
  buildTime: string | null;
  displayVersion: string;
}

interface BuildInfoOptions {
  publicOnly?: boolean;
}

function realValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized && normalized !== "unknown" && normalized !== "undefined" && normalized !== "null") return normalized;
  }
  return null;
}

export function getBuildInfo(deployment: BloomMDDeployment = "marketing", options: BuildInfoOptions = {}): BloomMDBuildInfo {
  const serverOnlyVersionValues = options.publicOnly ? [] : [
    process.env.BLOOMMD_APP_VERSION,
    process.env.BLOOMMD_RELEASE_VERSION,
  ];
  const version = realValue(
    process.env.NEXT_PUBLIC_BLOOMMD_VERSION,
    ...serverOnlyVersionValues,
  ) ?? packageJson.version;
  const serverOnlyShaValues = options.publicOnly ? [] : [
    process.env.BLOOMMD_BUILD_SHA,
    process.env.GITHUB_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
  ];
  const gitSha = realValue(
    process.env.NEXT_PUBLIC_BLOOMMD_GIT_SHA,
    ...serverOnlyShaValues,
  );
  const shortSha = gitSha ? gitSha.slice(0, 7) : null;
  const serverOnlyTagValues = options.publicOnly ? [] : [
    process.env.BLOOMMD_BUILD_TAG,
    process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined,
  ];
  const gitTag = realValue(
    process.env.NEXT_PUBLIC_BLOOMMD_GIT_TAG,
    ...serverOnlyTagValues,
  );
  const serverOnlyBuildTimeValues = options.publicOnly ? [] : [
    process.env.BLOOMMD_BUILD_TIME,
    process.env.VERCEL_GIT_COMMIT_DATE,
  ];
  const buildTime = realValue(
    process.env.NEXT_PUBLIC_BLOOMMD_BUILD_TIME,
    ...serverOnlyBuildTimeValues,
  );

  return {
    product: "BloomMD",
    packageName: packageJson.name,
    deployment,
    version,
    gitSha,
    shortSha,
    gitTag,
    buildTime,
    displayVersion: shortSha ? `BloomMD ${version} (${shortSha})` : `BloomMD ${version}`,
  };
}
