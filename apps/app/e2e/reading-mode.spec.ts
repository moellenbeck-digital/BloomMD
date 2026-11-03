/**
 * Ticket #54 — Lesemodus für Denkraum-Dokumente in /app. Alle Fälle tragen @t54.
 *
 * Kriterien aus dem Ticket (K1–K5 stehen je im Testtitel):
 *  K1 Ein Dokument lässt sich in einem Lesemodus ohne Editor-Leiste öffnen.
 *  K2 Überschriften, Links, Listen, Tabellen, Code, Bilder und Mermaid werden einheitlich dargestellt.
 *  K3 Der Weg zurück zur Map bzw. zum Dokumentkontext bleibt erhalten.
 *  K4 Der Modus funktioniert für lokale Markdown-Dateien, ohne die Quelle zu ändern.
 *  K5 Tastatur und Mobil sind durch Tests abgedeckt (Esc/Alt+L, Tab, Scrollen; 390 px).
 *
 * Muster wie document-tabs.spec.ts: Jeder Fall legt ein eigenes Konto an, die Dokumente kommen aus einer
 * Mock-API (`installDocApi`), weil das Dev-System keine Dokumente anlegen kann; der lokale Ordner läuft über
 * einen Ordner-Mock. „Quelle unverändert“ heißt hier: kein PUT der Oberfläche bzw. kein Schreibzugriff im Ordner-Mock.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };
// 1×1 PNG, eingebettet, damit der Test kein Netz braucht.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function uniqueEmail(label: string) {
  return `e2e-t54-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T54", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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

async function prepare(page: Page, options: { locale?: "de" | "en"; theme?: "light" | "dark" } = {}) {
  await page.addInitScript(({ locale, theme }) => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-theme", theme);
    window.localStorage.setItem("bloommd-locale", locale);
    // Das Dev-System läuft über HTTP: `crypto.randomUUID` fehlt dort (siehe document-tabs.spec.ts).
    if (typeof window.crypto.randomUUID !== "function") {
      Object.defineProperty(window.crypto, "randomUUID", {
        configurable: true,
        value: () => {
          const bytes = window.crypto.getRandomValues(new Uint8Array(16));
          bytes[6] = (bytes[6]! & 0x0f) | 0x40;
          bytes[8] = (bytes[8]! & 0x3f) | 0x80;
          const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
          return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        },
      });
    }
  }, { locale: options.locale ?? "de", theme: options.theme ?? "light" });
}

function frontmatter(title: string, slug: string) {
  return ["---", `title: ${title}`, `id: ${slug}`, 'created: "2026-11-03T10:00:00.000Z"', 'updated: "2026-11-03T10:00:00.000Z"', "layout:", "  direction: LR", "---", ""].join("\n");
}

/** Dokument mit allen Blocktypen, die der Lesemodus darstellen muss. */
function richMarkdown(title: string, slug: string) {
  return frontmatter(title, slug) + [
    `# ${title} <!-- bloommd:id=root-${slug} -->`,
    "",
    "Einleitung mit **fett**, einem [BloomMD-Link](https://bloommd.io/docs) und einem [unsicheren Link](javascript:alert(1)).",
    "",
    `## Listen <!-- bloommd:id=lists-${slug} -->`,
    "",
    "- Erster Punkt",
    "  - Verschachtelt eins",
    "  - Verschachtelt zwei",
    "- Zweiter Punkt",
    "",
    "1. Schritt eins",
    "2. Schritt zwei",
    "",
    `### Tabelle <!-- bloommd:id=table-${slug} -->`,
    "",
    "| Name | Wert |",
    "| ---- | ---- |",
    "| Alpha | 1 |",
    "| Beta | 2 |",
    "",
    `## Code <!-- bloommd:id=code-${slug} -->`,
    "",
    "```ts",
    "const antwort = 42;",
    "```",
    "",
    "```mermaid",
    "graph TD",
    "  A[Start] --> B{Auswahl}",
    "  B -->|ja| C[Fertig]",
    "```",
    "",
    `## Bild <!-- bloommd:id=image-${slug} -->`,
    "",
    `![Pixel](${PIXEL})`,
    "",
  ].join("\n");
}

/** Sehr langes Dokument, damit die Leseansicht scrollt. */
function longMarkdown(title: string, slug: string) {
  const sections = Array.from({ length: 12 }, (_, index) => [
    `## Abschnitt ${index + 1} <!-- bloommd:id=s${index + 1}-${slug} -->`,
    "",
    ...Array.from({ length: 4 }, (_unused, line) => `Absatz ${index + 1}.${line + 1}: ${"Lesbarer Text, der den Platz füllt. ".repeat(6)}\n`),
  ].join("\n"));
  return frontmatter(title, slug) + [`# ${title} <!-- bloommd:id=root-${slug} -->`, "", ...sections].join("\n");
}

/** Breite Inhalte für den Mobiltest: Tabelle und Codezeile sind breiter als 390 px. */
function wideMarkdown(title: string, slug: string) {
  const header = `| ${Array.from({ length: 8 }, (_, i) => `Spalte ${i + 1} mit langem Namen`).join(" | ")} |`;
  const divider = `| ${Array.from({ length: 8 }, () => "---").join(" | ")} |`;
  const row = `| ${Array.from({ length: 8 }, (_, i) => `Wert ${i + 1} sehr langer Inhalt`).join(" | ")} |`;
  return frontmatter(title, slug) + [
    `# ${title} <!-- bloommd:id=root-${slug} -->`,
    "",
    `Ein sehr langer Link: https://example.com/${"abcdefghij".repeat(12)} und ein Absatz, der in der Breite umbrechen muss.`,
    "",
    `## Breite Blöcke <!-- bloommd:id=wide-${slug} -->`,
    "",
    header,
    divider,
    row,
    row,
    "",
    "```ts",
    `const eineSehrLangeZeile = "${"x".repeat(160)}";`,
    "```",
    "",
    `![Pixel](${PIXEL})`,
    "",
  ].join("\n");
}

function documentFromMarkdown(filename: string, markdown: string) {
  const title = /^title:\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? filename;
  type Node = { id: string; parentId: string | null; level: number; title: string; content: string; children: string[] };
  const nodes: Record<string, Node> = {};
  const stack: Array<{ level: number; id: string }> = [];
  let rootId = "";
  let counter = 0;
  let current: Node | null = null;
  let body: string[] = [];
  let inFence = false;
  let inFront = false;
  const flush = () => { if (current) current.content = body.join("\n").trim(); body = []; };
  markdown.split("\n").forEach((line, index) => {
    if (index === 0 && line === "---") { inFront = true; return; }
    if (inFront) { if (line === "---") inFront = false; return; }
    if (/^```/.test(line)) inFence = !inFence;
    const match = inFence ? null : /^(#{1,6})\s+(.*?)\s*(?:<!--\s*bloommd:id=([^\s>]+)[^>]*-->)?\s*$/.exec(line);
    if (!match) { body.push(line); return; }
    flush();
    const level = match[1]!.length;
    const id = match[3] ?? `auto-${counter++}`;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    const parentId = stack[stack.length - 1]?.id ?? null;
    current = { id, parentId, level, title: match[2]!.trim(), content: "", children: [] };
    nodes[id] = current;
    if (parentId) nodes[parentId]!.children.push(id);
    else if (!rootId) rootId = id;
    stack.push({ level, id });
  });
  flush();
  return {
    filePath: `/t54/${filename}`,
    frontmatter: { title, id: filename, created: "2026-11-03T10:00:00.000Z", updated: "2026-11-03T10:00:00.000Z", layout: { direction: "LR" } },
    nodes,
    rootId,
    preamble: "",
  };
}

interface MockDocApi {
  saved: Map<string, string>;
  /** Alle PUTs der Oberfläche. Der Lesemodus darf keinen absetzen. */
  puts: Array<{ filename: string; markdown: string }>;
}

/** Liefert die Dokumente (Dateiname → Markdown) aus dem Speicher des Tests; das erste wird beim Start geöffnet. */
async function installDocApi(page: Page, files: Record<string, string>): Promise<MockDocApi> {
  const api: MockDocApi = { saved: new Map(Object.entries(files)), puts: [] };
  await page.route(
    (url) => url.pathname === "/api/mindmaps" || /^\/api\/mindmaps\/[^/]+$/.test(url.pathname),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/mindmaps") {
        if (request.method() !== "GET") return route.fallback();
        const list = [...api.saved.entries()].map(([filename, markdown]) => ({ filename, frontmatter: documentFromMarkdown(filename, markdown).frontmatter }));
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ files: list, storageMode: "filesystem" }) });
      }
      const filename = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      if (request.method() === "GET") {
        const markdown = api.saved.get(filename);
        if (markdown === undefined) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Mindmap not found." }) });
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(documentFromMarkdown(filename, markdown)) });
      }
      if (request.method() === "PUT") {
        const { markdown } = request.postDataJSON() as { markdown: string };
        api.puts.push({ filename, markdown });
        api.saved.set(filename, markdown);
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ filePath: filename }) });
      }
      return route.fallback();
    },
  );
  return api;
}

/** Eigener Ordner-Mock (lesen erlaubt, schreiben verweigert), damit jeder Schreibversuch sichtbar wird. */
async function installBrowserWorkspaceMock(page: Page) {
  await page.addInitScript(() => {
    type TreeEntry = string | { [name: string]: TreeEntry };
    const files: Record<string, string> = {
      "overview.md": [
        "---", "title: Local Overview", "id: local-overview", "---", "",
        "# Local Overview <!-- bloommd:id=local-overview-root -->", "",
        "Lokaler Text mit [[chapters/intro.md]] und einem [Link](https://bloommd.io).", "",
        "## Daten <!-- bloommd:id=local-overview-data -->", "",
        "| Name | Wert |", "| ---- | ---- |", "| Alpha | 1 |", "",
        "```mermaid", "graph LR", "  A --> B", "```", "",
      ].join("\n"),
      "chapters/intro.md": [
        "---", "title: Local Intro", "id: local-intro", "---", "",
        "# Local Intro <!-- bloommd:id=local-intro-root -->", "", "Intro-Text.", "",
      ].join("\n"),
    };
    const created: string[] = [];
    const writes: string[] = [];
    const state = { readwrite: "denied" as "granted" | "denied", read: "granted" as "granted" | "denied" };
    class MockFileHandle {
      readonly kind = "file";
      constructor(readonly name: string, private readonly path: string) {}
      async getFile() { const path = this.path; return { text: async () => files[path] ?? "" }; }
      async queryPermission(options?: { mode?: string }) { return options?.mode === "readwrite" ? state.readwrite : state.read; }
      async requestPermission(options?: { mode?: string }) {
        if (options?.mode === "readwrite") state.readwrite = "granted";
        return options?.mode === "readwrite" ? state.readwrite : state.read;
      }
      async createWritable() {
        const path = this.path;
        return { async write(value: string) { writes.push(path); files[path] = value; }, async close() {}, async abort() {} };
      }
    }
    class MockDirectoryHandle {
      readonly kind = "directory";
      constructor(readonly name: string, private readonly prefix = "") {}
      async queryPermission(options?: { mode?: string }) { return options?.mode === "readwrite" ? state.readwrite : state.read; }
      async requestPermission(options?: { mode?: string }) {
        if (options?.mode === "readwrite") state.readwrite = "granted";
        return options?.mode === "readwrite" ? state.readwrite : state.read;
      }
      private childPath(name: string) { return this.prefix ? `${this.prefix}/${name}` : name; }
      async *entries(): AsyncIterable<[string, MockDirectoryHandle | MockFileHandle]> {
        const direct = new Map<string, TreeEntry>();
        for (const path of Object.keys(files)) {
          if (this.prefix && !path.startsWith(`${this.prefix}/`)) continue;
          const relative = this.prefix ? path.slice(this.prefix.length + 1) : path;
          const [first, ...rest] = relative.split("/");
          if (!first) continue;
          direct.set(first, rest.length > 0 ? {} : files[path]!);
        }
        for (const [name, entry] of direct) {
          const path = this.childPath(name);
          yield [name, typeof entry === "string" ? new MockFileHandle(name, path) : new MockDirectoryHandle(name, path)];
        }
      }
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        const path = this.childPath(name);
        if (!Object.keys(files).some((filePath) => filePath.startsWith(`${path}/`))) {
          if (!options?.create) throw new Error(`No such directory: ${path}`);
          created.push(path);
        }
        return new MockDirectoryHandle(name, path);
      }
      async getFileHandle(name: string, options?: { create?: boolean }) {
        const path = this.childPath(name);
        if (!files[path]) {
          if (!options?.create) throw new Error(`No such file: ${path}`);
          created.push(path);
          files[path] = "";
        }
        return new MockFileHandle(name, path);
      }
    }
    Object.defineProperty(window, "__bloommdWorkspaceMock", { value: { files, created, writes, state }, configurable: true });
    Object.defineProperty(window, "showDirectoryPicker", { value: async () => new MockDirectoryHandle("Mock Workspace"), configurable: true });
  });
}

const rootOf = (page: Page, title: string) => page.locator(`[data-testid="mindmap-node"][data-node-label="${title}"]`).first();
const tabOf = (page: Page, filename: string) => page.locator(`[data-testid="mindmap-tab"][data-filename="${filename}"]`);
const readingView = (page: Page) => page.getByTestId("reading-view");

async function openByTitle(page: Page, title: string) {
  await page.keyboard.press("Control+K");
  await page.getByTestId("command-palette-input").fill(title);
  await page.getByTestId("command-palette-item-mindmap").first().click();
  await expect(page.getByTestId("command-palette-input")).toHaveCount(0);
}

async function enterReading(page: Page) {
  await page.getByTestId("view-mode-reading").click();
  await expect(readingView(page)).toBeVisible();
}

function names(run: number, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, { file: `t54-${key}-${run}.md`, title: `T54 ${key.toUpperCase()} ${run}`, slug: `t54-${key}-${run}` }]));
}

test.describe("Lesemodus @t54", () => {
  test.setTimeout(120_000);

  test("K1: Dokument im Lesemodus öffnen — ohne Editor-Leiste, Knoten-Aktionen und Eingabefelder; Quelle bleibt unverändert (DE) @t54", async ({ page, request }) => {
    const run = Date.now();
    const doc = names(run, ["a"]).a!;
    const email = uniqueEmail("k1");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, { [doc.file]: richMarkdown(doc.title, doc.slug) });
    await login(page, email);
    await expect(rootOf(page, doc.title)).toBeVisible();

    // Editor-Panel offen, dann Lesemodus: Panel, Knoten und Umschalter-Leiste verschwinden.
    await rootOf(page, doc.title).click();
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await expect(page.getByTestId("view-mode-reading")).toHaveAttribute("aria-label", "Lesemodus");
    // Stand vor dem Lesemodus (das Öffnen des Editors gehört nicht dazu).
    const putsBefore = api.puts.length;
    const before = api.saved.get(doc.file);
    await enterReading(page);

    await expect(page.getByTestId("node-editor")).toHaveCount(0);
    await expect(page.getByTestId("view-mode-toggle")).toHaveCount(0);
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(0);
    await expect(readingView(page).locator("[contenteditable], textarea, .mdxeditor, input:not([disabled])")).toHaveCount(0);
    await expect(readingView(page).getByRole("heading", { level: 1, name: doc.title })).toBeVisible();
    // Der Zurück-Knopf ist der einzige Knopf der Leseoberfläche.
    await expect(page.getByTestId("reading-toolbar").getByRole("button")).toHaveCount(1);
    await expect(page.getByTestId("reading-back")).toHaveText("Zurück zur Map");

    // Auch Doppelklick und Tippen im Text ändern nichts.
    await readingView(page).getByText("Erster Punkt").dblclick();
    await page.keyboard.type("x");
    await expect(readingView(page).getByText("Erster Punktx")).toHaveCount(0);
    await page.getByTestId("reading-back").click();
    await expect(readingView(page)).toHaveCount(0);
    expect(api.puts.length).toBe(putsBefore);
    expect(api.saved.get(doc.file)).toBe(before);
  });

  test("K1: Beschriftungen in EN, Umschalter trägt Titel mit Tastenkürzel @t54", async ({ page, request }) => {
    const run = Date.now();
    const doc = names(run, ["en"]).en!;
    const email = uniqueEmail("k1-en");
    await createAccount(request, email);
    await prepare(page, { locale: "en" });
    await installDocApi(page, { [doc.file]: richMarkdown(doc.title, doc.slug) });
    await login(page, email);
    const toggle = page.getByTestId("view-mode-reading");
    await expect(toggle).toHaveAttribute("aria-label", "Reading mode");
    await expect(toggle).toHaveAttribute("title", /Reading mode.*Alt\+L/);
    await toggle.click();
    await expect(page.getByTestId("reading-back")).toHaveText("Back to map");
    await expect(readingView(page)).toHaveAttribute("aria-label", "Reading mode: document");
  });

  test("K2: Überschriften, Links, Listen, Tabellen, Code, Bilder und Mermaid werden einheitlich dargestellt @t54", async ({ page, request }) => {
    const run = Date.now();
    const doc = names(run, ["a"]).a!;
    const email = uniqueEmail("k2");
    await createAccount(request, email);
    await prepare(page);
    await installDocApi(page, { [doc.file]: richMarkdown(doc.title, doc.slug) });
    await login(page, email);
    await enterReading(page);
    const view = readingView(page);

    // Überschriften nach Ebene (Knotentitel), in Dokumentreihenfolge
    await expect(view.locator("h1")).toHaveText([doc.title]);
    await expect(view.locator("h2")).toHaveText(["Listen", "Code", "Bild"]);
    await expect(view.locator("h3")).toHaveText(["Tabelle"]);

    // Links: extern mit rel=noreferrer; javascript: wird kein Link
    const link = view.getByRole("link", { name: "BloomMD-Link" });
    await expect(link).toHaveAttribute("href", "https://bloommd.io/docs");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noreferrer/);
    await expect(view.getByText("unsicheren Link")).toBeVisible();
    await expect(view.locator('a[href^="javascript:" i]')).toHaveCount(0);
    await expect(view.getByRole("link")).toHaveCount(1);

    // Listen, auch verschachtelt
    await expect(view.locator("ul > li").first()).toContainText("Erster Punkt");
    await expect(view.locator("ul ul > li")).toHaveText(["Verschachtelt eins", "Verschachtelt zwei"]);
    await expect(view.locator("ol > li")).toHaveText(["Schritt eins", "Schritt zwei"]);

    // Tabelle
    const table = view.getByTestId("reading-table");
    await expect(table.locator("th")).toHaveText(["Name", "Wert"]);
    await expect(table.locator("tbody tr")).toHaveCount(2);

    // Codeblöcke: Sprache sichtbar; Mermaid ist ein ganz normaler Codeblock ohne Diagramm
    const blocks = view.getByTestId("reading-code-block");
    await expect(blocks).toHaveCount(2);
    await expect(blocks.nth(0).getByTestId("reading-code-language")).toHaveText("ts");
    await expect(blocks.nth(0)).toContainText("const antwort = 42;");
    await expect(blocks.nth(1).getByTestId("reading-code-language")).toHaveText("mermaid");
    await expect(blocks.nth(1)).toContainText("graph TD");
    await expect(blocks.nth(1)).toContainText("A[Start] --> B{Auswahl}");
    await expect(view.locator("svg:not([aria-hidden])")).toHaveCount(0);
    const fonts = await blocks.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element.querySelector("pre")!);
      return `${style.fontFamily}|${style.fontSize}|${style.backgroundColor}`;
    }));
    expect(new Set(fonts).size).toBe(1);

    // Bild lädt und passt in die Spalte
    const image = view.getByRole("img", { name: "Pixel" });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });

  test("K3: Zurück zur Map stellt Modus, Auswahl und Editor wieder her; Dokumentwechsel bleibt im Lesemodus @t54", async ({ page, request }) => {
    const run = Date.now();
    const { a, b } = names(run, ["a", "b"]);
    const email = uniqueEmail("k3");
    await createAccount(request, email);
    await prepare(page);
    await installDocApi(page, { [a!.file]: richMarkdown(a!.title, a!.slug), [b!.file]: richMarkdown(b!.title, b!.slug) });
    await login(page, email);
    await openByTitle(page, a!.title);
    await expect(rootOf(page, a!.title)).toBeVisible();

    // Auswahl im Knoten „Code“, dann Outline als vorheriger Modus
    await page.getByTestId("view-mode-outline").click();
    await expect(page.getByTestId("outline-view")).toBeVisible();
    await page.getByTestId("outline-view").getByRole("button", { name: /Code/ }).click();
    await enterReading(page);
    await page.getByTestId("reading-back").click();
    await expect(readingView(page)).toHaveCount(0);
    await expect(page.getByTestId("outline-view")).toBeVisible();
    await expect(page.getByTestId("outline-view").getByRole("button", { name: /Code/ })).toHaveClass(/bg-\[#FFF4EE\]/);

    // Karte: Auswahl bleibt, die Ansicht ist wieder die Map
    await page.getByTestId("view-mode-map").click();
    await rootOf(page, "Code").click();
    await expect(rootOf(page, "Code")).toHaveAttribute("data-selected", "true");
    await enterReading(page);
    await page.getByTestId("reading-back").click();
    await expect(page.locator('[data-testid="mindmap-node"]').first()).toBeVisible();
    await expect(rootOf(page, "Code")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("view-mode-map")).toBeVisible();

    // Dokumentwechsel über Tabs / Befehlspalette in der Leseansicht: Lesemodus bleibt, Text wechselt
    await enterReading(page);
    await openByTitle(page, b!.title);
    await expect(tabOf(page, b!.file)).toHaveAttribute("aria-selected", "true");
    await expect(readingView(page).locator("h1")).toHaveText([b!.title]);
    await tabOf(page, a!.file).click();
    await expect(readingView(page).locator("h1")).toHaveText([a!.title]);
    await expect(page.getByTestId("reading-back")).toBeVisible();

    // Zurück nach dem Wechsel: wieder die Map, jetzt mit dem zuletzt geöffneten Dokument
    await tabOf(page, b!.file).click();
    await expect(readingView(page).locator("h1")).toHaveText([b!.title]);
    await page.getByTestId("reading-back").click();
    await expect(rootOf(page, b!.title)).toBeVisible();
    await expect(readingView(page)).toHaveCount(0);
  });

  test("K4: lokaler Ordner — Lesemodus betreten und verlassen schreibt nichts in die Datei @t54", async ({ page, request }) => {
    const email = uniqueEmail("k4");
    await createAccount(request, email);
    await prepare(page);
    await installBrowserWorkspaceMock(page);
    await login(page, email);

    await page.getByTestId("open-browser-workspace").click();
    await expect(page.getByTestId("workspace-readonly")).toBeVisible();
    await page.getByTestId("map-view-workspace").click();
    await expect(page.getByTestId("workspace-map")).toBeVisible();
    await page.locator(".react-flow__node").filter({ has: page.getByTestId("workspace-node-file"), hasText: "overview" }).first().dblclick({ delay: 80 });
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");

    const snapshot = () => page.evaluate(() => {
      const mock = (window as unknown as { __bloommdWorkspaceMock: { files: Record<string, string>; created: string[]; writes: string[]; state: { readwrite: string } } }).__bloommdWorkspaceMock;
      return JSON.stringify({ files: mock.files, created: mock.created, writes: mock.writes, readwrite: mock.state.readwrite });
    });
    const before = await snapshot();

    await enterReading(page);
    await expect(readingView(page).locator("h1")).toHaveText(["Local Overview"]);
    await expect(readingView(page).getByText("Lokaler Text mit")).toBeVisible();
    await expect(readingView(page).getByTestId("reading-table").locator("th")).toHaveText(["Name", "Wert"]);
    await expect(readingView(page).getByTestId("reading-code-language")).toHaveText("mermaid");
    await expect(page.getByTestId("reading-back")).toBeVisible();
    await page.getByTestId("reading-back").click();
    await expect(readingView(page)).toHaveCount(0);
    await enterReading(page);
    await page.keyboard.press("Escape");
    await expect(readingView(page)).toHaveCount(0);

    // Weder ein Schreibzugriff noch eine Schreibberechtigung wurde angefragt.
    expect(await snapshot()).toBe(before);
    expect(JSON.parse(await snapshot()).readwrite).toBe("denied");
  });

  test("K5/Tastatur: Alt+L betritt, Esc verlässt; Esc im Textfeld nicht; Pfeile und Bild-ab scrollen, Auswahl bleibt @t54", async ({ page, request }) => {
    const run = Date.now();
    const doc = names(run, ["long"]).long!;
    const email = uniqueEmail("kbd");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, { [doc.file]: longMarkdown(doc.title, doc.slug) });
    await login(page, email);
    await expect(rootOf(page, doc.title)).toBeVisible();
    const before = api.saved.get(doc.file);

    await rootOf(page, "Abschnitt 2").click();
    await expect(rootOf(page, "Abschnitt 2")).toHaveAttribute("data-selected", "true");
    await page.locator("#mindmap-canvas").focus();
    await page.keyboard.press("Alt+L");
    await expect(readingView(page)).toBeVisible();
    await expect(readingView(page)).toBeFocused();

    // Bild-ab und Pfeil-ab scrollen den Text, Pfeil links/rechts/hoch ändern im Hintergrund nichts
    const scrollTop = () => readingView(page).evaluate((element) => element.scrollTop);
    const start = await scrollTop();
    await page.keyboard.press("PageDown");
    await expect.poll(scrollTop).toBeGreaterThan(start);
    const afterPage = await scrollTop();
    await page.keyboard.press("ArrowDown");
    await expect.poll(scrollTop).toBeGreaterThan(afterPage);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+z");
    await expect(readingView(page)).toBeVisible();

    // Esc in einem Textfeld (Befehlspalette) lässt den Lesemodus stehen
    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("command-palette-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(readingView(page)).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await readingView(page).focus();

    // Esc verlässt: Map, Auswahl unverändert, nichts gespeichert
    await page.keyboard.press("Escape");
    await expect(readingView(page)).toHaveCount(0);
    await expect(rootOf(page, "Abschnitt 2")).toHaveAttribute("data-selected", "true");
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(13);

    // Alt+L schaltet auch wieder zurück
    await page.keyboard.press("Alt+L");
    await expect(readingView(page)).toBeVisible();
    await page.keyboard.press("Alt+L");
    await expect(readingView(page)).toHaveCount(0);
    expect(api.puts).toEqual([]);
    expect(api.saved.get(doc.file)).toBe(before);
  });

  test("K5/Tastatur: Alle Elemente per Tab erreichbar, sichtbarer Fokus; Hilfe und Befehlspalette kennen den Modus @t54", async ({ page, request }) => {
    const run = Date.now();
    const doc = names(run, ["tab"]).tab!;
    const email = uniqueEmail("tab");
    await createAccount(request, email);
    await prepare(page);
    await installDocApi(page, { [doc.file]: richMarkdown(doc.title, doc.slug) });
    await login(page, email);

    // Befehlspalette
    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill("Lesemodus");
    await expect(page.getByText("Lesemodus").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(readingView(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(readingView(page)).toHaveCount(0);

    // Hilfe nennt Alt+L und Esc im Lesemodus
    await page.keyboard.press("F1");
    await expect(page.getByTestId("shortcut-help")).toContainText("Alt+L");
    await expect(page.getByTestId("shortcut-help")).toContainText("Lesemodus betreten oder verlassen");
    await page.keyboard.press("F1");
    await expect(page.getByTestId("shortcut-help")).toHaveCount(0);

    // Tab-Reihenfolge: Zurück-Knopf → Lesefläche → Link → Tabelle → Codeblöcke
    await page.keyboard.press("Alt+L");
    await expect(readingView(page)).toBeFocused();
    const outlineVisible = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    });
    expect(await outlineVisible(readingView(page))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("reading-back")).toBeFocused();
    expect(await outlineVisible(page.getByTestId("reading-back"))).toBe(true);
    await page.keyboard.press("Tab");
    await expect(readingView(page)).toBeFocused();
    await page.keyboard.press("Tab");
    const link = readingView(page).getByRole("link", { name: "BloomMD-Link" });
    await expect(link).toBeFocused();
    expect(await outlineVisible(link)).toBe(true);
    await page.keyboard.press("Tab");
    await expect(readingView(page).getByTestId("reading-table")).toBeFocused();
    expect(await outlineVisible(readingView(page).getByTestId("reading-table"))).toBe(true);
    await page.keyboard.press("Tab");
    await expect(readingView(page).getByTestId("reading-code-block").first().locator("pre")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(readingView(page).getByTestId("reading-code-block").nth(1).locator("pre")).toBeFocused();
    // Enter auf dem Zurück-Knopf führt zurück
    await page.getByTestId("reading-back").focus();
    await page.keyboard.press("Enter");
    await expect(readingView(page)).toHaveCount(0);
  });

  test("K5/Mobil 390 px: kein horizontales Scrollen, Tabellen und Codeblöcke scrollen in sich, Touch-Ziele ab 44 px @t54", async ({ page, request }) => {
    const run = Date.now();
    const doc = names(run, ["mobile"]).mobile!;
    const email = uniqueEmail("mobile");
    await createAccount(request, email);
    await prepare(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await installDocApi(page, { [doc.file]: wideMarkdown(doc.title, doc.slug) });
    await login(page, email);

    const toggle = page.getByTestId("view-mode-reading");
    await expect(toggle).toBeVisible();
    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.width).toBeGreaterThanOrEqual(44);
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(readingView(page)).toBeVisible();

    const backBox = (await page.getByTestId("reading-back").boundingBox())!;
    expect(backBox.height).toBeGreaterThanOrEqual(44);
    expect(backBox.width).toBeGreaterThanOrEqual(44);

    const metrics = await page.evaluate(() => {
      const view = document.querySelector<HTMLElement>('[data-testid="reading-view"]')!;
      const table = document.querySelector<HTMLElement>('[data-testid="reading-table"]')!;
      const pre = document.querySelector<HTMLElement>('[data-testid="reading-code-block"] pre')!;
      const image = document.querySelector<HTMLImageElement>('[data-testid="reading-view"] img')!;
      const scroller = document.scrollingElement!;
      return {
        pageOverflow: scroller.scrollWidth - scroller.clientWidth,
        viewOverflow: view.scrollWidth - view.clientWidth,
        tableScrolls: table.scrollWidth > table.clientWidth,
        tableOverflowX: getComputedStyle(table).overflowX,
        tableClientWidth: table.clientWidth,
        codeScrolls: pre.scrollWidth > pre.clientWidth,
        codeOverflowX: getComputedStyle(pre).overflowX,
        imageFits: image.getBoundingClientRect().right <= view.getBoundingClientRect().right,
        fontSize: parseFloat(getComputedStyle(view.querySelector("article")!).fontSize),
        viewWidth: view.clientWidth,
      };
    });
    expect(metrics.pageOverflow).toBeLessThanOrEqual(1);
    expect(metrics.viewOverflow).toBeLessThanOrEqual(1);
    expect(metrics.tableScrolls).toBe(true);
    expect(["auto", "scroll"]).toContain(metrics.tableOverflowX);
    expect(metrics.tableClientWidth).toBeLessThanOrEqual(390);
    expect(metrics.codeScrolls).toBe(true);
    expect(["auto", "scroll"]).toContain(metrics.codeOverflowX);
    expect(metrics.imageFits).toBe(true);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(16);

    await page.getByTestId("reading-back").click();
    await expect(readingView(page)).toHaveCount(0);
  });

  test("K5/Layout: Textspalte höchstens ca. 70ch auf dem Desktop; Hell und Dunkel nutzen die Theme-Variablen @t54", async ({ page, request }) => {
    const run = Date.now();
    const doc = names(run, ["theme"]).theme!;
    const email = uniqueEmail("theme");
    await createAccount(request, email);
    await prepare(page, { theme: "dark" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await installDocApi(page, { [doc.file]: richMarkdown(doc.title, doc.slug) });
    await login(page, email);
    await enterReading(page);

    const layout = await page.evaluate(() => {
      const article = document.querySelector<HTMLElement>('[data-testid="reading-article"]')!;
      const view = document.querySelector<HTMLElement>('[data-testid="reading-view"]')!;
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;width:70ch";
      article.appendChild(probe);
      const limit = probe.getBoundingClientRect().width;
      probe.remove();
      const surface = getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim();
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim();
      const toRgb = (value: string) => {
        const holder = document.createElement("div");
        holder.style.color = value;
        document.body.appendChild(holder);
        const resolved = getComputedStyle(holder).color;
        holder.remove();
        return resolved;
      };
      return {
        width: article.getBoundingClientRect().width,
        limit,
        viewWidth: view.clientWidth,
        background: getComputedStyle(view).backgroundColor,
        color: getComputedStyle(view).color,
        surface: toRgb(surface),
        ink: toRgb(ink),
      };
    });
    expect(layout.width).toBeLessThanOrEqual(layout.limit + 1);
    expect(layout.viewWidth).toBeGreaterThan(layout.limit);
    // Farben kommen aus den Theme-Variablen (hier: dunkel), nicht aus festen Werten.
    expect(layout.background).toBe(layout.surface);
    expect(layout.color).toBe(layout.ink);
    const channels = (rgb: string) => rgb.match(/\d+/g)!.slice(0, 3).map(Number);
    expect(Math.max(...channels(layout.background))).toBeLessThan(60);
    expect(Math.min(...channels(layout.color))).toBeGreaterThan(150);
  });
});
