import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Reset for the offline conflict E2E (#261, #346): deletes the local test workspace together with its
 * pre-merge snapshots (`.snapshots`). The starting files are not prepared here: the spec creates them
 * itself through the app API (unique names per run), the same way it does against a test system.
 */
export default async function globalSetup(): Promise<void> {
  const workspace = resolve(process.cwd(), "../../.qa/playwright-offline-workspace");
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
}
