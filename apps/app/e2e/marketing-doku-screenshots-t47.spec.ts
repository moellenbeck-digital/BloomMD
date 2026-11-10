/**
 * Ticket #47 — Doku-Screenshots und Release-Status (Marketing-Website, `apps/marketing`).
 *
 * Geprüft wird an der Oberfläche des Marketing-Hosts (`PLAYWRIGHT_MARKETING_URL`, sonst aus `PLAYWRIGHT_BASE_URL`
 * abgeleitet: `app.` → `marketing.`) auf vier Seiten:
 * - DE-News `/news/shared-mode-und-lokale-agenten-release`, EN-News `/en/news/shared-mode-and-local-agents-release`
 * - DE-Hilfe `/docs/collaboration`, EN-Hilfe `/docs/collaboration?lang=en`
 * Ein Fall je Kriterium (K1–K7), jeder mit eigenem `expect`. Bilder gelten nur als geladen, wenn der Browser sie
 * dekodiert hat (`complete`, `naturalWidth > 0`) und die Datei mit 200 und Bild-Content-Type ausgeliefert wird.
 *
 * Nicht prüfbar:
 * - Kriterium 8 (Unit-Tests und `next build`): kein Oberflächen-Kriterium; gehört zu `posts.test.ts` und CI.
 * - Dass der Release-Status inhaltlich stimmt (Hosted `0.4.18` hat keinen Tag): belegt nur `Changelog.md`. Geprüft wird
 *   der Wortlaut auf der Seite.
 * - Obsidian: Es gibt keinen neuen Screenshot-Nachweis. K7 prüft nur, dass der Text nichts Gegenteiliges behauptet
 *   (kein „Übernehmen“-Knopf im Bild, keine Obsidian-Aufnahme).
 *
 * Die Tests sind rein lesend; es entstehen keine Testdaten.
 */
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
const marketingURL = (process.env.PLAYWRIGHT_MARKETING_URL?.trim() || baseURL.replace("//app.", "//marketing.")).replace(/\/$/, "");

const CONFLICT_IMG = "shared-mode-conflict-desktop.png";
const PROPOSAL_IMG = "openclaw-agent-proposal.png";
const ILLUSTRATION_IMG = "collaboration-sync.png";

const NEWS = {
  de: `${marketingURL}/news/shared-mode-und-lokale-agenten-release`,
  en: `${marketingURL}/en/news/shared-mode-and-local-agents-release`,
} as const;
const DOCS = {
  de: `${marketingURL}/docs/collaboration`,
  en: `${marketingURL}/docs/collaboration?lang=en`,
} as const;

type Lang = "de" | "en";

async function open(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

interface ImageInfo {
  src: string;
  alt: string;
  loaded: boolean;
  /** Text des Absatzes direkt vor dem Bild-Absatz. */
  before: string;
  /** Text des Absatzes direkt nach dem Bild-Absatz (Bildunterschrift). */
  caption: string;
}

/** Liest Bild, Alt-Text, Ladezustand und die Nachbarabsätze im DOM (Bild steht in eigenem `<p>`, Unterschrift folgt). */
async function imageInfo(page: Page, file: string): Promise<ImageInfo> {
  const img = page.locator(`img[src*="${file.replace(".png", "")}"]`);
  await expect(img, `Bild ${file} im DOM`).toHaveCount(1);
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), {
      message: `Bild ${file} geladen`,
      timeout: 15_000,
    })
    .toBe(true);
  return img.evaluate((el) => {
    const image = el as HTMLImageElement;
    const block = image.closest("p") ?? image;
    return {
      src: image.getAttribute("src") ?? "",
      alt: image.getAttribute("alt") ?? "",
      loaded: image.complete && image.naturalWidth > 0,
      before: (block.previousElementSibling?.textContent ?? "").replace(/\s+/g, " ").trim(),
      caption: (block.nextElementSibling?.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  });
}

/** Die Bilddatei selbst liefert 200 und einen Bild-Content-Type (nicht nur ein `<img>` im HTML). */
async function expectFileServed(page: Page, src: string) {
  const url = new URL(src, marketingURL).toString();
  const response = await page.request.get(url);
  expect(response.status(), `GET ${url}`).toBe(200);
  expect(response.headers()["content-type"] ?? "", `Content-Type ${url}`).toMatch(/^image\//);
}

/** Sichtbarer Absatztext der Prosa-Spalte (ohne Navigation), Whitespace normalisiert. */
async function bodyText(page: Page): Promise<string> {
  const prose = page.locator(".prose-bloommd, main").first();
  return ((await prose.innerText()) ?? "").replace(/\s+/g, " ").trim();
}

/** Elemente zwischen der `h2` mit `heading` und der nächsten `h2` (Geschwister im Markdown-Container). */
async function sectionOf(page: Page, heading: RegExp) {
  return page.evaluate(
    ({ source, flags }) => {
      const re = new RegExp(source, flags);
      const h2 = Array.from(document.querySelectorAll("h2")).find((el) => re.test(el.textContent ?? ""));
      if (!h2) return null;
      const items: { tag: string; text: string; imgSrc: string; imgAlt: string }[] = [];
      for (let el = h2.nextElementSibling; el && !/^H[12]$/.test(el.tagName); el = el.nextElementSibling) {
        const img = el.querySelector("img");
        items.push({
          tag: el.tagName,
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
          imgSrc: img?.getAttribute("src") ?? "",
          imgAlt: img?.getAttribute("alt") ?? "",
        });
      }
      return items;
    },
    { source: heading.source, flags: heading.flags },
  );
}

test.describe("Doku-Screenshots und Release-Status (Marketing) @t47", () => {
  test.beforeEach(() => {
    expect(marketingURL, "PLAYWRIGHT_MARKETING_URL bzw. PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
  });

  test("K1: DE-News zeigt den Desktop-Konflikt-Screenshot mit deutschem Alt-Text beim Konflikt-Absatz @t47", async ({ page }) => {
    await open(page, NEWS.de);
    const info = await imageInfo(page, CONFLICT_IMG);
    expect(info.src).toContain(CONFLICT_IMG.replace(".png", ""));
    expect(info.loaded).toBe(true);
    expect(info.alt.trim().length, "Alt-Text nicht leer").toBeGreaterThan(0);
    expect(info.alt).toMatch(/Konflikt/);
    expect(info.alt).toMatch(/Cloud-Version verwenden/);
    expect(info.alt).toMatch(/Lokale Version beibehalten/);
    expect(info.before, "Absatz direkt davor nennt den Status „Konflikt“").toMatch(/Konflikt/);
    expect(info.caption, "Bildunterschrift").toMatch(/überschreibt BloomMD nichts automatisch/);
    await expectFileServed(page, "/blog/" + CONFLICT_IMG);
  });

  test("K2: DE-News zeigt den Screenshot der Agenten-Vorschau mit deutschem Alt-Text beim OpenClaw-Absatz @t47", async ({ page }) => {
    await open(page, NEWS.de);
    const info = await imageInfo(page, PROPOSAL_IMG);
    expect(info.src).toContain(PROPOSAL_IMG.replace(".png", ""));
    expect(info.loaded).toBe(true);
    expect(info.alt.trim().length, "Alt-Text nicht leer").toBeGreaterThan(0);
    expect(info.alt).toMatch(/Vorschau/);
    expect(info.alt).toMatch(/Welcome/);
    expect(info.before, "Absatz direkt davor ist der OpenClaw-Vorschlag").toMatch(/OpenClaw/);
    expect(info.before).toMatch(/Vorschlag/);
    await expectFileServed(page, "/docs/" + PROPOSAL_IMG);
  });

  test("K3: EN-News zeigt beide Bilder mit englischem Alt-Text, Konfliktbild nennt deutsche Beschriftungen mit Übersetzung @t47", async ({ page }) => {
    await open(page, NEWS.en);
    const conflict = await imageInfo(page, CONFLICT_IMG);
    expect(conflict.loaded).toBe(true);
    expect(conflict.alt.trim().length, "Alt-Text Konflikt nicht leer").toBeGreaterThan(0);
    expect(conflict.alt).toMatch(/German interface/);
    expect(conflict.alt).toMatch(/"Konflikt" \(conflict\)/);
    expect(conflict.alt).toMatch(/"Cloud-Version verwenden" \(use cloud version\)/);
    expect(conflict.alt).toMatch(/"Lokale Version beibehalten" \(keep local version\)/);
    expect(conflict.before).toMatch(/conflict/i);

    const proposal = await imageInfo(page, PROPOSAL_IMG);
    expect(proposal.loaded).toBe(true);
    expect(proposal.alt.trim().length, "Alt-Text Vorschau nicht leer").toBeGreaterThan(0);
    expect(proposal.alt).toMatch(/preview shows the source node/i);
    expect(proposal.alt, "englischer Alt-Text, nicht der deutsche").not.toMatch(/Die Vorschau zeigt/);
    expect(proposal.before).toMatch(/OpenClaw/);
  });

  test("K4: Release-Status in DE und EN in der Vergangenheit, nirgends „wird veröffentlicht“ / „will publish“ @t47", async ({ page }) => {
    const expected: Record<Lang, RegExp> = {
      de: /Release-Status: Veröffentlicht am 22\.09\.2026 mit Desktop 0\.5\.6 und Hosted 0\.4\.18\.?$/,
      en: /Release status: Published on 22 September 2026 with Desktop 0\.5\.6 and Hosted 0\.4\.18\.?$/,
    };
    for (const lang of ["de", "en"] as const) {
      await open(page, NEWS[lang]);
      const paragraphs = await page.locator(".prose-bloommd > p").allInnerTexts();
      const last = (paragraphs.at(-1) ?? "").replace(/\s+/g, " ").trim();
      expect(last, `letzter Absatz (${lang})`).toMatch(expected[lang]);
      const text = await bodyText(page);
      expect(text, `kein Zukunftsstatus (${lang})`).not.toMatch(/wird veröffentlicht|will publish|will be published|wird am .* veröffentlicht/i);
    }
  });

  test("K5: DE-Hilfe zeigt Illustration und echten Konflikt-Screenshot getrennt, Punkt „Konflikt“ nennt beide Entscheidungen @t47", async ({ page }) => {
    await open(page, DOCS.de);
    const section = await sectionOf(page, /Eine lokale Desktop-Datei bewusst teilen/);
    expect(section, "Abschnitt gefunden").not.toBeNull();
    const imgs = section!.filter((item) => item.imgSrc);
    expect(imgs.map((i) => i.imgSrc.split("/").at(-1))).toEqual([ILLUSTRATION_IMG, CONFLICT_IMG]);
    expect(imgs[0]!.imgAlt).toMatch(/^Illustration/);
    expect(imgs[1]!.imgAlt).toMatch(/Konflikt/);
    expect(imgs[1]!.imgAlt.trim().length).toBeGreaterThan(0);

    // Reihenfolge Bild, Unterschrift, Bild, Unterschrift: Die Bilder sind durch ihre Unterschriften getrennt.
    const first = section!.findIndex((item) => item.imgSrc);
    const order = section!.slice(first, first + 4).map((item) => (item.imgSrc ? "img" : item.tag === "P" ? "p" : item.tag));
    expect(order).toEqual(["img", "p", "img", "p"]);
    expect(section![first + 1]!.text).toMatch(/Die Illustration erklärt den Ablauf/);
    expect(section![first + 3]!.text).toMatch(/Echter Screenshot der Desktop-App/);

    const conflictImg = await imageInfo(page, CONFLICT_IMG);
    const illustration = await imageInfo(page, ILLUSTRATION_IMG);
    expect(conflictImg.loaded).toBe(true);
    expect(illustration.loaded).toBe(true);

    const konflikt = page.locator("li", { has: page.locator("strong", { hasText: /^Konflikt:?$/ }) });
    await expect(konflikt).toHaveCount(1);
    await expect(konflikt).toContainText("Cloud-Version verwenden");
    await expect(konflikt).toContainText("Lokale Version beibehalten");
    await expect(konflikt).toContainText("Keine Seite wird still überschrieben");
  });

  test("K6: EN-Hilfe wie K5 mit „Use cloud version“ und „Keep local version“ und englischem Alt-Text @t47", async ({ page }) => {
    await open(page, DOCS.en);
    const section = await sectionOf(page, /Share one local Desktop file deliberately/);
    expect(section, "Abschnitt gefunden").not.toBeNull();
    const imgs = section!.filter((item) => item.imgSrc);
    expect(imgs.map((i) => i.imgSrc.split("/").at(-1))).toEqual([ILLUSTRATION_IMG, CONFLICT_IMG]);
    expect(imgs[0]!.imgAlt).toMatch(/^Illustration/);
    expect(imgs[1]!.imgAlt.trim().length).toBeGreaterThan(0);
    expect(imgs[1]!.imgAlt).toMatch(/German interface/);
    expect(imgs[1]!.imgAlt).toMatch(/"Cloud-Version verwenden" \(use cloud version\)/);
    expect(imgs[1]!.imgAlt).toMatch(/"Lokale Version beibehalten" \(keep local version\)/);

    const first = section!.findIndex((item) => item.imgSrc);
    const order = section!.slice(first, first + 4).map((item) => (item.imgSrc ? "img" : item.tag === "P" ? "p" : item.tag));
    expect(order).toEqual(["img", "p", "img", "p"]);
    expect(section![first + 1]!.text).toMatch(/The illustration explains the flow/);
    expect(section![first + 3]!.text).toMatch(/Real screenshot of the Desktop app/);

    expect((await imageInfo(page, CONFLICT_IMG)).loaded).toBe(true);
    expect((await imageInfo(page, ILLUSTRATION_IMG)).loaded).toBe(true);

    const conflict = page.locator("li", { has: page.locator("strong", { hasText: /^Conflict:?$/ }) });
    await expect(conflict).toHaveCount(1);
    await expect(conflict).toContainText("Use cloud version");
    await expect(conflict).toContainText("Keep local version");
    await expect(conflict).toContainText("Neither side is silently overwritten");
  });

  test("K7: Text behauptet nichts, was die Bilder nicht zeigen (kein „Übernehmen“-Knopf im Bild, kein Obsidian-Screenshot) @t47", async ({ page }) => {
    for (const lang of ["de", "en"] as const) {
      await open(page, NEWS[lang]);
      const proposal = await imageInfo(page, PROPOSAL_IMG);
      // Alt-Text und Unterschrift der Agenten-Vorschau beschreiben nur den Baum, nicht einen Knopf.
      expect(`${proposal.alt} ${proposal.caption}`, `Vorschau-Bild nennt keinen Knopf (${lang})`).not.toMatch(/Übernehmen|Accept/);
      expect(proposal.alt).toMatch(/Prüffragen/);
      expect(proposal.alt).toMatch(/Nächste Schritte/);

      // Die Knopf-Aussage steht im Fließtext vor dem Bild, nicht in Alt-Text oder Unterschrift.
      const paragraphs = await page.locator(".prose-bloommd > p").allInnerTexts();
      expect(paragraphs.join(" ")).toMatch(lang === "de" ? /erst\s+Übernehmen\s+schreibt/ : /only\s+Accept\s+writes/);

      // Genau zwei Bilder im Beitrag, keines zu Obsidian.
      const imgs = await page.locator(".prose-bloommd img").evaluateAll((els) => els.map((el) => `${el.getAttribute("src")} ${el.getAttribute("alt")}`));
      expect(imgs, `Bilder im Beitrag (${lang})`).toHaveLength(2);
      for (const entry of imgs) expect(entry).not.toMatch(/obsidian/i);
    }
    for (const lang of ["de", "en"] as const) {
      await open(page, DOCS[lang]);
      const imgs = await page.locator("img[src^='/blog/'], img[src^='/docs/']").evaluateAll((els) => els.map((el) => `${el.getAttribute("src")} ${el.getAttribute("alt")}`));
      for (const entry of imgs) expect(entry, `Doku-Bild zu Obsidian (${lang})`).not.toMatch(/obsidian/i);
    }
  });
});
