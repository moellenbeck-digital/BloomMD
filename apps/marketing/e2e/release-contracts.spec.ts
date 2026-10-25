import { expect, test } from "@playwright/test";

test.describe("marketing release contracts", () => {
  test("publishes crawl rules and a sitemap for public content in both languages", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(robots.headers()["content-type"]).toContain("text/plain");
    const rules = (await robots.text()).split(/\r?\n/).map((line) => line.trim());
    expect(rules).toContain("User-agent: *");
    expect(rules).toContain("Allow: /");
    expect(rules).not.toContain("Disallow: /");
    expect(rules).toContain("Disallow: /admin/");
    expect(rules).toContain("Disallow: /api/");
    expect(rules).toContain("Sitemap: https://bloommd.io/sitemap.xml");
    // Crawlers must be able to read the result pages' noindex directives.
    expect(rules).not.toContain("Disallow: /waitlist/");

    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
    for (const path of ["/news", "/en/news", "/news/desktop-release-0512", "/en/news/desktop-release-0512", "/docs", "/docs?lang=en", "/docs/desktop", "/docs/desktop?lang=en", "/download?lang=en"]) {
      expect(urls).toContain(`https://bloommd.io${path}`);
    }
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(new URL(url).origin).toBe("https://bloommd.io");
      expect(new URL(url).pathname).not.toMatch(/^\/(admin|api|waitlist|account|login|app)(\/|$)/);
    }
  });

  for (const path of ["/news/desktop-release-0512", "/en/news/desktop-release-0512", "/docs/desktop", "/docs/desktop?lang=en"]) {
    test(`allows indexing of public content: ${path}`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
      expect(response?.headers()["x-robots-tag"]).toBeUndefined();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    });
  }

  for (const path of ["/waitlist/bestaetigt", "/waitlist/abgemeldet", "/waitlist/ungueltig"]) {
    test(`keeps waitlist results out of indexes: ${path}`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /\bnoindex\b/);
    });
  }

  test("serves security headers on pages and no-store headers on APIs", async ({ request }) => {
    const pageResponse = await request.get("/demo");
    expect(pageResponse.ok()).toBe(true);
    const pageHeaders = pageResponse.headers();
    expect(pageHeaders["content-security-policy"]).toContain("default-src 'self'");
    expect(pageHeaders["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(pageHeaders["x-content-type-options"]).toBe("nosniff");
    expect(pageHeaders["x-frame-options"]).toBe("DENY");
    expect(pageHeaders["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(pageHeaders["permissions-policy"]).toContain("camera=()");
    expect(pageHeaders["x-robots-tag"]).toBeUndefined();

    const apiResponse = await request.get("/api/templates");
    expect(apiResponse.ok()).toBe(true);
    expect(apiResponse.headers()["cache-control"]).toContain("no-store");
  });

  test("does not include private app, account, auth, workspace, sync or billing routes", async ({ request }) => {
    for (const path of ["/app", "/login", "/signup", "/account", "/api/auth/login", "/api/account/export", "/api/mindmaps", "/api/sync-ticket", "/api/billing/checkout"]) {
      const response = await request.get(path);
      expect(response.status(), `${path} must not be served by the marketing app`).toBe(404);
    }
  });

  test("protects the waitlist admin and keeps its responses uncached", async ({ request }) => {
    const unauthorized = await request.get("/admin/waitlist");
    expect(unauthorized.status()).toBe(401);
    expect(unauthorized.headers()["www-authenticate"]).toContain("BloomMD Waitlist");
    expect(unauthorized.headers()["cache-control"]).toContain("no-store");
    expect(unauthorized.headers()["x-robots-tag"]).toBe("noindex, nofollow");

    const authorization = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
    const authorized = await request.get("/admin/waitlist", { headers: { authorization } });
    expect(authorized.ok()).toBe(true);
    expect(authorized.headers()["cache-control"]).toMatch(/no-store|no-cache/);
    expect(await authorized.text()).toContain("Waitlist-Datenbank nicht konfiguriert");

    const csv = await request.get("/admin/waitlist/export.csv", { headers: { authorization } });
    expect(csv.status()).toBe(503);
    expect(csv.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("keeps templates and their Markdown public without a session", async ({ request }) => {
    const listResponse = await request.get("/api/templates");
    const list = await listResponse.json() as { templates: Array<{ slug: string }> };
    expect(list.templates.length).toBeGreaterThanOrEqual(6);

    const markdownResponse = await request.get(`/api/templates/${list.templates[0]!.slug}/markdown`);
    expect(markdownResponse.ok()).toBe(true);
    expect(markdownResponse.headers()["content-type"]).toContain("text/markdown");
    expect(await markdownResponse.text()).toContain("#");
  });

  test("keeps the public Wiki disabled unless explicitly configured", async ({ request }) => {
    const pageResponse = await request.get("/wiki");
    expect(pageResponse.ok()).toBe(true);
    const apiResponse = await request.get("/api/wiki");
    expect(apiResponse.status()).toBe(404);
  });

  test("routes the Obsidian CTA to its setup guide", async ({ request }) => {
    const demoResponse = await request.get("/demo?lang=en");
    expect(demoResponse.ok()).toBe(true);
    const demoBody = (await demoResponse.text()).replace(/\s+/g, " ");
    expect(demoBody).toContain('href="/obsidian?lang=en"');
    expect(demoBody).toContain("Use BloomMD with Obsidian");

    const obsidianResponse = await request.get("/obsidian?lang=en");
    expect(obsidianResponse.ok()).toBe(true);
    expect((await obsidianResponse.text()).replace(/\s+/g, " ")).toContain("Your Obsidian notes as BloomMD maps.");
  });

  test("routes account CTAs to the product app and beta CTAs to the waitlist section", async ({ request }) => {
    const germanResponse = await request.get("/");
    expect(germanResponse.ok()).toBe(true);
    const germanBody = (await germanResponse.text()).replace(/\s+/g, " ");
    expect(germanBody).toContain('href="https://bloommd.app/login"');
    expect(germanBody).toContain('href="#beta"');
    expect(germanBody).toContain("Beta-Zugang anfragen");

    const englishDemoResponse = await request.get("/demo?lang=en");
    expect(englishDemoResponse.ok()).toBe(true);
    const englishDemoBody = (await englishDemoResponse.text()).replace(/\s+/g, " ");
    expect(englishDemoBody).toContain('href="/?lang=en#beta"');
    expect(englishDemoBody).toContain("Join the closed beta waitlist");
  });

  test("serves the English landing page with correct language, metadata and beta path", async ({ request }) => {
    const response = await request.get("/en");
    expect(response.ok()).toBe(true);
    const body = (await response.text()).replace(/\s+/g, " ");
    expect(body).toContain('<html lang="en">');
    expect(body).toContain("Visual Markdown maps");
    expect(body).toMatch(/rel="canonical" href="[^"]+\/en"/);
    expect(body).toContain("Markdown files. Visual maps.");
    expect(body).toContain('href="#beta"');
    expect(body).toContain('href="/demo?lang=en"');
    expect(body).toContain('href="https://bloommd.app/login?lang=en"');
    expect(body).toContain('href="/"');
    expect(body).toContain("Double opt-in");
    expect(body).toContain('src="/demo-branch-drag-markdown.webm"');
    expect(body).toContain('src="/demo-obsidian-note-map.webm"');
  });

  test("publishes the BloomMD OG banner and its HTML preview", async ({ request }) => {
    const image = await request.get("/og/bloommd-og-banner.png");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
    const imageBody = await image.body();
    expect(imageBody.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(imageBody.readUInt32BE(16)).toBe(1200);
    expect(imageBody.readUInt32BE(20)).toBe(630);
    expect(imageBody.byteLength).toBeGreaterThan(100_000);

    const previewResponse = await request.get("/og-banner.html");
    expect(previewResponse.ok()).toBe(true);
    const previewBody = (await previewResponse.text()).replace(/\s+/g, " ");
    expect(previewBody).toContain("<title>BloomMD Social Asset QA</title>");
    expect(previewBody).toContain("Social Asset QA");
    expect(previewBody).toContain("Social platforms receive the PNG below, not this HTML page.");
    expect(previewBody).toContain('src="/og/bloommd-og-banner.png"');

    const landingResponse = await request.get("/");
    expect(landingResponse.ok()).toBe(true);
    const origin = new URL(landingResponse.url()).origin;
    const landingBody = (await landingResponse.text()).replace(/\s+/g, " ");
    expect(landingBody).toContain(`property="og:image" content="${origin}/og/bloommd-og-banner.png"`);
    expect(landingBody).toContain(`name="twitter:image" content="${origin}/og/bloommd-og-banner.png"`);
  });

  test("publishes route-specific social metadata for public pages", async ({ request }) => {
    const cases = [
      { path: "/demo", locale: "de_DE" },
      { path: "/demo?lang=en", locale: "en_US" },
      { path: "/docs", locale: "de_DE" },
      { path: "/docs?lang=en", locale: "en_US" },
      { path: "/download", locale: "de_DE" },
      { path: "/download?lang=en", locale: "en_US" },
      { path: "/templates", locale: "de_DE" },
      { path: "/templates?lang=en", locale: "en_US" },
      { path: "/templates/software-architecture?lang=en", locale: "en_US" },
      { path: "/obsidian", locale: "de_DE" },
      { path: "/obsidian?lang=en", locale: "en_US" },
      { path: "/roadmap", locale: "de_DE" },
      { path: "/en/roadmap", locale: "en_US" },
      { path: "/blog", locale: "de_DE" },
      { path: "/en/blog", locale: "en_US" },
      { path: "/news", locale: "de_DE" },
      { path: "/en/news", locale: "en_US" },
    ];

    for (const { path, locale } of cases) {
      const response = await request.get(path);
      expect(response.ok(), path).toBe(true);
      const origin = new URL(response.url()).origin;
      const body = (await response.text()).replace(/\s+/g, " ");
      expect(body, path).toContain(`property="og:url" content="${origin}${path}"`);
      expect(body, path).toContain(`property="og:image" content="${origin}/og/bloommd-og-banner.png"`);
      expect(body, path).toContain('property="og:image:width" content="1200"');
      expect(body, path).toContain('property="og:image:height" content="630"');
      expect(body, path).toContain('property="og:image:alt" content="BloomMD — Markdown, visualized."');
      expect(body, path).toContain(`property="og:locale" content="${locale}"`);
      expect(body, path).toContain('name="twitter:card" content="summary_large_image"');
      expect(body, path).toContain(`name="twitter:image" content="${origin}/og/bloommd-og-banner.png"`);
    }
  });

  test("publishes bilingual Markdown content and a news feed", async ({ request }) => {
    const german = await request.get("/news");
    expect(german.ok()).toBe(true);
    expect((await german.text()).replace(/\s+/g, " ")).toContain("Markdown-Listen und Checklisten");

    const english = await request.get("/en/news");
    expect(english.ok()).toBe(true);
    expect((await english.text()).replace(/\s+/g, " ")).toContain("Markdown lists and checklists");

    const feed = await request.get("/news/feed.xml");
    expect(feed.ok()).toBe(true);
    expect(feed.headers()["content-type"]).toContain("application/rss+xml");
    expect(await feed.text()).toContain("<rss version=\"2.0\">");
  });

  test("keeps the landing page header usable without desktop overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Navigation öffnen" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);

    await page.getByRole("button", { name: "Navigation öffnen" }).click();
    const menu = page.locator("#mobile-navigation");
    await expect(menu).toBeVisible();
    for (const label of ["Produkt", "Demo", "Templates", "LLM Wiki", "Workflow", "Desktop", "Obsidian", "Local-first", "Beta", "FAQ", "Login", "Beta-Zugang anfragen"]) {
      await expect(menu.getByText(label, { exact: true }).first()).toBeVisible();
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Navigation schließen" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Navigation öffnen" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  test("keeps the no-login demo interactive for templates, pasted Markdown, local files and downloads", async ({ page }) => {
    await page.goto("/demo?lang=en");
    await page.getByRole("button", { name: "Skip" }).click().catch(() => {});

    const templateSelect = page.getByLabel("Select template");
    const options = await templateSelect.locator("option").all();
    expect(options.length).toBeGreaterThanOrEqual(2);
    const nextTemplate = await options[1]!.getAttribute("value");
    expect(nextTemplate).toBeTruthy();
    await templateSelect.selectOption(nextTemplate!);
    await expect(page.getByTestId("mindmap-canvas")).toBeVisible();

    await page.getByRole("button", { name: "Markdown", exact: true }).click();
    const markdownInput = page.getByLabel("Markdown to visualize");
    await markdownInput.fill([
      "---",
      "title: Demo Pasted QA",
      "id: demo-pasted-qa",
      "---",
      "",
      "# Demo Pasted QA <!-- bloommd:id=demo-pasted-root -->",
      "",
      "## Branch From Paste <!-- bloommd:id=branch-from-paste -->",
    ].join("\n"));
    await page.getByRole("button", { name: "Visualize pasted Markdown" }).click();
    await expect(page.locator('[data-node-label="Branch From Paste"]').first()).toBeVisible();

    const fileChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose local Markdown file" }).click();
    await (await fileChooser).setFiles({
      name: "demo-local.md",
      mimeType: "text/markdown",
      buffer: Buffer.from([
        "---",
        "title: Demo Local File",
        "id: demo-local-file",
        "---",
        "",
        "# Demo Local File <!-- bloommd:id=demo-local-root -->",
        "",
        "## Branch From File <!-- bloommd:id=branch-from-file -->",
      ].join("\n")),
    });
    await expect(page.locator('[data-node-label="Branch From File"]').first()).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("Demo Local File.md");
  });

  test("keeps link previews user-triggered and blocks unsafe targets", async ({ request }) => {
    const response = await request.get("/api/link-preview?url=http%3A%2F%2F127.0.0.1%3A3000%2Fdemo");
    expect(response.status()).toBe(422);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.json()).error).toContain("Private network");
  });

  test("keeps the node editor open while typing URL metadata", async ({ page }) => {
    await page.goto("/demo?lang=en");
    await page.getByRole("button", { name: "Skip" }).click().catch(() => {});
    await page.getByText("Frontend", { exact: true }).click();
    await page.getByTestId("node-action-open-editor").click();
    await page.locator("[data-testid=node-metadata-editor] select").selectOption("web");
    const url = page.locator("input[type=url]");
    await url.fill("");
    await url.pressSequentially("https://example.com");
    await expect(url).toHaveValue("https://example.com");
    await expect(page.getByTestId("node-metadata-editor")).toBeVisible();
    await url.blur();
    await expect(url).toHaveValue("https://example.com");
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

  test("does not serve browser source maps", async ({ request }) => {
    const landingResponse = await request.get("/");
    expect(landingResponse.ok()).toBe(true);
    const landingBody = await landingResponse.text();
    const scripts = [...landingBody.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]!);
    const bundles = scripts.filter((src) => src.endsWith(".js")).slice(0, 5);
    expect(bundles.length).toBeGreaterThan(0);

    for (const bundle of bundles) {
      const response = await request.get(`${bundle}.map`);
      expect(response.status(), `${bundle}.map must not be served`).toBeGreaterThanOrEqual(400);
    }
  });
});

test.describe("marketing documentation and waitlist", () => {
  test("serves the beta documentation with every section", async ({ request }) => {
    const response = await request.get("/docs");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toContain('data-testid="docs-article"');

    for (const section of ["Erste Schritte", "Desktop-App", "Web-App", "Zusammenarbeit", "OKF und LLM-Wiki"]) {
      expect(body).toContain(section);
    }
  });

  test("states plainly that mobile is out of scope for the beta", async ({ request }) => {
    const response = await request.get("/docs");
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("nicht Teil der Beta");
  });

  test("renders a subpage from its Markdown file", async ({ request }) => {
    const response = await request.get("/docs/desktop");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toContain("Desktop-App");
    expect(body).toContain('href="/download"');
    expect(body).toContain("Omarchy/Linux");
    expect(body).toContain("Pacman");
    expect(body).toContain("eigener Windows Beta Release");
    expect(body).toContain("https://bloommd.app");
    expect(body).toContain('href="/docs/collaboration"');
  });

  test("explains collaboration as concrete beta steps", async ({ request }) => {
    const response = await request.get("/docs/collaboration");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toContain("Zusammenarbeit");
    expect(body).toContain("Zwei Personen in der Web-App");
    expect(body).toContain("Web-App und Desktop-App gemeinsam");
    expect(body).toContain("Desktop-Zugriff");
    expect(body).toContain("https://bloommd.app");
    expect(body).toContain("feedback@bloommd.io");
    expect(body).toContain("Eine lokale Desktop-Datei bewusst teilen");
    expect(body).toContain("Zugriff entzogen");
    expect(body).toContain("/blog/collaboration-sync.png");
  });

  test("explains explicit local sharing in English without promising a folder upload", async ({ request }) => {
    const response = await request.get("/docs/collaboration?lang=en");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toContain("Share one local Desktop file deliberately");
    expect(body).toContain("never uploads an entire folder");
    expect(body).toContain("Access revoked");
    expect(body).toContain("/blog/collaboration-sync.png");
  });

  test("explains cloud import and tester feedback without a public GitHub fallback", async ({ request }) => {
    const response = await request.get("/docs/web");
    expect(response.ok()).toBe(true);
    const body = (await response.text()).replace(/\s+/g, " ");
    expect(body).toContain("Web-App");
    expect(body).toContain("Markdown-Datei in den Cloud-Workspace laden");
    expect(body).toContain("Markdown importieren");
    expect(body).toContain("serverseitig im Cloud-Workspace");
    expect(body).toContain("GitHub ist nur unser internes Triage-Ziel");
  });

  test("serves the desktop download entry point and redirects common aliases", async ({ request }) => {
    const response = await request.get("/download");
    expect(response.ok()).toBe(true);
    const body = (await response.text()).replace(/<!-- -->/g, "").replace(/\s+/g, " ");
    expect(body).toContain("Desktop-Apps herunterladen");
    expect(body).toMatch(/Desktop-Version (?:wird live ermittelt|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
    expect(body).toContain("Apple Silicon · arm64");
    expect(body).toContain("Arch Linux · x86_64 oder aarch64");
    expect(body).toContain("Plattform wählen");
    expect(body).toContain('href="https://bloommd.io/_desktop-updates/stable-macos-arm64-BloomMD.dmg"');
    expect(body).toContain('href="https://bloommd.io/_desktop-updates/stable-linux-x86_64.pacman"');
    expect(body).toContain('href="https://bloommd.io/_desktop-updates/stable-linux-aarch64.pacman"');
    expect(body).toContain('href="https://bloommd.app/beta"');
    expect(body).toContain('href="/docs/desktop"');

    for (const path of ["/downloads", "/desktop"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should point testers to /download`).toBe(307);
      expect(response.headers().location).toBe("/download");
    }
  });

  test("separates public downloads from invitation-only cloud access in both languages", async ({ request }) => {
    for (const [path, available, gated, upcoming] of [
      ["/download", "Jetzt verfügbar, ohne Einladung", "Einladung erforderlich", "Noch kein öffentlicher Download"],
      ["/download?lang=en", "Available now, no invitation", "Invitation required", "No public download yet"],
    ]) {
      const response = await request.get(path);
      expect(response.ok(), path).toBe(true);
      const body = (await response.text()).replace(/<!-- -->/g, "").replace(/\s+/g, " ");
      expect(body, path).toContain(available);
      expect(body, path).toContain(gated);
      expect(body, path).toContain(upcoming);
      expect(body, path).toContain("bloommd-obsidian/releases/latest");
    }

    const obsidian = await request.get("/obsidian");
    expect(obsidian.ok()).toBe(true);
    const obsidianBody = (await obsidian.text()).replace(/<!-- -->/g, "").replace(/\s+/g, " ");
    expect(obsidianBody).toContain("moellenbeck-digital/bloommd-obsidian");
    expect(obsidianBody).toContain("kein Eintrag im Obsidian-Plugin-Verzeichnis");
    expect(obsidianBody).toContain("bloommd-obsidian#beta-via-brat");
    expect(obsidianBody).not.toContain('href="/docs/obsidian"');

    const desktopGuide = await request.get("/docs/desktop");
    expect(desktopGuide.ok()).toBe(true);
    const guideBody = (await desktopGuide.text()).replace(/<!-- -->/g, "").replace(/\s+/g, " ");
    expect(guideBody).toContain("ohne Einladung oder BloomMD-Konto");
    expect(guideBody).not.toContain("Build nicht öffentlich gelistet");
  });

  test("the landing page offers a waitlist without promising more than it delivers", async ({ request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBe(true);
    const body = (await response.text()).replace(/\s+/g, " ");
    expect(body).toContain('data-testid="waitlist-form"');
    expect(body).toContain('src="/demo-branch-drag-markdown.webm"');
    expect(body).toContain('src="/demo-obsidian-note-map.webm"');
    expect(body).toContain("Bestätigung");
    expect(body).toContain("Normales Markdown · lokale Dateien · macOS und Omarchy/Linux");
    expect(body).toContain("Ich habe Markdown-Dateien");
    expect(body).toContain("Beta-Zugang anfragen");
    expect(body).not.toContain("macOS · Windows · Linux");
    expect(body).toContain("BloomMD wird von");
    expect(body).toContain("Ein Produkt von");
    expect(body).toContain('href="https://moellenbeck-digital.io/"');
  });

  test("does not embed PostHog when PostHog is not configured", async ({ request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).not.toContain("posthog");
  });

  test("loads cookieless Plausible directly without a consent dialog", async ({ page, request }) => {
    const scriptResponse = await request.get("https://plausible.moellenbeck-digital.io/js/script.js");
    expect(scriptResponse.ok()).toBe(true);
    const legacyScriptResponse = await request.get("/_plausible/js/script.js");
    expect(legacyScriptResponse.status()).toBe(404);
    const legacyEventResponse = await request.post("/_plausible/api/event", { data: { name: "legacy_route_probe" } });
    expect(legacyEventResponse.status()).toBe(404);

    const pageResponse = await page.goto("/");
    expect(pageResponse?.headers()["content-security-policy"]).toContain("script-src 'self' https://plausible.moellenbeck-digital.io");
    expect(pageResponse?.headers()["content-security-policy"]).toContain("connect-src 'self' https://plausible.moellenbeck-digital.io");
    const plausibleScript = page.locator('script[data-bloommd-plausible="true"]');
    await expect(plausibleScript).toHaveCount(1);
    await expect(plausibleScript).toHaveAttribute("data-domain", "bloommd.io");
    await expect(plausibleScript).toHaveAttribute("src", "https://plausible.moellenbeck-digital.io/js/script.js");
    await expect(plausibleScript).toHaveAttribute("data-api", "https://plausible.moellenbeck-digital.io/api/event");
    await expect(page.getByRole("dialog", { name: "Analytics-Einwilligung" })).toHaveCount(0);
  });

  test("the signup answers the same way regardless of whether the address is known", async ({ request }) => {
    test.skip(!process.env.BLOOMMD_WAITLIST_DATABASE_URL, "requires the configured waitlist database");
    const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3211";
    const send = () =>
      request.post("/api/waitlist", {
        form: { email: "waitlist-e2e@example.test", source: "e2e" },
        headers: { origin },
      });

    const first = await send();
    const second = await send();
    expect(first.status()).toBe(second.status());
    expect(await first.text()).toBe(await second.text());
  });

  test("a malformed address is rejected with a fixable message", async ({ request }) => {
    const response = await request.post("/api/waitlist", {
      form: { email: "not-an-address", source: "e2e", website: "", formStartedAt: String(Date.now() - 1_000) },
      headers: { origin: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3211" },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain("E-Mail");
  });

  test("serves legal pages and documents the cookieless analytics setup", async ({ request }) => {
    const legalPages = [
      { path: "/agb", heading: "Allgemeine Geschäftsbedingungen" },
      { path: "/datenschutz", heading: "Datenschutzerklärung" },
      { path: "/impressum", heading: "Impressum" },
      { path: "/cookies", heading: "Cookie-Einstellungen" },
    ] as const;

    for (const entry of legalPages) {
      const response = await request.get(entry.path);
      expect(response.ok()).toBe(true);
      const body = await response.text();
      expect(body).toContain(entry.heading);
      expect(body).toContain("Zurück zur Startseite");
      if (entry.path === "/cookies") {
        expect(body).toContain("Plausible ist eine cookielose, aggregierte Analyse");
        expect(body).not.toContain("Analyse ablehnen");
      }
    }
  });
});
