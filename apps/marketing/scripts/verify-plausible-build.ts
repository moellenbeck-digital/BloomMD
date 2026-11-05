import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const buildRoot = join(process.cwd(), ".next");
// Plausible runs first-party: script and events go through our own origin (/_plausible/...) to the Ops
// instance, so the CSP needs no foreign host. NEXT_PUBLIC_* values are inlined at build time; a build
// without them ships no tracking at all, which is what this check guards against.
const requiredValues = [
  "bloommd.io",
  "/_plausible/js/script.js",
  "/_plausible",
  "/api/event",
];
const forbiddenValues = ["plausible.moellenbeck-digital.io"];
const textExtensions = new Set([".html", ".js", ".json", ".map", ".txt"]);

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

const files = await collectTextFiles(buildRoot);
const contents = await Promise.all(files.map(async (path) => readFile(path, "utf8")));
const bundle = contents.join("\n");

for (const value of requiredValues) {
  if (!bundle.includes(value)) {
    throw new Error(`Marketing production bundle is missing Plausible value: ${value}`);
  }
}

for (const value of forbiddenValues) {
  if (bundle.includes(value)) {
    throw new Error(`Marketing production bundle contains legacy Plausible value: ${value}`);
  }
}

console.log(`Marketing production bundle contains the first-party Plausible endpoints and no legacy host (${files.length} text files checked).`);
