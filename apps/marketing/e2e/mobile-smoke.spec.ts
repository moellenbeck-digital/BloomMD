import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("mobile demo stays usable and local Markdown can be visualized", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bloommd_demo_guided_seen", "1"));
  await page.goto("/demo?lang=en");
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Try your own Markdown" }).click();
  const input = page.locator("textarea");
  await input.fill("# Mobile plan\n\n## First branch\n\nLocal content.\n\n## Second branch");
  await page.getByRole("button", { name: "Visualize pasted Markdown" }).click();
  await expect(page.locator('[data-node-label="Mobile plan"]')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("mobile landing page and template library have no horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/en", "/templates"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} should fit the mobile viewport`).toBeLessThanOrEqual(1);
  }
});

test("mobile editorial, download and OpenClaw docs keep their next action reachable", async ({ page }) => {
  const flows = [
    { path: "/blog", action: "Demo testen", actionType: "link" },
    { path: "/news", action: "Desktop laden", actionType: "link" },
    { path: "/download", action: "DMG herunterladen", actionType: "link" },
    { path: "/docs/openclaw-agent", action: "Dokumentation", actionType: "summary" },
  ] as const;

  for (const flow of flows) {
    await page.goto(flow.path);
    await expect(page.locator("h1")).toBeVisible();
    const action = flow.actionType === "link"
      ? page.getByRole("link", { name: flow.action, exact: true })
      : page.locator("summary");
    await expect(action.first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${flow.path} should fit the mobile viewport`).toBeLessThanOrEqual(1);
  }
});

// Keep each route's navigation and scan inside its own unchanged test budget.
// Readiness follows visible content, not analytics/media network activity.
for (const path of ["/", "/en", "/demo", "/templates"]) {
  test(`mobile marketing ${path} has no serious accessibility violations`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);
    await expect(page.locator("h1")).toBeVisible();
    if (path === "/demo") {
      await expect(page.locator("#mindmap-canvas")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Geführte Demo", exact: true })).toBeVisible();
    }
    // The landing page fades in for 450 ms. Scan its final contrast, not partial opacity.
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
      animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity
    ).length)).toBe(0);
    const result = await new AxeBuilder({ page }).analyze();
    const summary = result.violations
      .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
      .map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" ")) }));
    expect(summary, path).toEqual([]);
  });
}
