import { expect, test } from "@playwright/test";

const routeMatrix = [
  { path: "/en", text: "Markdown files. Visual maps." },
  { path: "/en/roadmap", text: "What beta feedback is turning into." },
  { path: "/en/blog", text: "Read the latest thinking" },
  { path: "/en/news", text: "The latest changes" },
  { path: "/demo?lang=en", text: "Try your own Markdown" },
  { path: "/templates?lang=en", text: "Start BloomMD with a real Markdown map." },
  { path: "/templates/software-architecture?lang=en", text: "Software Architecture Map" },
  { path: "/docs?lang=en", text: "Getting started" },
  { path: "/download?lang=en", text: "Download desktop apps" },
  { path: "/obsidian?lang=en", text: "Your Obsidian notes as BloomMD maps." },
  { path: "/waitlist/bestaetigt?lang=en", text: "You are on the waitlist" },
  { path: "/waitlist/abgemeldet?lang=en", text: "Unsubscribed" },
  { path: "/waitlist/ungueltig?lang=en", text: "This link is no longer valid" },
  { path: "/datenschutz?lang=en", text: "Privacy policy" },
  { path: "/impressum?lang=en", text: "Legal notice" },
  { path: "/wiki?lang=en", text: "Wiki is not enabled here" },
] as const;

for (const route of routeMatrix) {
  test(`English route stays English: ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("main").getByText(route.text, { exact: true }).last()).toBeVisible();
  });
}

test("German landing stays German", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("h1")).toHaveText("Markdown-Dateien. Als visuelle Maps.");
});

test("German and English docs keep their language switch", async ({ page }) => {
  await page.goto("/docs?lang=en");
  await expect(page.locator('a[href="/docs"]')).toBeVisible();

  await page.goto("/docs?lang=de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator('a[href="/docs?lang=en"]')).toBeVisible();
});

test("English legal metadata is localized", async ({ page }) => {
  await page.goto("/agb?lang=en");
  await expect(page).toHaveTitle(/General Terms and Conditions/);
  await expect(page.locator("main")).not.toContainText("Allgemeine Geschäftsbedingungen");
});
