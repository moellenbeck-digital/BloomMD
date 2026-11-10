/**
 * Ticket #79 — Plattform-Adapter für Datei- und API-Zugriff (Refactoring, Web unverändert). Alle Fälle tragen @t79.
 *
 * Kriterien K1–K11 stehen je im Testtitel. Jeder Fall legt ein eigenes Konto an (Repo-Konvention, die Konten
 * werden nicht gelöscht; `POST /api/account/delete` antwortet im Testmodus mit 401).
 *
 * Die Karten kommen aus einer Mock-API (`installDocApi`, page.route auf `/api/mindmaps…` und `/api/link-preview`),
 * nicht vom Server: Das Dev-System läuft im Dateimodus und lehnt `POST /api/mindmaps` mit 500 ab (Stand #52, am
 * Ticketbeginn erneut bestätigt). Geprüft wird damit die ausgelieferte Oberfläche samt Adapter: Methode, Pfad,
 * Query und Body jedes Aufrufs werden aufgezeichnet und mit dem Vertrag des Web-Adapters verglichen. Lesen
 * (K1, K10) läuft zusätzlich gegen den echten Server, ebenso die unerreichbare URL der Link-Vorschau (K8).
 *
 * Nicht prüfbar am Dev-System:
 *  - K9 (Cloud-Workspace): `/api/workspaces` antwortet 401 „A cloud session is required.“, es gibt keine Datenbank
 *    und keinen Cloud-Workspace. Geprüft wird nur der Gegenpol: ohne Cloud-Workspace trägt kein Aufruf einen
 *    `workspace`-Parameter (der Server fällt auf das Cookie zurück). Die Abgrenzung je Workspace und der Wechsel
 *    bleiben ungeprüft (nur Unit-Test `web-adapter.test.ts` der CI).
 *  - K10 (Ansicht `/share/<token>`): ein gültiger Token braucht die Datenbank. Geprüft wird die Seite mit einem
 *    ungültigen Token (lädt ohne Fehler, zeigt „Dieser Link ist nicht mehr gültig“), nicht die geteilte Karte.
 *  - Desktop- und Mobile-Adapter: kein Web-Pfad.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };

function uniqueEmail(label: string) {
  return `e2e-t79-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T79", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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

async function prepare(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", "de");
    // Das Dev-System läuft über HTTP (kein sicherer Kontext): `crypto.randomUUID` fehlt dort. Die Shim gleicht nur das Testsystem aus.
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
  });
}

/** K11: sammelt Konsolenfehler, Seitenfehler und fehlgeschlagene `/api`-Aufrufe über den ganzen Durchlauf. */
function watchPage(page: Page) {
  const consoleErrors: string[] = [];
  const failedApi: string[] = [];
  page.on("console", (message) => {
    // „Failed to load resource“ steht ohne URL in der Konsole; die fehlgeschlagenen Aufrufe erfasst `response` unten mit Pfad.
    // „Cross-Origin-Opener-Policy … untrustworthy“: Browserhinweis, weil das Dev-System über HTTP statt HTTPS ausgeliefert wird (Umgebung, nicht Anwendung).
    if (message.type() === "error" && !/Failed to load resource|Cross-Origin-Opener-Policy header has been ignored/.test(message.text())) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/") && response.status() >= 400) failedApi.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
  });
  return {
    consoleErrors,
    failedApi,
    /** `provoked`: bewusst ausgelöste Fehler (Muster auf „METHODE /pfad status“); alles andere ist ein Fehler. */
    expectClean(provoked: RegExp[] = []) {
      expect(consoleErrors.filter((text) => !provoked.some((pattern) => pattern.test(text))), "Konsolenfehler").toEqual([]);
      expect(failedApi.filter((entry) => !provoked.some((pattern) => pattern.test(entry))), "fehlgeschlagene /api-Aufrufe").toEqual([]);
    },
  };
}

function slugOf(title: string) {
  return title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

function starterMarkdown(title: string, body = "") {
  const slug = slugOf(title);
  return [
    "---",
    `title: ${title}`,
    `id: ${slug}`,
    'created: "2026-11-07T10:00:00.000Z"',
    'updated: "2026-11-07T10:00:00.000Z"',
    "tags:",
    "  - t79",
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${title} <!-- bloommd:id=root-${slug} -->`,
    "",
    ...(body ? [body, ""] : []),
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
  let current: string | null = null;
  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.*?)\s*(?:<!--\s*bloommd:id=([^\s>]+)[^>]*-->)?\s*$/.exec(line);
    if (!match) {
      if (current && !/^(---|\w+:|\s+-\s)/.test(line) && line.trim()) nodes[current]!.content += `${nodes[current]!.content ? "\n" : ""}${line}`;
      continue;
    }
    const level = match[1]!.length;
    const id = match[3] ?? `auto-${counter++}`;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    const parentId = stack[stack.length - 1]?.id ?? null;
    nodes[id] = { id, parentId, level, title: match[2]!.trim(), content: "", children: [] };
    if (parentId) nodes[parentId]!.children.push(id);
    else if (!rootId) rootId = id;
    stack.push({ level, id });
    current = id;
  }
  return {
    filePath: `/t79/${filename}`,
    frontmatter: { title, id: filename, created: "2026-11-07T10:00:00.000Z", updated: "2026-11-07T10:00:00.000Z", layout: { direction: "LR" } },
    nodes,
    rootId,
    preamble: "",
  };
}

interface RecordedRequest {
  method: string;
  pathname: string;
  search: string;
  body: unknown;
}

interface MockApi {
  /** Aktueller Stand je Datei (Dateiname → Markdown). */
  saved: Map<string, string>;
  /** Alle Aufrufe der Oberfläche an `/api/mindmaps…` in Reihenfolge. */
  requests: RecordedRequest[];
  /** true → DELETE scheitert mit 500. */
  failDelete: boolean;
}

/** Liefert die Karten `files` (Dateiname → Titel) aus dem Speicher des Tests; die erste wird beim Start geöffnet. */
async function installDocApi(page: Page, files: Record<string, string>, bodies: Record<string, string> = {}): Promise<MockApi> {
  const api: MockApi = { saved: new Map(), requests: [], failDelete: false };
  for (const [filename, title] of Object.entries(files)) api.saved.set(filename, starterMarkdown(title, bodies[filename] ?? ""));
  const json = (route: Parameters<Parameters<Page["route"]>[1]>[0], body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(
    (url) => url.pathname === "/api/mindmaps" || /^\/api\/mindmaps\/[^/]+$/.test(url.pathname),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      let body: unknown = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = null;
      }
      api.requests.push({ method, pathname: url.pathname, search: url.search, body });
      if (url.pathname === "/api/mindmaps") {
        if (method === "GET") {
          const list = [...api.saved.entries()].map(([filename, markdown]) => ({ filename, frontmatter: documentFromMarkdown(filename, markdown).frontmatter }));
          return json(route, { files: list, storageMode: "filesystem" });
        }
        if (method === "POST") {
          const { filename, markdown } = body as { filename: string; markdown: string };
          api.saved.set(filename, markdown);
          return json(route, { filePath: filename }, 201);
        }
        return route.fallback();
      }
      const filename = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      if (method === "GET") {
        const markdown = api.saved.get(filename);
        if (markdown === undefined) return json(route, { error: "Mindmap not found." }, 404);
        return json(route, documentFromMarkdown(filename, markdown));
      }
      if (method === "PUT") {
        api.saved.set(filename, (body as { markdown: string }).markdown);
        return json(route, { filePath: filename });
      }
      if (method === "PATCH") {
        const { newFilename } = body as { newFilename: string };
        const markdown = api.saved.get(filename);
        if (markdown === undefined) return json(route, { error: "Mindmap not found." }, 404);
        api.saved.delete(filename);
        api.saved.set(newFilename, markdown);
        // Antwortform der echten Route: Der Host prüft `success` und `newFilePath`.
        return json(route, { success: true, newFilePath: newFilename, newFilename });
      }
      if (method === "DELETE") {
        if (api.failDelete) return json(route, { error: "t79 forced failure" }, 500);
        api.saved.delete(filename);
        return json(route, { ok: true });
      }
      return route.fallback();
    },
  );
  return api;
}

const rootOf = (page: Page, title: string) => page.locator(`[data-testid="mindmap-node"][data-node-label="${title}"]`).first();
const drawerRow = (page: Page, filename: string) => page.locator(`[data-testid="file-drawer-item"][data-filename="${filename}"]`);

async function openFileBrowser(page: Page) {
  await page.getByTitle(/Open file browser|Datei-Browser/).click();
  await expect(page.getByTestId("file-drawer")).toBeVisible();
}

async function openByTitle(page: Page, title: string) {
  await page.keyboard.press("Control+K");
  await page.getByTestId("command-palette-input").fill(title);
  await page.getByTestId("command-palette-item-mindmap").first().click();
  await expect(page.getByTestId("command-palette-input")).toHaveCount(0);
  await expect(rootOf(page, title)).toBeVisible();
}

/** Fügt dem offenen Dokument einen Knoten hinzu. */
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

function names(run: number, keys: string[]) {
  const files: Record<string, string> = {};
  const titles: Record<string, string> = {};
  for (const key of keys) {
    files[key] = `t79-${key}-${run}.md`;
    titles[key] = `T79 ${key.toUpperCase()} ${run}`;
  }
  return { files, titles, map: Object.fromEntries(keys.map((key) => [files[key]!, titles[key]!])) };
}

/** Kein Aufruf der Oberfläche trägt einen `workspace`-Parameter, solange kein Cloud-Workspace offen ist (K9, Gegenpol). */
function expectNoWorkspaceParam(api: MockApi) {
  expect(api.requests.length).toBeGreaterThan(0);
  expect(api.requests.filter((entry) => /[?&]workspace=/.test(entry.search))).toEqual([]);
}

test.describe("Plattform-Adapter: Dateien und API im Web @t79", () => {
  test.setTimeout(120_000);

  test("K1/K6/K11: Dateibrowser und Befehlspalette listen dieselben Karten, Klick öffnet sie im Canvas @t79", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a", "b"]);
    const email = uniqueEmail("list");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, map);
    const watch = watchPage(page);
    await login(page, email);
    await expect(rootOf(page, titles.start!)).toBeVisible();

    // K1: Dateibrowser — vollständige Liste, Klick öffnet die Karte im Canvas
    await openFileBrowser(page);
    for (const key of ["start", "a", "b"]) await expect(drawerRow(page, files[key]!)).toBeVisible();
    await expect(page.getByTestId("file-drawer-item")).toHaveCount(3);
    await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${files.a}"]`).click();
    await expect(rootOf(page, titles.a!)).toBeVisible();

    // K6: Befehlspalette — gleiche Karten wie der Dateibrowser, Öffnen funktioniert
    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill("T79");
    await expect(page.getByTestId("command-palette-item-mindmap")).toHaveCount(3);
    const labels = await page.getByTestId("command-palette-item-mindmap").allInnerTexts();
    for (const key of ["start", "a", "b"]) expect(labels.join("\n")).toContain(titles[key]!);
    await page.getByTestId("command-palette-input").fill(titles.b!);
    await page.getByTestId("command-palette-item-mindmap").first().click();
    await expect(page.getByTestId("command-palette-input")).toHaveCount(0);
    await expect(rootOf(page, titles.b!)).toBeVisible();

    // Adapter-Vertrag: Liste per GET /api/mindmaps, Lesen per GET /api/mindmaps/<datei>, ohne workspace-Parameter
    expect(api.requests.some((entry) => entry.method === "GET" && entry.pathname === "/api/mindmaps")).toBe(true);
    expect(api.requests.some((entry) => entry.method === "GET" && entry.pathname === `/api/mindmaps/${encodeURIComponent(files.a!)}`)).toBe(true);
    expectNoWorkspaceParam(api);
    watch.expectClean();
  });

  test("K1/K11: gegen den echten Server — Liste, Beispielkarte öffnet im Canvas @t79", async ({ page, request }) => {
    const email = uniqueEmail("real-read");
    await createAccount(request, email);
    await prepare(page);
    const watch = watchPage(page);
    await login(page, email);

    const listed = await page.evaluate(async () => {
      const response = await fetch("/api/mindmaps");
      return { status: response.status, files: ((await response.json()) as { files: Array<{ filename: string }> }).files.map((file) => file.filename) };
    });
    expect(listed.status).toBe(200);
    expect(listed.files).toContain("typescript-basics.md");

    await openFileBrowser(page);
    await expect(drawerRow(page, "typescript-basics.md")).toBeVisible();
    for (const filename of listed.files.slice(0, 5)) await expect(drawerRow(page, filename)).toBeVisible();
    await page.locator('[data-testid="file-drawer-open-file"][data-filename="typescript-basics.md"]').click();
    // Die Beispielkarte heißt „TypeScript Basics“, ihre Wurzel „TypeScript“ (Tab trägt den Kartentitel).
    await expect(page.getByRole("tab", { name: "TypeScript Basics" })).toHaveAttribute("aria-selected", "true");
    await expect(rootOf(page, "TypeScript")).toBeVisible();
    await expect(rootOf(page, "Typen")).toBeVisible();

    // Befehlspalette findet dieselbe Karte und öffnet sie (bleibt derselbe Tab, kein Fehler)
    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill("TypeScript Basics");
    await page.getByTestId("command-palette-item-mindmap").first().click();
    await expect(page.getByTestId("command-palette-input")).toHaveCount(0);
    await expect(rootOf(page, "TypeScript")).toBeVisible();
    watch.expectClean();
  });

  test("K2/K11: neue Karte über die Toolbar erscheint in der Liste und lässt sich öffnen @t79", async ({ page, request }) => {
    const run = Date.now();
    const { titles, map } = names(run, ["start"]);
    const email = uniqueEmail("create");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, map);
    const watch = watchPage(page);
    await login(page, email);
    await expect(rootOf(page, titles.start!)).toBeVisible();

    const created = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/mindmaps" && response.request().method() === "POST");
    await page.getByTestId("toolbar-new").click();
    const response = await created;
    expect(response.status()).toBe(201);
    const body = response.request().postDataJSON() as { filename: string; markdown: string };
    expect(body.filename).toMatch(/\.md$/);
    expect(body.markdown).toContain("# ");
    await expect(page.locator('[data-node-label="Neue Mindmap"], [data-node-label="New Mindmap"]').first()).toBeVisible();
    expect(api.saved.has(body.filename)).toBe(true);

    // Zurück auf die Startkarte, dann die neue Karte über den Dateibrowser wieder öffnen
    await openByTitle(page, titles.start!);
    await openFileBrowser(page);
    await expect(drawerRow(page, body.filename)).toBeVisible();
    await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${body.filename}"]`).click();
    await expect(page.locator('[data-node-label="Neue Mindmap"], [data-node-label="New Mindmap"]').first()).toBeVisible();
    expectNoWorkspaceParam(api);
    watch.expectClean();
  });

  test("K3/K11: Karte ändern, speichern, neu laden — Änderung bleibt, keine Fehlermeldung @t79", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start"]);
    const email = uniqueEmail("save");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, map);
    const watch = watchPage(page);
    await login(page, email);
    await expect(rootOf(page, titles.start!)).toBeVisible();
    const nodesBefore = await page.locator('[data-testid="mindmap-node"]').count();

    await addChildNode(page);
    const saved = page.waitForResponse((response) => response.url().includes(`/api/mindmaps/${encodeURIComponent(files.start!)}`) && response.request().method() === "PUT");
    await page.getByTestId("toolbar-save").click();
    const putResponse = await saved;
    expect(putResponse.ok()).toBe(true);
    const putBody = putResponse.request().postDataJSON() as { markdown: string };
    expect(headingCount(putBody.markdown)).toBe(nodesBefore + 1);
    expect(headingCount(api.saved.get(files.start!))).toBe(nodesBefore + 1);
    // Leeres role=alert gehört dem Next.js-Routenansager; eine Fehlermeldung hätte Text.
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
    await expect(rootOf(page, titles.start!)).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(nodesBefore + 1);
    expectNoWorkspaceParam(api);
    watch.expectClean();
  });

  test("K4/K11: Karte im Dateibrowser umbenennen — neuer Name erscheint, alter nicht mehr @t79", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a"]);
    const email = uniqueEmail("rename");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, map);
    const watch = watchPage(page);
    await login(page, email);
    await expect(rootOf(page, titles.start!)).toBeVisible();

    await openFileBrowser(page);
    const row = drawerRow(page, files.a!);
    await expect(row).toBeVisible();
    await row.click({ button: "right", position: { x: 24, y: 18 } });
    await page.getByTestId("file-context-rename").click();
    const dialog = page.getByTestId("rename-mindmap-dialog");
    await expect(dialog).toBeVisible();
    const renamedTitle = `T79 Umbenannt ${run}`;
    const renamedFilename = `t79-umbenannt-${run}.md`;
    await page.getByTestId("rename-mindmap-input").fill(renamedTitle);
    const patched = page.waitForResponse((response) => response.url().includes(`/api/mindmaps/${encodeURIComponent(files.a!)}`) && response.request().method() === "PATCH");
    await page.getByTestId("rename-mindmap-submit").click();
    const patchResponse = await patched;
    expect(patchResponse.ok()).toBe(true);
    expect(patchResponse.request().postDataJSON()).toEqual({ newFilename: renamedFilename });
    await expect(dialog).toHaveCount(0);

    await openFileBrowser(page);
    await expect(drawerRow(page, renamedFilename)).toBeVisible();
    await expect(drawerRow(page, files.a!)).toHaveCount(0);
    await expect(page.getByTestId("file-drawer-item").filter({ hasText: titles.a! })).toHaveCount(0);
    expect(api.saved.has(renamedFilename)).toBe(true);
    expect(api.saved.has(files.a!)).toBe(false);
    expect(api.saved.get(renamedFilename)).toContain(`title: ${renamedTitle}`);
    expectNoWorkspaceParam(api);
    watch.expectClean();
  });

  test("K5/K11: Karte löschen verschwindet aus der Liste; Fehler beim Löschen wird angezeigt, nicht verschluckt @t79", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["start", "a", "b"]);
    const email = uniqueEmail("delete");
    await createAccount(request, email);
    await prepare(page);
    const api = await installDocApi(page, map);
    const watch = watchPage(page);
    await login(page, email);
    await expect(rootOf(page, titles.start!)).toBeVisible();

    // Fehlerfall zuerst: DELETE scheitert, die Karte bleibt, die Meldung ist sichtbar
    api.failDelete = true;
    await openFileBrowser(page);
    await drawerRow(page, files.a!).click({ button: "right", position: { x: 24, y: 18 } });
    await page.getByTestId("file-context-delete").click();
    await page.getByTestId("file-context-confirm-delete").click();
    await expect(page.getByText(/Mindmap konnte nicht gelöscht werden|could not be deleted/i).first()).toBeVisible();
    expect(api.requests.some((entry) => entry.method === "DELETE" && entry.pathname === `/api/mindmaps/${encodeURIComponent(files.a!)}`)).toBe(true);
    expect(api.saved.has(files.a!)).toBe(true);

    // Erfolgsfall: Karte verschwindet aus Liste und Speicher
    api.failDelete = false;
    await page.keyboard.press("Escape");
    const stillOpen = await page.getByTestId("file-drawer").isVisible();
    if (!stillOpen) await openFileBrowser(page);
    const row = drawerRow(page, files.b!);
    await expect(row).toBeVisible();
    await row.click({ button: "right", position: { x: 24, y: 18 } });
    await page.getByTestId("file-context-delete").click();
    await page.getByTestId("file-context-confirm-delete").click();
    await expect(drawerRow(page, files.b!)).toHaveCount(0);
    expect(api.saved.has(files.b!)).toBe(false);
    expectNoWorkspaceParam(api);
    watch.expectClean([/^DELETE \/api\/mindmaps\/.* 500$/, /Delete failed|Mindmap konnte nicht gelöscht|t79 forced failure/]);
  });

  test("K7/K11: Map-Auswahl (Portal) und Backlinks auf die Zielmap funktionieren @t79", async ({ page, request }) => {
    const run = Date.now();
    const { files, titles, map } = names(run, ["a", "b"]);
    const email = uniqueEmail("links");
    await createAccount(request, email);
    await prepare(page);
    // Karte B verlinkt per [[…]] auf die Wurzel von A; A wird beim Start geöffnet.
    const api = await installDocApi(page, map, { [files.b!]: `Siehe [[${files.a}#root-${slugOf(titles.a!)}|Karte A]].` });
    const watch = watchPage(page);
    await login(page, email);
    await expect(rootOf(page, titles.a!)).toBeVisible();

    // Backlinks: der Editor liest alle Karten über die Plattform und findet den Link aus B auf die Wurzel von A
    await rootOf(page, titles.a!).click();
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("node-editor")).toBeVisible();
    const backlink = page.getByTestId("node-backlink");
    await expect(backlink).toHaveCount(1);
    await expect(backlink).toContainText(titles.b!);
    expect(api.requests.some((entry) => entry.method === "GET" && entry.pathname === `/api/mindmaps/${encodeURIComponent(files.b!)}`)).toBe(true);

    // Map-Auswahl: Knotenart „Portal“ listet beide Karten, die Auswahl wird im Ziel-Panel angezeigt
    await page.getByTestId("node-kind-select").selectOption("portal");
    const select = page.getByTestId("node-portal-map-select");
    await expect(select.locator("option")).toHaveCount(3); // Platzhalter + 2 Karten
    await expect(select).toContainText(titles.a!);
    await expect(select).toContainText(titles.b!);
    await select.selectOption(files.b!);
    await expect(page.getByTestId("node-portal-panel")).toContainText(files.b!);
    expectNoWorkspaceParam(api);
    watch.expectClean();
  });

  test("K8/K11: Link-Vorschau einer externen URL lädt Titel und Beschreibung; Fehler zeigt verständliche Meldung @t79", async ({ page, request }) => {
    const run = Date.now();
    const { titles, map } = names(run, ["start"]);
    const email = uniqueEmail("preview");
    await createAccount(request, email);
    await prepare(page);
    await installDocApi(page, map);
    const watch = watchPage(page);
    const previewRequests: string[] = [];
    let mode: "ok" | "fail" | "real" = "ok";
    await page.route("**/api/link-preview?**", async (route) => {
      previewRequests.push(route.request().url());
      if (mode === "real") return route.continue();
      if (mode === "fail") {
        return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Die Seite ist nicht erreichbar (t79)." }) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ preview: { title: "T79 Beispieltitel", description: "T79 Beschreibung der Seite." } }),
      });
    });
    await login(page, email);
    await expect(rootOf(page, titles.start!)).toBeVisible();

    await rootOf(page, titles.start!).click();
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await page.getByTestId("node-kind-select").selectOption("web");
    const url = "https://example.com/t79?a=1&b=2";
    await page.getByTestId("node-url-input").fill(url);
    await page.getByTestId("node-url-input").blur();

    // Erfolg
    await page.getByRole("button", { name: "Website-Vorschau laden" }).click();
    await expect(page.getByTestId("node-metadata-editor")).toContainText("T79 Beispieltitel");
    await expect(page.getByTestId("node-metadata-editor")).toContainText("T79 Beschreibung der Seite.");
    expect(previewRequests).toHaveLength(1);
    expect(new URL(previewRequests[0]!).searchParams.get("url")).toBe(url);

    // Fehler des Servers: Meldung des Servers sichtbar
    mode = "fail";
    await page.getByRole("button", { name: "Website-Vorschau laden" }).click();
    await expect(page.getByText("Die Seite ist nicht erreichbar (t79).")).toBeVisible();

    // Unerreichbare URL gegen den echten Server: verständliche Meldung statt stillem Scheitern
    mode = "real";
    await page.getByTestId("node-url-input").fill("http://t79-nicht-erreichbar.invalid/");
    await page.getByTestId("node-url-input").blur();
    const real = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/link-preview");
    await page.getByRole("button", { name: "Website-Vorschau laden" }).click();
    const realResponse = await real;
    expect(realResponse.status()).toBeGreaterThanOrEqual(400);
    const message = page.locator("p.text-red-700");
    await expect(message).toBeVisible();
    const text = (await message.innerText()).trim();
    expect(text.length).toBeGreaterThan(5);
    expect(text).not.toMatch(/undefined|\[object|TypeError/);
    test.info().annotations.push({ type: "unerreichbare URL (echter Server)", description: `HTTP ${realResponse.status()}: ${text}` });

    watch.expectClean([/^GET \/api\/link-preview .*/, /link-preview|Link preview|Failed to fetch/i]);
  });

  test("K10/K11: Wiki-Seite und geteilte Ansicht laden ohne Fehler @t79", async ({ page }) => {
    await prepare(page);
    const watch = watchPage(page);

    await page.goto("/wiki");
    await expect(page.getByTestId("wiki-search")).toBeVisible();
    // Das Dev-System liefert nicht das Fixture-Bündel von wiki.spec.ts; geprüft wird, dass die Seite ohne Fehler lädt und zu Ende rendert.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main, [role=main], body").first()).toContainText(/\S/);

    // Ungültiger Token: gültige Tokens brauchen die Datenbank (nicht am Dev-System, siehe Dateikopf).
    const shared = await page.goto("/share/t79-ungueltiger-token");
    expect(shared?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Dieser Link ist nicht mehr gültig" })).toBeVisible();
    // `GET /api/wiki/proposals` antwortet 404 „Wiki proposals are not enabled.“, solange die Funktion nicht
    // aktiviert ist (Route unverändert, nicht Teil von #79); das ist gewolltes Verhalten, kein Fehler.
    watch.expectClean([/^GET \/api\/wiki\/proposals 404$/]);
  });
});
