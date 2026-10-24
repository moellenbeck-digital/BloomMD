import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function prepareVisualPage(page: Page, testInfo: TestInfo) {
  const theme = testInfo.project.name.includes("dark") ? "dark" : "light";
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("bloommd-theme", selectedTheme);
    window.localStorage.setItem("bloommd_demo_guided_seen", "1");
  }, theme);
}

async function stabilizeVisuals(page: Page) {
  await page.addStyleTag({
    content: [
      "*, *::before, *::after {",
      "  animation-duration: 0s !important;",
      "  animation-delay: 0s !important;",
      "  transition-duration: 0s !important;",
      "  transition-delay: 0s !important;",
      "  caret-color: transparent !important;",
      "}",
    ].join("\n"),
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

test.describe("M1 marketing visual regression", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await prepareVisualPage(page, testInfo);
  });

  test("public landing stays visually stable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /desktop-app holen/i })).toBeVisible();
    await stabilizeVisuals(page);
    await expect(page).toHaveScreenshot("public-landing.png");
  });

  test("wiki explorer and knowledge map stay visually stable", async ({ page }) => {
    await page.goto("/wiki");
    await expect(page.getByTestId("wiki-search")).toBeVisible();
    await page.getByTestId("wiki-view-map").click();
    await expect(page.getByTestId("wiki-knowledge-map")).toBeVisible();
    await stabilizeVisuals(page);
    await expect(page).toHaveScreenshot("wiki-knowledge-map.png");
  });
});
