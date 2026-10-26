import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicPages = [
  { path: "/login", name: "login" },
  { path: "/signup", name: "signup" },
  { path: "/forgot-password", name: "password reset request" },
  { path: "/invite/not-a-real-token", name: "invalid workspace invitation" },
  { path: "/beta", name: "private beta scope" },
] as const;

for (const entry of publicPages) {
  test(`${entry.name} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(entry.path);
    await page.waitForLoadState("networkidle");
    const result = await new AxeBuilder({ page }).analyze();
    const violations = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    const summary = violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
    expect(summary).toEqual([]);
  });
}

test("authenticated editor has no serious accessibility violations", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));
  await page.goto("/signup?next=/app");
  await page.getByLabel("Name").fill("Accessibility Test");
  await page.getByLabel("E-Mail").fill(`a11y-${Date.now()}@bloommd.local`);
  await page.getByLabel("Passwort").fill("Testpass12345");
  await page.getByTestId("signup-consent").check();
  await page.getByRole("button", { name: "Account erstellen" }).click();
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  const summary = result.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
    .map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" ")) }));
  expect(summary).toEqual([]);
});
