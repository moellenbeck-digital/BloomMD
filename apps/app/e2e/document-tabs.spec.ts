/**
 * Ticket #52 — Tabs und Navigation zwischen Dokumenten in /app. Alle Fälle tragen @t52.
 *
 * Kriterien K1–K14 stehen je im Testtitel. Jeder Fall legt ein eigenes Konto an (Repo-Konvention, die
 * Konten werden nicht gelöscht) und schreibt keine Daten auf den Server.
 *
 * Die Dokumente kommen aus einer Mock-API (`installDocApi`, page.route auf `/api/mindmaps` und
 * `/api/mindmaps/<datei>`), nicht vom Server: Das Dev-System kann keine Dokumente anlegen
 * (POST /api/mindmaps → 500 „Mindmap could not be created.“; so scheitert schon `createMindmapFixture`
 * in auth-shortcuts.spec.ts). Geprüft wird damit die ausgelieferte Oberfläche, nicht die Persistenz
 * auf dem Server; „gespeichert“ heißt hier: der PUT der Oberfläche kam mit dem erwarteten Markdown an.
 *
 * Nicht prüfbar am Dev-System: dieselbe Datei in zwei Cloud-Workspaces (K8, zweiter Satz) — das Dev-System
 * läuft im Dateimodus ohne Datenbank, `/api/workspaces` antwortet 401 „A cloud session is required.“.
 * Der lokale Ordner (K12–K14) läuft über den Ordner-Mock aus auth-shortcuts.spec.ts. Der Sync ist in
 * diesen Fällen nie verbunden; nur dann gibt es überhaupt einen Unsaved-Status (K9–K11).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };

function uniqueEmail(label: string) {
  return `e2e-t52-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T52", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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

async function prepare(page: Page, locale: "de" | "en" = "de") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", value);
    // Das Dev-System läuft über HTTP (kein sicherer Kontext): `crypto.randomUUID` fehlt dort, und „Knoten
    // anlegen“ scheitert mit „crypto.randomUUID is not a function“. Die Shim gleicht nur das Testsystem aus.
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
  }, locale);
}

interface MockDocApi {
  /** Letzter gespeicherter Markdown-Stand je Datei. */
  saved: Map<string, string>;
  /** Alle PUTs der Oberfläche (Datei, Markdown), auch die abgelehnten. */
  puts: Array<{ filename: string; markdown: string; rejected: boolean }>;
  /** true → jeder PUT scheitert mit 500. */
  failPut: boolean;
}

function starterMarkdown(title: string) {
  // Knoten-IDs je Dokument eindeutig, damit React Flow beim Wechsel nie Knoten eines anderen Dokuments wiederverwendet.
  const slug = title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return [
    "---",
    `title: ${title}`,
    `id: ${slug}`,
    'created: "2026-11-03T10:00:00.000Z"',
    'updated: "2026-11-03T10:00:00.000Z"',
    "tags:",
    "  - t52",
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${title} <!-- bloommd:id=root-${slug} -->`,
    "",
    `## Child <!-- bloommd:id=child-${slug} -->`,
    "",
  ].join("\n");
}

function documentFromMarkdown(filename: string, markdown: string) {
  const title = /^title:\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? filename;
  const nodes: Record<string, { id: string; parentId: string | null; level: number; title: string; content: string; children: string[] }> = {};
  const stack: Array<{ level: number; id: string }> = [];
  let rootId = "";
  let counter = 0;
  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.*?)\s*(?:<!--\s*bloommd:id=([^\s>]+)[^>]*-->)?\s*$/.exec(line);
    if (!match) continue;
    const level = match[1]!.length;
    const id = match[3] ?? `auto-${counter++}`;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    const parentId = stack[stack.length - 1]?.id ?? null;
    nodes[id] = { id, parentId, level, title: match[2]!.trim(), content: "", children: [] };
    if (parentId) nodes[parentId]!.children.push(id);
    else if (!rootId) rootId = id;
    stack.push({ level, id });
  }
  return {
    filePath: `/t52/${filename}`,
    frontmatter: { title, id: filename, created: "2026-11-03T10:00:00.000Z", updated: "2026-11-03T10:00:00.000Z", layout: { direction: "LR" } },
    nodes,
    rootId,
    preamble: "",
  };
}

/** Liefert die Dokumente `files` (Dateiname → Titel) aus dem Speicher des Tests; der erste Eintrag wird beim Start geöffnet. */
async function installDocApi(page: Page, files: Record<string, string>): Promise<MockDocApi> {
  const api: MockDocApi = { saved: new Map(), puts: [], failPut: false };
  for (const [filename, title] of Object.entries(files)) api.saved.set(filename, starterMarkdown(title));
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
        if (api.failPut) {
          api.puts.push({ filename, markdown, rejected: true });
          return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "t52 forced failure" }) });
        }
        api.puts.push({ filename, markdown, rejected: false });
        api.saved.set(filename, markdown);
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ filePath: filename }) });
      }
      return route.fallback();
    },
  );
  return api;
}

const tabOf = (page: Page, filename: string) => page.locator(`[data-testid="mindmap-tab"][data-filename="${filename}"]`);
const closeOf = (page: Page, filename: string) => page.locator(`[data-testid="mindmap-tab-close"][data-filename="${filename}"]`);
const rootOf = (page: Page, title: string) => page.locator(`[data-testid="mindmap-node"][data-node-label="${title}"]`).first();

async function openByTitle(page: Page, title: string) {
  await page.keyboard.press("Control+K");
  await page.getByTestId("command-palette-input").fill(title);
  await page.getByTestId("command-palette-item-mindmap").first().click();
  // Erst wenn die Palette zu ist, wirkt das nächste Strg+K nicht als Umschalter.
  await expect(page.getByTestId("command-palette-input")).toHaveCount(0);
  await expect(rootOf(page, title)).toBeVisible();
}

async function openViaLink(page: Page, kind: "portal" | "file", file: string) {
  await page.evaluate(
    ({ kind: k, file: f }) => window.dispatchEvent(new CustomEvent("bloommd:open-resource", { detail: { kind: k, file: f } })),
    { kind, file },
  );
}

async function tabFilenames(page: Page) {
  return page.getByRole("tab").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.filename ?? ""));
}

/** Fügt dem offenen Dokument einen Knoten hinzu; danach ist der Stand ungespeichert (Sync nicht verbunden). */
async function addChildNode(page: Page) {
  const before = await page.locator('[data-testid="mindmap-node"]').count();
  await page.locator('[data-testid="mindmap-node"][aria-level="1"]').first().click();
  await page.getByTestId("node-action-add-child").click();
  const input = page.locator('[data-testid="mindmap-node"] input').first();
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(before + 1);
}

const headingCount = (markdown: string | undefined) => (markdown ?? "").split("\n").filter((line) => /^#{1,6}\s/.test(line)).length;

async function installBrowserWorkspaceMock(page: Page) {
  await page.addInitScript(() => {
    type Permission = "granted" | "denied";
    type TreeEntry = string | { [name: string]: TreeEntry };
    const files: Record<string, string> = {
      "overview.md": [
        "---",
        "title: Local Overview",
        "id: local-overview",
        "---",
        "",
        "# Local Overview <!-- bloommd:id=local-overview-root -->",
        "",
        "See [[chapters/intro.md]] and [[missing.md]].",
        "",
      ].join("\n"),
      "chapters/intro.md": [
        "---",
        "title: Local Intro",
        "id: local-intro",
        "---",
        "",
        "# Local Intro <!-- bloommd:id=local-intro-root -->",
        "",
        "Back to [[../overview.md]].",
        "",
      ].join("\n"),
    };
    const created: string[] = [];
    const state = { readwrite: "denied" as Permission, read: "granted" as Permission };

    class MockFileHandle {
      readonly kind = "file";
      constructor(readonly name: string, private readonly path: string) {}
      async getFile() {
        const path = this.path;
        return { text: async () => files[path] ?? "" };
      }
      async queryPermission(options?: { mode?: string }) {
        return options?.mode === "readwrite" ? state.readwrite : state.read;
      }
      async requestPermission(options?: { mode?: string }) {
        if (options?.mode === "readwrite") state.readwrite = "granted";
        return options?.mode === "readwrite" ? state.readwrite : state.read;
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
      async queryPermission(options?: { mode?: string }) {
        return options?.mode === "readwrite" ? state.readwrite : state.read;
      }
      async requestPermission(options?: { mode?: string }) {
        if (options?.mode === "readwrite") state.readwrite = "granted";
        return options?.mode === "readwrite" ? state.readwrite : state.read;
      }
      private childPath(name: string) {
        return this.prefix ? `${this.prefix}/${name}` : name;
      }
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

    Object.defineProperty(window, "__bloommdWorkspaceMock", {
      value: { files, created, state },
      configurable: true,
    });
    Object.defineProperty(window, "showDirectoryPicker", {
      value: async () => new MockDirectoryHandle("Mock Workspace"),
      configurable: true,
    });
  });
}


function names(run: number, keys: string[]) {
  const files: Record<string, string> = {};
  const titles: Record<string, string> = {};
  for (const key of keys) {
    files[key] = `t52-${key}-${run}.md`;
    titles[key] = `T52 ${key.toUpperCase()} ${run}`;
  }
  return { files, titles, map: Object.fromEntries(keys.map((key) => [files[key]!, titles[key]!])) };
}

test.describe("Dokument-Tabs und Navigation @t52", () => {
  test.setTimeout(120_000);

  test("K1/K2/K4/K5/K6/K13: Tab-Leiste im schmalen Viewport, Reihenfolge, Titel, Schließen (DE) @t52", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a", "b", "c", "long"]);
    titles.long = `T52 Ein sehr langer Dokumenttitel der niemals in ein Tab passt ${run}`;
    map[files.long!] = titles.long;
    const email = uniqueEmail("tabs-de");
    await createAccount(request, email);
    await prepare(page, "de");
    await installDocApi(page, map);
    // K4: unter `lg` (1024 px)
    await page.setViewportSize({ width: 900, height: 700 });
    await login(page, email);

    // K4: schon beim ersten Tab sichtbar. K6: beim einzigen Tab ist Schließen deaktiviert.
    await expect(page.getByTestId("mindmap-tabs")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect(tabOf(page, files.start!)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("mindmap-tab-close")).toBeDisabled();
    // K13: ohne Herkunft kein Zurück-Button
    await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);

    await openByTitle(page, titles.a!);
    await openByTitle(page, titles.b!);
    await openByTitle(page, titles.c!);

    // K1: Rollen und aria-selected
    const tablist = page.getByRole("tablist");
    await expect(tablist).toHaveCount(1);
    await expect(tablist.getByRole("tab")).toHaveCount(4);
    await expect(page.getByTestId("mindmap-tab")).toHaveCount(4);
    await expect(tabOf(page, files.c!)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);

    // K2: neue Tabs hinten, Aktivieren ändert die Reihenfolge nicht
    const order = [files.start, files.a, files.b, files.c];
    expect(await tabFilenames(page)).toEqual(order);
    await tabOf(page, files.a!).click();
    await expect(tabOf(page, files.a!)).toHaveAttribute("aria-selected", "true");
    await expect(tabOf(page, files.c!)).toHaveAttribute("aria-selected", "false");
    await expect(rootOf(page, titles.a!)).toBeVisible();
    expect(await tabFilenames(page)).toEqual(order);
    await tabOf(page, files.start!).click();
    await tabOf(page, files.b!).click();
    await expect(tabOf(page, files.b!)).toHaveAttribute("aria-selected", "true");
    expect(await tabFilenames(page)).toEqual(order);

    // K5: Titel gekürzt, title-Attribut mit vollem Titel und Dateiname
    await openByTitle(page, titles.long!);
    const longTab = tabOf(page, files.long!);
    await expect(longTab).toHaveAttribute("title", `${titles.long} — ${files.long}`);
    const label = longTab.locator("span.truncate");
    expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await label.evaluate((element) => getComputedStyle(element).textOverflow)).toBe("ellipsis");
    await expect(tabOf(page, files.a!)).toHaveAttribute("title", `${titles.a} — ${files.a}`);

    // K4: Leiste scrollt horizontal und bleibt im Viewport
    const scroller = page.getByTestId("mindmap-tabs").locator("div.overflow-x-auto");
    expect(await scroller.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.getByTestId("mindmap-tabs").evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);

    // K6: Schließen-Button je Tab, DE-Label, ab zwei Tabs aktiv
    await expect(page.getByTestId("mindmap-tab-close")).toHaveCount(5);
    await expect(closeOf(page, files.a!)).toBeEnabled();
    await expect(closeOf(page, files.a!)).toHaveAttribute("aria-label", `Tab schließen: ${titles.a}`);
  });

  test("K6: Schließen-Button trägt EN-Label bei locale=en @t52", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a"]);
    const email = uniqueEmail("tabs-en");
    await createAccount(request, email);
    await prepare(page, "en");
    await installDocApi(page, map);
    await login(page, email);
    // Die Sprache von /app kommt aus `?lang=` (proxy.ts, Header x-bloommd-locale), nicht aus dem localStorage.
    await page.goto("/app?lang=en", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
    await expect(page.getByTestId("mindmap-tab-close")).toBeDisabled();
    await openByTitle(page, titles.a!);
    await expect(closeOf(page, files.a!)).toBeEnabled();
    await expect(closeOf(page, files.a!)).toHaveAttribute("aria-label", `Close tab: ${titles.a}`);
    await expect(closeOf(page, files.start!)).toHaveAttribute("aria-label", `Close tab: ${titles.start}`);
  });

  test("K3: höchstens 10 Tabs, beim elften fliegt das älteste inaktive Tab, das aktive bleibt @t52", async ({ page, request }) => {
    const run = Date.now();
    const keys = ["start", ...Array.from({ length: 11 }, (_, index) => `m${String(index + 1).padStart(2, "0")}`)];
    const { files, titles, map } = names(run, keys);
    const email = uniqueEmail("tabs-max");
    await createAccount(request, email);
    await prepare(page);
    await installDocApi(page, map);
    await login(page, email);
    await expect(page.getByRole("tab")).toHaveCount(1);
    for (const key of keys.slice(1, 10)) await openByTitle(page, titles[key]!);
    // Startdokument + 9 = 10: noch nichts verdrängt
    await expect(page.getByRole("tab")).toHaveCount(10);
    expect((await tabFilenames(page))[0]).toBe(files.start);
    await openByTitle(page, titles.m10!);
    // elftes Tab: das älteste inaktive (Startdokument) fliegt
    await expect(page.getByRole("tab")).toHaveCount(10);
    await expect(tabOf(page, files.start!)).toHaveCount(0);
    await expect(tabOf(page, files.m10!)).toHaveAttribute("aria-selected", "true");
    // zwölftes Tab: das nächstälteste (m01) fliegt, neues aktives Tab bleibt
    await openByTitle(page, titles.m11!);
    await expect(page.getByRole("tab")).toHaveCount(10);
    await expect(tabOf(page, files.m01!)).toHaveCount(0);
    await expect(tabOf(page, files.m11!)).toHaveAttribute("aria-selected", "true");
    expect(await tabFilenames(page)).toEqual(keys.slice(2).map((key) => files[key]));
  });

  test("K7/K8: Schließen aktiviert Nachbar (rechts, sonst links), Mittelklick schließt, kein Duplikat beim erneuten Öffnen @t52", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a", "b", "c"]);
    const email = uniqueEmail("tabs-close");
    await createAccount(request, email);
    await prepare(page);
    await installDocApi(page, map);
    await login(page, email);
    await openByTitle(page, titles.a!);
    await openByTitle(page, titles.b!);
    await openByTitle(page, titles.c!);
    await expect(page.getByRole("tab")).toHaveCount(4);

    // K7: aktives Mitteltab schließen → rechter Nachbar
    await tabOf(page, files.b!).click();
    await expect(tabOf(page, files.b!)).toHaveAttribute("aria-selected", "true");
    await closeOf(page, files.b!).click();
    await expect(tabOf(page, files.b!)).toHaveCount(0);
    await expect(tabOf(page, files.c!)).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, titles.c!)).toBeVisible();
    // letztes Tab schließen → linker Nachbar
    await closeOf(page, files.c!).click();
    await expect(tabOf(page, files.c!)).toHaveCount(0);
    await expect(tabOf(page, files.a!)).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, titles.a!)).toBeVisible();
    expect(await tabFilenames(page)).toEqual([files.start, files.a]);

    // K8: dieselbe Datei erneut öffnen (Befehlspalette, Dateibrowser, Link) → kein Duplikat
    await openByTitle(page, titles.a!);
    await expect(page.getByRole("tab")).toHaveCount(2);
    await openByTitle(page, titles.b!);
    await expect(page.getByRole("tab")).toHaveCount(3);
    await page.getByTitle(/Open file browser|Datei-Browser/).click();
    await page.getByTestId("file-browser-search").fill(titles.a!);
    await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${files.a}"]`).press("Enter");
    await expect(tabOf(page, files.a!)).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, titles.a!)).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);
    await openViaLink(page, "portal", files.b!);
    await expect(tabOf(page, files.b!)).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, titles.b!)).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);
    expect(await tabFilenames(page)).toEqual([files.start, files.a, files.b]);

    // K7: Mittelklick schließt (inaktives, dann aktives Tab)
    await tabOf(page, files.start!).click({ button: "middle" });
    await expect(tabOf(page, files.start!)).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(2);
    await tabOf(page, files.b!).click({ button: "middle" });
    await expect(tabOf(page, files.b!)).toHaveCount(0);
    await expect(tabOf(page, files.a!)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect(page.getByTestId("mindmap-tab-close")).toBeDisabled();
  });

  test("K9/K10: aktives Tab zeigt data-unsaved und Punkt; Wechsel speichert zuerst, bei Fehler bleibt man im Dokument mit Meldung @t52", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a", "b"]);
    const email = uniqueEmail("tabs-unsaved");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, map);
    await login(page, email);
    await openByTitle(page, titles.a!);
    await openByTitle(page, titles.b!);
    await tabOf(page, files.a!).click();
    await expect(rootOf(page, titles.a!)).toBeVisible();

    // K10: sauberer Stand → kein Punkt; nach Änderung data-unsaved und Punkt nur am aktiven Tab
    await expect(tabOf(page, files.a!)).not.toHaveAttribute("data-unsaved", "true");
    await expect(page.getByTestId("mindmap-tab-unsaved")).toHaveCount(0);
    await addChildNode(page);
    await expect(tabOf(page, files.a!)).toHaveAttribute("data-unsaved", "true");
    await expect(tabOf(page, files.a!).getByTestId("mindmap-tab-unsaved")).toBeVisible();
    await expect(page.getByTestId("mindmap-tab-unsaved")).toHaveCount(1);
    await expect(tabOf(page, files.b!)).not.toHaveAttribute("data-unsaved", "true");

    // K9: Speichern schlägt fehl → bleibt im Dokument, Meldung, Änderung bleibt
    api.failPut = true;
    await tabOf(page, files.b!).click();
    await expect(page.getByTestId("app-notice")).toBeVisible();
    expect(api.puts.filter((put) => put.filename === files.a && put.rejected)).toHaveLength(1);
    await expect(tabOf(page, files.a!)).toHaveAttribute("aria-selected", "true");
    await expect(tabOf(page, files.a!)).toHaveAttribute("data-unsaved", "true");
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
    expect(headingCount(api.saved.get(files.a!))).toBe(2);

    // K9: Speichern gelingt → Wechsel, Stand ist gespeichert und beim Zurückkehren da
    api.failPut = false;
    await tabOf(page, files.b!).click();
    await expect(tabOf(page, files.b!)).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, titles.b!)).toBeVisible();
    expect(api.puts.filter((put) => put.filename === files.a && !put.rejected)).toHaveLength(1);
    expect(headingCount(api.saved.get(files.a!))).toBe(3);
    await expect(tabOf(page, files.a!)).not.toHaveAttribute("data-unsaved", "true");
    await tabOf(page, files.a!).click();
    await expect(rootOf(page, titles.a!)).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
  });

  test("K11: Schließen mit ungespeichertem Stand fragt nach (Abbrechen, Verwerfen, Speichern und schließen) @t52", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a", "b"]);
    const email = uniqueEmail("tabs-confirm");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, map);
    await login(page, email);
    await openByTitle(page, titles.a!);
    await openByTitle(page, titles.b!);
    await tabOf(page, files.a!).click();
    await expect(rootOf(page, titles.a!)).toBeVisible();
    const dialog = page.getByTestId("mindmap-tab-close-confirm");

    // Abbrechen: Tab bleibt offen, Änderung bleibt, nichts gespeichert
    await addChildNode(page);
    await closeOf(page, files.a!).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("mindmap-tab-close-save")).toBeVisible();
    await expect(page.getByTestId("mindmap-tab-close-discard")).toBeVisible();
    await page.getByTestId("mindmap-tab-close-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect(tabOf(page, files.a!)).toHaveAttribute("aria-selected", "true");
    await expect(tabOf(page, files.a!)).toHaveAttribute("data-unsaved", "true");
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
    expect(api.puts).toHaveLength(0);

    // Verwerfen: schließt ohne Speichern, Nachbar wird aktiv, Änderung ist weg
    await closeOf(page, files.a!).click();
    await expect(dialog).toBeVisible();
    await page.getByTestId("mindmap-tab-close-discard").click();
    await expect(dialog).toHaveCount(0);
    await expect(tabOf(page, files.a!)).toHaveCount(0);
    await expect(tabOf(page, files.b!)).toHaveAttribute("aria-selected", "true");
    expect(api.puts).toHaveLength(0);
    await openByTitle(page, titles.a!);
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(2);

    // Speichern und schließen: speichert, schließt, Stand bleibt erhalten
    await addChildNode(page);
    await closeOf(page, files.a!).click();
    await expect(dialog).toBeVisible();
    await page.getByTestId("mindmap-tab-close-save").click();
    await expect(dialog).toHaveCount(0);
    await expect(tabOf(page, files.a!)).toHaveCount(0);
    expect(api.puts.filter((put) => put.filename === files.a && !put.rejected)).toHaveLength(1);
    expect(headingCount(api.saved.get(files.a!))).toBe(3);
    await openByTitle(page, titles.a!);
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
  });

  test("K12/K13: Link oder Portal aus einem Dokument — Zurück führt zu diesem Dokument; ohne Herkunft kein Zurück @t52", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a", "b"]);
    const email = uniqueEmail("tabs-link");
    await createAccount(request, email);
    await prepare(page);
    await installDocApi(page, map);
    await login(page, email);
    await openByTitle(page, titles.a!);
    await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);

    await openViaLink(page, "portal", files.b!);
    await expect(tabOf(page, files.b!)).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, titles.b!)).toBeVisible();
    const back = page.getByTestId("mindmap-tab-back");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("aria-label", `Zurück zu „${titles.a}“`);
    await back.click();
    await expect(tabOf(page, files.a!)).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, titles.a!)).toBeVisible();
    // A selbst hat keine Herkunft → kein Zurück
    await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);
  });

  test("K12/K14: Dokument aus Karte und Health-Panel, Zurück-Button und Cmd/Strg+←, Cmd/Strg+→ wie bisher (lokaler Ordner) @t52", async ({ page, request }) => {
    const email = uniqueEmail("tabs-local");
    await createAccount(request, email);
    await prepare(page);
    await installBrowserWorkspaceMock(page);
    await login(page, email);

    await page.getByTestId("open-browser-workspace").click();
    await expect(page.getByTestId("workspace-readonly")).toBeVisible();
    await page.getByTestId("map-view-workspace").click();
    await expect(page.getByTestId("workspace-map")).toBeVisible();

    // K12: Dokument aus der Karte → Zurück-Button, Zurück führt zur Karte
    await page.locator(".react-flow__node").filter({ has: page.getByTestId("workspace-node-file"), hasText: "overview" }).first().dblclick({ delay: 80 });
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");
    const back = page.getByTestId("mindmap-tab-back");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("aria-label", "Zurück zur Karte");
    await back.click();
    await expect(page.getByTestId("workspace-map")).toBeVisible();
    await expect(page.getByTestId("map-view-workspace")).toHaveAttribute("aria-pressed", "true");

    // K14: Cmd/Strg+→ geht wie bisher zur Datei zurück, Cmd/Strg+← löst dieselbe Zurück-Aktion aus
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Control+ArrowRight");
    await expect(page.getByTestId("map-view-document")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("workspace-map")).toHaveCount(0);
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Control+ArrowLeft");
    await expect(page.getByTestId("workspace-map")).toBeVisible();

    // Health-Panel: Dokument öffnen → Zurück-Button führt zur Karte
    await page.getByTestId("open-workspace-health").click();
    await expect(page.getByTestId("workspace-health")).toBeVisible();
    await page.getByTestId("workspace-health").getByRole("button", { name: "overview.md" }).click();
    await expect(page.getByTestId("map-view-document")).toHaveAttribute("aria-pressed", "true");
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("mindmap-tab-back")).toHaveAttribute("aria-label", "Zurück zur Karte");
    await page.getByTestId("mindmap-tab-back").click();
    await expect(page.getByTestId("workspace-map")).toBeVisible();
    await page.getByTestId("map-view-document").click();
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");

    // K12/K14: per Link aus einem Dokument → Zurück (Button und Cmd/Strg+←) führt zu diesem Dokument
    await openViaLink(page, "file", "chapters/intro.md");
    await expect(tabOf(page, "chapters/intro.md")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("mindmap-tab-back")).toHaveAttribute("aria-label", "Zurück zu „Local Overview“");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Control+ArrowLeft");
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");
  });
});
