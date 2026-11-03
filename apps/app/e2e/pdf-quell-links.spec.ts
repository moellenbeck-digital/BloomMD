import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Ticket #5 — Quell-Links: PDF-Ausschnitte und Zitate als Knoten (Zotero/BibTeX).
 *
 * Der Ordner-Picker des Browsers lässt sich nicht bedienen. Wie in note-templates.spec.ts ersetzt ein
 * In-Memory-Ordner `window.showDirectoryPicker`; die App liest und schreibt über denselben
 * File-System-Access-Code wie bei einem echten Ordner. `window.open` wird abgefangen: Der Test prüft die
 * URL, mit der die App das PDF öffnen will (`blob:…#page=n`), nicht den PDF-Viewer des Browsers.
 *
 * Nicht prüfbar mit diesen Tests:
 * - Desktop-App (Seite im Panel, Datei öffnen): eigene Electrobun-Anwendung, nicht über das Web-Dev-System erreichbar.
 * - Das tatsächliche Springen des Browser-PDF-Viewers auf Seite n (liegt im Browser, nicht in der App).
 * - Zotero selbst: geprüft wird nur der `citekey` im Frontmatter und der Export.
 */

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };

const PDF_STUB = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

const QUELLE_MD = [
  "---",
  "title: Quelle",
  "id: quelle",
  "---",
  "",
  "# Quelle <!-- bloommd:id=q-root -->",
  "",
  "## Beleg <!-- bloommd:id=q-beleg -->",
  "",
  "[[papers/smith.pdf#page=3]]",
  "> Zitat aus Smith",
  "",
  "## Mit Label <!-- bloommd:id=q-label -->",
  "",
  "[[papers/smith.pdf#page=3|Label]]",
  "",
  "## Ohne Seite <!-- bloommd:id=q-ohne -->",
  "",
  "[[papers/smith.pdf]]",
  "",
  "## Seite Null <!-- bloommd:id=q-null -->",
  "",
  "[[papers/smith.pdf#page=0]]",
  "",
  "## Seite Text <!-- bloommd:id=q-text -->",
  "",
  "[[papers/smith.pdf#page=abc]]",
  "",
  "## Fehlt <!-- bloommd:id=q-fehlt -->",
  "",
  "[[gibtsnicht.pdf#page=2]]",
  "",
  "## Karte <!-- bloommd:id=q-karte -->",
  "",
  "[[nachbar.md]]",
  "[[nachbar.md#n-ziel|Ziel]]",
  "",
  '## Papier <!-- bloommd:id=q-papier --> <!-- bloommd:meta={"kind":"pdf","file":"papers/smith.pdf"} -->',
  "",
].join("\n");

const NACHBAR_MD = [
  "---",
  "title: Nachbar",
  "id: nachbar",
  "---",
  "",
  "# Nachbar <!-- bloommd:id=n-root -->",
  "",
  "## Ziel <!-- bloommd:id=n-ziel -->",
  "",
  "Zielinhalt.",
  "",
].join("\n");

function uniqueEmail() {
  return `e2e-t5-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: { Origin: API_ORIGIN },
    form: { name: "E2E Quell-Links", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

async function login(page: Page, email: string) {
  await page.goto("/login?next=/app", { waitUntil: "domcontentloaded" });
  const loginForm = page.locator('form[action="/api/auth/login"]');
  await expect(loginForm).toBeVisible();
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await loginForm.evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
}

async function suppressOnboarding(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));
}

/** In-Memory-Ordner mit Schreibrecht; `window.open` wird in `window.__opened` mitgeschrieben. */
async function installWorkspaceMock(page: Page, seed: Record<string, string>) {
  await page.addInitScript(
    ({ seed: initialFiles }) => {
      window.localStorage.setItem("bloommd_onboarding_seen", "1");

      // Das Dev-System läuft über http auf einem Cluster-Namen, also ohne „secure context“: dort fehlt
      // `crypto.randomUUID`, das der Markdown-Parser beim Öffnen einer Map braucht.
      if (typeof crypto.randomUUID !== "function") {
        Object.defineProperty(crypto, "randomUUID", {
          configurable: true,
          value: () =>
            "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
              const random = crypto.getRandomValues(new Uint8Array(1))[0]! & 15;
              return (char === "x" ? random : (random & 3) | 8).toString(16);
            }),
        });
      }

      const opened: Array<{ url: string; target: string | undefined }> = [];
      Object.defineProperty(window, "__opened", { value: opened, configurable: true });
      window.open = ((url?: string | URL, target?: string) => {
        opened.push({ url: String(url), target });
        return null;
      }) as typeof window.open;

      const files: Record<string, string> = { ...initialFiles };
      const dirs = new Set<string>();

      class MockFileHandle {
        readonly kind = "file";
        constructor(readonly name: string, private readonly path: string) {}
        async getFile() {
          const type = this.path.endsWith(".pdf") ? "application/pdf" : "text/markdown";
          return new File([files[this.path] ?? ""], this.name, { type });
        }
        async createWritable() {
          const path = this.path;
          return {
            async write(value: string) {
              files[path] = value;
            },
            async close() {},
            async abort() {},
          };
        }
      }

      class MockDirectoryHandle {
        readonly kind = "directory";
        constructor(readonly name: string, private readonly prefix = "") {}
        private childPath(name: string) {
          return this.prefix ? `${this.prefix}/${name}` : name;
        }
        async *entries(): AsyncIterable<[string, MockDirectoryHandle | MockFileHandle]> {
          const seen = new Map<string, "file" | "dir">();
          const base = this.prefix ? `${this.prefix}/` : "";
          for (const path of Object.keys(files)) {
            if (!path.startsWith(base)) continue;
            const [first, ...rest] = path.slice(base.length).split("/");
            if (first) seen.set(first, rest.length > 0 ? "dir" : "file");
          }
          for (const dir of dirs) {
            if (!dir.startsWith(base)) continue;
            const [first] = dir.slice(base.length).split("/");
            if (first && !seen.has(first)) seen.set(first, "dir");
          }
          for (const [name, type] of seen) {
            const path = this.childPath(name);
            yield [name, type === "file" ? new MockFileHandle(name, path) : new MockDirectoryHandle(name, path)];
          }
        }
        async getDirectoryHandle(name: string, options?: { create?: boolean }) {
          const path = this.childPath(name);
          const exists = dirs.has(path) || Object.keys(files).some((filePath) => filePath.startsWith(`${path}/`));
          if (!exists) {
            if (!options?.create) throw new Error(`No such directory: ${path}`);
            dirs.add(path);
          }
          return new MockDirectoryHandle(name, path);
        }
        async getFileHandle(name: string, options?: { create?: boolean }) {
          const path = this.childPath(name);
          if (!(path in files)) {
            if (!options?.create) throw new Error(`No such file: ${path}`);
            files[path] = "";
          }
          return new MockFileHandle(name, path);
        }
      }

      Object.defineProperty(window, "__t5Workspace", { value: { files }, configurable: true });
      Object.defineProperty(window, "showDirectoryPicker", {
        value: async () => new MockDirectoryHandle("T5 Workspace"),
        configurable: true,
      });
    },
    { seed },
  );
}

/** Konto anlegen, einloggen, Mock-Ordner öffnen und die Map `file` anzeigen. */
async function startFolderSession(page: Page, request: APIRequestContext, seed: Record<string, string>, file: string) {
  const email = uniqueEmail();
  await createAccount(request, email);
  await installWorkspaceMock(page, seed);
  await login(page, email);
  await page.getByTestId("open-browser-workspace").click();
  await expect(page.getByTestId("create-file")).toBeVisible();
  await showFile(page, file);
}

async function showFile(page: Page, file: string) {
  await page.getByLabel("Local workspace file").selectOption(file);
  await expect(page.getByLabel("Local workspace file")).toHaveValue(file);
}

function node(page: Page, label: string) {
  return page.locator(`[data-testid="mindmap-node"][data-node-label="${label}"]`).first();
}

async function selectNode(page: Page, label: string) {
  await expect(node(page, label)).toBeVisible();
  await node(page, label).click();
}

async function opened(page: Page) {
  return page.evaluate(() => (window as unknown as { __opened: Array<{ url: string }> }).__opened.map((entry) => entry.url));
}

async function readFolderFile(page: Page, path: string) {
  return page.evaluate(
    (key) => (window as unknown as { __t5Workspace: { files: Record<string, string> } }).__t5Workspace.files[key],
    path,
  );
}

async function openPalette(page: Page) {
  await page.keyboard.press("Control+K");
  await expect(page.getByTestId("command-palette")).toBeVisible();
}

function fixtureMap(title: string, citekeyLines: string[], body: string[] = []) {
  return [
    "---",
    `title: ${title}`,
    `id: ${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
    ...citekeyLines,
    "---",
    "",
    `# ${title} <!-- bloommd:id=${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-root -->`,
    "",
    ...body,
    "",
  ].join("\n");
}

const LITERATUR_ORDNER = {
  "hauptwerk.md": fixtureMap(
    "Hauptwerk",
    ["citekey: mueller2021", "author: Müller, Anna", "year: 2021"],
    ["Siehe [[lit-b.md]] und [[lit-c.md]] und nochmal [[lit-b.md]]."],
  ),
  "lit-b.md": fixtureMap("Abels Buch", ["citekey: abel2019", "author: Abel, Karl", "year: 2019"]),
  "lit-c.md": fixtureMap("Abels Buch", ["citekey: abel2019", "author: Abel, Karl", "year: 2019"]),
  "lit-d.md": fixtureMap("Unverlinkt", ["citekey: unverlinkt1999", "author: Niemand, N.", "year: 1999"]),
  "ohne-schluessel.md": fixtureMap("Ohne Schlüssel", [], ["Kein citekey, keine Links."]),
};

const BIBTEX_ERWARTET = [
  "@misc{abel2019,",
  "  author = {Abel, Karl},",
  "  year = {2019},",
  "  title = {Abels Buch}",
  "}",
  "",
  "@misc{mueller2021,",
  "  author = {Müller, Anna},",
  "  year = {2021},",
  "  title = {Hauptwerk}",
  "}",
  "",
].join("\n");

const MARKDOWN_ERWARTET = ["- abel2019: Abel, Karl (2019). Abels Buch", "- mueller2021: Müller, Anna (2021). Hauptwerk", ""].join("\n");

test.describe("Quell-Links: PDF-Ausschnitte und Zitate", () => {
  const folder = { "quelle.md": QUELLE_MD, "nachbar.md": NACHBAR_MD, "papers/smith.pdf": PDF_STUB };

  test("Kriterium 1: Karte mit Dateiname, Seite und Zitat; Klick öffnet das PDF bei Seite 3, ohne eine Map zu laden @t5", async ({ page, request }) => {
    await startFolderSession(page, request, folder, "quelle.md");
    await selectNode(page, "Beleg");

    const card = page.getByTestId("pdf-link-resource");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("smith.pdf");
    await expect(card.getByTestId("pdf-link-page")).toContainText("Seite 3");
    await expect(card.getByTestId("pdf-quote")).toContainText("Zitat aus Smith");

    await card.getByTestId("pdf-link-open").click();
    await expect.poll(() => opened(page).then((urls) => urls.length)).toBe(1);
    const [url] = await opened(page);
    expect(url).toMatch(/^blob:.*#page=3$/);

    // Es wurde keine Map geladen: dieselbe Map ist offen, der Knoten bleibt wählbar.
    await expect(page.getByLabel("Local workspace file")).toHaveValue("quelle.md");
    await expect(node(page, "Beleg")).toBeVisible();
    await expect(node(page, "Quelle")).toBeVisible();
  });

  test("Kriterium 2: Link mit Label zeigt das Label, ohne oder mit ungültiger Seite gilt Seite 1 @t5", async ({ page, request }) => {
    await startFolderSession(page, request, folder, "quelle.md");

    await selectNode(page, "Mit Label");
    const labelCard = page.getByTestId("pdf-link-resource");
    await expect(labelCard).toHaveCount(1);
    await expect(labelCard.getByTestId("pdf-link-open")).toContainText("Label");
    await expect(labelCard.getByTestId("pdf-link-page")).toContainText("Seite 3");

    const expectedPage: Array<[string, string]> = [
      ["Ohne Seite", "#page=1"],
      ["Seite Null", "#page=1"],
      ["Seite Text", "#page=1"],
    ];
    let count = 0;
    for (const [label, fragment] of expectedPage) {
      await selectNode(page, label);
      const card = page.getByTestId("pdf-link-resource");
      await expect(card).toHaveCount(1);
      await expect(card.getByTestId("pdf-link-page")).toContainText("Seite 1");
      await card.getByTestId("pdf-link-open").click();
      count += 1;
      await expect.poll(() => opened(page).then((urls) => urls.length)).toBe(count);
      const urls = await opened(page);
      expect(urls[urls.length - 1]).toMatch(new RegExp(`^blob:.*${fragment}$`));
    }
  });

  test("Kriterium 3: fehlende PDF-Datei ergibt eine verständliche Meldung statt stillem Fehlschlag @t5", async ({ page, request }) => {
    await startFolderSession(page, request, folder, "quelle.md");
    await selectNode(page, "Fehlt");

    const card = page.getByTestId("pdf-link-resource");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("pdf-link-page")).toContainText("Seite 2");
    await card.getByTestId("pdf-link-open").click();

    const notice = page.getByTestId("app-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("gibtsnicht.pdf");
    await expect(notice).toContainText("nicht gefunden");
    expect(await opened(page)).toEqual([]);
  });

  test("Kriterium 4: Workspace-Health meldet PDF-Links nicht als kaputte Map-Links, nur die fehlende Datei als missing-resource @t5", async ({ page, request }) => {
    await startFolderSession(page, request, folder, "quelle.md");
    await page.getByTestId("open-workspace-health").click();

    const health = page.getByTestId("workspace-health");
    await expect(health).toBeVisible();
    await expect(health).toContainText("PDF-Datei nicht im Workspace: gibtsnicht.pdf");
    // Der vorhandene PDF-Link taucht in keinem Befund auf, weder als Map- noch als Anker-Link.
    await expect(health).not.toContainText("smith.pdf");
    // Auch kein Befund zu `gibtsnicht.pdf` außer der einen „PDF-Datei nicht im Workspace“-Meldung.
    const text = (await health.innerText()).split("gibtsnicht.pdf").length - 1;
    expect(text).toBe(1);
  });

  test("Kriterium 5: citekey bleibt nach Speichern und erneutem Öffnen erhalten, ungültiger Schlüssel wird gemeldet @t5", async ({ page, request }) => {
    const seed = {
      "quelle.md": fixtureMap("Zitierbar", ["citekey: müller2021", "author: Müller, Anna", "year: 2021"], ["## Abschnitt", ""]),
      "schlecht.md": fixtureMap("Schlecht", ["citekey: mit Leerzeichen", "author: Test", "year: 2020"]),
      "papers/smith.pdf": PDF_STUB,
    };
    await startFolderSession(page, request, seed, "quelle.md");

    // Änderung (neuer Kindknoten über die Palette) und Speichern in die Datei.
    await openPalette(page);
    await page.locator('[data-command-id="action-pdf-citation"]').click();
    await page.getByTestId("pdf-citation-file").fill("papers/smith.pdf");
    await page.getByTestId("pdf-citation-page").fill("2");
    await page.getByTestId("pdf-citation-submit").click();
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await page.keyboard.press("Control+S");
    await expect.poll(() => readFolderFile(page, "quelle.md")).toMatch(/papers\/smith\.pdf#page=2/);
    expect(await readFolderFile(page, "quelle.md")).toMatch(/citekey:\s*["']?müller2021["']?/);

    // Anderes Dokument und zurück: der Schlüssel steht noch im Frontmatter und im Export.
    await showFile(page, "schlecht.md");
    await showFile(page, "quelle.md");
    await openPalette(page);
    const download = page.waitForEvent("download");
    await page.locator('[data-command-id="action-bibliography-bibtex"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("Zitierbar-literatur.bib");
    const content = readFileSync((await file.path())!, "utf8");
    expect(content).toContain("@misc{müller2021,");

    // Ungültiger Schlüssel (Leerzeichen): keine Datei, Hinweis.
    await showFile(page, "schlecht.md");
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await openPalette(page);
    await page.locator('[data-command-id="action-bibliography-bibtex"]').click();
    await expect(page.getByTestId("command-palette-notice")).toBeVisible();
    expect(downloaded).toBe(false);
  });

  test("Kriterium 6: Literaturliste (BibTeX und Markdown) im lokalen Ordner: sortiert, ohne Duplikate, mit verlinkten Maps @t5", async ({ page, request }) => {
    await startFolderSession(page, request, LITERATUR_ORDNER, "hauptwerk.md");

    await openPalette(page);
    const bib = page.waitForEvent("download");
    await page.locator('[data-command-id="action-bibliography-bibtex"]').click();
    const bibFile = await bib;
    expect(bibFile.suggestedFilename()).toBe("Hauptwerk-literatur.bib");
    expect(readFileSync((await bibFile.path())!, "utf8")).toBe(BIBTEX_ERWARTET);

    await openPalette(page);
    const md = page.waitForEvent("download");
    await page.locator('[data-command-id="action-bibliography-markdown"]').click();
    const mdFile = await md;
    expect(mdFile.suggestedFilename()).toBe("Hauptwerk-literatur.md");
    expect(readFileSync((await mdFile.path())!, "utf8")).toBe(MARKDOWN_ERWARTET);
  });

  test("Kriterium 6 (Cloud-Maps): Literaturliste liefert die verlinkten Maps des Kontos @t5", async ({ page, request }) => {
    const email = uniqueEmail();
    const stamp = Date.now();
    const names = [`t5-hauptwerk-${stamp}.md`, `t5-lit-b-${stamp}.md`, `t5-lit-c-${stamp}.md`, `t5-lit-d-${stamp}.md`];
    await createAccount(request, email);
    try {
      const maps: Array<[string, string]> = [
        [
          names[0]!,
          fixtureMap(
            "Hauptwerk",
            ["citekey: mueller2021", "author: Müller, Anna", "year: 2021"],
            [`Siehe [[${names[1]}]] und [[${names[2]}]] und nochmal [[${names[1]}]].`],
          ),
        ],
        [names[1]!, fixtureMap("Abels Buch", ["citekey: abel2019", "author: Abel, Karl", "year: 2019"])],
        [names[2]!, fixtureMap("Abels Buch", ["citekey: abel2019", "author: Abel, Karl", "year: 2019"])],
        [names[3]!, fixtureMap("Unverlinkt", ["citekey: unverlinkt1999", "author: Niemand, N.", "year: 1999"])],
      ];
      for (const [filename, markdown] of maps) {
        const response = await request.post("/api/mindmaps", { headers: SAME_ORIGIN_HEADERS, data: { filename, markdown } });
        expect(response.ok()).toBe(true);
      }
      await suppressOnboarding(page);
      await login(page, email);

      await openPalette(page);
      await page.getByTestId("command-palette-input").fill("Hauptwerk");
      await page.getByTestId("command-palette-item-mindmap").first().click();
      await expect(node(page, "Hauptwerk")).toBeVisible();

      await openPalette(page);
      const bib = page.waitForEvent("download");
      await page.locator('[data-command-id="action-bibliography-bibtex"]').click();
      expect(readFileSync(((await (await bib).path()))!, "utf8")).toBe(BIBTEX_ERWARTET);

      await openPalette(page);
      const md = page.waitForEvent("download");
      await page.locator('[data-command-id="action-bibliography-markdown"]').click();
      expect(readFileSync(((await (await md).path()))!, "utf8")).toBe(MARKDOWN_ERWARTET);
    } finally {
      for (const filename of names) {
        await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
      }
    }
  });

  test("Kriterium 7: Map ohne citekey ergibt einen Hinweis, keinen Download und keinen Fehler @t5", async ({ page, request }) => {
    await startFolderSession(page, request, LITERATUR_ORDNER, "ohne-schluessel.md");
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await openPalette(page);
    for (const command of ["action-bibliography-bibtex", "action-bibliography-markdown"]) {
      await page.locator(`[data-command-id="${command}"]`).click();
      await expect(page.getByTestId("command-palette-notice")).toContainText("Keine Zitierschlüssel");
    }
    // Der Hinweis bleibt, die Palette bleibt offen; es gab weder Download noch Seitenfehler.
    await expect(page.getByTestId("command-palette")).toBeVisible();
    expect(downloaded).toBe(false);
    expect(errors).toEqual([]);
  });

  test("Kriterium 8: „PDF-Zitat einfügen“ legt einen Kindknoten an, ungültige Eingaben zeigen einen Fehler und legen nichts an @t5", async ({ page, request }) => {
    await startFolderSession(page, request, folder, "quelle.md");
    await selectNode(page, "Beleg");
    const before = await page.getByTestId("mindmap-node").count();

    // Ungültig: keine .pdf-Endung.
    await openPalette(page);
    await page.locator('[data-command-id="action-pdf-citation"]').click();
    await expect(page.getByTestId("pdf-citation-form")).toBeVisible();
    await page.getByTestId("pdf-citation-file").fill("notiz.txt");
    await page.getByTestId("pdf-citation-page").fill("2");
    await page.getByTestId("pdf-citation-submit").click();
    await expect(page.getByTestId("pdf-citation-error")).toBeVisible();
    await expect(page.getByTestId("pdf-citation-form")).toBeVisible();

    // Ungültig: Seite 0.
    await page.getByTestId("pdf-citation-file").fill("papers/smith.pdf");
    await page.getByTestId("pdf-citation-page").fill("0");
    await page.getByTestId("pdf-citation-submit").click();
    await expect(page.getByTestId("pdf-citation-error")).toBeVisible();
    await expect(page.getByTestId("pdf-citation-form")).toBeVisible();

    // Gültig.
    await page.getByTestId("pdf-citation-page").fill("4");
    await page.getByTestId("pdf-citation-quote").fill("Neues Zitat aus Smith");
    await page.getByTestId("pdf-citation-submit").click();
    await expect(page.getByTestId("command-palette")).toHaveCount(0);

    const created = page.locator('[data-testid="mindmap-node"][data-node-label*="smith.pdf"][data-node-label*="4"]').first();
    await expect(created).toBeVisible();
    await expect(page.getByTestId("mindmap-node")).toHaveCount(before + 1);
    const card = page.getByTestId("pdf-link-resource");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("pdf-link-page")).toContainText("Seite 4");
    await expect(card.getByTestId("pdf-quote")).toContainText("Neues Zitat aus Smith");
  });

  test("Kriterium 8b: fehlerhafte Eingabe allein legt keinen Knoten an @t5", async ({ page, request }) => {
    await startFolderSession(page, request, folder, "quelle.md");
    await selectNode(page, "Beleg");
    const before = await page.getByTestId("mindmap-node").count();

    await openPalette(page);
    await page.locator('[data-command-id="action-pdf-citation"]').click();
    await page.getByTestId("pdf-citation-file").fill("notiz.txt");
    await page.getByTestId("pdf-citation-submit").click();
    await expect(page.getByTestId("pdf-citation-error")).toBeVisible();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mindmap-node")).toHaveCount(before);
  });

  test("Kriterium 9: Map-Links, Anker-Links und PDF-Knoten (Typ pdf) funktionieren unverändert @t5", async ({ page, request }) => {
    await startFolderSession(page, request, folder, "quelle.md");

    // [[Map]] und [[datei.md#id|Label]]: normale Map-Link-Karten, keine PDF-Karte, nicht als kaputt markiert.
    await selectNode(page, "Karte");
    await expect(page.getByTestId("pdf-link-resource")).toHaveCount(0);
    await expect(page.getByTestId("broken-map-link")).toHaveCount(0);
    await expect(page.getByTestId("map-link-resource")).toHaveCount(2);
    await page.getByTestId("map-link-resource").nth(1).click();
    await expect(page.getByLabel("Local workspace file")).toHaveValue("nachbar.md");
    await expect(node(page, "Ziel")).toBeVisible();

    // PDF-Knoten (Typ pdf): Datei-Panel mit Vorschau, keine Quell-Link-Karte.
    await showFile(page, "quelle.md");
    await selectNode(page, "Papier");
    await expect(page.getByTestId("node-file-panel")).toBeVisible();
    await expect(page.getByTestId("node-pdf-preview")).toBeVisible();
    await expect(page.getByTestId("pdf-link-resource")).toHaveCount(0);
  });
});
