import { expect, test, type Browser, type Locator, type Page, type WebSocketRoute } from "@playwright/test";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// @t261 — W1: two clients edit the same Markdown file separately offline, reconnect, and nothing is
// lost. A real content conflict becomes visible and is resolved by rule A (the server room leads,
// the state that reached the server last stays in the node, the other one becomes a
// "Konflikt: …" sibling with device and time). Reset procedure: docs/offline-konflikt.md.

const PASSWORD = "Testpass12345";
const workspace = resolve(process.cwd(), "../../.qa/playwright-offline-workspace");
const alphaFile = resolve(workspace, "offline-alpha.md");
const compareFile = resolve(workspace, "offline-vergleich.md");
const snapshotRoot = resolve(workspace, ".snapshots");

const sha256 = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

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

async function openClient(browser: Browser, label: "A" | "B"): Promise<Client> {
  // The sync status is only shown from the 2xl breakpoint (1536px).
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
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
  await page.goto(`/signup?next=%2Fapp%3Flang%3Den&lang=en`);
  await page.getByLabel("Name").fill(`Offline ${label}`);
  await page.getByLabel("Email").fill(`offline-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByTestId("signup-consent").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.getByTestId("mindmap-canvas")).toBeVisible();
  await expect(node(page, "Offline Alpha")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toContainText("Synced");

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

async function readSnapshots(): Promise<Array<{ meta: { device: string; conflictNodeIds: string[] }; server: string; client: string }>> {
  const rooms = await readdir(snapshotRoot).catch(() => []);
  const result: Array<{ meta: { device: string; conflictNodeIds: string[] }; server: string; client: string }> = [];
  for (const room of rooms) {
    for (const id of (await readdir(resolve(snapshotRoot, room))).sort()) {
      const dir = resolve(snapshotRoot, room, id);
      result.push({
        meta: JSON.parse(await readFile(resolve(dir, "meta.json"), "utf8")),
        server: await readFile(resolve(dir, "server.md"), "utf8"),
        client: await readFile(resolve(dir, "client.md"), "utf8"),
      });
    }
  }
  return result;
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

test("@t261 two clients edit offline, conflict is visible and resolvable, nothing is lost", async ({ browser }) => {
  const compareBefore = await sha256(compareFile);
  const a = await openClient(browser, "A");
  const b = await openClient(browser, "B");

  try {
    // Starting point: both see Alpha, Beta, Gamma.
    for (const client of [a, b]) {
      for (const title of ["Alpha", "Beta", "Gamma"]) await expect(node(client.page, title)).toBeVisible();
    }

    // Both lose the connection and edit separately.
    await a.goOffline();
    await b.goOffline();
    await rename(a.page, "Alpha", "Alpha-A");
    await addChild(a.page, "Offline Alpha", "Delta");
    await rename(b.page, "Alpha", "Alpha-B");
    await expectQueued(a.page);
    await expectQueued(b.page);

    // A reloads without a connection to the sync server: the local edits stay visible.
    await a.blockSyncOnly();
    await a.page.reload();
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(node(a.page, "Delta")).toBeVisible();
    await expect(a.page.getByTestId("sync-offline-pending")).toBeVisible();
    // The room has not seen any of it yet.
    await expect.poll(async () => readFile(alphaFile, "utf8")).not.toContain("Alpha-A");

    // A reconnects first and delivers its edits; they are merged without any notice.
    await a.goOnline();
    await expect(node(a.page, "Alpha-A")).toBeVisible();
    await expect(a.page.getByTestId("sync-conflicts")).toHaveCount(0);
    await expect.poll(async () => readFile(alphaFile, "utf8"), { timeout: 10_000 }).toContain("## Alpha-A");
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

    // Both starting versions are in a snapshot taken before the merge.
    await expect.poll(async () => (await readSnapshots()).length, { timeout: 10_000 }).toBe(2);
    const snapshots = await readSnapshots();
    const conflictSnapshot = snapshots.find((snapshot) => snapshot.meta.conflictNodeIds.length > 0)!;
    expect(conflictSnapshot.meta.device).toBe("Gerät B");
    expect(conflictSnapshot.server).toContain("## Alpha-A");
    expect(conflictSnapshot.server).toContain("## Delta");
    expect(conflictSnapshot.client).toContain("## Alpha-B");
    expect(snapshots[0]!.server).toContain("## Alpha ");
    expect(snapshots[0]!.client).toContain("## Alpha-A");

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
    expect((await readSnapshots()).length).toBe(2);
    const afterRetries = await readFile(alphaFile, "utf8");
    expect(count(afterRetries, "## Delta")).toBe(1);
    expect(count(afterRetries, "## Konflikt: Alpha-A")).toBe(1);

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

    // Reloading and reopening keeps the result; the Markdown on the server matches what is shown.
    await a.page.reload();
    await b.page.reload();
    for (const client of [a, b]) {
      await expect(node(client.page, "Alpha-A")).toBeVisible();
      await expect(node(client.page, "Delta")).toBeVisible();
      await expect(client.page.locator('[data-node-label^="Konflikt:"]')).toHaveCount(0);
      await expect(client.page.getByTestId("sync-status")).toContainText("Synced");
    }
    const shown = await labels(a.page);
    await expect.poll(async () => {
      const markdown = await readFile(alphaFile, "utf8");
      return ["Alpha-A", "Beta", "Gamma", "Delta", "Offline Alpha"].every((title) => markdown.includes(`# ${title}`)) &&
        !markdown.includes("Alpha-B") && !markdown.includes("Konflikt");
    }, { timeout: 10_000 }).toBe(true);
    const finalMarkdown = await readFile(alphaFile, "utf8");
    const headings = [...finalMarkdown.matchAll(/^#{1,6} (.+?)(?: <!--.*)?$/gm)].map((match) => match[1]!).sort();
    expect(headings).toEqual(shown);

    // The comparison file was never touched.
    expect(await sha256(compareFile)).toBe(compareBefore);
  } finally {
    await a.close();
    await b.close();
  }
});

test("@t261 a conflict copy can be deleted instead: the node keeps its version", async ({ browser }) => {
  const a = await openClient(browser, "A");
  const b = await openClient(browser, "B");
  try {
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
    // The export follows the shown state once the debounced persistence has run.
    await expect
      .poll(async () => {
        const text = await readFile(alphaFile, "utf8");
        return text.includes("## Beta-B") && !text.includes("Konflikt");
      }, { timeout: 15_000 })
      .toBe(true);
  } finally {
    await a.close();
    await b.close();
  }
});
