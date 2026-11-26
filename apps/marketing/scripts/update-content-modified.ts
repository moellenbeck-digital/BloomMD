import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Run in a full-history checkout after committing content changes. The checked-in
// inventory also works in Docker/source archives where Git history is unavailable.
const root = resolve(import.meta.dir, "..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("rev-parse", "--is-shallow-repository") === "true") {
  throw new Error("Fetch full Git history before updating content dates");
}
const paths = git("ls-files", "content/docs/*.md", "src/app/**/page.tsx", "src/app/page.tsx").split("\n").filter(Boolean).sort();
const dates = Object.fromEntries(paths.map(path => {
  const date = git("log", "-1", "--format=%cI", "--", path);
  if (!date) throw new Error(`Missing Git date: ${path}`);
  return [path, date];
}));
writeFileSync(resolve(root, "src/lib/content-modified.json"), JSON.stringify(dates, null, 2) + "\n");
