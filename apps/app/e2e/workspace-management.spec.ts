import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;

function uniqueEmail() {
  return `e2e-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: { Origin: API_ORIGIN },
    form: { name: "Workspace Owner", email, password: PASSWORD, next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

async function login(page: Page, email: string) {
  await page.goto("/login?next=/app");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.locator('form[action="/api/auth/login"]').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
}

test("owner can inspect members, invite an editor, and remove the member", async ({ page, request }) => {
  const email = uniqueEmail();
  await createAccount(request, email);
  await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));

  const workspace = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Research Team",
    slug: "team-research",
    kind: "team" as const,
    role: "owner" as const,
  };
  const invited = {
    userId: "33333333-3333-4333-8333-333333333333",
    email: "editor@example.test",
    name: "Editor",
    role: "editor" as const,
    createdAt: "2026-08-20T10:00:00.000Z",
  };
  let members = [
    { userId: "22222222-2222-4222-8222-222222222222", email, name: "Workspace Owner", role: "owner" as const, createdAt: "2026-08-20T10:00:00.000Z" },
  ];
  let invitations: Array<{ id: string; workspaceId: string; email: string; role: "editor" | "viewer"; status: "pending"; expiresAt: string; acceptedAt: null; revokedAt: null; createdAt: string }> = [];

  await page.route("**/api/mindmaps**", async (route) => {
    if (route.request().method() === "GET" && route.request().url().endsWith("/api/mindmaps")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ files: [{ filename: "welcome.md", frontmatter: { title: "Welcome", id: "welcome" } }], storageMode: "database", workspace }) });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ filePath: "welcome.md", frontmatter: { title: "Welcome", id: "welcome" }, nodes: { root: { id: "root", title: "Welcome", level: 1, parentId: null, children: [], content: "" } }, rootId: "root", storage: { mode: "database", documentId: "44444444-4444-4444-8444-444444444444", workspaceId: workspace.id, version: 1, permission: "write" } }) });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/workspaces", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ workspace, workspaces: [workspace] }) });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/workspaces/${workspace.id}/members`, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ members }) });
  });
  await page.route(`**/api/workspaces/${workspace.id}/invitations`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ invitations }) });
      return;
    }
    const body = route.request().postDataJSON() as { email: string; role: "editor" | "viewer" };
    invitations = [{ id: "55555555-5555-4555-8555-555555555555", workspaceId: workspace.id, email: body.email, role: body.role, status: "pending", expiresAt: "2099-08-20T10:00:00.000Z", acceptedAt: null, revokedAt: null, createdAt: "2026-08-20T10:00:00.000Z" }];
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ invitation: invitations[0], emailSent: true }) });
  });
  await page.route(`**/api/workspaces/${workspace.id}/members/${invited.userId}`, async (route) => {
    members = members.filter((member) => member.userId !== invited.userId);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ removed: true }) });
  });

  await login(page, email);
  await page.getByTestId("workspace-manager-toggle").click();
  await expect(page.getByRole("dialog", { name: "Workspace-Verwaltung" })).toBeVisible();
  await page.getByLabel("E-Mail des einzuladenden Mitglieds").fill(invited.email);
  await page.getByRole("button", { name: "Einladung prüfen" }).click();
  await expect(page.getByRole("group", { name: "Einladung prüfen" })).toContainText(invited.email);
  await page.getByRole("button", { name: "Einladung senden" }).click();
  await expect(page.getByText("Einladung gesendet.")).toBeVisible();
  await expect(page.getByText(invited.email)).toBeVisible();
  await page.getByRole("button", { name: "Erneut senden" }).click();
  await expect(page.getByText("Einladung erneut gesendet.")).toBeVisible();

  members = [...members, invited];
  await page.getByTestId("workspace-manager-toggle").click();
  await page.getByTestId("workspace-manager-toggle").click();
  await expect(page.getByText(invited.email)).toBeVisible();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: `${invited.email} ausladen` }).click();
  await expect(page.getByText("Mitglied ausgeladen.")).toBeVisible();
});

test("recovers from a stale active workspace context", async ({ page, request }) => {
  const email = uniqueEmail();
  await createAccount(request, email);
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd_active_workspace", "99999999-9999-4999-8999-999999999999");
  });

  const documentPayload = {
    filePath: "welcome.md",
    frontmatter: { title: "Welcome", id: "welcome" },
    nodes: {
      root: { id: "root", title: "Welcome", level: 1, parentId: null, children: [], content: "" },
    },
    rootId: "root",
    storage: {
      mode: "database",
      documentId: "44444444-4444-4444-8444-444444444444",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      version: 1,
      permission: "write",
    },
  };

  await page.route("**/api/mindmaps**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") return route.fallback();
    if (url.pathname.endsWith("/api/mindmaps/") || url.pathname.endsWith("/api/mindmaps")) {
      if (url.searchParams.has("workspace")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Workspace not found or access denied." }) });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          files: [{ filename: "welcome.md", frontmatter: documentPayload.frontmatter }],
          storageMode: "database",
          workspace: { id: "11111111-1111-4111-8111-111111111111", name: "My Workspace", slug: "personal", kind: "personal", role: "owner" },
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/api/mindmaps/welcome.md")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(documentPayload) });
      return;
    }
    await route.fallback();
  });

  await login(page, email);
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
  await expect(page.getByTestId("cloud-workspace-chip")).toContainText("My Workspace");
  expect(await page.evaluate(() => localStorage.getItem("bloommd_active_workspace"))).toBe("11111111-1111-4111-8111-111111111111");
});
