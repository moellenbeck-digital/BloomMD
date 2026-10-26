import { expect, test } from "@playwright/test";

test("waitlist unsubscribe pages stay out of search indexes", async ({ page }) => {
  for (const path of ["/waitlist/abgemeldet", "/waitlist/abgemeldet?status=ungueltig"]) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.ok(), path).toBe(true);
    const body = await page.content();
    expect(body).toContain('name="robots"');
    expect(body).toContain("noindex");
  }
});
