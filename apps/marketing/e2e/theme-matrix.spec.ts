import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];

const publicRoutes = [
  "/",
  "/en",
  "/demo",
  "/demo?lang=en",
  "/templates",
  "/templates?lang=en",
  "/templates/software-architecture",
  "/docs",
  "/docs?lang=en",
  "/docs/desktop",
  "/download",
  "/download?lang=en",
  "/obsidian",
  "/obsidian?lang=en",
  "/roadmap",
  "/en/roadmap",
  "/waitlist/abgemeldet",
  "/waitlist/abgemeldet?status=ungueltig",
  "/agb",
  "/cookies",
  "/datenschutz",
  "/impressum",
  "/leistungen",
  "/lizenz",
  "/widerruf",
  "/wiki",
] as const;

const representativeAccessibilityRoutes = [
  "/",
  "/demo",
  "/templates",
  "/docs",
  "/datenschutz",
  "/waitlist/abgemeldet",
] as const;

async function setThemeBeforePaint(page: Page, theme: Theme) {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("bloommd-theme", selectedTheme);
    window.localStorage.setItem("bloommd_demo_guided_seen", "1");
  }, theme);
}

async function assertNoLightSurfaces(page: Page, path: string) {
  const result = await page.evaluate(() => {
    const knownLightSurfaces = new Set([
      "rgb(255, 255, 255)",
      "rgb(250, 250, 250)",
      "rgb(250, 250, 247)",
      "rgb(248, 245, 240)",
      "rgb(255, 253, 251)",
      "rgb(252, 251, 250)",
      "rgb(242, 240, 237)",
    ]);
    return Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const style = getComputedStyle(element);
        return element.getClientRects().length > 0 && knownLightSurfaces.has(style.backgroundColor);
      })
      .slice(0, 12)
      .map((element) => ({ tag: element.tagName.toLowerCase(), testId: element.dataset.testid ?? null, className: element.className }));
  });

  expect(result, `${path} still renders Light-theme surfaces in dark mode`).toEqual([]);
}

function seriousViolations(result: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return result.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
    .map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" ")) }));
}

for (const theme of themes) {
  test(`public marketing route matrix renders ${theme} without Light-theme surfaces`, async ({ page }) => {
    await setThemeBeforePaint(page, theme);

    for (const path of publicRoutes) {
      await page.goto(path, { waitUntil: "commit" });
      if (theme === "dark") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      }
      await page.waitForLoadState("networkidle");
      if (theme === "dark") await assertNoLightSurfaces(page, path);
    }
  });

  test(`representative marketing routes pass Axe in ${theme}`, async ({ page }) => {
    await setThemeBeforePaint(page, theme);

    for (const path of representativeAccessibilityRoutes) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page }).analyze();
      expect(seriousViolations(result), `${path} in ${theme}`).toEqual([]);
    }
  });
}
