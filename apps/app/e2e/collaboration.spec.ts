import { expect, test, type Browser, type Page, type WebSocketRoute } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PASSWORD = "Testpass12345";
const workspaceFile = resolve(process.cwd(), "../../.qa/playwright-collaboration-workspace/shared.md");

function uniqueEmail(label: string) {
  return `collab-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function preparePage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    (window as unknown as { __bloommdSyncEvents: unknown[] }).__bloommdSyncEvents = [];
    window.addEventListener("bloommd:sync:connect", (event) => {
      (window as unknown as { __bloommdSyncEvents: unknown[] }).__bloommdSyncEvents.push({ type: "connect", detail: (event as CustomEvent).detail });
    });
    window.addEventListener("bloommd:sync:status", (event) => {
      (window as unknown as { __bloommdSyncEvents: unknown[] }).__bloommdSyncEvents.push({ type: "status", detail: (event as CustomEvent).detail });
    });
  });
}

async function syncEvents(page: Page) {
  return page.evaluate(() => (window as unknown as { __bloommdSyncEvents?: unknown[] }).__bloommdSyncEvents ?? []);
}

async function signUpAndOpenApp(browser: Browser, label: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let syncRoute: WebSocketRoute | null = null;
  await page.routeWebSocket(/\/ws\//, (route) => {
    syncRoute = route;
    route.connectToServer();
    route.onClose(() => {
      if (syncRoute === route) syncRoute = null;
    });
  });
  await preparePage(page);
  const configResponse = await page.request.get("/api/config");
  expect(configResponse.ok()).toBe(true);
  const config = await configResponse.json() as { syncUrl?: string };
  expect(config.syncUrl ?? "").toContain(process.env.PLAYWRIGHT_COLLAB_SYNC_PORT ?? "4611");
  await page.goto("/signup?next=%2Fapp%3Flang%3Den&lang=en");
  await page.getByLabel("Name").fill(`Collab ${label}`);
  await page.getByLabel("Email").fill(uniqueEmail(label));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByTestId("signup-consent").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.getByTestId("mindmap-canvas")).toBeVisible();
  await expect(page.locator('[data-node-label="Collaboration Shared"]').first()).toBeVisible();
  await expect(page.getByTestId("sync-status"), `Sync events: ${JSON.stringify(await syncEvents(page))}`).toContainText("Synced");
  return {
    context,
    page,
    closeSyncConnection: async () => {
      if (!syncRoute) throw new Error("No active sync WebSocket route found.");
      await syncRoute.close({ code: 1000, reason: "test interruption" });
    },
  };
}

test("two clients exchange awareness, sync edits and persist Markdown", async ({ browser }) => {
  const clientA = await signUpAndOpenApp(browser, "a");
  const clientB = await signUpAndOpenApp(browser, "b");

  try {
    await expect(clientA.page.getByTestId("sync-status")).toContainText("(2)");
    await expect(clientB.page.getByTestId("sync-status")).toContainText("(2)");

    await clientA.page.locator('[data-node-label="Branch A"]').first().click();
    await expect(
      clientB.page.locator('[data-node-label="Branch A"]').first().getByTestId("remote-user-presence"),
    ).toBeVisible();
    await expect(clientB.page.getByTestId("sync-presence-user").first()).toHaveText(/^[A-Z0-9?]{1,2}$/);
    await expect(clientB.page.getByTestId("sync-presence-user").first()).toHaveAttribute("title", /\S+/);
    await expect(
      clientB.page.locator('[data-node-label="Branch A"]').first().getByTestId("remote-user-presence-badge"),
    ).toHaveText(/^[A-Z0-9?]{1,2}$/);

    const branchB = clientA.page.locator('[data-node-label="Branch B"]').first();
    await branchB.click();
    await branchB.press("r");
    const renameInput = clientA.page.getByTestId("node-rename-input");
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Branch B synced");
    await renameInput.press("Enter");

    await expect(clientB.page.locator('[data-node-label="Branch B synced"]').first()).toBeVisible();

    await expect
      .poll(async () => readFile(workspaceFile, "utf8"), { timeout: 5000 })
      .toContain("## Branch B synced");

    await clientB.context.close();
    const clientC = await signUpAndOpenApp(browser, "c");
    try {
      await expect(clientC.page.locator('[data-node-label="Branch B synced"]').first()).toBeVisible();
      await expect(clientC.page.getByTestId("sync-status")).toContainText("Synced");
    } finally {
      await clientC.context.close();
    }
  } finally {
    await clientA.context.close();
    await clientB.context.close().catch(() => undefined);
  }
});

test("recovers one remote client after a browser network interruption", async ({ browser }) => {
  const client = await signUpAndOpenApp(browser, "reconnect");

  try {
    await client.closeSyncConnection();

    await expect(client.page.getByTestId("sync-status")).toContainText("Reconnecting...", { timeout: 12_000 });

    await expect(client.page.getByTestId("sync-status")).toContainText("Synced", { timeout: 12_000 });

    const statuses = (await syncEvents(client.page))
      .filter((event): event is { type: string; detail: { status?: string } } => {
        if (!event || typeof event !== "object") return false;
        const candidate = event as { type?: unknown; detail?: unknown };
        return candidate.type === "status" && Boolean(candidate.detail) && typeof candidate.detail === "object";
      })
      .map((event) => event.detail.status)
      .filter((status): status is string => Boolean(status));
    expect(statuses.filter((status) => status === "reconnecting")).toHaveLength(1);
    expect(statuses.at(-1)).toBe("connected");
  } finally {
    await client.context.close();
  }
});

// @t46 — Änderungen per WebSocket müssen im Sync-Server persistiert werden (Reload, Raumabbau, Tab-Schluss).
// Der Test-Sync-Server läuft mit SYNC_PERSIST_DEBOUNCE=250 und SYNC_DESTROY_DELAY=1000 (playwright.collaboration.config.ts).
// Alle Clients teilen shared.md, und der Server bleibt über die Tests hinweg an. Deshalb benennen diese Tests Knoten
// `collab-a` per Id um (nie über den Titel) und vergeben je Aufruf einen eigenen Titel: wiederholbar mit Retries.
const T46_NODE_ID = "collab-a";
const SYNC_HEALTH_URL = `http://localhost:${process.env.PLAYWRIGHT_COLLAB_SYNC_PORT ?? "4611"}/health`;

function t46Label(tag: string) {
  return `T46 ${tag} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nodeByLabel(page: Page, label: string) {
  return page.locator(`[data-node-label="${label}"]`).first();
}

async function renameT46Node(page: Page, label: string) {
  const node = page.locator(`[data-node-id="${T46_NODE_ID}"]`).first();
  await node.click();
  await node.press("r");
  const renameInput = page.getByTestId("node-rename-input");
  await expect(renameInput).toBeVisible();
  await renameInput.fill(label);
  await renameInput.press("Enter");
  await expect(nodeByLabel(page, label)).toBeVisible();
}

async function reloadSynced(page: Page) {
  await page.reload();
  await expect(page.getByTestId("mindmap-canvas")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toContainText("Synced");
}

async function syncHealth() {
  const response = await fetch(SYNC_HEALTH_URL);
  return await response.json() as { status: string; rooms: number; clients: number; persistenceFailures: number };
}

async function expectPersistedInFile(label: string) {
  await expect.poll(async () => readFile(workspaceFile, "utf8"), { timeout: 10_000 }).toContain(`## ${label}`);
}

async function expectRoomsTornDown() {
  // SYNC_DESTROY_DELAY=1000: Raum ist erst weg, wenn /health keinen Raum und keinen Client mehr meldet.
  await expect.poll(async () => (await syncHealth()).rooms, { timeout: 15_000 }).toBe(0);
}

test("@t46 rename at client A is persisted: reload at A and at B shows the new state", async ({ browser }) => {
  const clientA = await signUpAndOpenApp(browser, "t46-reload-a");
  const clientB = await signUpAndOpenApp(browser, "t46-reload-b");

  try {
    const label = t46Label("reload");
    await renameT46Node(clientA.page, label);
    await expect(nodeByLabel(clientB.page, label)).toBeVisible();
    await expectPersistedInFile(label);

    await reloadSynced(clientA.page);
    await expect(nodeByLabel(clientA.page, label)).toBeVisible();

    await reloadSynced(clientB.page);
    await expect(nodeByLabel(clientB.page, label)).toBeVisible();
  } finally {
    await clientA.context.close();
    await clientB.context.close();
  }
});

test("@t46 state survives room teardown after all clients left", async ({ browser }) => {
  const clientA = await signUpAndOpenApp(browser, "t46-teardown-a");
  const clientB = await signUpAndOpenApp(browser, "t46-teardown-b");
  const label = t46Label("teardown");

  try {
    await renameT46Node(clientA.page, label);
    await expect(nodeByLabel(clientB.page, label)).toBeVisible();
    await expectPersistedInFile(label);
  } finally {
    await clientA.context.close();
    await clientB.context.close();
  }

  await expectRoomsTornDown();
  expect((await syncHealth()).persistenceFailures).toBe(0);

  const clientC = await signUpAndOpenApp(browser, "t46-teardown-c");
  try {
    await expect(nodeByLabel(clientC.page, label)).toBeVisible();
    await expect(clientC.page.getByTestId("sync-status")).toContainText("Synced");
    expect(await readFile(workspaceFile, "utf8")).toContain(`## ${label}`);
  } finally {
    await clientC.context.close();
  }
});

test("@t46 change right before closing the tab is persisted", async ({ browser }) => {
  const clientA = await signUpAndOpenApp(browser, "t46-close-a");
  const label = t46Label("close");

  try {
    await renameT46Node(clientA.page, label);
    // Kein Warten auf Sync oder Datei: Tab schließt innerhalb des Debounce-Fensters (250 ms).
    await clientA.page.close();
  } finally {
    await clientA.context.close();
  }

  await expectRoomsTornDown();
  await expectPersistedInFile(label);

  const clientD = await signUpAndOpenApp(browser, "t46-close-d");
  try {
    await expect(nodeByLabel(clientD.page, label)).toBeVisible();
  } finally {
    await clientD.context.close();
  }
});

test("@t46 editing continues after reload without error and the next reload shows the newest state", async ({ browser }) => {
  const clientA = await signUpAndOpenApp(browser, "t46-edit-a");
  const clientB = await signUpAndOpenApp(browser, "t46-edit-b");

  try {
    const first = t46Label("edit-1");
    await renameT46Node(clientA.page, first);
    await expect(nodeByLabel(clientB.page, first)).toBeVisible();
    await expectPersistedInFile(first);

    await reloadSynced(clientA.page);
    await expect(nodeByLabel(clientA.page, first)).toBeVisible();

    const second = t46Label("edit-2");
    await renameT46Node(clientA.page, second);
    await expect(nodeByLabel(clientB.page, second)).toBeVisible();
    await expectPersistedInFile(second);
    expect(await readFile(workspaceFile, "utf8")).not.toContain(`## ${first}`);

    // Weder Fehler- noch Konfliktzustand: Sync-Status bleibt "Synced", der Server meldet keinen Speicherfehler.
    await expect(clientA.page.getByTestId("sync-status")).toContainText("Synced");
    await expect(clientA.page.getByTestId("sync-status")).not.toContainText(/fail|conflict|error|offline/i);
    expect(await syncHealth()).toMatchObject({ status: "ok", persistenceFailures: 0 });

    await reloadSynced(clientA.page);
    await expect(nodeByLabel(clientA.page, second)).toBeVisible();
    await expect(nodeByLabel(clientA.page, first)).toHaveCount(0);

    await reloadSynced(clientB.page);
    await expect(nodeByLabel(clientB.page, second)).toBeVisible();
    await expect(nodeByLabel(clientB.page, first)).toHaveCount(0);
  } finally {
    await clientA.context.close();
    await clientB.context.close();
  }
});
