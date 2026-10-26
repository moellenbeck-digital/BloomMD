import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };
const NEW_NODE_SELECTOR = '[data-node-label="New node"], [data-node-label="Neuer Node"]';

function uniqueEmail(label: string) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: {
      name: "E2E Test",
      email,
      password: PASSWORD,
      acceptTerms: "1",
      next: "/app",
    },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("/app");
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

async function openFileBrowser(page: Page) {
  await page.getByTitle(/Open file browser|Datei-Browser/).click();
}

async function createMindmapFixture(request: APIRequestContext, filename: string, title: string) {
  const now = new Date().toISOString();
  const rootNodeId = "fixture-root";
  const evidenceNodeId = "fixture-evidence";
  const markdown = [
    "---",
    `title: ${title}`,
    `id: ${filename.replace(/[^a-z0-9]/gi, "-")}`,
    `created: "${now}"`,
    `updated: "${now}"`,
    "tags:",
    "  - e2e",
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${title} <!-- bloommd:id=${rootNodeId} -->`,
    "",
    "Primary source: [Example](https://example.com/reference).",
    `Related node: [[#${evidenceNodeId}|Evidence]].`,
    "Broken reference: [[missing-map.md#missing-node|Missing]].",
    "",
    `## Evidence <!-- bloommd:id=${evidenceNodeId} -->`,
    "",
    "Plain URL: https://docs.example.com/path.",
    `Back to root: [[#${rootNodeId}|Root]].`,
  ].join("\n");

  const response = await request.post("/api/mindmaps", {
    headers: SAME_ORIGIN_HEADERS,
    data: { filename, markdown },
  });
  expect(response.ok()).toBe(true);
}

async function suppressOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
  });
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

async function readViewportTransform(page: Page) {
  return page.locator(".react-flow__viewport").first().evaluate((element) => {
    const style = element.getAttribute("style") ?? "";
    const match = style.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\s*\)\s*scale\(\s*(-?[\d.]+)\s*\)/);
    if (!match) throw new Error(`Unexpected React Flow viewport transform: ${style}`);
    return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
  });
}

test.describe("auth and onboarding", () => {
  test("redirects anonymous users from app to login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp|\/login\?next=\/app/);
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  });

  test("rejects anonymous access to mindmap data", async ({ request }) => {
    const response = await request.get("/api/mindmaps");
    expect(response.status()).toBe(401);
  });

  test("signs up and shows first-run onboarding", async ({ page }) => {
    const email = uniqueEmail("signup");

    await page.goto("/signup?next=/app");
    await page.getByLabel("Name").fill("E2E Signup");
    await page.getByLabel("E-Mail").fill(email);
    await page.getByLabel("Passwort").fill(PASSWORD);
    await page.getByTestId("signup-consent").check();
    await page.getByRole("button", { name: "Account erstellen" }).click();

    await expect(page).toHaveURL((url) => url.pathname === "/app");
    await expect(page.getByTestId("onboarding-panel")).toBeVisible();
    await expect(page.getByText("Tab für ein Kind")).toBeVisible();

    await page.getByTestId("show-shortcuts-from-onboarding").click();
    await expect(page.getByTestId("shortcut-help")).toBeVisible();
    await expect(page.getByText("ArrowRight")).toBeVisible();
    await expect(page.getByText("F1 / ? / Cmd/Ctrl+/")).toBeVisible();
  });

  test("logs in with an existing account", async ({ page, request }) => {
    const email = uniqueEmail("login");
    await createAccount(request, email);
    await suppressOnboarding(page);

    await login(page, email);
    await expect(page.getByTestId("onboarding-panel")).toHaveCount(0);
  });

  test("rejects login without a password", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      headers: SAME_ORIGIN_HEADERS,
      form: { email: uniqueEmail("empty-password"), password: "", next: "/app" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(303);
    expect(response.headers().location).toContain("Bitte%20gib%20dein%20Passwort%20ein");
  });
});

test.describe("discoverable workflows", () => {
  test("shows and renames the active cloud workspace", async ({ page, request }) => {
    const email = uniqueEmail("cloud-workspace");
    await createAccount(request, email);
    await suppressOnboarding(page);

    let workspaceName = "My Workspace";
    let renamePayload: { workspaceId?: string; name?: string } | null = null;
    const workspace = () => ({
      id: "11111111-1111-4111-8111-111111111111",
      name: workspaceName,
      slug: "personal-111",
      kind: "personal",
      role: "owner",
    });
    const documentPayload = {
      filePath: "cloud.md",
      frontmatter: { title: "Cloud Document", id: "cloud-document" },
      nodes: {
        "cloud-root": {
          id: "cloud-root",
          title: "Cloud Document",
          level: 1,
          children: [],
          content: "",
          references: [],
        },
      },
      rootId: "cloud-root",
      preamble: "",
      storage: {
        mode: "database",
        workspaceId: "11111111-1111-4111-8111-111111111111",
        documentId: "22222222-2222-4222-8222-222222222222",
        version: 1,
      },
    };

    await page.route("**/api/mindmaps", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            files: [{ filename: "cloud.md", frontmatter: documentPayload.frontmatter }],
            storageMode: "database",
            workspace: workspace(),
          }),
        });
        return;
      }
      await route.fallback();
    });
    await page.route("**/api/mindmaps/cloud.md", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(documentPayload) });
    });
    await page.route("**/api/workspaces", async (route) => {
      renamePayload = route.request().postDataJSON() as { workspaceId?: string; name?: string };
      workspaceName = String(renamePayload.name ?? workspaceName).replace(/\s+/g, " ").trim();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ workspace: workspace() }) });
    });

    await login(page, email);
    await expect(page.getByTestId("cloud-workspace-chip")).toContainText("Cloud");
    await expect(page.getByTestId("cloud-workspace-chip")).toContainText("My Workspace");

    await page.getByTestId("rename-workspace").click();
    await page.getByTestId("workspace-name-input").fill("Research Team");
    await page.getByTestId("save-workspace-name").click();

    await expect(page.getByTestId("cloud-workspace-chip")).toContainText("Research Team");
    expect(renamePayload).toEqual({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      name: "Research Team",
    });
  });

  test("switches between map, outline, presentation, and saves a local view", async ({ page, request }) => {
    const email = uniqueEmail("view-modes");
    await createAccount(request, email);
    await suppressOnboarding(page);
    await login(page, email);

    await page.getByTestId("view-mode-outline").click();
    await expect(page.getByTestId("outline-view")).toBeVisible();

    await page.getByTestId("view-mode-presentation").click();
    await expect(page.getByTestId("presentation-view")).toBeVisible();

    await page.getByTestId("view-mode-map").click();
    await page.getByRole("button", { name: /Save local view|Lokale Ansicht speichern/ }).click();
    await expect(page.getByLabel(/Load saved view|Gespeicherte Ansicht laden/)).toContainText(/View 1|Ansicht 1/);
    page.once("dialog", (dialog) => void dialog.accept("Launch view"));
    await page.getByRole("button", { name: /Rename saved view|Gespeicherte Ansicht umbenennen/ }).click();
    await expect(page.getByLabel(/Load saved view|Gespeicherte Ansicht laden/)).toContainText("Launch view");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: /Delete saved view|Gespeicherte Ansicht löschen/ }).click();
    await expect(page.getByLabel(/Load saved view|Gespeicherte Ansicht laden/)).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("bloommd:views:")))).toBe(true);
  });

  test("adds a child with the visible node action toolbar", async ({ page, request }) => {
    const email = uniqueEmail("visible-actions");
    await createAccount(request, email);
    await suppressOnboarding(page);
    await login(page, email);

    const rootNode = page.locator('[data-node-label="TypeScript"]').first();
    await expect(rootNode).toBeVisible();
    await rootNode.click();

    await expect(page.getByTestId("node-action-toolbar")).toBeVisible();
    await page.getByTestId("node-action-add-child").click();
    await expect(page.locator(NEW_NODE_SELECTOR).first()).toBeVisible();
  });

  test("opens command palette and switches to a searched mindmap", async ({ page, request }) => {
    const email = uniqueEmail("command-palette");
    await createAccount(request, email);
    await suppressOnboarding(page);
    await login(page, email);

    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-palette-input").fill("TypeScript Basics");
    await page.getByTestId("command-palette-item-mindmap").first().click();

    await expect(page.locator('[data-node-label="TypeScript"]').first()).toBeVisible();
  });

  test("runs command palette actions through the same handlers as the toolbar", async ({ page, request }) => {
    const email = uniqueEmail("command-actions");
    const filename = `e2e-command-actions-${Date.now()}.md`;
    const title = `E2E Command Actions ${Date.now()}`;
    const createdFilenames = [filename];
    await createAccount(request, email);
    await createMindmapFixture(request, filename, title);
    await suppressOnboarding(page);
    await login(page, email);

    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill(title);
    await page.getByTestId("command-palette-item-mindmap").first().click();
    await expect(page.locator(`[data-node-label="${title}"]`).first()).toBeVisible();

    await page.keyboard.press("Control+K");
    const saveResponse = page.waitForResponse((response) => {
      return response.url().includes(`/api/mindmaps/${encodeURIComponent(filename)}`) && response.request().method() === "PUT";
    });
    await page.locator('[data-command-id="action-save"]').click();
    await expect((await saveResponse).ok()).toBe(true);
    await expect(page.getByTestId("command-palette")).toHaveCount(0);

    await page.keyboard.press("Control+K");
    const reloadResponse = page.waitForResponse((response) => {
      return response.url().includes(`/api/mindmaps/${encodeURIComponent(filename)}`) && response.request().method() === "GET";
    });
    await page.locator('[data-command-id="action-reload"]').click();
    await expect((await reloadResponse).ok()).toBe(true);
    await expect(page.locator(`[data-node-label="${title}"]`).first()).toBeVisible();

    await page.keyboard.press("Control+K");
    const download = page.waitForEvent("download");
    await page.locator('[data-command-id="action-export"]').click();
    expect((await download).suggestedFilename()).toBe(`${title}.md`);

    await page.keyboard.press("Control+K");
    const newResponse = page.waitForResponse((response) => {
      return response.url().endsWith("/api/mindmaps") && response.request().method() === "POST";
    });
    await page.locator('[data-command-id="action-new"]').click();
    const newApiResponse = await newResponse;
    await expect(newApiResponse.ok()).toBe(true);
    const newRequestBody = newApiResponse.request().postDataJSON() as { filename?: string };
    if (newRequestBody.filename) createdFilenames.push(newRequestBody.filename);
    await expect(page.locator('[data-node-label="Neue Mindmap"], [data-node-label="New Mindmap"]').first()).toBeVisible();

    await page.keyboard.press("Control+K");
    const fileChooser = page.waitForEvent("filechooser");
    await page.locator('[data-command-id="action-import"]').click();
    const importResponse = page.waitForResponse((response) => {
      return response.url().endsWith("/api/mindmaps") && response.request().method() === "POST";
    });
    await (await fileChooser).setFiles({
      name: "palette-import.md",
      mimeType: "text/markdown",
      buffer: Buffer.from([
        "---",
        "title: Palette Import",
        "id: palette-import",
        "---",
        "",
        "# Palette Import <!-- bloommd:id=palette-import-root -->",
        "",
      ].join("\n")),
    });
    const importApiResponse = await importResponse;
    await expect(importApiResponse.ok()).toBe(true);
    const importRequestBody = importApiResponse.request().postDataJSON() as { filename?: string };
    if (importRequestBody.filename) createdFilenames.push(importRequestBody.filename);
    await expect(page.locator('[data-node-label="Palette Import"]').first()).toBeVisible();

    for (const createdFilename of createdFilenames) {
      await request.delete(`/api/mindmaps/${encodeURIComponent(createdFilename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });

  test("filters the file browser", async ({ page, request }) => {
    const email = uniqueEmail("file-search");
    await createAccount(request, email);
    await suppressOnboarding(page);
    await login(page, email);

    await openFileBrowser(page);
    await page.getByTestId("file-browser-search").fill("WebTest");
    await expect(page.getByRole("button", { name: /WebTest webtest-md\.md/ })).toBeVisible();
    await expect(page.getByText("typescript-basics.md")).toHaveCount(0);
  });

  test("persists file browser favorites and sorts them before regular files", async ({ page, request }) => {
    const email = uniqueEmail("file-favorites");
    const alphaFilename = `favorite-order-alpha-${Date.now()}.md`;
    const zuluFilename = `favorite-order-zulu-${Date.now()}.md`;
    await createAccount(request, email);
    await createMindmapFixture(request, alphaFilename, "Favorite Order Alpha");
    await createMindmapFixture(request, zuluFilename, "Favorite Order Zulu");
    await suppressOnboarding(page);
    await login(page, email);

    await openFileBrowser(page);
    await page.getByTestId("file-browser-search").fill("Favorite Order");
    await expect(page.getByTestId("file-drawer-item").first()).toContainText("Favorite Order Alpha");

    const favoriteRow = page.locator(`[data-testid="file-drawer-item"][data-filename="${zuluFilename}"]`);
    await favoriteRow.getByTestId("favorite-mindmap").click();
    await expect(favoriteRow.getByTestId("favorite-mindmap")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("file-drawer-item").first()).toContainText("Favorite Order Zulu");

    await page.reload();
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
    await openFileBrowser(page);
    await page.getByTestId("file-browser-search").fill("Favorite Order");
    await expect(page.getByTestId("file-drawer-item").first()).toContainText("Favorite Order Zulu");
    await expect(page.locator(`[data-testid="favorite-mindmap"][data-filename="${zuluFilename}"]`)).toHaveAttribute("aria-pressed", "true");

    await request.delete(`/api/mindmaps/${encodeURIComponent(alphaFilename)}`, { headers: SAME_ORIGIN_HEADERS });
    await request.delete(`/api/mindmaps/${encodeURIComponent(zuluFilename)}`, { headers: SAME_ORIGIN_HEADERS });
  });

  test("renaming the root node moves the Markdown file and keeps title and path in sync", async ({ page, request }) => {
    const email = uniqueEmail("root-rename");
    const runId = Date.now();
    const filename = `root-rename-${runId}.md`;
    const title = "Root Rename Alpha";
    const renamedTitle = `Root Rename Beta ${runId}`;
    const renamedFilename = `root-rename-beta-${runId}.md`;
    await createAccount(request, email);
    await createMindmapFixture(request, filename, title);
    await suppressOnboarding(page);
    await login(page, email);

    try {
      await openFileBrowser(page);
      await page.getByTestId("file-browser-search").fill(title);
      await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${filename}"]`).click();
      await expect(page.locator(`[data-node-label="${title}"]`).first()).toBeVisible();
      const rootNode = page.locator(`[data-testid="mindmap-node"][data-node-label="${title}"]`).first();
      await rootNode.focus();
      await rootNode.press("r");
      const input = page.getByTestId("node-rename-input");
      await expect(input).toHaveValue(title);
      await input.fill(renamedTitle);
      const renameResponse = page.waitForResponse((response) => {
        return response.url().includes(`/api/mindmaps/${encodeURIComponent(filename)}`) && response.request().method() === "PATCH";
      });
      await input.press("Enter");
      await expect((await renameResponse).ok()).toBe(true);
      await expect(page.locator(`[data-node-label="${renamedTitle}"]`).first()).toBeVisible();

      await openFileBrowser(page);
      await page.getByTestId("file-browser-search").fill(renamedTitle);
      await expect(page.locator(`[data-testid="file-drawer-item"][data-filename="${renamedFilename}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="file-drawer-item"][data-filename="${filename}"]`)).toHaveCount(0);

      const oldResponse = await request.get(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
      expect(oldResponse.ok()).toBe(false);
      const newResponse = await request.get(`/api/mindmaps/${encodeURIComponent(renamedFilename)}`, { headers: SAME_ORIGIN_HEADERS });
      expect(newResponse.ok()).toBe(true);
      const newDocument = await newResponse.json() as { frontmatter?: { title?: string } };
      expect(newDocument.frontmatter?.title).toBe(renamedTitle);
    } finally {
      await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
      await request.delete(`/api/mindmaps/${encodeURIComponent(renamedFilename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });

  test("renaming an inactive file updates its root title before moving it", async ({ page, request }) => {
    const email = uniqueEmail("inactive-rename");
    const runId = Date.now();
    const filename = `inactive-rename-${runId}.md`;
    const title = "Inactive Rename Alpha";
    const renamedTitle = `Inactive Rename Beta ${runId}`;
    const renamedFilename = `inactive-rename-beta-${runId}.md`;
    await createAccount(request, email);
    await createMindmapFixture(request, filename, title);
    await suppressOnboarding(page);
    await login(page, email);

    try {
      // Keep the fixture unopened so this covers the file-browser rename path rather than the
      // inline rename path of the currently active document.
      await openFileBrowser(page);
      await page.getByTestId("file-browser-search").fill(title);
      const row = page.locator(`[data-testid="file-drawer-item"][data-filename="${filename}"]`);
      await expect(row).toBeVisible();
      await row.click({ button: "right", position: { x: 24, y: 18 } });
      await page.getByTestId("file-context-rename").click();

      const renameDialog = page.getByTestId("rename-mindmap-dialog");
      await expect(renameDialog).toBeVisible();
      const renameInput = page.getByTestId("rename-mindmap-input");
      await renameInput.fill(renamedTitle);
      const putResponse = page.waitForResponse((response) => {
        return response.url().includes(`/api/mindmaps/${encodeURIComponent(filename)}`) && response.request().method() === "PUT";
      });
      const patchResponse = page.waitForResponse((response) => {
        return response.url().includes(`/api/mindmaps/${encodeURIComponent(filename)}`) && response.request().method() === "PATCH";
      });
      await page.getByTestId("rename-mindmap-submit").click();
      await expect((await putResponse).ok()).toBe(true);
      await expect((await patchResponse).ok()).toBe(true);
      await expect(renameDialog).toHaveCount(0);

      const newResponse = await request.get(`/api/mindmaps/${encodeURIComponent(renamedFilename)}`, { headers: SAME_ORIGIN_HEADERS });
      expect(newResponse.ok()).toBe(true);
      const newDocument = await newResponse.json() as {
        frontmatter?: { title?: string };
        nodes?: Record<string, { title?: string }>;
        rootId?: string;
      };
      expect(newDocument.frontmatter?.title).toBe(renamedTitle);
      expect(newDocument.nodes?.[newDocument.rootId ?? ""]?.title).toBe(renamedTitle);

      await openFileBrowser(page);
      const renamedRow = page.locator(`[data-testid="file-drawer-item"][data-filename="${renamedFilename}"]`);
      await expect(renamedRow).toBeInViewport();
      await expect(renamedRow).toHaveClass(/ring-2/);
    } finally {
      await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
      await request.delete(`/api/mindmaps/${encodeURIComponent(renamedFilename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });

  test("covers toolbar actions, file drawer keyboard, context delete, tabs, theme, locale and account link", async ({ page, request }) => {
    const email = uniqueEmail("toolbar-files");
    const runId = Date.now();
    const alphaFilename = `toolbar-alpha-${runId}.md`;
    const betaFilename = `toolbar-beta-${runId}.md`;
    const deleteFilename = `toolbar-delete-${runId}.md`;
    const createdFilenames = [alphaFilename, betaFilename, deleteFilename];
    await createAccount(request, email);
    await createMindmapFixture(request, alphaFilename, "Toolbar Alpha");
    await createMindmapFixture(request, betaFilename, "Toolbar Beta");
    await createMindmapFixture(request, deleteFilename, "Toolbar Delete");
    await suppressOnboarding(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("bloommd-theme", "light");
      window.localStorage.setItem("bloommd-locale", "de");
    });
    await login(page, email);

    await openFileBrowser(page);
    await page.getByTestId("file-browser-search").fill("Toolbar Alpha");
    const alphaRow = page.locator(`[data-testid="file-drawer-item"][data-filename="${alphaFilename}"]`);
    await expect(alphaRow).toBeVisible();
    await page.locator(`[data-testid="file-drawer-open-file"][data-filename="${alphaFilename}"]`).press("Enter");
    await expect(page.locator(`[data-testid="mindmap-tab"][data-filename="${alphaFilename}"]`)).toBeVisible();
    await expect(page.locator('[data-node-label="Toolbar Alpha"]').first()).toBeVisible();

    await openFileBrowser(page);
    await page.getByTestId("file-browser-search").fill("Toolbar Alpha");
    const alphaRenameRow = page.locator(`[data-testid="file-drawer-item"][data-filename="${alphaFilename}"]`);
    await expect(alphaRenameRow).toBeVisible();
    await alphaRenameRow.click({ button: "right", position: { x: 24, y: 18 } });
    await page.getByTestId("file-context-rename").click();
    await expect(page.getByTestId("file-drawer")).toHaveCount(0);
    const renameDialog = page.getByTestId("rename-mindmap-dialog");
    await expect(renameDialog).toBeVisible();
    await expect(renameDialog).toContainText(alphaFilename);
    const alphaRenameInput = page.getByTestId("rename-mindmap-input");
    await expect(alphaRenameInput).toHaveValue("Toolbar Alpha");
    const renamedTitle = `Toolbar Alpha Renamed ${runId}`;
    await alphaRenameInput.fill(renamedTitle);
    const renameResponse = page.waitForResponse((response) => {
      return response.url().includes(`/api/mindmaps/${encodeURIComponent(alphaFilename)}`) && response.request().method() === "PATCH";
    });
    await page.getByTestId("rename-mindmap-submit").click();
    await expect((await renameResponse).ok()).toBe(true);
    await expect(renameDialog).toHaveCount(0);
    const renamedRoot = page.locator(`[data-testid="mindmap-node"][data-node-label="${renamedTitle}"]`).first();
    await expect(renamedRoot).toBeVisible();
    await expect(renamedRoot).toBeFocused();
    const renamedFilename = `toolbar-alpha-renamed-${runId}.md`;
    createdFilenames[createdFilenames.indexOf(alphaFilename)] = renamedFilename;

    await openFileBrowser(page);
    const renamedRow = page.locator(`[data-testid="file-drawer-item"][data-filename="${renamedFilename}"]`);
    await expect(renamedRow).toBeInViewport();
    await page.getByTestId("file-browser-search").fill(renamedTitle);
    await expect(renamedRow).toBeVisible();
    await expect(page.locator(`[data-testid="file-drawer-item"][data-filename="${alphaFilename}"]`)).toHaveCount(0);
    await page.getByTestId("file-browser-search").fill("Toolbar Delete");
    const deleteRow = page.locator(`[data-testid="file-drawer-item"][data-filename="${deleteFilename}"]`);
    await expect(deleteRow).toBeVisible();
    await deleteRow.click({ button: "right", position: { x: 24, y: 18 } });
    await expect(page.getByTestId("file-context-menu")).toBeVisible();
    await page.getByTestId("file-context-delete").click();
    await page.getByTestId("file-context-confirm-delete").click();
    await expect(page.locator(`[data-testid="file-drawer-item"][data-filename="${deleteFilename}"]`)).toHaveCount(0);
    createdFilenames.splice(createdFilenames.indexOf(deleteFilename), 1);

    await page.getByTestId("file-browser-search").fill("Toolbar Beta");
    await page.locator(`[data-testid="file-drawer-item"][data-filename="${betaFilename}"]`).getByRole("button").first().click();
    await expect(page.locator('[data-node-label="Toolbar Beta"]').first()).toBeVisible();
    await expect(page.locator(`[data-testid="mindmap-tab"][data-filename="${renamedFilename}"]`)).toBeVisible();
    await page.locator(`[data-testid="mindmap-tab"][data-filename="${renamedFilename}"]`).click();
    await expect(page.locator(`[data-node-label="${renamedTitle}"]`).first()).toBeVisible();

    const saveResponse = page.waitForResponse((response) => {
      return response.url().includes(`/api/mindmaps/${encodeURIComponent(renamedFilename)}`) && response.request().method() === "PUT";
    });
    await page.getByTestId("toolbar-save").click();
    await expect((await saveResponse).ok()).toBe(true);

    const reloadResponse = page.waitForResponse((response) => {
      return response.url().includes(`/api/mindmaps/${encodeURIComponent(renamedFilename)}`) && response.request().method() === "GET";
    });
    await page.getByTestId("toolbar-reload").click();
    await expect((await reloadResponse).ok()).toBe(true);

    const exportDownload = page.waitForEvent("download");
    await page.getByTestId("toolbar-export").click();
    expect((await exportDownload).suggestedFilename()).toBe(`${renamedTitle}.md`);

    const newResponse = page.waitForResponse((response) => {
      return response.url().endsWith("/api/mindmaps") && response.request().method() === "POST";
    });
    await page.getByTestId("toolbar-new").click();
    const newApiResponse = await newResponse;
    await expect(newApiResponse.ok()).toBe(true);
    const newRequestBody = newApiResponse.request().postDataJSON() as { filename?: string };
    if (newRequestBody.filename) createdFilenames.push(newRequestBody.filename);
    await expect(page.locator('[data-node-label="Neue Mindmap"], [data-node-label="New Mindmap"]').first()).toBeVisible();

    const importChooser = page.waitForEvent("filechooser");
    await page.getByTestId("toolbar-import").click();
    const importResponse = page.waitForResponse((response) => {
      return response.url().endsWith("/api/mindmaps") && response.request().method() === "POST";
    });
    await (await importChooser).setFiles({
      name: "toolbar-import.md",
      mimeType: "text/markdown",
      buffer: Buffer.from([
        "---",
        "title: Toolbar Import",
        "id: toolbar-import",
        "---",
        "",
        "# Toolbar Import <!-- bloommd:id=toolbar-import-root -->",
        "",
      ].join("\n")),
    });
    const importApiResponse = await importResponse;
    await expect(importApiResponse.ok()).toBe(true);
    const importRequestBody = importApiResponse.request().postDataJSON() as { filename?: string };
    if (importRequestBody.filename) createdFilenames.push(importRequestBody.filename);
    await expect(page.locator('[data-node-label="Toolbar Import"]').first()).toBeVisible();

    await page.getByTestId("toolbar-help-menu").click();
    await page.getByTestId("toolbar-theme").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("bloommd-theme"))).toBe("dark");
    await page.getByTestId("toolbar-help-menu").click();
    await page.getByTestId("toolbar-locale").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("bloommd-locale"))).toBe("en");
    await expect(page.getByTestId("toolbar-save")).toHaveAttribute("title", /Save/);

    await page.getByTestId("toolbar-help-menu").click();
    await page.getByTestId("toolbar-account").click();
    await expect(page).toHaveURL((url) => url.pathname === "/account");
    await expect(page.getByRole("heading", { name: /Plan und Abrechnung|Plan and billing/ })).toBeVisible();

    for (const createdFilename of createdFilenames) {
      await request.delete(`/api/mindmaps/${encodeURIComponent(createdFilename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });

  test("opens a browser workspace and shows workspace map, read-only state and health findings", async ({ page, request }) => {
    const email = uniqueEmail("browser-workspace");
    await createAccount(request, email);
    await suppressOnboarding(page);
    await installBrowserWorkspaceMock(page);
    await login(page, email);

    await page.getByTestId("open-browser-workspace").click();
    await expect(page.getByText("Local Intro").first()).toBeVisible();
    await expect(page.getByTestId("workspace-readonly")).toBeVisible();

    const folderNode = page.locator('[data-testid="mindmap-node"][data-node-kind="folder"][data-node-label="chapters"]').first();
    await expect(folderNode).toBeVisible();
    await folderNode.click();
    await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-kind-select")).toHaveValue("folder");
    await expect(page.getByTestId("node-structure-panel")).toBeVisible();
    await expect(page.getByTestId("node-structure-panel")).toContainText("Ordnerpfad");
    await expect(page.getByTestId("node-content-panel")).toHaveCount(0);
    await expect(page.getByTestId("node-content-unavailable")).toBeVisible();

    const fileNode = page.locator('[data-testid="mindmap-node"][data-node-kind="file"][data-node-label="Local Intro"]').first();
    await expect(fileNode).toBeVisible();
    await fileNode.click();
    await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-kind-select")).toHaveValue("file");
    await expect(page.getByTestId("node-file-panel")).toBeVisible();
    await expect(page.getByTestId("node-file-panel")).toContainText("chapters/intro.md");
    await expect(page.getByTestId("node-file-panel").getByRole("button", { name: "Datei wählen" })).toBeVisible();
    await expect(page.getByTestId("node-content-panel")).toHaveCount(0);
    await expect(page.getByTestId("node-content-unavailable")).toBeVisible();

    await page.getByTestId("map-view-workspace").click();
    await expect(page.getByTestId("map-view-workspace")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("workspace-map")).toBeVisible();
    await expect(page.getByTestId("workspace-node-folder").first()).toBeVisible();
    await expect(page.getByTestId("workspace-node-file").first()).toBeVisible();
    await page.getByTestId("graph-preset-knowledge").click();
    await expect(page.getByTestId("graph-preset-knowledge")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("graph-layer-brokenLinks")).toContainText("1");

    await page.getByTestId("open-workspace-health").click();
    await expect(page.getByTestId("workspace-health")).toBeVisible();
    await page.getByTestId("health-roundtrip").check();
    await page.getByTestId("health-orphans").check();
    await expect(page.getByTestId("workspace-health")).toContainText("2 Dateien");
    await expect(page.getByTestId("workspace-health")).toContainText("missing.md");

    await page.getByTestId("workspace-readonly").click();
    await expect(page.getByTestId("workspace-readonly")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { __bloommdWorkspaceMock?: { state: { readwrite: string } } }).__bloommdWorkspaceMock?.state.readwrite;
    })).toBe("granted");
  });

  test("shows a dismissible app notice without blocking the toolbar", async ({ page, request }) => {
    const email = uniqueEmail("app-notice");
    await createAccount(request, email);
    await suppressOnboarding(page);
    await login(page, email);

    const firstNode = page.locator('[data-testid="mindmap-node"]').first();
    await expect(firstNode).toBeVisible();
    const firstNodeLabel = await firstNode.getAttribute("data-node-label");
    await firstNode.click();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("bloommd:open-resource", { detail: { kind: "file" } }));
    });
    await expect(page.getByTestId("app-notice")).toBeVisible();
    await expect(page.getByTestId("app-notice")).toContainText("keine Datei hinterlegt");
    await expect(page.getByTestId("app-notice-node-link")).toContainText(firstNodeLabel ?? "");
    await expect(page.getByTestId("toolbar-save")).toBeVisible();
    await expect.poll(async () => (await page.getByTestId("app-notice").boundingBox())?.width ?? 0).toBeLessThanOrEqual(560);
    await page.getByTestId("app-notice-node-link").click();
    await expect(firstNode).toHaveAttribute("data-selected", "true");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("bloommd:open-resource", { detail: { kind: "file" } }));
    });
    await page.getByRole("button", { name: "Hinweis schließen" }).click();
    await expect(page.getByTestId("app-notice")).toHaveCount(0);
  });

  test("surfaces node links as resources in the map and editor", async ({ page, request }) => {
    const email = uniqueEmail("resources");
    const filename = `e2e-resources-${Date.now()}.md`;
    const title = `E2E Resources ${Date.now()}`;
    await createAccount(request, email);
    await createMindmapFixture(request, filename, title);
    await suppressOnboarding(page);
    await login(page, email);

    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill(title);
    await page.getByTestId("command-palette-item-mindmap").first().click();

    const root = page.locator(`[data-node-label="${title}"]`).first();
    await expect(root).toBeVisible();
    await root.click();
    await expect(page.getByTestId("node-link-badge").first()).toBeVisible();
    await page.getByTestId("node-action-open-editor").click();

    await expect(page.getByTestId("node-resource-panel")).toBeVisible();
    await expect(page.getByText("example.com")).toBeVisible();
    await expect(page.getByTestId("map-link-resource").first()).toBeVisible();
    await expect(page.getByTestId("broken-map-link")).toBeVisible();
    await expect(page.getByTestId("node-backlink")).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __bloommdFocusedNode?: string | null }).__bloommdFocusedNode = null;
      window.addEventListener("bloommd:focus-node", (event) => {
        (window as unknown as { __bloommdFocusedNode?: string | null }).__bloommdFocusedNode =
          (event as CustomEvent<{ nodeId?: string }>).detail.nodeId ?? null;
      }, { once: true });
    });
    await page.getByTestId("map-link-resource").first().click();
    const evidenceNode = page.locator('[data-node-label="Evidence"]').first();
    await expect(evidenceNode).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("node-editor")).toContainText("Evidence");
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { __bloommdFocusedNode?: string | null }).__bloommdFocusedNode;
    })).toBe("fixture-evidence");

    await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
  });

  test("covers canvas selection, sibling creation, edge modes, focus branch and editor shell", async ({ page, request }) => {
    const email = uniqueEmail("canvas-editor");
    const filename = `e2e-canvas-editor-${Date.now()}.md`;
    const title = `E2E Canvas Editor ${Date.now()}`;
    await createAccount(request, email);
    await createMindmapFixture(request, filename, title);
    await suppressOnboarding(page);
    await login(page, email);

    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill(title);
    await page.getByTestId("command-palette-item-mindmap").first().click();

    const rootNode = page.locator(`[data-node-label="${title}"]`).first();
    const evidenceNode = page.locator('[data-node-label="Evidence"]').first();
    await expect(rootNode).toBeVisible();
    await expect(evidenceNode).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="hierarchy"]')).toHaveCount(1);

    await evidenceNode.click();
    await expect(evidenceNode).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("node-action-toolbar")).toBeVisible();
    await expect(page.getByTestId("node-action-add-child")).toBeVisible();
    await expect(page.getByTestId("node-action-add-sibling")).toBeVisible();
    await expect(page.getByTestId("node-action-open-editor")).toBeVisible();
    await page.keyboard.press("R");
    await expect(evidenceNode.locator("input")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(evidenceNode.locator("input")).toHaveCount(0);

    await evidenceNode.click();
    await page.getByTestId("node-action-add-sibling").click();
    const newSiblingCandidate = page.locator(NEW_NODE_SELECTOR).first();
    await expect(newSiblingCandidate).toBeVisible();
    const newSiblingId = await newSiblingCandidate.getAttribute("data-node-id");
    expect(newSiblingId).toBeTruthy();
    const newSibling = page.locator(`[data-testid="mindmap-node"][data-node-id="${newSiblingId}"]`);
    await expect(newSibling.locator("input")).toBeFocused();
    await newSibling.locator("input").press("Enter");
    await expect(newSibling).toBeFocused();
    await newSibling.press("Backspace");
    await expect(newSibling).toHaveCount(0);
    await expect(page.locator('[data-testid="mindmap-node"][data-node-id="fixture-root"]')).toBeFocused();
    await expect(page.getByTestId("canvas-undo")).toBeEnabled();

    const minimap = page.locator(".react-flow__minimap").first();
    const controls = page.locator(".react-flow__controls").first();
    await expect(minimap).toBeVisible();
    await expect(controls).toBeVisible();
    const viewport = page.locator(".react-flow__viewport").first();
    // Fit View may already be at the maximum zoom for a small map.
    const viewportBeforeZoomOut = await viewport.getAttribute("style");
    await controls.getByRole("button", { name: /zoom out/i }).click();
    await expect.poll(() => viewport.getAttribute("style")).not.toBe(viewportBeforeZoomOut);
    const viewportBeforeZoom = await viewport.getAttribute("style");
    await controls.getByRole("button", { name: /zoom in/i }).click();
    await expect.poll(() => viewport.getAttribute("style")).not.toBe(viewportBeforeZoom);
    await controls.getByRole("button", { name: /fit view/i }).click();
    await page.waitForTimeout(350);

    const viewportBeforePan = await readViewportTransform(page);
    await page.locator(".react-flow__pane").hover();
    await page.mouse.wheel(120, 80);
    await expect.poll(async () => {
      const current = await readViewportTransform(page);
      return Math.abs(current.x - viewportBeforePan.x) + Math.abs(current.y - viewportBeforePan.y);
    }).toBeGreaterThan(0);
    const viewportAfterPan = await readViewportTransform(page);
    expect(viewportAfterPan.scale).toBeCloseTo(viewportBeforePan.scale, 2);

    await evidenceNode.click();
    await expect(page.getByTestId("canvas-copy")).toBeEnabled();
    await page.getByTestId("canvas-copy").click();
    await page.getByTestId("canvas-paste").click();
    await expect(page.locator('[data-node-label="Evidence"]')).toHaveCount(2);
    await page.getByTestId("canvas-undo").click();
    await expect(page.locator('[data-node-label="Evidence"]')).toHaveCount(1);
    await expect(page.getByTestId("canvas-redo")).toBeEnabled();
    await page.getByTestId("canvas-redo").click();
    await expect(page.locator('[data-node-label="Evidence"]')).toHaveCount(2);

    await page.getByTestId("edge-mode").selectOption("links");
    await expect(page.getByTestId("edge-mode")).toHaveValue("links");
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="link"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="hierarchy"]')).toHaveCount(0);

    await page.getByTestId("edge-mode").selectOption("backlinks");
    await expect(page.getByTestId("edge-mode")).toHaveValue("backlinks");
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="backlink"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="hierarchy"]')).toHaveCount(0);

    await page.getByTestId("edge-mode").selectOption("all");
    await expect(page.getByTestId("edge-mode")).toHaveValue("all");
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="hierarchy"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="link"]').first()).toBeVisible();

    await page.getByTestId("edge-mode").selectOption("hierarchy");
    await expect(page.getByTestId("edge-mode")).toHaveValue("hierarchy");
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="hierarchy"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-edge"][data-relation="link"]')).toHaveCount(0);

    await evidenceNode.click();
    await page.getByTestId("canvas-focus").click();
    await expect(page.getByTestId("canvas-focus")).toBeEnabled();
    await page.getByTestId("view-mode-outline").click();
    await expect(page.getByTestId("outline-view")).toBeVisible();
    await expect(page.getByTestId("outline-view")).toContainText("Evidence");
    await expect(page.getByTestId("outline-view")).not.toContainText(title);
    await page.getByTestId("canvas-focus").click();
    await page.getByTestId("view-mode-map").click();

    await evidenceNode.click();
    await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("node-editor")).toHaveCount(0);
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("node-editor")).toBeVisible();
    const richEditor = page.locator(".mdxeditor [contenteditable]").first();
    await expect(richEditor).toBeVisible();
    await richEditor.fill("Edited content from Playwright.");
    await expect(richEditor).toContainText("Edited content from Playwright.");

    const resizeHandle = page.getByTestId("editor-resize-handle");
    const editorBeforeResize = await page.getByTestId("node-editor").boundingBox();
    const handleBox = await resizeHandle.boundingBox();
    expect(editorBeforeResize).not.toBeNull();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 40);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x - 90, handleBox!.y + 40, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await page.getByTestId("node-editor").boundingBox())?.width ?? 0).toBeGreaterThan(editorBeforeResize!.width + 40);

    await page.getByTestId("node-kind-select").selectOption("web");
    await page.getByTestId("node-url-input").fill("https://example.com/evidence");
    await page.getByTestId("node-url-input").blur();
    await expect(evidenceNode).toHaveAttribute("data-node-kind", "web");
    await page.route("**/api/link-preview?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          preview: {
            title: "Example evidence",
            description: "Preview loaded through the product app shell.",
          },
        }),
      });
    });
    await page.getByRole("button", { name: "Website-Vorschau laden" }).click();
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Example evidence");
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "URL öffnen" }).click();
    const popup = await popupPromise;
    expect(popup.url()).toBe("https://example.com/evidence");
    await popup.close();
    await page.getByTestId("node-kind-select").selectOption("portal");
    await expect(page.getByTestId("node-portal-panel")).toBeVisible();
    await expect(page.getByTestId("node-resource-issue")).toContainText("Ziel-Map");
    await expect(evidenceNode.getByTestId("node-resource-issue-badge")).toBeVisible();
    await expect(page.getByTestId("node-portal-map-select")).toContainText(title);
    await page.getByTestId("node-kind-select").selectOption("task");
    await page.getByTestId("node-task-status").selectOption("done");
    await expect(evidenceNode).toHaveAttribute("data-node-kind", "task");
    await expect(evidenceNode.getByTestId("node-resource-issue-badge")).toHaveCount(0);

    const metadataSaveResponse = page.waitForResponse((response) => {
      return response.url().includes(`/api/mindmaps/${encodeURIComponent(filename)}`) && response.request().method() === "PUT";
    });
    await page.evaluate(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    const metadataSave = await metadataSaveResponse;
    await expect(metadataSave.ok()).toBe(true);
    const savedMarkdown = (metadataSave.request().postDataJSON() as { markdown?: string }).markdown ?? "";
    expect(savedMarkdown).toContain("Edited content from Playwright.");
    expect(savedMarkdown).toContain('"kind":"task"');
    expect(savedMarkdown).toContain('"status":"done"');

    await page.keyboard.press("Alt+Enter");
    await expect(page.getByTestId("node-editor")).toHaveCount(0);
    await evidenceNode.getByRole("button", { name: /Toggle task|Aufgabe umschalten/ }).click();
    await expect(page.getByTestId("canvas-undo")).toBeEnabled();
    await evidenceNode.click();
    await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await page.getByTestId("node-editor-delete").click();
    await expect(page.locator('[data-node-label="Evidence"]')).toHaveCount(0);
    await expect(rootNode).toBeVisible();

    await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
  });

  test("shows a save conflict diff and lets the user save a copy", async ({ page, request }) => {
    const email = uniqueEmail("save-conflict");
    const filename = `e2e-conflict-${Date.now()}.md`;
    const title = `E2E Conflict ${Date.now()}`;
    const createdFilenames = [filename];
    await createAccount(request, email);
    await createMindmapFixture(request, filename, title);
    await suppressOnboarding(page);
    await login(page, email);

    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill(title);
    await page.getByTestId("command-palette-item-mindmap").first().click();
    await expect(page.locator(`[data-node-label="${title}"]`).first()).toBeVisible();

    await page.route(`**/api/mindmaps/${encodeURIComponent(filename)}`, async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          conflict: {
            markdown: [
              "---",
              "title: Stored Conflict",
              "id: stored-conflict",
              "---",
              "",
              "# Stored Conflict <!-- bloommd:id=stored-root -->",
              "",
              "Stored server-side change.",
            ].join("\n"),
            version: 41,
          },
        }),
      });
    });

    await page.getByTestId("toolbar-save").click();
    await expect(page.getByTestId("conflict-dialog")).toBeVisible();
    await expect(page.getByTestId("conflict-diff")).toContainText("Stored server-side change.");
    await expect(page.getByTestId("conflict-diff")).toContainText(title);
    await expect(page.getByTestId("conflict-reload")).toBeVisible();
    await expect(page.getByTestId("conflict-keep-mine")).toBeVisible();

    const copyResponse = page.waitForResponse((response) => {
      return response.url().endsWith("/api/mindmaps") && response.request().method() === "POST";
    });
    await page.getByTestId("conflict-save-copy").click();
    const copyApiResponse = await copyResponse;
    await expect(copyApiResponse.ok()).toBe(true);
    const copyBody = copyApiResponse.request().postDataJSON() as { filename?: string };
    if (copyBody.filename) createdFilenames.push(copyBody.filename);
    await expect(page.getByTestId("conflict-dialog")).toHaveCount(0);

    await page.unroute(`**/api/mindmaps/${encodeURIComponent(filename)}`);
    for (const createdFilename of createdFilenames) {
      await request.delete(`/api/mindmaps/${encodeURIComponent(createdFilename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });
});

test.describe("shortcut workflows", () => {
  test("opens shortcut help with question mark", async ({ page, request }) => {
    const email = uniqueEmail("shortcuts");
    await createAccount(request, email);
    await suppressOnboarding(page);
    await login(page, email);

    await page.keyboard.press("?");
    await expect(page.getByTestId("shortcut-help")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Keyboard Shortcuts|Tastaturkürzel/ })).toBeVisible();
    await expect(page.getByText(/Add child node|Kind-Node erstellen/)).toBeVisible();
  });

  test("saves the current mindmap with Cmd+S", async ({ page, request }) => {
    const email = uniqueEmail("node");
    const filename = `e2e-save-${Date.now()}.md`;
    const title = `E2E Save ${Date.now()}`;
    await createAccount(request, email);
    await createMindmapFixture(request, filename, title);
    await suppressOnboarding(page);
    await login(page, email);

    await page.keyboard.press("Control+K");
    await page.getByTestId("command-palette-input").fill(title);
    await page.getByTestId("command-palette-item-mindmap").first().click();

    const firstBranch = page.locator('[data-node-label="Evidence"]').first();
    await expect(firstBranch).toBeVisible();
    await firstBranch.click();
    await expect(page.getByTestId("node-action-toolbar")).toBeVisible();

    const saveResponse = page.waitForResponse((response) => {
      return response.url().includes("/api/mindmaps/") && response.request().method() === "PUT";
    });
    await page.evaluate(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await expect((await saveResponse).ok()).toBe(true);
    await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
  });
});

test.describe("beta onboarding", () => {
  test("shows beta scope and opens the in-app feedback form from onboarding", async ({ page, request }) => {
    const email = `beta-${Date.now()}@example.com`;
    await createAccount(request, email);
    await page.route("**/api/feedback", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          feedbackId: "11111111-1111-4111-8111-111111111111",
          issueUrl: "https://github.com/moellenbeck-digital/BloomMD/issues/999",
        }),
      });
    });
    await login(page, email);

    // A fresh account opens the onboarding automatically, so there is nothing to click here.
    const scope = page.getByTestId("onboarding-beta-scope");
    await expect(scope).toBeVisible();
    // Mobile must never be presented as available (#40).
    await expect(scope).toContainText("Mobile ist nicht verfügbar");

    const feedback = page.getByTestId("onboarding-feedback-link");
    await expect(feedback).toBeVisible();
    await feedback.click();
    await expect(page.getByTestId("feedback-dialog")).toBeVisible();
    await page.locator('textarea[name="message"]').fill("Feedback submit regression coverage for the beta dialog.");
    await page.locator('input[name="screenshots"]').setInputFiles({
      name: "feedback-smoke.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l6Av6QAAAABJRU5ErkJggg==", "base64"),
    });
    await page.getByTestId("submit-feedback").click();
    await expect(page.getByTestId("feedback-result")).toContainText("Danke, dein Feedback ist im Beta-Board angekommen.");
  });
});
