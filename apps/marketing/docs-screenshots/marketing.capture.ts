import { expect, test } from "@playwright/test";
import { BROWSER_LOCALE, capture, LOCALES } from "./shared";

/**
 * Pictures of the public marketing site for the online help. Server: the marketing app of
 * `playwright.docs-screenshots.config.ts`. The demo needs no account and loads a built-in template.
 */
for (const locale of LOCALES) {
  test.describe(`docs screenshots (${locale}) @t69`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });

    test("browser demo with a template map", async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("bloommd_demo_guided_seen", "1"));
      await page.goto(`/demo${locale === "en" ? "?lang=en" : ""}`);
      await expect(page.locator("#mindmap-canvas")).toBeVisible();
      await expect(page.locator('[data-testid="mindmap-node"]').first()).toBeVisible();
      await capture(page, "demo", locale);
    });
  });
}
