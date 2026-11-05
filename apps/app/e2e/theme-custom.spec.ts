import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Custom colour themes (#74): chosen in the toolbar menu, stored in this browser only
 * (`bloommd-theme-custom`) and applied by the blocking script in `<head>` before first paint.
 */

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };
const STORAGE_KEY = "bloommd-theme-custom";

function uniqueEmail() {
  return `e2e-theme-custom-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E Test", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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

async function openThemeDialog(page: Page) {
  await page.getByTestId("toolbar-help-menu").click();
  await page.getByTestId("toolbar-theme-custom").click();
  await expect(page.getByTestId("theme-custom-dialog")).toBeVisible();
}

const readToken = (page: Page, name: string) =>
  page.evaluate((token) => document.documentElement.style.getPropertyValue(token).trim(), name);

test.describe("first paint", () => {
  test("a stored custom theme is applied before the page renders", async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, JSON.stringify({ name: "Ocean", base: "light", accent: "#0B5FA5", surface: "#F4F8FB", ink: "#12202B" }));
    }, STORAGE_KEY);
    await page.goto("/login", { waitUntil: "commit" });

    // `commit`: the head script has run, React has not hydrated.
    await expect.poll(() => readToken(page, "--color-surface")).toBe("#F4F8FB");
    expect(await readToken(page, "--color-bloom")).toBe("#0B5FA5");
    expect(await readToken(page, "--color-ink")).toBe("#12202B");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("a dark custom theme switches the page to dark, whatever the plain theme says", async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem("bloommd-theme", "light");
      window.localStorage.setItem(key, JSON.stringify({ name: "Midnight", base: "dark", accent: "#7AB2FF", surface: "#0F1626", ink: "#E6ECF7" }));
    }, STORAGE_KEY);
    await page.goto("/login", { waitUntil: "commit" });

    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await readToken(page, "--color-surface")).toBe("#0F1626");
  });

  test("a stored theme with too little contrast is ignored", async ({ page }) => {
    await page.addInitScript((key) => {
      // Light grey text on a white surface: far below 4.5:1.
      window.localStorage.setItem(key, JSON.stringify({ name: "Unlesbar", base: "light", accent: "#0B5FA5", surface: "#FFFFFF", ink: "#CCCCCC" }));
    }, STORAGE_KEY);
    await page.goto("/login", { waitUntil: "commit" });

    expect(await readToken(page, "--color-surface")).toBe("");
    await expect(page.locator("form").first()).toBeVisible();
  });

  test("a garbled stored value keeps the plain theme", async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, "{not json"), STORAGE_KEY);
    await page.goto("/login", { waitUntil: "commit" });

    expect(await readToken(page, "--color-surface")).toBe("");
    await expect(page.locator("form").first()).toBeVisible();
  });
});

test.describe("toolbar dialog", () => {
  test("applies a preset, keeps it after reload and resets to the standard theme", async ({ page, request }) => {
    const email = uniqueEmail();
    await createAccount(request, email);
    await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));
    await login(page, email);

    await openThemeDialog(page);
    await page.getByTestId("theme-custom-preset-ocean").click();
    await expect(page.getByTestId("theme-custom-accent")).toHaveValue("#0B5FA5");
    await page.getByTestId("theme-custom-save").click();
    await expect(page.getByTestId("theme-custom-dialog")).toBeHidden();

    expect(await readToken(page, "--color-surface")).toBe("#F4F8FB");
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ name: "Ocean", base: "light", accent: "#0B5FA5" });

    await page.reload();
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
    expect(await readToken(page, "--color-surface")).toBe("#F4F8FB");

    await page.getByTestId("toolbar-help-menu").click();
    await page.getByTestId("toolbar-theme-reset").click();
    await expect.poll(() => readToken(page, "--color-surface")).toBe("");
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  });

  test("refuses to save text colours with too little contrast and says why", async ({ page, request }) => {
    const email = uniqueEmail();
    await createAccount(request, email);
    await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));
    await login(page, email);

    await openThemeDialog(page);
    await page.getByTestId("theme-custom-name").fill("Zu blass");
    await page.getByTestId("theme-custom-accent").fill("#0B5FA5");
    await page.getByTestId("theme-custom-surface").fill("#FFFFFF");
    await page.getByTestId("theme-custom-ink").fill("#CCCCCC");
    await page.getByTestId("theme-custom-save").click();

    await expect(page.getByTestId("theme-custom-error")).toBeVisible();
    await expect(page.getByTestId("theme-custom-ink")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("theme-custom-dialog")).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    // A readable text colour on the same surface goes through.
    await page.getByTestId("theme-custom-ink").fill("#1A1A1A");
    await page.getByTestId("theme-custom-save").click();
    await expect(page.getByTestId("theme-custom-dialog")).toBeHidden();
    expect(await readToken(page, "--color-surface")).toBe("#FFFFFF");
  });

  test("closes with Escape without saving", async ({ page, request }) => {
    const email = uniqueEmail();
    await createAccount(request, email);
    await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));
    await login(page, email);

    await openThemeDialog(page);
    await page.getByTestId("theme-custom-preset-forest").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("theme-custom-dialog")).toBeHidden();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  });
});
