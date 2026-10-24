import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };

function uniqueEmail() {
  return `e2e-about-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

test("opens the accessible web About dialog with web build metadata", async ({ page, request }) => {
  const email = uniqueEmail();
  const signup = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "About E2E", email, password: PASSWORD, next: "/app" },
    maxRedirects: 0,
  });
  expect(signup.status()).toBe(303);

  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
  });
  await page.goto("/login?next=/app", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.locator('form[action="/api/auth/login"]').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.locator("#mindmap-canvas")).toBeVisible();

  const versionResponse = page.waitForResponse((response) => response.url().endsWith("/api/version"));
  await page.getByTestId("toolbar-help-menu").click();
  await page.getByTestId("toolbar-about").click();
  await versionResponse;

  const dialog = page.getByTestId("about-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("data-platform", "web");
  await expect(dialog).toHaveAttribute("aria-labelledby", "about-dialog-title");
  await expect(page.getByTestId("about-display-version")).toContainText("BloomMD");
  await expect(dialog).toContainText("Next.js");
  await expect(dialog).not.toContainText("Electrobun");

  await page.getByTestId("about-build-details").locator("summary").click();
  await expect(page.getByTestId("about-build-details")).toContainText("Deployment");
  const accessibility = await new AxeBuilder({ page }).include("[data-testid='about-dialog']").analyze();
  expect(accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("toolbar-help-menu")).toBeFocused();

  await page.getByTestId("toolbar-help-menu").click();
  await page.getByTestId("toolbar-locale").click();
  await page.getByTestId("toolbar-help-menu").click();
  await page.getByTestId("toolbar-about").click();
  await expect(page.getByRole("heading", { name: "About BloomMD" })).toBeVisible();
  await expect(page.getByTestId("about-dialog")).toContainText("hosted web application");
  await page.keyboard.press("Escape");
});
