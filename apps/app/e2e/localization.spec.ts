import { expect, test } from "@playwright/test";

const publicRoutes = [
  { path: "/login?lang=en", heading: "Sign in" },
  { path: "/signup?lang=en", heading: "Create account" },
  { path: "/forgot-password?lang=en", heading: "Reset your password" },
  { path: "/reset-password?lang=en", heading: "Choose a new password" },
  { path: "/agb?lang=en", heading: "General Terms and Conditions" },
  { path: "/datenschutz?lang=en", heading: "Privacy Policy" },
  { path: "/impressum?lang=en", heading: "Legal notice" },
  { path: "/lizenz?lang=en", heading: "License terms" },
  { path: "/widerruf?lang=en", heading: "Right of withdrawal" },
  { path: "/cookies?lang=en", heading: "Cookie settings" },
  { path: "/beta?lang=en", heading: "Thanks for testing BloomMD." },
  { path: "/invite/confirm?lang=en", heading: "This invitation handoff is invalid or expired." },
] as const;

for (const route of publicRoutes) {
  test(`English app route stays English: ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("h1")).toHaveText(route.heading);
  });
}

test("authentication language survives the account redirect", async ({ page }) => {
  await page.goto("/account?lang=en");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
});

test("English legal metadata is localized", async ({ page }) => {
  await page.goto("/datenschutz?lang=en");
  await expect(page).toHaveTitle(/Privacy Policy/);
  await expect(page.locator("main")).not.toContainText("Datenschutzerklärung");
});
