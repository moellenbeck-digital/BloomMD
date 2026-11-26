import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocPage } from "../src/lib/docs";
import { STATIC_ROUTE_SOURCES, templateSource } from "../src/lib/seo-routes";
import { templateSlugs } from "../src/lib/templates";

// Run in a full-history checkout after committing content changes. The checked-in
// inventory also works in Docker/source archives where Git history is unavailable.
// Only paths the sitemap consumes are written: static routes, published docs, templates.
const root = resolve(import.meta.dir, "..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("rev-parse", "--is-shallow-repository") === "true") {
  throw new Error("Fetch full Git history before updating content dates");
}
const lastCommit = (...paths: string[]) => {
  const date = git("log", "-1", "--format=%cI", "--", ...paths);
  if (!date) throw new Error(`Missing Git date: ${paths.join(", ")}`);
  return date;
};
const sorted = (entries: [string, string][]) => Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));

const routes = sorted(Object.entries(STATIC_ROUTE_SOURCES)
  .filter((entry): entry is [string, readonly string[]] => entry[1] !== null)
  .map(([route, sources]) => [route, lastCommit(...sources)]));
const docsDir = resolve(root, "content/docs");
const docs = sorted(readdirSync(docsDir)
  .filter(file => file.endsWith(".md") && parseDocPage(file, readFileSync(resolve(docsDir, file), "utf8")))
  .map(file => [file, lastCommit(`content/docs/${file}`)]));
const templates = sorted(templateSlugs().map(slug => [slug, lastCommit(templateSource(slug))]));

writeFileSync(resolve(root, "src/lib/content-modified.json"), JSON.stringify({ routes, docs, templates }, null, 2) + "\n");
