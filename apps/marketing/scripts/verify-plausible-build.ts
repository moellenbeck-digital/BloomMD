import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { checkPlausibleBundle, DEFAULT_PLAUSIBLE_DOMAIN, describePlausibleBundleReport, type BundleFile } from "../src/lib/plausible-bundle-check";

// Plausible runs first-party: script and events go through our own origin (/_plausible/...) to the Ops
// instance, so the CSP needs no foreign host. NEXT_PUBLIC_* values are inlined at build time; a build
// without them ships no tracking at all, which is what this check guards against. The logic lives in
// src/lib/plausible-bundle-check.ts (unit-tested); this script only reads the build and prints the proof.
const buildRoot = join(process.cwd(), ".next");
const clientRoot = join(buildRoot, "static");
const textExtensions = new Set([".html", ".js", ".json", ".map", ".txt"]);
// The domain the build was made for: the Dockerfile default, or the value of the build environment (CI builds
// with `localhost` for the end-to-end tests). An explicitly empty value is an error, not a fallback.
const expectedDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? DEFAULT_PLAUSIBLE_DOMAIN;

async function collectTextFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (directory === buildRoot && entry.name === "dev") continue;
      files.push(...(await collectTextFiles(path)));
      continue;
    }

    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    if (textExtensions.has(extension)) {
      files.push(path);
    }
  }

  return files;
}

const paths = await collectTextFiles(buildRoot);
const allFiles: BundleFile[] = await Promise.all(paths.map(async (path) => ({ path: relative(process.cwd(), path), text: await readFile(path, "utf8") })));
const clientFiles = allFiles.filter((file) => file.path.startsWith(relative(process.cwd(), clientRoot)) && file.path.endsWith(".js"));

const report = checkPlausibleBundle({ clientFiles, allFiles, expectedDomain });
console.log(`Plausible bundle check (expected domain "${expectedDomain}", ${clientFiles.length} client chunks, ${allFiles.length} text files):`);
for (const line of describePlausibleBundleReport(report, expectedDomain, allFiles.length)) console.log(`  ${line}`);

if (report.errors.length > 0) {
  for (const error of report.errors) console.error(`  ERROR: ${error}`);
  throw new Error("Marketing production bundle fails the Plausible check.");
}
console.log("Marketing production bundle carries the first-party Plausible config and no legacy host.");
