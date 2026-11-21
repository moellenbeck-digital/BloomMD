import { defineConfig } from "@playwright/test";
import learningsConfig from "./playwright.learnings-w0.config";

/**
 * Ticket #345 — dieselbe Spec mit Video (1280×720), nach dem Muster von `playwright.wiki.timelapse-demo.config.ts`.
 * `LEARNINGS_W0_PAUSE_MS` lässt die Spec zwischen den Schritten warten, damit das Video lesbar ist.
 * Video: `/tmp/bloommd-e2e-learnings-w0-video/<test>/video.webm`.
 *
 * Lauf: `bun run --cwd apps/app test:e2e:learnings-w0:video`
 */
process.env.LEARNINGS_W0_PAUSE_MS ??= "1200";

export default defineConfig({
  ...learningsConfig,
  projects: [{ name: "chromium-learnings-w0-video" }],
  outputDir: "/tmp/bloommd-e2e-learnings-w0-video",
  use: {
    ...learningsConfig.use,
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
  },
});
