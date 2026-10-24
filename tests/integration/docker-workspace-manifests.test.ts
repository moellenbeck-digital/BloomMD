/**
 * `bun install --frozen-lockfile` in the Docker builds fails ("Workspace not found") when a
 * workspace's package.json is not copied before the install. New packages were missed there
 * several times; this keeps both Dockerfiles in step with the workspace list.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");
const DOCKERFILES = ["Dockerfile", "deploy/openclaw/Dockerfile"];

function workspaceDirs(): string[] {
  const { workspaces } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { workspaces: string[] };
  return workspaces.flatMap((pattern) => {
    if (!pattern.endsWith("/*")) return [pattern];
    const base = pattern.slice(0, -2);
    return [...new Bun.Glob(`${base}/*/package.json`).scanSync({ cwd: root })].map((file) => path.dirname(file));
  }).filter((dir) => existsSync(path.join(root, dir, "package.json"))).sort();
}

/** Sources of every COPY before the first `bun install` of the first build stage. */
function copiedBeforeInstall(dockerfile: string): string[] {
  const lines = readFileSync(path.join(root, dockerfile), "utf8").split("\n");
  const install = lines.findIndex((line) => /bun install/.test(line));
  return lines.slice(0, install).filter((line) => /^COPY\s/.test(line) && !/--from=/.test(line))
    .flatMap((line) => line.replace(/^COPY\s+/, "").trim().split(/\s+/).slice(0, -1));
}

describe("Docker builds know every workspace", () => {
  for (const dockerfile of DOCKERFILES) {
    test(`${dockerfile} copies each workspace manifest before installing`, () => {
      const copied = copiedBeforeInstall(dockerfile).map((source) => source.replace(/^\.\//, "").replace(/\/$/, ""));
      const missing = workspaceDirs().filter((dir) => !copied.includes(`${dir}/package.json`) && !copied.includes(dir));
      expect(missing).toEqual([]);
    });
  }
});
