/**
 * Ticket #19 — Der Workspace-Speicherhinweis („Workspace-Ansichten sind abgeleitet“) gehört nur zum
 * Workspace-Dokument, für das er entstand, und verschwindet beim Öffnen einer Datei. Alle Fälle tragen @t19.
 *
 * Kriterien K1–K4 stehen im Testtitel, je Kriterium ein eigenes `expect`. Der lokale Ordner kommt aus dem
 * In-Memory-Ordner-Mock (`showDirectoryPicker`, wie in document-tabs.spec.ts); auf dem Server wird nichts
 * geschrieben. Jeder Fall legt ein eigenes Konto an (Repo-Konvention).
 *
 * Nicht prüfbar in diesem Spec: der native Desktop-Smoke, in dem der Fehler auftrat. Geprüft wird die
 * Web-Oberfläche mit denselben UI-Paketen (`Toolbar`, `useMindMapStore.setDocument`); der Store-Test liegt in
 * `packages/ui/src/hooks/useMindMapStore.status-message.test.ts`.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };
const HINT = "Workspace-Ansichten sind abgeleitet";

function uniqueEmail(label: string) {
  return `e2e-t19-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T19", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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
    // Das Dev-System läuft über HTTP (kein sicherer Kontext): `crypto.randomUUID` fehlt dort, und „Knoten
    // anlegen“ scheitert mit „crypto.randomUUID is not a function“. Die Shim gleicht nur das Testsystem aus.
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
  }, locale);
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

const rootOf = (page: Page, title: string) => page.locator(`[data-testid="mindmap-node"][data-node-label="${title}"]`).first();


async function addChildNode(page: Page) {
  const before = await page.locator('[data-testid="mindmap-node"]').count();
  await page.locator('[data-testid="mindmap-node"][aria-level="1"]').first().click();
  await page.getByTestId("node-action-add-child").click();
  const input = page.locator('[data-testid="mindmap-node"] input').first();
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(page.locator('[data-testid="mindmap-node"]')).toHaveCount(before + 1);
}



/** Stand des Ordner-Mocks (Dateiinhalte und angelegte Pfade) als Text. */
const folderState = (page: Page) =>
  page.evaluate(() => {
    const mock = (window as unknown as { __bloommdWorkspaceMock: { files: Record<string, string>; created: string[] } }).__bloommdWorkspaceMock;
    return JSON.stringify({ files: mock.files, created: mock.created });
  });

test.describe("Workspace-Speicherhinweis folgt dem Dokument @t19", () => {
  test.setTimeout(120_000);

  test("K1–K4: Hinweis nach Speichern der Übersicht, weg nach Vorwärtsnavigation zur Datei, Inhalt unverändert @t19", async ({ page, request }) => {
    const email = uniqueEmail("hint");
    await createAccount(request, email);
    await prepare(page);
    await installBrowserWorkspaceMock(page);
    await login(page, email);

    const hint = page.getByRole("status").filter({ hasText: HINT });

    await page.getByTestId("open-browser-workspace").click();
    await expect(page.getByTestId("workspace-readonly")).toBeVisible();
    await page.getByTestId("map-view-workspace").click();
    await expect(page.getByTestId("workspace-map")).toBeVisible();

    // Vorbereitung: Datei einmal öffnen und zur Übersicht zurück, damit es ein „Vorwärts“ gibt.
    await page.locator(".react-flow__node").filter({ has: page.getByTestId("workspace-node-file"), hasText: "overview" }).first().dblclick({ delay: 80 });
    await expect(page.getByTestId("map-view-document")).toHaveAttribute("aria-pressed", "true");
    await expect(rootOf(page, "Local Overview")).toBeVisible();
    await page.getByTestId("workspace-navigation-back").click();
    await expect(page.getByTestId("workspace-map")).toBeVisible();
    await expect(hint).toHaveCount(0);
    const before = await folderState(page);

    // K1: Workspace-Übersicht, Speichern → Hinweis erscheint
    await page.getByTestId("toolbar-save").click();
    await expect(hint).toBeVisible();

    // K2: Vorwärtsnavigation öffnet die Markdown-Datei; sie ist geöffnet und editierbar
    await expect(page.getByTestId("workspace-navigation-forward")).toBeEnabled();
    await page.getByTestId("workspace-navigation-forward").click();
    await expect(page.getByTestId("workspace-map")).toHaveCount(0);
    await expect(rootOf(page, "Local Overview")).toBeVisible();
    await page.getByTestId("workspace-readonly").click();
    await expect(page.getByTestId("workspace-readonly")).toHaveCount(0);
    await addChildNode(page);

    // K3: Hinweis nicht mehr sichtbar (Store-Statusmeldung und App-Hinweis)
    await expect(hint).toHaveCount(0);
    await expect(page.getByText(HINT)).toHaveCount(0);
    await expect(page.getByTestId("app-notice")).toHaveCount(0);

    // K4: Persistenz — Speichern der Übersicht und Öffnen der Datei haben nichts geschrieben oder angelegt;
    // erst das bewusste Speichern der editierten Datei ändert sie (und zeigt keinen Hinweis).
    expect(await folderState(page)).toBe(before);
    await page.getByTestId("toolbar-save").click();
    await expect.poll(() => folderState(page)).not.toBe(before);
    await expect(hint).toHaveCount(0);
  });
});
