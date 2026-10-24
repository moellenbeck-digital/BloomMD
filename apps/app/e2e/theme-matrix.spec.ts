import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];

const publicRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/invite/not-a-real-token",
  "/invite/confirm",
  "/beta",
  "/agb",
  "/cookies",
  "/datenschutz",
  "/impressum",
  "/lizenz",
  "/widerruf",
] as const;

const representativeAccessibilityRoutes = [
  "/login",
  "/invite/not-a-real-token",
  "/datenschutz",
  "/beta",
] as const;

function uniqueEmail() {
  return `theme-matrix-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function setThemeBeforePaint(page: Page, theme: Theme) {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("bloommd-theme", selectedTheme);
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
  test(`public app route matrix renders ${theme} without Light-theme surfaces`, async ({ page }) => {
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

  test(`representative app routes pass Axe in ${theme}`, async ({ page }) => {
    await setThemeBeforePaint(page, theme);

    for (const path of representativeAccessibilityRoutes) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page }).analyze();
      expect(seriousViolations(result), `${path} in ${theme}`).toEqual([]);
    }
  });

  test(`authenticated app surfaces stay themed in ${theme}`, async ({ page }) => {
    await setThemeBeforePaint(page, theme);
    await page.goto("/signup?next=/app");
    await page.getByLabel("Name").fill("Theme Matrix");
    await page.getByLabel("E-Mail").fill(uniqueEmail());
    await page.getByLabel("Passwort").fill("Testpass12345");
    await page.getByRole("button", { name: "Account erstellen" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/app");
    await expect(page.getByTestId("mindmap-canvas")).toBeVisible();

    for (const path of ["/app", "/account", "/wiki"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (theme === "dark") await assertNoLightSurfaces(page, path);
    }
  });
}
