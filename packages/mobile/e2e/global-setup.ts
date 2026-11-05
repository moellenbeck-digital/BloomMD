import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Starts every run with an empty list of rows for the job summary (see touch-views.spec.ts and summary.mjs). */
export default function globalSetup() {
  const results = fileURLToPath(new URL("../test-results", import.meta.url));
  mkdirSync(results, { recursive: true });
  rmSync(`${results}/summary-rows.jsonl`, { force: true });
}
