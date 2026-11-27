import { defineConfig } from "@playwright/test";
import offlineConfig from "./playwright.offline-t346.config";

/**
 * Ticket #346 — dieselbe Spec mit Video (1280×720), nach dem Muster von `playwright.learnings-w0.video.config.ts`.
 * `T346_VIDEO=1` schaltet die aufgenommene Bühne der Spec ein (zwei Geräte in einem Video, siehe `e2e/offline-t346-stage.ts`),
 * `T346_PAUSE_MS` die Pause zwischen den Schritten. Ziel: unter 90 s Video.
 * Video: `/tmp/bloommd-e2e-offline-t346-video/<Testordner>/video.webm`.
 *
 * Lauf: `bun run --cwd apps/app test:e2e:offline-t346:video`
 */
process.env.T346_VIDEO = "1";
process.env.T346_PAUSE_MS ??= "1500";

export default defineConfig({
  ...offlineConfig,
  outputDir: "/tmp/bloommd-e2e-offline-t346-video",
  projects: offlineConfig.projects,
});
