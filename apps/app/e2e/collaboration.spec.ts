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
