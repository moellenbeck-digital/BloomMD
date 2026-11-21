import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Reset for the offline conflict E2E (#261, #346): deletes the test workspace together with its
 * pre-merge snapshots (`.snapshots`) and recreates the starting files from the fixtures.
 */
export default async function globalSetup(): Promise<void> {
  const workspace = resolve(process.cwd(), "../../.qa/playwright-offline-workspace");
  const fixtures = resolve(process.cwd(), "e2e/fixtures/offline-workspace");
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  for (const name of (await readdir(fixtures)).filter((entry) => entry.endsWith(".md"))) {
    await cp(resolve(fixtures, name), resolve(workspace, name));
  }
}
