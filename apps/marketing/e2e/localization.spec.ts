import { expect, test } from "@playwright/test";

const routeMatrix = [
  { path: "/en", text: "Markdown files. Visual maps." },
  { path: "/en/roadmap", text: "What BloomMD is exploring next." },
  { path: "/en/blog", text: "Read the latest thinking" },
  { path: "/en/news", text: "The latest changes" },
  { path: "/demo?lang=en", text: "Try your own Markdown" },
  { path: "/templates?lang=en", text: "Start BloomMD with a real Markdown map." },
  { path: "/templates/software-architecture?lang=en", text: "Software Architecture Map" },
  { path: "/docs?lang=en", text: "Getting started" },
  { path: "/download?lang=en", text: "Download desktop apps" },
  { path: "/obsidian?lang=en", text: "Install BloomMD in Obsidian" },
  { path: "/waitlist/abgemeldet?lang=en", text: "Unsubscribed" },
  { path: "/waitlist/abgemeldet?status=ungueltig&lang=en", text: "This unsubscribe link no longer works" },
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

/**
 * Help pages that were added with the online help (ticket 69): they load in both languages, show their
 * pictures and can be reached from the docs navigation, on a wide screen and in the narrow overview.
 */
const helpPages = [
  { slug: "fehlerbehebung", title: { de: "Fehlerbehebung", en: "Troubleshooting" } },
  { slug: "lokal-oder-cloud", title: { de: "Lokal oder Cloud", en: "Local or cloud" } },
] as const;
const docsLocales = ["de", "en"] as const;

function docsPath(slug: string, locale: "de" | "en") {
  const path = slug ? `/docs/${slug}` : "/docs";
  return locale === "en" ? `${path}?lang=en` : path;
}

for (const helpPage of helpPages) {
  for (const locale of docsLocales) {
    const title = helpPage.title[locale];
    const navigationName = locale === "de" ? "Dokumentation" : "Documentation";

    test(`help page ${helpPage.slug} loads in ${locale} with working pictures`, async ({ page }) => {
      const response = await page.goto(docsPath(helpPage.slug, locale));
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByTestId("docs-article").getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();

      await page.waitForLoadState("load");
      const images = page.locator('[data-testid="docs-article"] img');
      expect(await images.count(), "the page shows at least one picture").toBeGreaterThan(0);
      const broken = await images.evaluateAll((elements) =>
        elements
          .filter((element) => !(element as HTMLImageElement).complete || (element as HTMLImageElement).naturalWidth === 0)
          .map((element) => (element as HTMLImageElement).getAttribute("src")),
      );
      expect(broken, "pictures that did not load").toEqual([]);
    });

    test(`help page ${helpPage.slug} is in the docs navigation in ${locale}`, async ({ page }) => {
      await page.goto(docsPath("", locale));
      const link = page.getByRole("navigation", { name: navigationName }).getByRole("link", { name: title, exact: true });
      await expect(link).toHaveAttribute("href", docsPath(helpPage.slug, locale));
      await link.click();
      await expect(page).toHaveURL((url) => url.pathname === `/docs/${helpPage.slug}`);
      await expect(page.getByTestId("docs-article").getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    });

    test(`help page ${helpPage.slug} is in the narrow docs overview in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(docsPath("", locale));
      await page.locator("summary").filter({ hasText: navigationName }).click();
      const link = page.locator("details").getByRole("link", { name: title, exact: true });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL((url) => url.pathname === `/docs/${helpPage.slug}`);
      await expect(page.getByTestId("docs-article").getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    });
  }
}
