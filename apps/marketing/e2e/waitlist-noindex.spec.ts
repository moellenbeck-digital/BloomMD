import { expect, test } from "@playwright/test";

test("waitlist result pages stay out of search indexes", async ({ page }) => {
  const response = await page.goto("/waitlist/bestaetigt", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  const body = await page.content();
  expect(body).toContain('name="robots"');
  expect(body).toContain("noindex");
});
