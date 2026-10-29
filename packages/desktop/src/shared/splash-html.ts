import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { renderSplashHtml, resolveDisplayVersion } from "./display-version";

/**
 * Renders `src/splash/index.html` with the build's display version into `outFile`, which
 * `electrobun.config.ts` then copies to `views/splash/index.html`. The config is evaluated by
 * `electrobun build` and `electrobun dev` alike, so both paths get a real version.
 */
export function prepareSplashHtml(options: {
  templateFile: string;
  outFile: string;
  env: Record<string, string | undefined>;
  packageVersion: string;
}): string {
  const displayVersion = resolveDisplayVersion(options.env, options.packageVersion);
  const html = renderSplashHtml(readFileSync(options.templateFile, "utf8"), displayVersion);
  mkdirSync(dirname(options.outFile), { recursive: true });
  writeFileSync(options.outFile, html);
  return displayVersion;
}
