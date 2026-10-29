/**
 * Ticket #78 — Template-Metadaten der Marketing-Seite werden zur Laufzeit gegen ein Schema geprüft.
 *
 * Die Templates liefert der Dienst `marketing` des Testsystems, nicht `app`. Die Adresse kommt aus
 * `PLAYWRIGHT_MARKETING_URL`, sonst wird sie aus `PLAYWRIGHT_BASE_URL` abgeleitet (`app.` → `marketing.`).
 *
 * Nicht an der Oberfläche prüfbar (durch Unit-Tests in `apps/marketing/src/lib/templates.test.ts` abgedeckt):
 * ungültige Metadaten (kaputtes JSON, fehlendes Feld, falscher Typ, Slug/Pfad außerhalb des Template-Ordners,
 * ungültige Version oder Vorschaubild-Pfad). Sie lassen sich auf dem ausgerollten System nicht erzeugen, ohne
 * Dateien im Deployment zu ändern.
 *
 * Die Tests sind rein lesend; es entstehen keine Testdaten.
 */
import { expect, test, type APIResponse } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
const marketingURL = (process.env.PLAYWRIGHT_MARKETING_URL?.trim() || baseURL.replace("//app.", "//marketing.")).replace(/\/$/, "");

const TEMPLATES = [
  { slug: "software-architecture", en: "Software Architecture Map", de: "Software-Architektur-Map" },
  { slug: "startup-operating-system", en: "Startup Operating System", de: "Startup-Betriebssystem" },
  { slug: "obsidian-vault-starter", en: "Obsidian Vault Starter", de: "Obsidian-Vault-Starter" },
  { slug: "research-project", en: "Research Project Map", de: "Forschungsprojekt-Map" },
  { slug: "novel-writing", en: "Novel Writing Map", de: "Roman-Schreib-Map" },
  { slug: "content-strategy", en: "Content Strategy Map", de: "Content-Strategie-Map" },
] as const;

const url = (path: string) => `${marketingURL}${path}`;

/** Kein Stacktrace, keine Rohdaten, keine Dateipfade in der Ausgabe. */
function expectNoInternals(body: string) {
  expect(body).not.toMatch(/\n\s+at\s+\S+.*(:\d+:\d+|\(<anonymous>\))/);
  expect(body).not.toMatch(/metadata\.json/i);
  expect(body).not.toMatch(/(^|[\s"'(])\/(home|app|usr|var|tmp|srv|opt|workspace)\//);
  expect(body).not.toMatch(/node_modules|\.next\/|[A-Za-z]:\\\\/);
  expect(body).not.toMatch(/SyntaxError|ENOENT|TypeError|ZodError/);
}

test.describe("Template-Metadaten @t78", () => {
  test.beforeAll(() => {
    expect(marketingURL, "PLAYWRIGHT_BASE_URL bzw. PLAYWRIGHT_MARKETING_URL muss gesetzt sein").toMatch(/^https?:\/\//);
  });

  test("GET /api/templates liefert alle sechs Templates mit Titel, Beschreibung und Slug @t78", async ({ request }) => {
    const response = await request.get(url("/api/templates"));
    expect(response.status()).toBe(200);
    const { templates } = (await response.json()) as { templates: Array<{ slug: string; title: string; description: string }> };
    expect(templates).toHaveLength(6);
    expect(templates.map((template) => template.slug).sort()).toEqual(TEMPLATES.map((template) => template.slug).sort());
    for (const expected of TEMPLATES) {
      const found = templates.find((template) => template.slug === expected.slug);
      expect(found, `Template ${expected.slug} fehlt`).toBeDefined();
      expect(found!.title).toBe(expected.en);
      expect(found!.description.trim().length).toBeGreaterThan(10);
    }
  });

  test("/templates zeigt alle sechs Templates (de und en) @t78", async ({ page }) => {
    for (const locale of ["de", "en"] as const) {
      await page.goto(url(locale === "de" ? "/templates" : "/templates?lang=en"));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("main article")).toHaveCount(6);
      for (const template of TEMPLATES) {
        await expect(page.getByRole("heading", { level: 2, name: template[locale], exact: true })).toBeVisible();
      }
    }
  });

  for (const template of TEMPLATES) {
    for (const locale of ["de", "en"] as const) {
      test(`/templates/${template.slug} rendert mit Titel und Markdown-Inhalt (${locale}) @t78`, async ({ page, request }) => {
        const response = await page.goto(url(locale === "de" ? `/templates/${template.slug}` : `/templates/${template.slug}?lang=${locale}`));
        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1, name: template[locale], exact: true })).toBeVisible();

        const markdown = await (await request.get(url(`/api/templates/${template.slug}/markdown`))).text();
        const firstHeading = markdown.split(/\r?\n/).find((line) => /^#{1,6}\s+\S/.test(line));
        expect(firstHeading, "Markdown enthält eine Überschrift").toBeDefined();
        const preview = page.locator("pre code").first();
        await expect(preview).toBeVisible();
        await expect(preview).toContainText(firstHeading!.trim());
        await expect(preview).toContainText(`title: ${template.en}`);
      });
    }
  }

  test("/demo rendert mit Voreinstellung software-architecture @t78", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("bloommd_demo_guided_seen", "1"));
    const response = await page.goto(url("/demo?lang=en"));
    expect(response?.status()).toBe(200);
    const select = page.getByLabel("Select template");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("software-architecture");
    await expect(select.locator("option")).toHaveCount(6);
    await page.getByRole("button", { name: "Markdown", exact: true }).click();
    await expect(page.getByLabel("Markdown preview")).toContainText("title: Software Architecture Map");

    // ohne lang-Parameter (Standardsprache Deutsch) gilt dieselbe Voreinstellung
    await page.goto(url("/demo"));
    await expect(page.getByLabel("Vorlage auswählen")).toHaveValue("software-architecture");
  });

  test("/demo?template=research-project zeigt dieses Template @t78", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("bloommd_demo_guided_seen", "1"));
    const response = await page.goto(url("/demo?template=research-project&lang=en"));
    expect(response?.status()).toBe(200);
    const select = page.getByLabel("Select template");
    await expect(select).toHaveValue("research-project");
    await expect(select.locator("option:checked")).toHaveText("Research Project Map");
    await page.getByRole("button", { name: "Markdown", exact: true }).click();
    await expect(page.getByLabel("Markdown preview")).toContainText("title: Research Project Map");
  });

  for (const template of TEMPLATES) {
    test(`API /api/templates/${template.slug} und Markdown-Download liefern 200 mit Inhalt @t78`, async ({ request }) => {
      const detail: APIResponse = await request.get(url(`/api/templates/${template.slug}`));
      expect(detail.status()).toBe(200);
      const { template: body } = (await detail.json()) as { template: { slug: string; title: string; markdown: string } };
      expect(body.slug).toBe(template.slug);
      expect(body.title).toBe(template.en);
      expect(body.markdown.length).toBeGreaterThan(100);

      const markdown = await request.get(url(`/api/templates/${template.slug}/markdown`));
      expect(markdown.status()).toBe(200);
      expect(markdown.headers()["content-type"]).toContain("text/markdown");
      expect(markdown.headers()["content-disposition"]).toContain(`${template.slug}.md`);
      const text = await markdown.text();
      expect(text.length).toBeGreaterThan(100);
      expect(text).toBe(body.markdown);
    });
  }

  test("unbekannter Slug liefert 404 ohne Stacktrace, Rohdaten oder Dateipfade @t78", async ({ page, request }) => {
    const slug = "gibt-es-nicht";
    for (const path of [`/api/templates/${slug}`, `/api/templates/${slug}/markdown`]) {
      const response = await request.get(url(path));
      expect(response.status(), path).toBe(404);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({ error: "Template not found" });
      expectNoInternals(body);
    }

    const response = await page.goto(url(`/templates/${slug}`));
    expect(response?.status()).toBe(404);
    // sichtbarer Text der Seite (das HTML enthält Framework-Skripte mit eigenen Pfaden)
    expectNoInternals(await page.locator("body").innerText());
  });
});
