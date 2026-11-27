import { expect as baseExpect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo, type WebSocketRoute } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// @t261 — W1: two clients edit the same Markdown file separately offline, reconnect, and nothing is
// lost. A real content conflict becomes visible and is resolved by rule A (the server room leads,
// the state that reached the server last stays in the node, the other one becomes a
// "Konflikt: …" sibling with device and time). Reset procedure: docs/offline-konflikt.md.
//
// Two modes, one spec:
// - local (`playwright.offline.config.ts`, project `chromium-offline`): own sync server and workspace
//   folder; the pre-merge snapshots are read from that folder.
// - test system (`playwright.testsystem.config.ts`): an already running system, nothing on its disk is
//   reachable. The test creates its starting files itself (unique names per run) and checks content,
//   comparison file, export and restore only through the UI and the app API (version history).
// In both modes both clients use the same account, so they share the cloud document there.

const expect = baseExpect.configure({ timeout: 15_000 });

const PASSWORD = "Testpass12345";
const LOCAL_PROJECT = "chromium-offline";
const localWorkspace = resolve(process.cwd(), "../../.qa/playwright-offline-workspace");
const snapshotRoot = resolve(localWorkspace, ".snapshots");

interface Run {
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

interface Client {
  label: "A" | "B";
  page: Page;
  /** Cuts the connection to the sync server (and HTTP) like a lost network. */
  goOffline(): Promise<void>;
  /** Only the sync server is unreachable; the page itself can still load (used to reload "offline"). */
  blockSyncOnly(): Promise<void>;
  goOnline(): Promise<void>;
  /** Interrupts the established connection once; the provider reconnects by itself. */
  dropConnection(): Promise<void>;
  close(): Promise<void>;
}

function alphaMarkdown(run: Pick<Run, "tag" | "rootTitle">): string {
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

function compareMarkdown(tag: string): string {
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

const apiUrl = (filename: string, suffix = "") => `/api/mindmaps/${encodeURIComponent(filename)}${suffix}`;

async function createFile(run: Run, filename: string, markdown: string) {
  const response = await run.api.request.post("/api/mindmaps", { headers: { Origin: run.origin }, data: { filename, markdown } });
  expect(response.status(), `create ${filename}: ${await response.text()}`).toBe(201);
}

/** Signs up the test account in a first client context and creates the starting files through the app API. */
async function startRun(browser: Browser, testInfo: TestInfo): Promise<{ run: Run; a: Client; b: Client }> {
  testInfo.setTimeout(240_000);
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const run = {
    local: testInfo.project.name === LOCAL_PROJECT,
    origin: "",
    email: `offline-${tag}@bloommd.local`,
    tag,
    rootTitle: `Offline Alpha ${tag}`,
    alphaFile: `offline-alpha-${tag}.md`,
    compareFile: `offline-vergleich-${tag}.md`,
    contexts: [],
  } as unknown as Run;

  const a = await openClient(browser, run, "A");
  await createFile(run, run.alphaFile, alphaMarkdown(run));
  await createFile(run, run.compareFile, compareMarkdown(tag));
  await openDocument(a.page, run);
  const b = await openClient(browser, run, "B");
  await openDocument(b.page, run);
  return { run, a, b };
}

async function openClient(browser: Browser, run: Run, label: "A" | "B"): Promise<Client> {
  // The sync status is only shown from the 2xl breakpoint (1536px).
  const viewport = { width: 1600, height: 900 };
  let context: BrowserContext;
  if (label === "A") {
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
  }, `Gerät ${label}`);

  if (label === "A") {
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
async function openDocument(page: Page, run: Run, options: { requireSync: boolean } = { requireSync: true }) {
  if (!(await node(page, run.rootTitle).isVisible().catch(() => false))) {
    await page.getByTitle(/Open file browser|Datei-Browser/).click();
    await page.getByTestId("file-browser-search").fill(run.rootTitle);
    await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${run.alphaFile}"]`).click();
    await expect(node(page, run.rootTitle)).toBeVisible();
    if (await page.getByTestId("file-drawer").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  }
  if (!options.requireSync) return;
  for (const title of ["Alpha", "Beta", "Gamma"]) await expect(node(page, title)).toBeVisible();
  const status = page.getByTestId("sync-status");
  await expect(status, `sync status: ${await status.innerText().catch(() => "n/a")}`).toContainText("Synced", { timeout: 30_000 });
}

function node(page: Page, title: string): Locator {
  return page.locator(`[data-node-label="${title}"]`).first();
}

function conflictCopy(page: Page, title: string, device: string): Locator {
  return page.locator(`[data-node-label^="Konflikt: ${title} (${device}, "]`);
}

async function rename(page: Page, from: string, to: string) {
  const target = node(page, from);
  await target.click();
  await target.press("r");
  const input = page.getByTestId("node-rename-input");
  await expect(input).toBeVisible();
  await input.fill(to);
  await input.press("Enter");
  await expect(node(page, to)).toBeVisible();
}

async function addChild(page: Page, parent: string, title: string) {
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
async function expectQueued(page: Page) {
  await expect(page.getByTestId("sync-offline-pending")).toBeVisible();
}

async function labels(page: Page): Promise<string[]> {
  return page.locator("[data-node-label]").evaluateAll((elements) => [...new Set(elements.map((element) => element.getAttribute("data-node-label") ?? ""))].sort());
}

interface ServerDocument {
  frontmatter: unknown;
  nodes: Record<string, { title: string }>;
  rootId: string;
  storage?: { version?: number };
}

/** What the app stores for the file, read through the app API (not from a disk). */
async function readServerDocument(run: Run, filename: string): Promise<ServerDocument> {
  const response = await run.api.request.get(apiUrl(filename), { headers: { Origin: run.origin } });
  expect(response.ok(), `read ${filename}: ${response.status()}`).toBe(true);
  return (await response.json()) as ServerDocument;
}

/** All node titles of the stored file (with duplicates), sorted. */
async function serverTitles(run: Run, filename = run.alphaFile): Promise<string[]> {
  const doc = await readServerDocument(run, filename);
  return Object.values(doc.nodes).map((entry) => entry.title).sort();
}

const unique = (values: string[]) => [...new Set(values)].sort();
const countOf = (titles: string[], predicate: (title: string) => boolean) => titles.filter(predicate).length;

/** Fingerprint of the comparison file: content and version as the app reports them. */
async function fingerprint(run: Run, filename: string): Promise<string> {
  const doc = await readServerDocument(run, filename);
  return JSON.stringify({ frontmatter: doc.frontmatter, nodes: doc.nodes, rootId: doc.rootId, version: doc.storage?.version ?? null });
}

/** Markdown export through the UI (menu entry "Markdown"); returns the downloaded text. */
async function exportMarkdown(page: Page): Promise<string> {
  const download = page.waitForEvent("download");
  await page.getByTestId("toolbar-export").click();
  await page.getByTestId("export-markdown").click();
  return readFile((await (await download).path())!, "utf8");
}

const exportedHeadings = (markdown: string) => [...markdown.matchAll(/^#{1,6} (.+?)(?: <!--.*)?$/gm)].map((match) => match[1]!).sort();

// --- local mode: pre-merge snapshots of the sync server -------------------------------------------

interface Snapshot { meta: { filename: string; device: string; conflictNodeIds: string[] }; server: string; client: string }

async function readLocalSnapshots(run: Run): Promise<Snapshot[]> {
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

// --- test system mode: restore through the version history API -------------------------------------

/**
 * Restores every stored version of the file one after the other (version history API) and returns the
 * node titles each of them yields. Needs the room to be empty, so the clients are closed first.
 */
async function restoreAllVersions(run: Run, filename: string): Promise<string[][]> {
  const history = await run.api.request.get(apiUrl(filename, "/history"), { headers: { Origin: run.origin } });
  expect(history.ok(), `history: ${history.status()}`).toBe(true);
  const { revisions, canRestore } = (await history.json()) as { revisions: Array<{ id: string }>; canRestore: boolean };
  expect(canRestore).toBe(true);
  expect(revisions.length).toBeGreaterThanOrEqual(2);
  const results: string[][] = [];
  for (const revision of revisions) {
    await expect
      .poll(async () => (await run.api.request.post(apiUrl(filename, "/history"), { headers: { Origin: run.origin }, data: { revisionId: revision.id } })).status(), { timeout: 60_000, intervals: [1_000, 2_000, 3_000] })
      .toBe(200);
    results.push(await serverTitles(run, filename));
  }
  return results;
}

// --- cleanup --------------------------------------------------------------------------------------

async function deleteFile(run: Run, filename: string) {
  // A room that still has clients refuses the change, so retry for a moment.
  await expect
    .poll(async () => {
      const response = await run.api.request.delete(apiUrl(filename), { headers: { Origin: run.origin } });
      return response.ok() || response.status() === 404;
    }, { timeout: 30_000, intervals: [1_000, 2_000] })
    .toBe(true);
}

/** Removes the run's files and, where the system allows it, the test account. */
async function finish(run: Run | undefined, testInfo: TestInfo) {
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

test("@t261 two clients edit offline, conflict is visible and resolvable, nothing is lost", async ({ browser }, testInfo) => {
  let run: Run | undefined;
  try {
    const started = await startRun(browser, testInfo);
    run = started.run;
    const { a, b } = started;
    const compareBefore = await fingerprint(run, run.compareFile);

    // Starting point: both see Alpha, Beta, Gamma (openDocument checked it). The stored file has them, too.
    expect(await serverTitles(run)).toEqual([run.rootTitle, "Alpha", "Beta", "Gamma"].sort());

    // Both lose the connection and edit separately.
    await a.goOffline();
    await b.goOffline();
    await rename(a.page, "Alpha", "Alpha-A");
    await addChild(a.page, run.rootTitle, "Delta");
    await rename(b.page, "Alpha", "Alpha-B");
    await expectQueued(a.page);
    await expectQueued(b.page);

    // A reloads without a connection to the sync server: the local edits stay visible.
    await a.blockSyncOnly();
    await a.page.reload();
    await openDocument(a.page, run, { requireSync: false });
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(node(a.page, "Delta")).toBeVisible();
    await expect(a.page.getByTestId("sync-offline-pending")).toBeVisible();
    // The room has not seen any of it yet.
    expect(await serverTitles(run)).not.toContain("Alpha-A");

    // A reconnects first and delivers its edits; they are merged without any notice.
    await a.goOnline();
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(a.page.getByTestId("sync-conflicts")).toHaveCount(0);
    await expect.poll(async () => (await serverTitles(run!)).includes("Alpha-A"), { timeout: 20_000 }).toBe(true);
    await expect(a.page.getByTestId("sync-offline-pending")).toHaveCount(0);

    // B reconnects second: its state stays in the node, A's becomes the conflict copy.
    await b.goOnline();
    for (const client of [a, b]) {
      await expect(node(client.page, "Delta"), `Delta at ${client.label}`).toBeVisible();
      await expect(node(client.page, "Alpha-B"), `Alpha-B at ${client.label}`).toBeVisible();
      await expect(conflictCopy(client.page, "Alpha-A", "Gerät A"), `copy at ${client.label}`).toBeVisible();
      await expect(client.page.getByTestId("sync-conflicts-toggle"), `conflict at ${client.label}`).toBeVisible();
    }
    await expect(node(b.page, "Alpha-A")).toHaveCount(0);

    // The copy names device and time; the conflict list offers both resolutions.
    const copyTitle = (await conflictCopy(a.page, "Alpha-A", "Gerät A").getAttribute("data-node-label"))!;
    expect(copyTitle).toMatch(/^Konflikt: Alpha-A \(Gerät A, \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/);
    await b.page.getByTestId("sync-conflicts-toggle").click();
    await expect(b.page.getByTestId("sync-conflict")).toHaveCount(1);
    await expect(b.page.getByTestId("sync-conflict-adopt")).toBeVisible();
    await expect(b.page.getByTestId("sync-conflict-discard")).toBeVisible();
    await b.page.getByTestId("sync-conflicts-toggle").click();

    // The stored file has the conflict result (persisted after a short delay).
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return titles.includes("Alpha-B") && titles.includes("Delta") && titles.some((title) => title.startsWith("Konflikt: Alpha-A (Gerät A, "));
      }, { timeout: 20_000 })
      .toBe(true);

    // Local mode: both starting versions are in a snapshot of the sync server taken before the merge.
    if (run.local) {
      await expect.poll(async () => (await readLocalSnapshots(run!)).length, { timeout: 10_000 }).toBe(2);
      const snapshots = await readLocalSnapshots(run);
      const conflictSnapshot = snapshots.find((snapshot) => snapshot.meta.conflictNodeIds.length > 0)!;
      expect(conflictSnapshot.meta.device).toBe("Gerät B");
      expect(conflictSnapshot.server).toContain("## Alpha-A");
      expect(conflictSnapshot.server).toContain("## Delta");
      expect(conflictSnapshot.client).toContain("## Alpha-B");
      expect(snapshots[0]!.server).toContain("## Alpha ");
      expect(snapshots[0]!.client).toContain("## Alpha-A");
    }

    // Repeated connection and re-delivery create neither duplicate nodes nor another copy/snapshot.
    const before = await labels(a.page);
    await b.dropConnection();
    await expect(b.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    await b.dropConnection();
    await expect(b.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    await a.dropConnection();
    await expect(a.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 30_000 });
    expect(await labels(a.page)).toEqual(before);
    expect(await labels(b.page)).toEqual(before);
    if (run.local) expect((await readLocalSnapshots(run)).length).toBe(2);
    const afterRetries = await serverTitles(run);
    expect(countOf(afterRetries, (title) => title === "Delta")).toBe(1);
    expect(countOf(afterRetries, (title) => title.startsWith("Konflikt: Alpha-A"))).toBe(1);

    // A adopts the copied version: both show the same result and the copy is gone.
    await a.page.getByTestId("sync-conflicts-toggle").click();
    await a.page.getByTestId("sync-conflict-adopt").click();
    for (const client of [a, b]) {
      await expect(node(client.page, "Alpha-A"), `adopted at ${client.label}`).toBeVisible();
      await expect(node(client.page, "Alpha-B")).toHaveCount(0);
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(client.page.getByTestId("sync-conflicts")).toHaveCount(0);
    }
    expect(await labels(a.page)).toEqual(await labels(b.page));

    // Reloading and reopening keeps the result.
    await a.page.reload();
    await b.page.reload();
    for (const client of [a, b]) {
      await openDocument(client.page, run);
      await expect(node(client.page, "Alpha-A")).toBeVisible();
      await expect(node(client.page, "Delta")).toBeVisible();
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(client.page.getByTestId("sync-status")).toContainText("Synced");
    }
    const shown = await labels(a.page);
    expect(shown).toEqual([run.rootTitle, "Alpha-A", "Beta", "Gamma", "Delta"].sort());

    // The stored file matches what is shown, and so does the Markdown export.
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return !titles.includes("Alpha-B") && !titles.some((title) => title.includes("Konflikt")) && titles.includes("Alpha-A");
      }, { timeout: 20_000 })
      .toBe(true);
    expect(unique(await serverTitles(run))).toEqual(shown);
    const exported = await exportMarkdown(a.page);
    expect(exportedHeadings(exported)).toEqual(shown);
    expect(exported).not.toContain("Konflikt");

    // The comparison file was never touched.
    expect(await fingerprint(run, run.compareFile)).toBe(compareBefore);

    // Restore: both starting versions can be brought back.
    if (!run.local) {
      await a.close();
      await b.close();
      const versions = await restoreAllVersions(run, run.alphaFile);
      // The state the server had before B's edits arrived (A's version, no copy) ...
      expect(
        versions.some((titles) => titles.includes("Alpha-A") && titles.includes("Delta") && !titles.includes("Alpha-B") && !titles.some((title) => title.startsWith("Konflikt"))),
        `server version in ${JSON.stringify(versions)}`,
      ).toBe(true);
      // ... and the state with B's version in the node and A's version kept as the conflict copy.
      expect(
        versions.some((titles) => titles.includes("Alpha-B") && titles.some((title) => title.startsWith("Konflikt: Alpha-A (Gerät A, "))),
        `client version in ${JSON.stringify(versions)}`,
      ).toBe(true);
    }
  } finally {
    await finish(run, testInfo);
  }
});

test("@t261 a conflict copy can be deleted instead: the node keeps its version", async ({ browser }, testInfo) => {
  let run: Run | undefined;
  try {
    const started = await startRun(browser, testInfo);
    run = started.run;
    const { a, b } = started;
    await a.goOffline();
    await b.goOffline();
    await rename(a.page, "Beta", "Beta-A");
    await rename(b.page, "Beta", "Beta-B");
    await expectQueued(a.page);
    await expectQueued(b.page);
    await a.goOnline();
    await b.goOnline();
    for (const client of [a, b]) await expect(conflictCopy(client.page, "Beta-A", "Gerät A")).toBeVisible();
    await b.page.getByTestId("sync-conflicts-toggle").click();
    await b.page.getByTestId("sync-conflict-discard").click();
    for (const client of [a, b]) {
      await expect(node(client.page, "Beta-B")).toBeVisible();
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(node(client.page, "Beta-A")).toHaveCount(0);
    }
    // The stored file follows the shown state once the debounced persistence has run.
    await expect
      .poll(async () => {
        const titles = await serverTitles(run!);
        return titles.includes("Beta-B") && !titles.some((title) => title.includes("Konflikt")) && !titles.includes("Beta-A");
      }, { timeout: 20_000 })
      .toBe(true);
    const exported = await exportMarkdown(b.page);
    expect(exportedHeadings(exported)).toEqual(await labels(b.page));
  } finally {
    await finish(run, testInfo);
  }
});
