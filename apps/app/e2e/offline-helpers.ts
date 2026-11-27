import { expect as baseExpect, type Browser, type BrowserContext, type Locator, type Page, type TestInfo, type WebSocketRoute } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// Shared helpers of the offline conflict E2E specs: @t261 (`offline-collaboration.spec.ts`) and @t346
// (`offline-t346.spec.ts`). Extracted unchanged from the @t261 spec so that both run on the same code.
// `routeWebSocket` below only forwards frames to the real sync server or closes the connection (lost network);
// it never fakes or rewrites sync content. Reset procedure: docs/offline-konflikt.md.

export const expect = baseExpect.configure({ timeout: 15_000 });

export const PASSWORD = "Testpass12345";
export const LOCAL_PROJECT = "chromium-offline";
export const localWorkspace = resolve(process.cwd(), "../../.qa/playwright-offline-workspace");
export const snapshotRoot = resolve(localWorkspace, ".snapshots");

export interface Run {
  local: boolean;
  origin: string;
  email: string;
  tag: string;
  /** Root title of the edited file, unique per run. */
  rootTitle: string;
  alphaFile: string;
  compareFile: string;
  /** Session of the test account, used for API calls that must not depend on a client being offline. */
  api: BrowserContext;
  /** Browser contexts of the two clients, closed by `finish`. */
  contexts: BrowserContext[];
}

export interface Client {
  label: "A" | "B";
  page: Page;
  /** Cuts the connection to the sync server (and HTTP) like a lost network. */
  goOffline(): Promise<void>;
  /** Only the sync server is unreachable; the page itself can still load (used to reload "offline"). */
  blockSyncOnly(): Promise<void>;
  goOnline(): Promise<void>;
  /** Interrupts the established connection once; the provider reconnects by itself. */
  dropConnection(): Promise<void>;
  /** Goes back online, waits until the provider has reached the sync server, then cuts the connection again (and keeps it cut). */
  reconnectThenCut(): Promise<void>;
  close(): Promise<void>;
}

export function alphaMarkdown(run: Pick<Run, "tag" | "rootTitle">): string {
  return [
    "---",
    `title: ${run.rootTitle}`,
    `id: offline-alpha-${run.tag}`,
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${run.rootTitle} <!-- bloommd:id=off-root -->`,
    "",
    "Ausgangsdatei für #261: zwei Clients bearbeiten sie getrennt offline.",
    "",
    "## Alpha <!-- bloommd:id=off-alpha -->",
    "",
    "## Beta <!-- bloommd:id=off-beta -->",
    "",
    "## Gamma <!-- bloommd:id=off-gamma -->",
    "",
  ].join("\n");
}

export function compareMarkdown(tag: string): string {
  return [
    "---",
    `title: Offline Vergleich ${tag}`,
    `id: offline-vergleich-${tag}`,
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# Offline Vergleich ${tag} <!-- bloommd:id=cmp-root -->`,
    "",
    "Unveränderte Vergleichsdatei: bleibt während des gesamten Tests unverändert.",
    "",
    "## Alpha <!-- bloommd:id=cmp-alpha -->",
    "",
    "## Beta <!-- bloommd:id=cmp-beta -->",
    "",
  ].join("\n");
}

export const apiUrl = (filename: string, suffix = "") => `/api/mindmaps/${encodeURIComponent(filename)}${suffix}`;

export async function createFile(run: Run, filename: string, markdown: string) {
  const response = await run.api.request.post("/api/mindmaps", { headers: { Origin: run.origin }, data: { filename, markdown } });
  expect(response.status(), `create ${filename}: ${await response.text()}`).toBe(201);
}

/** Signs up the test account in a first client context and creates the starting files through the app API. */
export async function startRun(browser: Browser, testInfo: TestInfo, options: { viewport?: Viewport } = {}): Promise<{ run: Run; a: Client; b: Client }> {
  testInfo.setTimeout(240_000);
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const run = {
    // Own configs of later tickets (e.g. "chromium-offline-t346") run against the same local servers.
    local: testInfo.project.name === LOCAL_PROJECT || testInfo.project.name.startsWith(`${LOCAL_PROJECT}-`),
    origin: "",
    email: `offline-${tag}@bloommd.local`,
    tag,
    rootTitle: `Offline Alpha ${tag}`,
    alphaFile: `offline-alpha-${tag}.md`,
    compareFile: `offline-vergleich-${tag}.md`,
    contexts: [],
  } as unknown as Run;

  const a = await openClient(browser, run, "A", options.viewport);
  await createFile(run, run.alphaFile, alphaMarkdown(run));
  await createFile(run, run.compareFile, compareMarkdown(tag));
  await openDocument(a.page, run);
  const b = await openClient(browser, run, "B", options.viewport);
  await openDocument(b.page, run);
  return { run, a, b };
}

export interface Viewport { width: number; height: number }

export async function openClient(browser: Browser, run: Run, label: "A" | "B", viewport: Viewport = { width: 1600, height: 900 }): Promise<Client> {
  // The sync status is only shown from the 2xl breakpoint (1536px), so the width must stay at 1536 or more.
  let context: BrowserContext;
  // The first client signs the account up; a client that opens later (after a restore) uses the account.
  const signup = label === "A" && !run.api;
  if (signup) {
    context = await browser.newContext({ viewport });
  } else {
    // Same account, own browser storage (own offline queue).
    context = await browser.newContext({ viewport, storageState: await run.api.storageState() });
  }
  run.contexts.push(context);
  const page = await context.newPage();
  const state = { blocked: false, route: null as WebSocketRoute | null };
  await page.routeWebSocket(/\/ws\//, (route) => {
    if (state.blocked) {
      void route.close({ code: 1000, reason: "offline" });
      return;
    }
    state.route = route;
    route.connectToServer();
    route.onClose(() => {
      if (state.route === route) state.route = null;
    });
  });
  await page.addInitScript((deviceLabel) => {
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-device-label", deviceLabel);
    // Das Testsystem läuft über HTTP (kein sicherer Kontext): `crypto.randomUUID` fehlt dort, neue Knoten scheitern.
    // Die Shim gleicht nur diese Umgebung aus; wo die Funktion existiert (lokal, HTTPS), bleibt sie unberührt.
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
  }, `Gerät ${label}`);

  if (signup) {
    await page.goto(`/signup?next=%2Fapp%3Flang%3Den&lang=en`);
    await page.getByLabel("Name").fill("Offline Test");
    await page.getByLabel("Email").fill(run.email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByTestId("signup-consent").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/app");
    await expect(page.getByTestId("mindmap-canvas")).toBeVisible({ timeout: 90_000 });
    run.origin = new URL(page.url()).origin;
    // API session of the same account; it never goes offline.
    run.api = await browser.newContext({ storageState: await context.storageState() });
  } else {
    await page.goto(`/app?lang=en`);
    await expect(page.getByTestId("mindmap-canvas")).toBeVisible({ timeout: 90_000 });
  }

  const reconnectIfFailed = async () => {
    const retry = page.getByRole("button", { name: "Reconnect" });
    if (await retry.isVisible().catch(() => false)) await retry.click();
  };
  return {
    label,
    page,
    async goOffline() {
      state.blocked = true;
      await context.setOffline(true);
      await state.route?.close({ code: 1000, reason: "offline" });
      await expect(page.getByTestId("sync-status")).not.toContainText("Synced");
    },
    async blockSyncOnly() {
      state.blocked = true;
      await context.setOffline(false);
    },
    async goOnline() {
      state.blocked = false;
      await context.setOffline(false);
      await expect
        .poll(async () => {
          await reconnectIfFailed();
          return page.getByTestId("sync-status").innerText();
        }, { timeout: 60_000 })
        .toContain("Synced");
    },
    async reconnectThenCut() {
      state.blocked = false;
      await context.setOffline(false);
      await expect
        .poll(async () => {
          await reconnectIfFailed();
          return state.route !== null;
        }, { timeout: 60_000 })
        .toBe(true);
      state.blocked = true;
      await state.route?.close({ code: 1000, reason: "cut during reconnect" });
      await expect(page.getByTestId("sync-status")).not.toContainText("Synced");
    },
    async dropConnection() {
      if (!state.route) throw new Error("No active sync WebSocket route found.");
      await state.route.close({ code: 1000, reason: "test interruption" });
    },
    close: () => context.close(),
  };
}

/**
 * Opens the run's file through the file browser unless it is already shown (a reload may reopen it).
 * Without `requireSync` (reload while the sync server is unreachable) it does not wait for "Synced".
 */
export async function openDocument(page: Page, run: Run, options: { requireSync: boolean; titles?: string[] } = { requireSync: true }) {
  // After a reload the app restores the open tab itself; opening the file again would replace the restored
  // (offline) state with the server version. Only open it when the tab does not come back.
  const restored = await node(page, run.rootTitle).waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
  if (!restored) {
    await page.getByTitle(/Open file browser|Datei-Browser/).click();
    await page.getByTestId("file-browser-search").fill(run.rootTitle);
    await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${run.alphaFile}"]`).click();
    await expect(node(page, run.rootTitle)).toBeVisible();
    if (await page.getByTestId("file-drawer").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  }
  if (!options.requireSync) return;
  for (const title of options.titles ?? ["Alpha", "Beta", "Gamma"]) await expect(node(page, title)).toBeVisible();
  const status = page.getByTestId("sync-status");
  await expect(status, `sync status: ${await status.innerText().catch(() => "n/a")}`).toContainText("Synced", { timeout: 30_000 });
}

export function node(page: Page, title: string): Locator {
  return page.locator(`[data-node-label="${title}"]`).first();
}

export function conflictCopy(page: Page, title: string, device: string): Locator {
  return page.locator(`[data-node-label^="Konflikt: ${title} (${device}, "]`);
}

export async function rename(page: Page, from: string, to: string) {
  const target = node(page, from);
  await target.click();
  await target.press("r");
  const input = page.getByTestId("node-rename-input");
  await expect(input).toBeVisible();
  await input.fill(to);
  await input.press("Enter");
  await expect(node(page, to)).toBeVisible();
}

export async function addChild(page: Page, parent: string, title: string) {
  await node(page, parent).click();
  await page.getByTestId("node-action-add-child").click();
  const created = page.locator('[data-node-label="New node"], [data-node-label="Neuer Node"]').first();
  await expect(created).toBeVisible();
  const input = created.locator("input");
  await expect(input).toBeFocused();
  await input.fill(title);
  await input.press("Enter");
  await expect(node(page, title)).toBeVisible();
}

/** The local edits reached the device's own storage; only then does a reload keep them. */
export async function expectQueued(page: Page) {
  await expect(page.getByTestId("sync-offline-pending")).toBeVisible();
}

export async function labels(page: Page): Promise<string[]> {
  return page.locator("[data-node-label]").evaluateAll((elements) => [...new Set(elements.map((element) => element.getAttribute("data-node-label") ?? ""))].sort());
}

export interface ServerDocument {
  frontmatter: unknown;
  nodes: Record<string, { title: string }>;
  rootId: string;
  storage?: { version?: number };
}

/** What the app stores for the file, read through the app API (not from a disk). */
export async function readServerDocument(run: Run, filename: string): Promise<ServerDocument> {
  const response = await run.api.request.get(apiUrl(filename), { headers: { Origin: run.origin } });
  expect(response.ok(), `read ${filename}: ${response.status()}`).toBe(true);
  return (await response.json()) as ServerDocument;
}

/** All node titles of the stored file (with duplicates), sorted. */
export async function serverTitles(run: Run, filename = run.alphaFile): Promise<string[]> {
  const doc = await readServerDocument(run, filename);
  return Object.values(doc.nodes).map((entry) => entry.title).sort();
}

export const unique = (values: string[]) => [...new Set(values)].sort();
export const countOf = (titles: string[], predicate: (title: string) => boolean) => titles.filter(predicate).length;

/** Fingerprint of the comparison file: content and version as the app reports them. */
export async function fingerprint(run: Run, filename: string): Promise<string> {
  const doc = await readServerDocument(run, filename);
  return JSON.stringify({ frontmatter: doc.frontmatter, nodes: doc.nodes, rootId: doc.rootId, version: doc.storage?.version ?? null });
}

/** Markdown export through the UI (menu entry "Markdown"); returns the downloaded text. */
export async function exportMarkdown(page: Page): Promise<string> {
  const download = page.waitForEvent("download");
  await page.getByTestId("toolbar-export").click();
  await page.getByTestId("export-markdown").click();
  return readFile((await (await download).path())!, "utf8");
}

export const exportedHeadings = (markdown: string) => [...markdown.matchAll(/^#{1,6} (.+?)(?: <!--.*)?$/gm)].map((match) => match[1]!).sort();

// --- local mode: pre-merge snapshots of the sync server -------------------------------------------

export interface Snapshot { meta: { filename: string; device: string; conflictNodeIds: string[] }; server: string; client: string }

export async function readLocalSnapshots(run: Run): Promise<Snapshot[]> {
  const rooms = await readdir(snapshotRoot).catch(() => []);
  const result: Snapshot[] = [];
  for (const room of rooms) {
    for (const id of (await readdir(resolve(snapshotRoot, room))).sort()) {
      const dir = resolve(snapshotRoot, room, id);
      const meta = JSON.parse(await readFile(resolve(dir, "meta.json"), "utf8")) as Snapshot["meta"];
      if (!meta.filename.includes(run.tag)) continue;
      result.push({ meta, server: await readFile(resolve(dir, "server.md"), "utf8"), client: await readFile(resolve(dir, "client.md"), "utf8") });
    }
  }
  return result;
}

// --- restore through the version history API ---------------------------------------------------------

export interface HistoryResponse { source: "local" | "cloud"; canRestore: boolean; revisions: Array<{ id: string; replacedAt: string }> }

/** The version history of a file as the app reports it (the list the UI shows), newest first. */
export async function readHistory(run: Run, filename: string): Promise<HistoryResponse> {
  const response = await run.api.request.get(apiUrl(filename, "/history"), { headers: { Origin: run.origin } });
  expect(response.ok(), `history ${filename}: ${response.status()}`).toBe(true);
  return (await response.json()) as HistoryResponse;
}

/** Restores one version of the history through the app API; retries while the room is still occupied. */
export async function restoreVersion(run: Run, filename: string, revisionId: string): Promise<string[]> {
  await expect
    .poll(async () => (await run.api.request.post(apiUrl(filename, "/history"), { headers: { Origin: run.origin }, data: { revisionId } })).status(), { timeout: 60_000, intervals: [1_000, 2_000, 3_000] })
    .toBe(200);
  return serverTitles(run, filename);
}

/**
 * Restoring a note of a folder writes its file. A sync room that is still alive would keep (and later
 * persist) the old state, so the clients are closed first and the room is given time to go away:
 * locally the health endpoint of the sync server tells, on a running system its idle time
 * (`SYNC_DESTROY_DELAY`, 30 s by default) is waited out.
 */
export async function waitForEmptyRoom(run: Run) {
  if (!run.local) {
    await new Promise((done) => setTimeout(done, Number(process.env.PLAYWRIGHT_SYNC_ROOM_IDLE_MS ?? 35_000)));
    return;
  }
  const syncPort = process.env.PLAYWRIGHT_OFFLINE_SYNC_PORT ?? "4612";
  await expect
    .poll(async () => ((await (await fetch(`http://localhost:${syncPort}/health`)).json()) as { rooms: number }).rooms, { timeout: 30_000, intervals: [500, 1_000] })
    .toBe(0);
}

/**
 * Restores every stored version of the file one after the other (version history API) and returns the
 * node titles each of them yields. Needs the room to be empty, so the clients are closed first.
 */
export async function restoreAllVersions(run: Run, filename: string): Promise<string[][]> {
  const { revisions, canRestore } = await readHistory(run, filename);
  expect(canRestore).toBe(true);
  expect(revisions.length).toBeGreaterThanOrEqual(2);
  const results: string[][] = [];
  for (const revision of revisions) results.push(await restoreVersion(run, filename, revision.id));
  return results;
}

// --- cleanup --------------------------------------------------------------------------------------

export async function deleteFile(run: Run, filename: string) {
  // A room that still has clients refuses the change, so retry for a moment.
  await expect
    .poll(async () => {
      const response = await run.api.request.delete(apiUrl(filename), { headers: { Origin: run.origin } });
      return response.ok() || response.status() === 404;
    }, { timeout: 30_000, intervals: [1_000, 2_000] })
    .toBe(true);
}

/** Removes the run's files and, where the system allows it, the test account. */
export async function finish(run: Run | undefined, testInfo: TestInfo) {
  if (!run) return;
  for (const context of run.contexts) await context.close().catch(() => undefined);
  if (!run.api) return;
  try {
    for (const filename of [run.alphaFile, run.compareFile]) await deleteFile(run, filename);
    const response = await run.api.request.post("/api/account/delete", {
      headers: { Origin: run.origin },
      form: { confirmation: run.email, password: PASSWORD },
      maxRedirects: 0,
    });
    const location = response.headers().location ?? "";
    if (response.status() !== 303 || location.includes("accountError")) {
      testInfo.annotations.push({ type: "cleanup", description: `Test account ${run.email} was not deleted (status ${response.status()}); files are removed.` });
    }
  } catch (error) {
    testInfo.annotations.push({ type: "cleanup", description: `Cleanup of ${run.email} incomplete: ${error instanceof Error ? error.message : String(error)}` });
  } finally {
    await run.api.close().catch(() => undefined);
  }
}

