import { expect, test, type APIRequestContext } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BETA_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_BETA_PORT ?? "3411"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };

function uniqueEmail(label: string) {
  return `e2e-beta-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function signup(
  request: APIRequestContext,
  input: { email: string; inviteCode?: string; next?: string },
) {
  return request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: {
      name: "Closed Beta E2E",
      email: input.email,
      password: PASSWORD,
      acceptTerms: "1",
      inviteCode: input.inviteCode ?? "",
      next: input.next ?? "/app",
    },
    maxRedirects: 0,
  });
}

test.describe("closed beta gate enabled", () => {
  test("renders the invite-code field and explains the gate", async ({ page }) => {
    await page.goto("/signup?next=/app");

    await expect(page.getByRole("heading", { name: "Account erstellen" })).toBeVisible();
    await expect(page.getByText("Dein Cloud-Zugang ist noch nicht freigeschaltet.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Warteliste/ })).toHaveCount(0);
    await expect(page.getByLabel("Beta-Code (optional)")).toBeHidden();
    await page.locator("summary").filter({ hasText: "Beta-Code (optional)" }).click();
    await expect(page.getByLabel("Beta-Code (optional)")).toBeVisible();
    await expect(page.getByText("Nur nötig, wenn du einen Code erhalten hast.")).toBeVisible();
  });

  test("does not ask email-invited users for a missing invite code", async ({ page }) => {
    await page.goto("/signup?next=/app&email=invited%40bloommd.local");

    await expect(page.getByRole("heading", { name: "Account erstellen" })).toBeVisible();
    await expect(page.getByLabel("E-Mail", { exact: true })).toHaveValue("invited@bloommd.local");
    await expect(page.getByTestId("beta-access-gate")).toHaveCount(0);
    await expect(page.getByLabel("Beta-Code (optional)")).toHaveCount(0);
  });

  test("rejects an uninvited signup without a code", async ({ request, page }) => {
    const response = await signup(request, { email: uniqueEmail("blocked") });

    expect(response.status()).toBe(303);
    const location = response.headers().location ?? "";
    expect(location).toContain("/signup");
    expect(decodeURIComponent(location)).toContain("Diese E-Mail ist noch nicht für die Beta freigeschaltet.");

    await page.goto(location);
    await expect(page.getByText("Diese E-Mail ist noch nicht für die Beta freigeschaltet.")).toBeVisible();
    await expect(page).not.toHaveURL((url) => url.pathname === "/app");
  });

  test("separates invalid invite-code errors from email invite errors", async ({ request, page }) => {
    const response = await signup(request, { email: uniqueEmail("wrong-code"), inviteCode: "wrong-code" });

    expect(response.status()).toBe(303);
    const location = response.headers().location ?? "";
    expect(decodeURIComponent(location)).toContain("Der Einladungscode ist ungültig.");

    await page.goto(location);
    await expect(page.getByText("Der Einladungscode ist ungültig.")).toBeVisible();
  });

  test("allows an allowlisted address without a code", async ({ request }) => {
    const response = await signup(request, { email: "invited@bloommd.local" });

    expect(response.status()).toBe(303);
    expect(response.headers().location).toContain("/app");
    expect(response.headers()["set-cookie"]).toContain("bloommd_session=");
  });

  test("allows a valid invite code for a non-allowlisted address", async ({ request }) => {
    const response = await signup(request, { email: uniqueEmail("code"), inviteCode: "beta-e2e-code" });

    expect(response.status()).toBe(303);
    expect(response.headers().location).toContain("/app");
    expect(response.headers()["set-cookie"]).toContain("bloommd_session=");
  });

  test("does not let the signup next parameter escape the site", async ({ request }) => {
    const response = await signup(request, {
      email: uniqueEmail("next"),
      inviteCode: "beta-e2e-code",
      next: "https://evil.example/app",
    });

    expect(response.status()).toBe(303);
    expect(response.headers().location).toContain("/app");
    expect(response.headers().location).not.toContain("evil.example");
  });

  test("keeps login ungated for existing beta accounts", async ({ page }) => {
    await page.goto("/login?next=/app");

    await expect(page.getByText("Closed Beta")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Warteliste/ })).toHaveCount(0);
    const loginForm = page.locator('form[action="/api/auth/login"]');
    await loginForm.getByLabel("E-Mail", { exact: true }).fill(uniqueEmail("login"));
    await loginForm.getByLabel("Passwort").fill(PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL((url) => url.pathname === "/app");
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
  });
});
