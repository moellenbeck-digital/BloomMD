import { expect, test } from "@playwright/test";

for (const locale of [
  { path: "/", available: "Heute nutzbar", pilot: "Interner Pilot · #116", exploring: "In Prüfung", roadmap: "/roadmap", desktop: "/download" },
  { path: "/en", available: "Available today", pilot: "Internal pilot · #116", exploring: "Exploring", roadmap: "/en/roadmap", desktop: "/download?lang=en" },
] as const) {
  test(`${locale.path} separates shipped product from pilot and roadmap`, async ({ page }) => {
    await page.goto(locale.path);

    const vision = page.locator("#vision");
    await expect(vision.getByText(locale.available, { exact: true })).toBeVisible();
    await expect(vision.getByText(locale.pilot, { exact: true })).toBeVisible();
    await expect(vision.getByText(locale.exploring, { exact: true })).toBeVisible();
    await expect(vision.getByRole("link", { name: /Roadmap/i })).toHaveAttribute("href", locale.roadmap);

    await expect(page.getByRole("link", { name: /Desktop herunterladen|Download desktop/i }).first()).toHaveAttribute("href", locale.desktop);
    await expect(page.locator("#templates article")).toHaveCount(3);
  });
}
