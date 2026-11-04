import { expect, test, type Page } from "@playwright/test";
import { BROWSER_LOCALE, capture, LOCALES, type Locale } from "./shared";

/**
 * Pictures of the signup page while the access switch is on. Server: the web app of
 * `playwright.docs-screenshots.config.ts` with `DOCS_SCREENSHOTS_TARGET=gate`, where only
 * `alex@example.com` is invited. Pages are only looked at; nothing is submitted.
 */

async function prepare(page: Page, locale: Locale) {
  await page.addInitScript((selectedLocale) => {
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", selectedLocale);
  }, locale);
}

for (const locale of LOCALES) {
  test.describe(`docs screenshots, access switch on (${locale}) @t69`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });

    test("signup without an invitation explains the access switch", async ({ page }) => {
      await prepare(page, locale);
      await page.goto(`/signup?next=%2Fapp&lang=${locale}`);
      await expect(page.getByText(locale === "de" ? "Dein kostenloser Testaccount ist noch nicht freigeschaltet." : "Your free trial account is not enabled yet.")).toBeVisible();
      await capture(page, "signup-gate", locale);
    });

    test("signup from an invitation link has the invited address filled in", async ({ page }) => {
      await prepare(page, locale);
      await page.goto(`/signup?next=%2Fapp&lang=${locale}&email=${encodeURIComponent("alex@example.com")}`);
      await expect(page.getByTestId("signup-form").locator('input[name="email"]')).toHaveValue("alex@example.com");
      await capture(page, "signup-invited", locale);
    });
  });
}
