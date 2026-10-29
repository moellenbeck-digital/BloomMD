import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Ticket #7 — Vorlagen als Markdown (Web-Dialog „+ Datei“ im lokalen Browser-Workspace).
 *
 * Der Ordner-Picker des Browsers lässt sich nicht bedienen. Wie in auth-shortcuts.spec.ts ersetzt ein
 * In-Memory-Ordner `window.showDirectoryPicker`; die App legt die Dateien über denselben
 * File-System-Access-Code an wie bei einem echten Ordner.
 *
 * Nicht prüfbar mit diesen Tests (Kriterien 7 und 8):
 * - Desktop-App (Knopf „Neu aus Vorlage“, `toolbar-create-from-template`): eigene Electrobun-Anwendung,
 *   nicht über das Web-Dev-System erreichbar.
 * - Obsidian-Plugin (Kommando „New note from template“, Einstellung „Template folder“): läuft nur in Obsidian.
 */

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;

type Locale = "de" | "en";

const BUILT_IN = [
  { id: "lecture", de: "Vorlesung", en: "Lecture" },
  { id: "cornell", de: "Cornell", en: "Cornell" },
  { id: "literature", de: "Literaturnotiz", en: "Literature note" },
  { id: "exam", de: "Prüfungsvorbereitung", en: "Exam prep" },
  { id: "project", de: "Projekt", en: "Project" },
] as const;

const BLANK_LABEL: Record<Locale, string> = { de: "Leer", en: "Blank" };
const BUILT_IN_GROUP: Record<Locale, string> = { de: "Eingebaut", en: "Built-in" };
const CUSTOM_GROUP: Record<Locale, string> = { de: "Eigene (Ordner Vorlagen)", en: "Your own (Vorlagen folder)" };

const OVERVIEW_MD = "# Overview\n\nText\n";

function uniqueEmail() {
  return `e2e-t7-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: { Origin: API_ORIGIN },
    form: { name: "E2E Vorlagen", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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

/** In-Memory-Ordner mit Schreibrecht; `files` enthält zu Beginn `seed`. */
async function installWorkspaceMock(page: Page, seed: Record<string, string>) {
  await page.addInitScript(
    ({ seed: initialFiles }) => {
      window.localStorage.setItem("bloommd_onboarding_seen", "1");

      // Das Dev-System läuft über http auf einem Cluster-Namen, also ohne „secure context“: dort fehlt
      // `crypto.randomUUID`, das der Markdown-Parser beim Öffnen einer Map braucht.
      if (typeof crypto.randomUUID !== "function") {
        Object.defineProperty(crypto, "randomUUID", {
          configurable: true,
          value: () =>
            "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
              const random = crypto.getRandomValues(new Uint8Array(1))[0]! & 15;
              return (char === "x" ? random : (random & 3) | 8).toString(16);
            }),
        });
      }

      const files: Record<string, string> = { ...initialFiles };
      const dirs = new Set<string>();

      class MockFileHandle {
        readonly kind = "file";
        constructor(readonly name: string, private readonly path: string) {}
        async getFile() {
          const path = this.path;
          return { text: async () => files[path] ?? "" };
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
        private childPath(name: string) {
          return this.prefix ? `${this.prefix}/${name}` : name;
        }
        async *entries(): AsyncIterable<[string, MockDirectoryHandle | MockFileHandle]> {
          const seen = new Map<string, "file" | "dir">();
          const base = this.prefix ? `${this.prefix}/` : "";
          for (const path of Object.keys(files)) {
            if (!path.startsWith(base)) continue;
            const [first, ...rest] = path.slice(base.length).split("/");
            if (first) seen.set(first, rest.length > 0 ? "dir" : "file");
          }
          for (const dir of dirs) {
            if (!dir.startsWith(base)) continue;
            const [first] = dir.slice(base.length).split("/");
            if (first && !seen.has(first)) seen.set(first, "dir");
          }
          for (const [name, type] of seen) {
            const path = this.childPath(name);
            yield [name, type === "file" ? new MockFileHandle(name, path) : new MockDirectoryHandle(name, path)];
          }
        }
        async getDirectoryHandle(name: string, options?: { create?: boolean }) {
          const path = this.childPath(name);
          const exists = dirs.has(path) || Object.keys(files).some((filePath) => filePath.startsWith(`${path}/`));
          if (!exists) {
            if (!options?.create) throw new Error(`No such directory: ${path}`);
            dirs.add(path);
          }
          return new MockDirectoryHandle(name, path);
        }
        async getFileHandle(name: string, options?: { create?: boolean }) {
          const path = this.childPath(name);
          if (!(path in files)) {
            if (!options?.create) throw new Error(`No such file: ${path}`);
            files[path] = "";
          }
          return new MockFileHandle(name, path);
        }
      }

      Object.defineProperty(window, "__t7Workspace", { value: { files }, configurable: true });
      Object.defineProperty(window, "showDirectoryPicker", {
        value: async () => new MockDirectoryHandle("T7 Workspace"),
        configurable: true,
      });
    },
    { seed },
  );
}

async function startSession(page: Page, request: APIRequestContext, locale: Locale, seed: Record<string, string> = {}) {
  const email = uniqueEmail();
  await createAccount(request, email);
  await installWorkspaceMock(page, { "overview.md": OVERVIEW_MD, ...seed });
  await login(page, email);
  if (locale === "en") {
    // Die App startet auf Deutsch; die Oberfläche wird wie im Betrieb über das Hilfe-Menü umgestellt.
    await page.getByTestId("toolbar-help-menu").click();
    await page.getByTestId("toolbar-locale").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("bloommd-locale"))).toBe("en");
  }
  await page.getByTestId("open-browser-workspace").click();
  await expect(page.getByTestId("create-file")).toBeVisible();
}

async function openCreateDialog(page: Page) {
  await page.getByTestId("create-file").click();
  await expect(page.getByTestId("create-entry-dialog")).toBeVisible();
}

async function createFile(page: Page, name: string, templateLabel?: string) {
  await openCreateDialog(page);
  if (templateLabel) await page.getByTestId("create-entry-template").selectOption({ label: templateLabel });
  await page.getByTestId("create-entry-name").fill(name);
  await page.getByTestId("create-entry-submit").click();
  await expect(page.getByTestId("create-entry-dialog")).toHaveCount(0);
}

async function readCreated(page: Page, path: string) {
  return page.evaluate(
    (key) => (window as unknown as { __t7Workspace: { files: Record<string, string> } }).__t7Workspace.files[key],
    path,
  );
}

async function todayInBrowser(page: Page) {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

async function templateOptions(page: Page) {
  const select = page.getByTestId("create-entry-template");
  return select.locator("option").allTextContents();
}

async function groupOptions(page: Page, groupLabel: string) {
  return page.getByTestId("create-entry-template").locator(`optgroup[label="${groupLabel}"] option`).allTextContents();
}

function headings(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => /^(#{1,6}) (.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ level: match[1]!.length, text: match[2]! }));
}

function expectNoHierarchyJumps(markdown: string) {
  const found = headings(markdown);
  expect(found.length).toBeGreaterThan(1);
  expect(found[0]!.level).toBe(1);
  found.forEach((heading, index) => {
    if (index > 0) expect(heading.level).toBeLessThanOrEqual(found[index - 1]!.level + 1);
  });
}

/** Die Datei ist als Map geöffnet: Wurzel = Titel, jede Überschrift ein Knoten, keine Fehlermeldung. */
async function expectOpenedAsMap(page: Page, markdown: string) {
  const found = headings(markdown);
  const [root, ...sections] = found;
  await expect(page.locator(`[data-testid="mindmap-node"][data-node-label="${root!.text}"]`).first()).toBeVisible();
  for (const section of sections) {
    await expect(page.locator(`[data-testid="mindmap-node"][data-node-label="${section.text}"]`).first()).toBeVisible();
  }
  await expect(page.locator("div.text-red-500")).toHaveCount(0);
}

test.describe("Vorlagen für neue Dateien", () => {
  test("K1: Auswahl „Vorlage“, Voreinstellung „Leer“ legt nur die Überschrift an @t7", async ({ page, request }) => {
    await startSession(page, request, "de");
    await openCreateDialog(page);

    const select = page.getByTestId("create-entry-template");
    await expect(select).toBeVisible();
    await expect(page.getByTestId("create-entry-dialog").getByText("Vorlage", { exact: true })).toBeVisible();
    await expect(select).toHaveValue("");
    await expect(select.locator("option:checked")).toHaveText("Leer");

    await page.getByTestId("create-entry-name").fill("test-t7-leer");
    await page.getByTestId("create-entry-submit").click();
    await expect(page.getByTestId("create-entry-dialog")).toHaveCount(0);

    expect(await readCreated(page, "test-t7-leer.md")).toBe("# test-t7-leer\n\n");
    await expect(page.locator('[data-testid="mindmap-node"][data-node-label="test-t7-leer"]').first()).toBeVisible();
    await expect(page.locator("div.text-red-500")).toHaveCount(0);
  });

  for (const locale of ["de", "en"] as const) {
    test(`K2: unter „${BUILT_IN_GROUP[locale]}“ stehen die fünf Vorlagen in ${locale.toUpperCase()} @t7`, async ({ page, request }) => {
      await startSession(page, request, locale);
      await openCreateDialog(page);

      expect(await groupOptions(page, BUILT_IN_GROUP[locale])).toEqual(BUILT_IN.map((template) => template[locale]));
      expect(await templateOptions(page)).toEqual([BLANK_LABEL[locale], ...BUILT_IN.map((template) => template[locale])]);
    });
  }

  test("K3: Cornell als „test-t7“ — Überschrift, Abschnitte, Map ohne Fehler und Sprünge @t7", async ({ page, request }) => {
    await startSession(page, request, "de");
    await createFile(page, "test-t7", "Cornell");

    const markdown = await readCreated(page, "test-t7.md");
    expect(markdown).toBeDefined();
    expect(markdown.startsWith("# test-t7\n")).toBe(true);
    expect(headings(markdown).map((heading) => heading.text)).toEqual(["test-t7", "Stichwörter", "Notizen", "Zusammenfassung"]);
    expectNoHierarchyJumps(markdown);
    await expectOpenedAsMap(page, markdown);
  });

  for (const locale of ["de", "en"] as const) {
    test(`K4: alle fünf Vorlagen in ${locale.toUpperCase()} anlegen und als Map öffnen @t7`, async ({ page, request }) => {
      await startSession(page, request, locale);
      const today = await todayInBrowser(page);

      for (const template of BUILT_IN) {
        // Umlaute und Leerzeichen im Namen: der Titel muss ihn unverändert übernehmen.
        const name = template.id === "exam" ? `test-t7 Prüfung Ärger ${locale}` : `test-t7-${template.id}-${locale}`;
        await createFile(page, name, template[locale]);

        const markdown = await readCreated(page, `${name}.md`);
        expect(markdown, `${name}.md wurde angelegt`).toBeDefined();
        expect(markdown.startsWith(`# ${name}\n`)).toBe(true);
        expect(markdown).not.toContain("{{title}}");
        expect(markdown).not.toContain("{{date}}");
        expectNoHierarchyJumps(markdown);
        if (template.id === "lecture") {
          expect(markdown).toContain(`\n${today}\n`);
          expect(markdown).toMatch(/\d{4}-\d{2}-\d{2}/);
        }
        await expectOpenedAsMap(page, markdown);
      }
    });
  }

  test("K5: eigene Vorlage steht hinter den eingebauten, {{title}}/{{date}} ersetzt, {{foo}} bleibt @t7", async ({ page, request }) => {
    await startSession(page, request, "de", {
      "Vorlagen/Meine Vorlage.md": "# {{title}}\n\nDatum: {{date}}\n\nPlatzhalter: {{foo}}\n\n## Teil\n\nText\n",
    });
    const today = await todayInBrowser(page);
    await openCreateDialog(page);

    expect(await groupOptions(page, CUSTOM_GROUP.de)).toEqual(["Meine Vorlage"]);
    expect(await templateOptions(page)).toEqual(["Leer", ...BUILT_IN.map((template) => template.de), "Meine Vorlage"]);
    await page.getByTestId("create-entry-dialog").getByRole("button", { name: "Abbrechen" }).click();
    await expect(page.getByTestId("create-entry-dialog")).toHaveCount(0);

    await createFile(page, "test-t7-eigen", "Meine Vorlage");
    const markdown = await readCreated(page, "test-t7-eigen.md");
    expect(markdown).toBeDefined();
    expect(markdown).toContain("# test-t7-eigen\n");
    expect(markdown).toContain(`Datum: ${today}`);
    expect(markdown).toContain("Platzhalter: {{foo}}");
    expect(markdown).not.toContain("{{title}}");
    expect(markdown).not.toContain("{{date}}");
    await expectOpenedAsMap(page, markdown);
  });

  test("K6a: .md in einem Unterordner von Vorlagen/ erscheint nicht in der Liste @t7", async ({ page, request }) => {
    await startSession(page, request, "de", {
      "Vorlagen/Meine Vorlage.md": "# {{title}}\n",
      "Vorlagen/Unter/Versteckt.md": "# {{title}}\n",
    });
    await openCreateDialog(page);

    expect(await groupOptions(page, CUSTOM_GROUP.de)).toEqual(["Meine Vorlage"]);
    expect(await templateOptions(page)).not.toContain("Versteckt");
    await expect(page.getByTestId("create-entry-template-error")).toHaveCount(0);
  });

  test("K6b: ohne Ordner Vorlagen/ nur die eingebauten Vorlagen, keine Fehlermeldung @t7", async ({ page, request }) => {
    await startSession(page, request, "de");
    await openCreateDialog(page);

    expect(await templateOptions(page)).toEqual(["Leer", ...BUILT_IN.map((template) => template.de)]);
    await expect(page.getByTestId("create-entry-template").locator(`optgroup[label="${CUSTOM_GROUP.de}"]`)).toHaveCount(0);
    await expect(page.getByTestId("create-entry-template-error")).toHaveCount(0);
    await expect(page.getByTestId("create-entry-error")).toHaveCount(0);
  });
});
