import { expect, test } from "@playwright/test";

/**
 * The theme has to be right at the first paint.
 *
 * `useTheme` applies the class in an effect, which runs after hydration. Without the blocking
 * script in `<head>`, a user who prefers dark saw the light theme flash on every load — the first
 * impression of the product, and it looks broken rather than merely light.
 *
 * These tests check the login page, which needs no session and is genuinely the first thing an
 * invited tester sees.
 */

test("a stored dark preference is applied before the page renders", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bloommd-theme", "dark"));
  await page.goto("/login", { waitUntil: "commit" });

  // `commit` means the response arrived and scripts in <head> have run, but React has not hydrated.
  // If the class is only set by the effect, it is absent here.
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("a stored light preference stays light", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bloommd-theme", "light"));
  await page.goto("/login", { waitUntil: "commit" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("the system preference decides when nothing is stored", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("a stored preference beats the system setting", async ({ page }) => {
  // Someone who chose light in the app means it, even on a dark desktop.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => window.localStorage.setItem("bloommd-theme", "light"));
  await page.goto("/login", { waitUntil: "commit" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("the body follows the theme rather than a hardcoded colour", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bloommd-theme", "dark"));
  await page.goto("/login");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // #111111 is the dark surface token; a hardcoded #FAFAFA would show up as rgb(250, 250, 250).
  expect(background).toBe("rgb(17, 17, 17)");
});

test("a garbled stored value falls back to the system setting", async ({ page }) => {
  // Storage survives across releases, so a value written by an older build — or by hand — has to
  // degrade to something sensible rather than to a half-applied theme.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => window.localStorage.setItem("bloommd-theme", "{\"mode\":\"dark\"}"));
  await page.goto("/login", { waitUntil: "commit" });

  // Not the string "dark", so the stored value is ignored and the system preference decides.
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("form").first()).toBeVisible();
});
