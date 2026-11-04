import { expect, test, type Browser, type Page } from "@playwright/test";
import { BROWSER_LOCALE, capture, LOCALES, readFixtureVault, type Locale } from "./shared";

/**
 * Pictures of the web app for the online help. Server: the web app of
 * `playwright.docs-screenshots.config.ts`, running with the E2E auth bypass (no database, no mail).
 *
 * Local folder: the browser's folder picker cannot be operated, so `window.showDirectoryPicker` is
 * replaced by an in-memory folder filled from the checked-in `test-vault/`. The app goes through the
 * same File System Access code as with a real folder, including the read-only state.
 */

const PASSWORD = "Docs-Screenshots-12345";
const FIXTURE = readFixtureVault();
/** A few notes of the fixture vault: the full vault makes an unreadable overview map. */
const SMALL_FOLDER = Object.fromEntries(
  Object.entries(FIXTURE).filter(([path]) => /^(Konzepte|Personen|Buch\/Teil-1)\//.test(path)),
);

function uniqueEmail(label: string) {
  return `docs-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

/** Fixed, non-personal values for the registration form; the form is only filled, never sent. */
const SIGNUP_EXAMPLE = { name: "Alex", email: "alex@example.com" };

async function prepare(page: Page, locale: Locale) {
  await page.addInitScript((selectedLocale) => {
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", selectedLocale);
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd_demo_guided_seen", "1");
  }, locale);
}

/** Registers a throw-away account through the bypass and lands in `/app`. */
async function signUpAndOpenApp(page: Page, locale: Locale, label: string) {
  await prepare(page, locale);
  await page.goto(`/signup?next=${encodeURIComponent(`/app?lang=${locale}`)}&lang=${locale}`);
  await page.getByTestId("signup-form").locator('input[name="name"]').fill("Docs");
  await page.getByTestId("signup-form").locator('input[name="email"]').fill(uniqueEmail(label));
  await page.getByTestId("signup-form").locator('input[name="password"]').fill(PASSWORD);
  await page.getByTestId("signup-consent").check();
  await page.getByTestId("signup-submit").click();
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.getByTestId("mindmap-canvas")).toBeVisible();
}

/** An in-memory folder that starts read-only; `requestPermission({ mode: "readwrite" })` grants writing. */
async function installFolderMock(page: Page, files: Record<string, string>, folderName: string) {
  await page.addInitScript(
    ({ seed, name }) => {
      const store: Record<string, string> = { ...seed };
      type Permission = "granted" | "denied" | "prompt";
      const state = { readwrite: "denied" as Permission };

      class MockFileHandle {
        readonly kind = "file";
        constructor(readonly name: string, private readonly path: string) {}
        async getFile() {
          const path = this.path;
          return { text: async () => store[path] ?? "" };
        }
        async queryPermission(options?: { mode?: string }) {
          return options?.mode === "readwrite" ? state.readwrite : "granted";
        }
        async requestPermission(options?: { mode?: string }) {
          if (options?.mode === "readwrite") state.readwrite = "granted";
          return options?.mode === "readwrite" ? state.readwrite : "granted";
        }
        async createWritable() {
          const path = this.path;
          return {
            async write(value: string) {
              store[path] = value;
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
          return options?.mode === "readwrite" ? state.readwrite : "granted";
        }
        async requestPermission(options?: { mode?: string }) {
          if (options?.mode === "readwrite") state.readwrite = "granted";
          return options?.mode === "readwrite" ? state.readwrite : "granted";
        }
        private childPath(child: string) {
          return this.prefix ? `${this.prefix}/${child}` : child;
        }
        async *entries(): AsyncIterable<[string, MockDirectoryHandle | MockFileHandle]> {
          const direct = new Map<string, boolean>();
          const base = this.prefix ? `${this.prefix}/` : "";
          for (const path of Object.keys(store)) {
            if (!path.startsWith(base)) continue;
            const [first, ...rest] = path.slice(base.length).split("/");
            if (first) direct.set(first, rest.length > 0);
          }
          for (const [child, isDirectory] of direct) {
            const path = this.childPath(child);
            yield [child, isDirectory ? new MockDirectoryHandle(child, path) : new MockFileHandle(child, path)];
          }
        }
        async getDirectoryHandle(child: string, options?: { create?: boolean }) {
          const path = this.childPath(child);
          if (!Object.keys(store).some((filePath) => filePath.startsWith(`${path}/`)) && !options?.create) {
            throw new Error(`No such directory: ${path}`);
          }
          return new MockDirectoryHandle(child, path);
        }
        async getFileHandle(child: string, options?: { create?: boolean }) {
          const path = this.childPath(child);
          if (!(path in store)) {
            if (!options?.create) throw new Error(`No such file: ${path}`);
            store[path] = "";
          }
          return new MockFileHandle(child, path);
        }
      }

      Object.defineProperty(window, "showDirectoryPicker", {
        value: async () => new MockDirectoryHandle(name),
        configurable: true,
      });
    },
    { seed: files, name: folderName },
  );
}

for (const locale of LOCALES) {
  test.describe(`docs screenshots (${locale}) @t69`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });

    test("registration page", async ({ page }) => {
      await prepare(page, locale);
      await page.goto(`/signup?next=%2Fapp&lang=${locale}`);
      const form = page.getByTestId("signup-form");
      await expect(form).toBeVisible();
      await form.locator('input[name="name"]').fill(SIGNUP_EXAMPLE.name);
      await form.locator('input[name="email"]').fill(SIGNUP_EXAMPLE.email);
      await form.locator('input[name="password"]').fill(PASSWORD);
      await page.getByTestId("signup-consent").check();
      await capture(page, "signup", locale);
    });

    test("page after registration asks for the email confirmation", async ({ page }) => {
      await prepare(page, locale);
      await page.goto(`/login?next=%2Fapp&verification=sent&lang=${locale}&email=${encodeURIComponent(SIGNUP_EXAMPLE.email)}`);
      await expect(page.locator("form[action='/api/auth/login']")).toBeVisible();
      await capture(page, "signup-verify", locale);
    });

    test("web app with an opened Markdown map", async ({ page }) => {
      await installFolderMock(page, SMALL_FOLDER, "test-vault");
      await signUpAndOpenApp(page, locale, "map");
      await page.getByTestId("open-browser-workspace").click();
      await expect(page.getByTestId("workspace-readonly")).toBeVisible();
      await page.getByTestId("workspace-readonly").click();
      await expect(page.getByTestId("workspace-readonly")).toHaveCount(0);
      await page.getByLabel("Local workspace file").selectOption("Buch/Teil-1/Kapitel 1.md");
      await expect(page.locator('[data-node-label="Kapitel 1"]').first()).toBeVisible();
      await capture(page, "web-app-map", locale);
    });

    test("template picker in the new-file dialog", async ({ page }) => {
      await installFolderMock(page, SMALL_FOLDER, "test-vault");
      await signUpAndOpenApp(page, locale, "templates");
      await page.getByTestId("open-browser-workspace").click();
      await page.getByTestId("workspace-readonly").click();
      await expect(page.getByTestId("workspace-readonly")).toHaveCount(0);
      await page.getByTestId("create-file").click();
      const dialog = page.getByTestId("create-entry-dialog");
      await expect(dialog).toBeVisible();
      await page.getByTestId("create-entry-template").selectOption({ value: "lecture" });
      await page.getByTestId("create-entry-name").fill(locale === "de" ? "Vorlesung Graphen" : "Lecture graphs");
      await capture(page, "templates", locale);
    });

    test("sync status of a map in the cloud workspace", async ({ page }) => {
      await signUpAndOpenApp(page, locale, "sync");
      await expect(page.getByTestId("sync-status")).toContainText(locale === "de" ? "Synchronisiert" : "Synced");
      await capture(page, "sync-status", locale);
    });

    test("open a local folder: read-only notice", async ({ page }) => {
      await installFolderMock(page, SMALL_FOLDER, "test-vault");
      await signUpAndOpenApp(page, locale, "folder");
      await page.getByTestId("open-browser-workspace").click();
      await expect(page.getByTestId("workspace-readonly")).toBeVisible();
      await page.getByLabel("Local workspace file").selectOption("Konzepte/Graphentheorie.md");
      await expect(page.locator('[data-node-label="Graphentheorie"]').first()).toBeVisible();
      await expect(page.getByTestId("workspace-readonly")).toBeVisible();
      await capture(page, "web-open-folder", locale);
    });
  });
}

export type { Browser };
