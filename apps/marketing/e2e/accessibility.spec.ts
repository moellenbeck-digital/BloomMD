import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicPages = [
  { path: "/", name: "landing page" },
  { path: "/en", name: "English landing page" },
  { path: "/demo", name: "public demo" },
  { path: "/download", name: "download status" },
  { path: "/obsidian", name: "Obsidian status" },
  { path: "/templates", name: "template library" },
  { path: "/templates/software-architecture", name: "template detail" },
  { path: "/docs", name: "documentation" },
  { path: "/blog", name: "blog" },
  { path: "/blog/markdown-als-visuelle-map", name: "blog article" },
  { path: "/news", name: "news" },
  { path: "/news/markdown-editor-formatting", name: "news article" },
] as const;

const darkModePages = [
  { path: "/", name: "landing page", surfaceSelectors: ["body", "header", "footer", '[data-testid="landing-paths"]'] },
  { path: "/en", name: "English landing page", surfaceSelectors: ["body", "header", "footer"] },
  { path: "/datenschutz", name: "privacy page", surfaceSelectors: ["body", "main", "article"] },
  { path: "/waitlist/abgemeldet", name: "waitlist unsubscribe", surfaceSelectors: ["body", "main"] },
  { path: "/news", name: "news", surfaceSelectors: ["body", "header", "footer"] },
] as const;

function seriousViolations(result: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return result.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
}

function maxRenderedRgb(color: string) {
  const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
  return Math.max(values[0] ?? 255, values[1] ?? 255, values[2] ?? 255);
}

for (const entry of publicPages) {
  test(`${entry.name} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(entry.path);
    await page.waitForLoadState("networkidle");
    const result = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(result)).toEqual([]);
  });
}

test("light theme keeps muted and faint ink tokens distinct", async ({ page }) => {
  await page.goto("/");
  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      muted: styles.getPropertyValue("--color-ink-muted").trim(),
      faint: styles.getPropertyValue("--color-ink-faint").trim(),
    };
  });
  expect(tokens.muted).toBeTruthy();
  expect(tokens.faint).toBeTruthy();
  expect(tokens.faint).not.toBe(tokens.muted);
});

test.describe("dark system preference", () => {
  test.use({ colorScheme: "dark" });

  for (const entry of darkModePages) {
    test(`${entry.name} uses dark surfaces and keeps accessibility contrast`, async ({ page }) => {
      await page.goto(entry.path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveClass(/dark/);

      for (const selector of entry.surfaceSelectors) {
        const color = await page.locator(selector).first().evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(maxRenderedRgb(color), `${entry.path} ${selector} should not render as a light surface (${color})`).toBeLessThanOrEqual(80);
      }

      if (entry.path === "/" || entry.path === "/en") {
        await expect(page.locator(".bloommd-logo-dark").first()).toBeVisible();
        await expect(page.locator(".bloommd-logo-light").first()).toBeHidden();
      }

      const result = await new AxeBuilder({ page }).analyze();
      expect(seriousViolations(result)).toEqual([]);
    });
  }
});
  const response = await page.goto("/admin/waitlist");
  test.skip(response?.status() === 503, "Waitlist admin auth is not configured on this server.");
  await page.waitForLoadState("networkidle");
  const result = await new AxeBuilder({ page }).analyze();
  expect(seriousViolations(result)).toEqual([]);
});
