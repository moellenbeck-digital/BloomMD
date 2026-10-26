import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const workspace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Research Team",
  slug: "team-research",
  kind: "team" as const,
  role: "owner" as const,
};
const documentId = "44444444-4444-4444-8444-444444444444";
const agentId = "33333333-3333-4333-8333-333333333333";

function uniqueEmail() {
  return `e2e-node-agent-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: { Origin: API_ORIGIN },
    form: { name: "Node Agent Owner", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

async function login(page: Page, email: string) {
  await page.goto("/login?next=/app");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page
    .locator('form[action="/api/auth/login"]')
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL((url) => url.pathname === "/app");
}

test("opens the node-scoped agent inspector and queues the selected node only", async ({
  page,
  request,
}) => {
  const email = uniqueEmail();
  await createAccount(request, email);
  await page.addInitScript(() =>
    window.localStorage.setItem("bloommd_onboarding_seen", "1"),
  );
  let queuedBody: Record<string, unknown> | null = null;
  let tasks: unknown[] = [
    {
      id: "proposal-task",
      agentId,
      agentName: "OpenClaw",
      filename: "welcome.md",
      prompt: "Erweitere Welcome.",
      status: "proposed",
      resultSummary: "Vorschlag bereit.",
      failureCode: null,
      createdAt: "2026-09-09T20:00:00.000Z",
      nodeId: "root",
      nodeTitle: "Welcome",
      nodePath: "Welcome",
      proposals: [
        {
          id: "proposal-1",
          proposedMarkdown: "",
          proposedNodeContent:
            "## Prüffragen\n- Was ist das Ziel?\n## Nächste Schritte\n- Quelle validieren",
          rationale: "Nur der ausgewählte Knoten wird erweitert.",
          status: "pending",
        },
      ],
    },
    {
      id: "other-task",
      agentId,
      agentName: "OpenClaw",
      filename: "welcome.md",
      prompt: "Dieser andere Knoten darf nicht erscheinen.",
      status: "proposed",
      resultSummary: null,
      failureCode: null,
      createdAt: "2026-09-09T20:00:00.000Z",
      nodeId: "other-node",
      nodeTitle: "Other",
      nodePath: "Welcome → Other",
      proposals: [],
    },
  ];

  await page.route("**/api/mindmaps**", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      url.pathname.endsWith("/api/mindmaps")
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          files: [
            {
              filename: "welcome.md",
              frontmatter: { title: "Welcome", id: "root" },
            },
          ],
          storageMode: "database",
          workspace,
        }),
      });
      return;
    }
    if (
      route.request().method() === "GET" &&
      url.pathname.endsWith("/api/mindmaps/welcome.md")
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          filePath: "welcome.md",
          frontmatter: { title: "Welcome", id: "root" },
          nodes: {
            root: {
              id: "root",
              title: "Welcome",
              level: 1,
              parentId: null,
              children: [],
              content: "Selected node content.",
            },
          },
          rootId: "root",
          storage: {
            mode: "database",
            documentId,
            workspaceId: workspace.id,
            version: 1,
            permission: "write",
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/workspaces", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ workspace, workspaces: [workspace] }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route(
    `**/api/workspaces/${workspace.id}/agents`,
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          agents: [
            {
              id: agentId,
              provider: "openclaw",
              displayName: "OpenClaw",
              status: "active",
              pairedAt: "2026-09-09T20:00:00.000Z",
            },
          ],
        }),
      });
    },
  );
  await page.route(
    `**/api/workspaces/${workspace.id}/agent-tasks`,
    async (route) => {
      if (route.request().method() === "POST") {
        queuedBody = route.request().postDataJSON() as Record<string, unknown>;
        tasks = [
          {
            id: "55555555-5555-4555-8555-555555555555",
            agentId,
            agentName: "OpenClaw",
            filename: "welcome.md",
            prompt: queuedBody.command,
            status: "queued",
            resultSummary: null,
            failureCode: null,
            createdAt: "2026-09-09T20:00:00.000Z",
            nodeId: "root",
            nodeTitle: "Welcome",
            nodePath: "Welcome",
            proposals: [],
          },
        ];
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            taskId: tasks[0] && "55555555-5555-4555-8555-555555555555",
            status: "queued",
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ tasks }),
      });
    },
  );

  await login(page, email);
  await expect(page.getByTestId("node-action-ask-agent")).toBeVisible();
  await expect(page.getByTestId("node-agent-action-badge")).toHaveText("1");
  await page.getByTestId("node-action-ask-agent").click();
  const composer = page.getByTestId("node-agent-sidebar");
  await expect(composer).toBeVisible();
  await expect(composer).toContainText("Welcome");
  await expect(composer).toContainText("Selected node content.");
  await expect(composer).toContainText("Erweitere Welcome.");
  await expect(composer).not.toContainText(
    "Dieser andere Knoten darf nicht erscheinen.",
  );
  await composer.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await expect(composer).toContainText("Prüffragen");
  if (process.env.BLOOMMD_CAPTURE_AGENT_PROPOSAL_SCREENSHOT) {
    await composer
      .getByTestId("proposal-tree-preview")
      .screenshot({
        path: process.env.BLOOMMD_CAPTURE_AGENT_PROPOSAL_SCREENSHOT,
      });
  }
  const commandInput = composer.getByLabel("Dein Auftrag");
  await commandInput.fill("Erweitere diesen Knoten.");
  await expect(commandInput).toBeFocused();
  if (process.env.BLOOMMD_CAPTURE_AGENT_COMPOSER_SCREENSHOT) {
    await composer.screenshot({
      path: process.env.BLOOMMD_CAPTURE_AGENT_COMPOSER_SCREENSHOT,
    });
  }
  await page.waitForTimeout(4_500);
  await expect(commandInput).toBeFocused();
  await expect(commandInput).toHaveValue("Erweitere diesen Knoten.");
  await composer.getByRole("button", { name: "Auftrag senden" }).click();
  await expect
    .poll(() => queuedBody)
    .toMatchObject({
      agentId,
      documentId,
      filename: "welcome.md",
      nodeId: "root",
      command: "Erweitere diesen Knoten.",
    });
  await expect(composer).toContainText("Erweitere diesen Knoten.");
});
