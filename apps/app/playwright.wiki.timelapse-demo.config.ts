import { defineConfig } from "@playwright/test";
import wikiConfig from "./playwright.wiki.config";

export default defineConfig({
  ...wikiConfig,
  testMatch: /wiki-timelapse-demo\.spec\.ts/,
  projects: [{ name: "chromium-wiki-demo" }],
  outputDir: "/tmp/bloommd-e2e-timelapse/raw",
  use: {
    ...wikiConfig.use,
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
  },
});
