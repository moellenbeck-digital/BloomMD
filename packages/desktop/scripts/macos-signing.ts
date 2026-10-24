type SigningEnvironment = Record<string, string | undefined>;

export function macOSReleaseEnabled(env: SigningEnvironment = process.env): boolean {
  const mode = env.BLOOMMD_MACOS_RELEASE;
  if (mode && mode !== "0" && mode !== "1") throw new Error("BLOOMMD_MACOS_RELEASE must be 0 or 1.");
  if (mode !== "1") return false;
  for (const name of [
    "ELECTROBUN_DEVELOPER_ID", "APPLE_TEAM_ID", "ELECTROBUN_APPLEAPIKEY",
    "ELECTROBUN_APPLEAPIISSUER", "ELECTROBUN_APPLEAPIKEYPATH",
  ]) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name} for signed macOS release.`);
  }
  if (!env.ELECTROBUN_DEVELOPER_ID?.startsWith("Developer ID Application: ") ||
      !env.ELECTROBUN_DEVELOPER_ID.endsWith(`(${env.APPLE_TEAM_ID})`)) {
    throw new Error("Developer ID Application identity must match APPLE_TEAM_ID.");
  }
  return true;
}
