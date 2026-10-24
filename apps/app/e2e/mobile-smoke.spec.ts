import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("mobile product auth pages have no horizontal overflow", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} should fit the mobile viewport`).toBeLessThanOrEqual(1);
  }
});

test("mobile product auth pages have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const result = await new AxeBuilder({ page }).analyze();
    const summary = result.violations
      .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
      .map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" ")) }));
    expect(summary, path).toEqual([]);
  }
});
