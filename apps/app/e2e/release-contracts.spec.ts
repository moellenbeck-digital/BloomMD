import { expect, test } from "@playwright/test";

test.describe("product app release contracts", () => {
  test("serves security headers and globally opts out of indexing", async ({ request }) => {
    const pageResponse = await request.get("/login");
    expect(pageResponse.ok()).toBe(true);
    const pageHeaders = pageResponse.headers();
    expect(pageHeaders["content-security-policy"]).toContain("default-src 'self'");
    expect(pageHeaders["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(pageHeaders["x-content-type-options"]).toBe("nosniff");
    expect(pageHeaders["x-frame-options"]).toBe("DENY");
    expect(pageHeaders["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(pageHeaders["permissions-policy"]).toContain("camera=()");
    expect(pageHeaders["x-robots-tag"]).toBe("noindex, nofollow");

    const apiResponse = await request.get("/api/config");
    expect(apiResponse.ok()).toBe(true);
    expect(apiResponse.headers()["cache-control"]).toContain("no-store");
    expect(apiResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("redirects the product root to the authenticated workspace surface", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/app");
  });

  test("redirects marketing page routes to the marketing app while keeping marketing APIs closed", async ({ request }) => {
    for (const path of ["/demo", "/docs", "/templates", "/waitlist/bestaetigt"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} must leave the product app`).toBe(308);
      expect(response.headers().location).toBe(`https://bloommd.io${path}`);
      expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    }

    for (const path of ["/api/waitlist", "/api/templates"]) {
      const response = await request.get(path);
      expect(response.status(), `${path} must not be served or proxied by the product app`).toBe(404);
    }
  });

  test("keeps every Stripe route unreachable while billing is disabled", async ({ request }) => {
    for (const path of ["/api/billing/checkout", "/api/billing/portal", "/api/billing/webhook"]) {
      const response = await request.get(path);
      expect(response.status(), `${path} must not be discoverable by GET while billing is disabled`).toBe(404);
    }

    const checkout = await request.post("/api/billing/checkout", {
      form: { tier: "pro-monthly" },
      headers: { origin: "http://localhost:3211" },
      maxRedirects: 0,
    });
    expect(checkout.status()).toBe(404);

    const portal = await request.post("/api/billing/portal", {
      headers: { origin: "http://localhost:3211" },
      maxRedirects: 0,
    });
    expect(portal.status()).toBe(404);

    const webhook = await request.post("/api/billing/webhook", {
      data: JSON.stringify({ id: "evt_test", type: "checkout.session.completed", data: { object: {} } }),
      headers: { "content-type": "application/json" },
    });
    expect(webhook.status()).toBe(404);
  });

  test("keeps the signup form open while the gate is off", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("E-Mail", { exact: true })).toBeVisible();
    await expect(page.getByTestId("beta-access-gate")).toHaveCount(0);
  });

  test("keeps the beta page private and explicit about scope", async ({ page, request }) => {
    const response = await request.get("/beta");
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");

    await page.goto("/beta");
    const body = await page.locator("body").innerText();
    expect(body).toContain("Mobile Obsidian");
    expect(body).toContain("Wiederherstellungszusage");
    expect(body).toContain("GitHub ist unser internes Triage-Ziel");
    await expect(page.getByRole("link", { name: /github-fallback/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "macOS-App laden" })).toHaveAttribute("href", "https://bloommd.io/download");
    await expect(page.getByRole("link", { name: "Installation lesen" })).toHaveAttribute("href", "https://bloommd.io/docs/desktop");
    await expect(page.getByRole("link", { name: "Zusammenarbeits-Doku" })).toHaveAttribute("href", "https://bloommd.io/docs/collaboration");
    await expect(page.getByRole("link", { name: "English overview" })).toHaveAttribute("href", "/beta?lang=en");
    await expect(page.getByRole("link", { name: "Per E-Mail melden" })).toHaveAttribute("href", "mailto:feedback@bloommd.io");

    await expect(page.getByRole("link", { name: "Demo" })).toHaveAttribute("href", "https://bloommd.io/demo");
    await expect(page.getByRole("link", { name: "Templates" })).toHaveAttribute("href", "https://bloommd.io/templates");
  });

  test("keeps link previews user-triggered and blocks unsafe targets", async ({ request }) => {
    const response = await request.get("/api/link-preview?url=http%3A%2F%2F127.0.0.1%3A3000%2Fapp");
    expect(response.status()).toBe(422);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.json()).error).toContain("Private network");
  });

  test("reports an incomplete local deployment as not ready without caching", async ({ request }) => {
    const response = await request.get("/api/health/ready");
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.json() as { status: string; checks: { configuration: boolean; database: boolean } };
    expect(body.status).toBe("not-ready");
    expect(body.checks.configuration).toBe(false);
    expect(typeof body.checks.database).toBe("boolean");
  });

  test("does not serve browser source maps", async ({ page, request }) => {
    await page.goto("/login");
    const scripts = await page.locator("script[src]").evaluateAll((elements) =>
      elements.map((element) => (element as HTMLScriptElement).getAttribute("src")).filter((src): src is string => Boolean(src)),
    );
    const bundles = scripts.filter((src) => src.endsWith(".js")).slice(0, 5);
    expect(bundles.length).toBeGreaterThan(0);

    for (const bundle of bundles) {
      const response = await request.get(`${bundle}.map`);
      expect(response.status(), `${bundle}.map must not be served`).toBeGreaterThanOrEqual(400);
    }
  });
});
