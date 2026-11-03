/**
 * Ticket #52 — Tabs und Navigation zwischen Dokumenten in /app. Alle Fälle tragen @t52.
 *
 * Kriterien 1–14 stehen je im Testtitel (K1, K2, …). Jede Prüfung legt ein eigenes Konto und eigene
 * Dokumente (Dateiname `t52-…`, Tag `t52`) an und räumt die Dokumente im `finally` wieder ab.
 *
 * Nicht prüfbar: ein Konto und ein Team-Workspace lassen sich über die API nicht löschen (K8 legt einen
 * Team-Workspace an, der leer zurückbleibt). Der lokale Ordner (K12–K14) läuft über den Ordner-Mock.
 * Der Sync ist am Testsystem nicht verbunden; nur dann gibt es überhaupt einen Unsaved-Status (K9–K11).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };
const OPEN_TABS_STORAGE_KEY = "bloommd_open_tabs";

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
  }, locale);
}

function workspaceQuery(workspaceId?: string) {
  return workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "";
}

async function createDoc(request: APIRequestContext, filename: string, title: string, workspaceId?: string) {
  const now = new Date().toISOString();
  const markdown = [
    "---",
    `title: ${title}`,
    `id: ${filename.replace(/[^a-z0-9]/gi, "-")}`,
    `created: "${now}"`,
    `updated: "${now}"`,
    "tags:",
    "  - t52",
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${title} <!-- bloommd:id=t52-root -->`,
    "",
    `## Child <!-- bloommd:id=t52-child -->`,
    "",
  ].join("\n");
  const response = await request.post(`/api/mindmaps${workspaceQuery(workspaceId)}`, {
    headers: SAME_ORIGIN_HEADERS,
    data: { filename, markdown },
  });
  expect(response.ok(), `Fixture ${filename} anlegen`).toBe(true);
}

async function deleteDocs(request: APIRequestContext, filenames: string[], workspaceId?: string) {
  for (const filename of filenames) {
    await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}${workspaceQuery(workspaceId)}`, { headers: SAME_ORIGIN_HEADERS });
  }
}

const tabOf = (page: Page, filename: string) => page.locator(`[data-testid="mindmap-tab"][data-filename="${filename}"]`);
const closeOf = (page: Page, filename: string) => page.locator(`[data-testid="mindmap-tab-close"][data-filename="${filename}"]`);
const rootOf = (page: Page, title: string) => page.locator(`[data-testid="mindmap-node"][data-node-label="${title}"]`).first();

async function openByTitle(page: Page, title: string) {
  await page.keyboard.press("Control+K");
  await page.getByTestId("command-palette-input").fill(title);
  await page.getByTestId("command-palette-item-mindmap").first().click();
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
  await page.locator('[data-testid="mindmap-node"][data-node-id="t52-root"]').click();
  await page.getByTestId("node-action-add-child").click();
  const input = page.locator('[data-testid="mindmap-node"] input').first();
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(before + 1);
}

function putTo(filename: string) {
  return (response: { url(): string; request(): { method(): string } }) =>
    response.url().includes(`/api/mindmaps/${encodeURIComponent(filename)}`) && response.request().method() === "PUT";
}

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


test.describe("Dokument-Tabs und Navigation @t52", () => {
  test.setTimeout(120_000);

  test("K1/K2/K4/K5/K6/K13: Tab-Leiste im schmalen Viewport, Reihenfolge, Titel, Schließen (DE) @t52", async ({ page, request }) => {
    const run = Date.now();
    const files = { a: `t52-a-${run}.md`, b: `t52-b-${run}.md`, c: `t52-c-${run}.md`, long: `t52-long-${run}.md` };
    const titles = { a: `T52 Alpha ${run}`, b: `T52 Beta ${run}`, c: `T52 Gamma ${run}`, long: `T52 Ein sehr langer Dokumenttitel der niemals in ein Tab passt ${run}` };
    const email = uniqueEmail("tabs-de");
    await createAccount(request, email);
    await createDoc(request, files.a, titles.a);
    await createDoc(request, files.b, titles.b);
    await createDoc(request, files.c, titles.c);
    await createDoc(request, files.long, titles.long);
    await prepare(page, "de");
    // K4: unter `lg` (1024 px)
    await page.setViewportSize({ width: 900, height: 700 });
    try {
      await login(page, email);

      // K4: schon beim ersten Tab sichtbar. K6: beim einzigen Tab ist Schließen deaktiviert.
      await expect(page.getByTestId("mindmap-tabs")).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(1);
      await expect(page.getByTestId("mindmap-tab-close")).toBeDisabled();
      // K13: ohne Herkunft kein Zurück-Button
      await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);
      const [first] = await tabFilenames(page);

      await openByTitle(page, titles.a);
      await openByTitle(page, titles.b);
      await openByTitle(page, titles.c);

      // K1: Rollen und aria-selected
      const tablist = page.getByRole("tablist");
      await expect(tablist).toHaveCount(1);
      await expect(tablist.getByRole("tab")).toHaveCount(4);
      await expect(page.getByTestId("mindmap-tab")).toHaveCount(4);
      await expect(tabOf(page, files.c)).toHaveAttribute("aria-selected", "true");
      await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
      await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);

      // K2: neue Tabs hinten, Aktivieren ändert die Reihenfolge nicht
      expect(await tabFilenames(page)).toEqual([first, files.a, files.b, files.c]);
      await tabOf(page, files.a).click();
      await expect(tabOf(page, files.a)).toHaveAttribute("aria-selected", "true");
      await expect(tabOf(page, files.c)).toHaveAttribute("aria-selected", "false");
      await expect(rootOf(page, titles.a)).toBeVisible();
      expect(await tabFilenames(page)).toEqual([first, files.a, files.b, files.c]);
      await tabOf(page, first!).click();
      await tabOf(page, files.b).click();
      await expect(tabOf(page, files.b)).toHaveAttribute("aria-selected", "true");
      expect(await tabFilenames(page)).toEqual([first, files.a, files.b, files.c]);

      // K5: Titel gekürzt, title-Attribut mit vollem Titel und Dateiname
      await openByTitle(page, titles.long);
      const longTab = tabOf(page, files.long);
      await expect(longTab).toHaveAttribute("title", `${titles.long} — ${files.long}`);
      const label = longTab.locator("span.truncate");
      expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      expect(await label.evaluate((element) => getComputedStyle(element).textOverflow)).toBe("ellipsis");
      await expect(tabOf(page, files.a)).toHaveAttribute("title", `${titles.a} — ${files.a}`);

      // K4: Leiste scrollt horizontal
      const scroller = page.getByTestId("mindmap-tabs").locator("div.overflow-x-auto");
      expect(await scroller.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
      expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      expect(await page.getByTestId("mindmap-tabs").evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);

      // K6: Schließen-Button je Tab, DE-Label, ab zwei Tabs aktiv
      await expect(page.getByTestId("mindmap-tab-close")).toHaveCount(5);
      await expect(closeOf(page, files.a)).toBeEnabled();
      await expect(closeOf(page, files.a)).toHaveAttribute("aria-label", `Tab schließen: ${titles.a}`);
    } finally {
      await deleteDocs(request, Object.values(files));
    }
  });

  test("K6: Schließen-Button trägt EN-Label bei locale=en @t52", async ({ page, request }) => {
    const run = Date.now();
    const file = `t52-en-${run}.md`;
    const title = `T52 English ${run}`;
    const email = uniqueEmail("tabs-en");
    await createAccount(request, email);
    await createDoc(request, file, title);
    await prepare(page, "en");
    try {
      await login(page, email);
      await expect(page.getByTestId("mindmap-tab-close")).toBeDisabled();
      await openByTitle(page, title);
      await expect(closeOf(page, file)).toBeEnabled();
      await expect(closeOf(page, file)).toHaveAttribute("aria-label", `Close tab: ${title}`);
    } finally {
      await deleteDocs(request, [file]);
    }
  });

  test("K3: höchstens 10 Tabs, beim elften fliegt das älteste inaktive Tab, das aktive bleibt @t52", async ({ page, request }) => {
    test.setTimeout(240_000);
    const run = Date.now();
    const files = Array.from({ length: 11 }, (_, index) => `t52-max-${String(index + 1).padStart(2, "0")}-${run}.md`);
    const titles = files.map((_, index) => `T52 Max ${String(index + 1).padStart(2, "0")} ${run}`);
    const email = uniqueEmail("tabs-max");
    await createAccount(request, email);
    for (const [index, file] of files.entries()) await createDoc(request, file, titles[index]!);
    await prepare(page);
    try {
      await login(page, email);
      for (const title of titles.slice(0, 9)) await openByTitle(page, title);
      // Startdokument + 9 = 10: noch nichts verdrängt
      await expect(page.getByRole("tab")).toHaveCount(10);
      await expect(tabOf(page, files[0]!)).toHaveCount(1);
      await openByTitle(page, titles[9]!);
      await expect(page.getByRole("tab")).toHaveCount(10);
      await openByTitle(page, titles[10]!);
      await expect(page.getByRole("tab")).toHaveCount(10);
      // das neueste Tab ist aktiv und da, das älteste (Startdokument, dann Max 01) ist weg
      await expect(tabOf(page, files[10]!)).toHaveAttribute("aria-selected", "true");
      await expect(tabOf(page, files[0]!)).toHaveCount(0);
      await expect(tabOf(page, files[1]!)).toHaveCount(1);
      const names = await tabFilenames(page);
      expect(names).toEqual(files.slice(1));
    } finally {
      await deleteDocs(request, files);
    }
  });

  test("K7/K8: Schließen aktiviert Nachbar (rechts, sonst links), Mittelklick schließt, kein Duplikat beim erneuten Öffnen @t52", async ({ page, request }) => {
    const run = Date.now();
    const files = { a: `t52-na-${run}.md`, b: `t52-nb-${run}.md`, c: `t52-nc-${run}.md` };
    const titles = { a: `T52 Nachbar A ${run}`, b: `T52 Nachbar B ${run}`, c: `T52 Nachbar C ${run}` };
    const email = uniqueEmail("tabs-close");
    await createAccount(request, email);
    for (const key of ["a", "b", "c"] as const) await createDoc(request, files[key], titles[key]);
    await prepare(page);
    try {
      await login(page, email);
      const [first] = await tabFilenames(page);
      await openByTitle(page, titles.a);
      await openByTitle(page, titles.b);
      await openByTitle(page, titles.c);
      await expect(page.getByRole("tab")).toHaveCount(4);

      // K7: aktives Mitteltab schließen → rechter Nachbar
      await tabOf(page, files.b).click();
      await expect(tabOf(page, files.b)).toHaveAttribute("aria-selected", "true");
      await closeOf(page, files.b).click();
      await expect(tabOf(page, files.b)).toHaveCount(0);
      await expect(tabOf(page, files.c)).toHaveAttribute("aria-selected", "true");
      await expect(rootOf(page, titles.c)).toBeVisible();
      // letztes Tab schließen → linker Nachbar
      await closeOf(page, files.c).click();
      await expect(tabOf(page, files.c)).toHaveCount(0);
      await expect(tabOf(page, files.a)).toHaveAttribute("aria-selected", "true");
      await expect(rootOf(page, titles.a)).toBeVisible();
      expect(await tabFilenames(page)).toEqual([first, files.a]);

      // K8: dieselbe Datei erneut öffnen (Befehlspalette, Dateibrowser, Link) → kein Duplikat
      await openByTitle(page, titles.a);
      await expect(page.getByRole("tab")).toHaveCount(2);
      await openByTitle(page, titles.b);
      await expect(page.getByRole("tab")).toHaveCount(3);
      await page.getByTitle(/Open file browser|Datei-Browser/).click();
      await page.getByTestId("file-browser-search").fill(titles.a);
      await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${files.a}"]`).press("Enter");
      await expect(tabOf(page, files.a)).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab")).toHaveCount(3);
      await openViaLink(page, "portal", files.b);
      await expect(tabOf(page, files.b)).toHaveAttribute("aria-selected", "true");
      await expect(rootOf(page, titles.b)).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(3);
      expect(await tabFilenames(page)).toEqual([first, files.a, files.b]);

      // K7: Mittelklick schließt (inaktives, dann aktives Tab)
      await tabOf(page, first!).click({ button: "middle" });
      await expect(tabOf(page, first!)).toHaveCount(0);
      await expect(page.getByRole("tab")).toHaveCount(2);
      await tabOf(page, files.b).click({ button: "middle" });
      await expect(tabOf(page, files.b)).toHaveCount(0);
      await expect(tabOf(page, files.a)).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab")).toHaveCount(1);
      await expect(page.getByTestId("mindmap-tab-close")).toBeDisabled();
    } finally {
      await deleteDocs(request, Object.values(files));
    }
  });

  test("K8: dieselbe Datei in zwei Workspaces ergibt zwei Tabs @t52", async ({ page, request }) => {
    const run = Date.now();
    const file = `t52-dup-${run}.md`;
    const titlePersonal = `T52 Dup Persönlich ${run}`;
    const titleTeam = `T52 Dup Team ${run}`;
    const email = uniqueEmail("tabs-ws");
    await createAccount(request, email);
    const created = await request.post("/api/workspaces", { headers: SAME_ORIGIN_HEADERS, data: { name: `T52 Team ${run}` } });
    expect(created.ok()).toBe(true);
    const body = (await created.json()) as { workspace?: { id?: string }; id?: string };
    const teamId = body.workspace?.id ?? body.id;
    expect(teamId).toBeTruthy();
    await createDoc(request, file, titlePersonal);
    await createDoc(request, file, titleTeam, teamId);
    await prepare(page);
    try {
      await login(page, email);
      await openByTitle(page, titlePersonal);
      await expect(tabOf(page, file)).toHaveAttribute("aria-selected", "true");

      await page.getByTestId("workspace-manager-toggle").click();
      await page.getByTestId("workspace-option").filter({ hasText: `T52 Team ${run}` }).click();
      await openByTitle(page, titleTeam);
      await expect(tabOf(page, file)).toHaveAttribute("aria-selected", "true");

      const stored = JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key), OPEN_TABS_STORAGE_KEY)) ?? "[]") as Array<{ key: string; filename: string; workspaceId: string | null }>;
      const duplicates = stored.filter((tab) => tab.filename === file);
      expect(duplicates).toHaveLength(2);
      expect(new Set(duplicates.map((tab) => tab.key)).size).toBe(2);
      expect(new Set(duplicates.map((tab) => tab.workspaceId)).size).toBe(2);
      expect(duplicates.some((tab) => tab.workspaceId === teamId)).toBe(true);
    } finally {
      await deleteDocs(request, [file]);
      await deleteDocs(request, [file], teamId);
    }
  });

  test("K9/K10: Wechsel speichert zuerst; schlägt das fehl, bleibt man im Dokument mit Meldung; aktives Tab zeigt data-unsaved und Punkt @t52", async ({ page, request }) => {
    const run = Date.now();
    const files = { a: `t52-ua-${run}.md`, b: `t52-ub-${run}.md` };
    const titles = { a: `T52 Unsaved A ${run}`, b: `T52 Unsaved B ${run}` };
    const email = uniqueEmail("tabs-unsaved");
    await createAccount(request, email);
    await createDoc(request, files.a, titles.a);
    await createDoc(request, files.b, titles.b);
    await prepare(page);
    try {
      await login(page, email);
      await openByTitle(page, titles.a);
      await openByTitle(page, titles.b);
      await tabOf(page, files.a).click();
      await expect(rootOf(page, titles.a)).toBeVisible();

      // K10: sauberer Stand → kein Punkt; nach Änderung data-unsaved und Punkt nur am aktiven Tab
      await expect(tabOf(page, files.a)).not.toHaveAttribute("data-unsaved", "true");
      await expect(page.getByTestId("mindmap-tab-unsaved")).toHaveCount(0);
      await addChildNode(page);
      await expect(tabOf(page, files.a)).toHaveAttribute("data-unsaved", "true");
      await expect(tabOf(page, files.a).getByTestId("mindmap-tab-unsaved")).toBeVisible();
      await expect(page.getByTestId("mindmap-tab-unsaved")).toHaveCount(1);
      await expect(tabOf(page, files.b)).not.toHaveAttribute("data-unsaved", "true");

      // K9: Speichern schlägt fehl → bleibt im Dokument, Meldung
      await page.route(`**/api/mindmaps/${encodeURIComponent(files.a)}**`, async (route) => {
        if (route.request().method() === "PUT") {
          await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "t52 forced failure" }) });
          return;
        }
        await route.continue();
      });
      await tabOf(page, files.b).click();
      await expect(page.getByTestId("app-notice")).toBeVisible();
      await expect(tabOf(page, files.a)).toHaveAttribute("aria-selected", "true");
      await expect(tabOf(page, files.a)).toHaveAttribute("data-unsaved", "true");
      await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
      await page.unroute(`**/api/mindmaps/${encodeURIComponent(files.a)}**`);

      // K9: Speichern gelingt → Wechsel, Stand ist gespeichert und beim Zurückkehren da
      const saved = page.waitForResponse(putTo(files.a));
      await tabOf(page, files.b).click();
      expect((await saved).ok()).toBe(true);
      await expect(tabOf(page, files.b)).toHaveAttribute("aria-selected", "true");
      await expect(rootOf(page, titles.b)).toBeVisible();
      await expect(tabOf(page, files.a)).not.toHaveAttribute("data-unsaved", "true");
      await tabOf(page, files.a).click();
      await expect(rootOf(page, titles.a)).toBeVisible();
      await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
      const persisted = await request.get(`/api/mindmaps/${encodeURIComponent(files.a)}`);
      expect(Object.keys(((await persisted.json()) as { nodes: Record<string, unknown> }).nodes)).toHaveLength(3);
    } finally {
      await deleteDocs(request, Object.values(files));
    }
  });

  test("K11: Schließen mit ungespeichertem Stand fragt nach (Abbrechen, Verwerfen, Speichern und schließen) @t52", async ({ page, request }) => {
    const run = Date.now();
    const files = { a: `t52-ca-${run}.md`, b: `t52-cb-${run}.md` };
    const titles = { a: `T52 Confirm A ${run}`, b: `T52 Confirm B ${run}` };
    const email = uniqueEmail("tabs-confirm");
    await createAccount(request, email);
    await createDoc(request, files.a, titles.a);
    await createDoc(request, files.b, titles.b);
    await prepare(page);
    const puts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "PUT" && req.url().includes(`/api/mindmaps/${encodeURIComponent(files.a)}`)) puts.push(req.url());
    });
    try {
      await login(page, email);
      await openByTitle(page, titles.a);
      await openByTitle(page, titles.b);
      await tabOf(page, files.a).click();
      await expect(rootOf(page, titles.a)).toBeVisible();

      // Abbrechen: Tab bleibt offen, Änderung bleibt
      await addChildNode(page);
      await closeOf(page, files.a).click();
      const dialog = page.getByTestId("mindmap-tab-close-confirm");
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId("mindmap-tab-close-save")).toBeVisible();
      await expect(page.getByTestId("mindmap-tab-close-discard")).toBeVisible();
      await page.getByTestId("mindmap-tab-close-cancel").click();
      await expect(dialog).toHaveCount(0);
      await expect(tabOf(page, files.a)).toHaveAttribute("aria-selected", "true");
      await expect(tabOf(page, files.a)).toHaveAttribute("data-unsaved", "true");
      await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
      expect(puts).toHaveLength(0);

      // Verwerfen: schließt ohne Speichern
      await closeOf(page, files.a).click();
      await expect(dialog).toBeVisible();
      await page.getByTestId("mindmap-tab-close-discard").click();
      await expect(dialog).toHaveCount(0);
      await expect(tabOf(page, files.a)).toHaveCount(0);
      await expect(tabOf(page, files.b)).toHaveAttribute("aria-selected", "true");
      expect(puts).toHaveLength(0);
      await openByTitle(page, titles.a);
      await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(2);

      // Speichern und schließen: speichert, schließt, Stand bleibt erhalten
      await addChildNode(page);
      await closeOf(page, files.a).click();
      await expect(dialog).toBeVisible();
      const saved = page.waitForResponse(putTo(files.a));
      await page.getByTestId("mindmap-tab-close-save").click();
      expect((await saved).ok()).toBe(true);
      await expect(dialog).toHaveCount(0);
      await expect(tabOf(page, files.a)).toHaveCount(0);
      const persisted = await request.get(`/api/mindmaps/${encodeURIComponent(files.a)}`);
      expect(Object.keys(((await persisted.json()) as { nodes: Record<string, unknown> }).nodes)).toHaveLength(3);
      await openByTitle(page, titles.a);
      await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(3);
    } finally {
      await deleteDocs(request, Object.values(files));
    }
  });

  test("K12/K13: Link oder Portal aus einem Dokument — Zurück führt zu diesem Dokument; ohne Herkunft kein Zurück @t52", async ({ page, request }) => {
    const run = Date.now();
    const files = { a: `t52-la-${run}.md`, b: `t52-lb-${run}.md` };
    const titles = { a: `T52 Link A ${run}`, b: `T52 Link B ${run}` };
    const email = uniqueEmail("tabs-link");
    await createAccount(request, email);
    await createDoc(request, files.a, titles.a);
    await createDoc(request, files.b, titles.b);
    await prepare(page);
    try {
      await login(page, email);
      await openByTitle(page, titles.a);
      await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);

      await openViaLink(page, "portal", files.b);
      await expect(tabOf(page, files.b)).toHaveAttribute("aria-selected", "true");
      await expect(rootOf(page, titles.b)).toBeVisible();
      const back = page.getByTestId("mindmap-tab-back");
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute("aria-label", `Zurück zu „${titles.a}“`);
      await back.click();
      await expect(tabOf(page, files.a)).toHaveAttribute("aria-selected", "true");
      await expect(rootOf(page, titles.a)).toBeVisible();
      // A selbst hat keine Herkunft → kein Zurück
      await expect(page.getByTestId("mindmap-tab-back")).toHaveCount(0);
    } finally {
      await deleteDocs(request, Object.values(files));
    }
  });

  test("K12/K14: Dokument aus Karte und Health-Panel, Zurück-Button und Cmd/Strg+←, Cmd/Strg+→ wie bisher (lokaler Ordner) @t52", async ({ page, request }) => {
    const email = uniqueEmail("tabs-local");
    await createAccount(request, email);
    await prepare(page);
    await installBrowserWorkspaceMock(page);
    await login(page, email);

    await page.getByTestId("open-browser-workspace").click();
    await expect(page.getByTestId("workspace-name-input").or(page.getByTestId("workspace-readonly"))).toBeVisible();
    await page.getByTestId("map-view-workspace").click();
    await expect(page.getByTestId("workspace-map")).toBeVisible();

    // K12: Dokument aus der Karte → Zurück-Button, Zurück führt zur Karte
    await page.getByTestId("workspace-node-file").filter({ hasText: "Local Overview" }).first().dblclick();
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
    await page.getByTestId("health-orphans").check();
    await page.getByTestId("workspace-health").getByRole("button", { name: /intro\.md/ }).first().click();
    await expect(tabOf(page, "chapters/intro.md")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("mindmap-tab-back")).toBeVisible();
    await expect(page.getByTestId("mindmap-tab-back")).toHaveAttribute("aria-label", "Zurück zur Karte");

    // K12/K14: per Link aus einem Dokument → Zurück (Button und Cmd/Strg+←) führt zu diesem Dokument
    await tabOf(page, "overview.md").click();
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");
    await openViaLink(page, "file", "chapters/intro.md");
    await expect(tabOf(page, "chapters/intro.md")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("mindmap-tab-back")).toHaveAttribute("aria-label", "Zurück zu „Local Overview“");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Control+ArrowLeft");
    await expect(tabOf(page, "overview.md")).toHaveAttribute("aria-selected", "true");
  });
});
