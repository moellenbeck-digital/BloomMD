/**
 * Ticket #91 — datenschutzfreundliche Website-Vorschau im Knoten-Panel (Knotentyp „Website“/„Quelle“). Alle Fälle tragen @t91.
 *
 * Kriterien K1–K8 stehen je im Testtitel:
 *  K1  Kein Abruf ohne Klick (Knoten öffnen, URL mit Blur, Typwechsel).
 *  K2  Hinweis `node-preview-disclosure` vor dem Klick: volle URL, Host, Datenschutzaussage, folgt dem URL-Feld; leer → kein Hinweis, Button gesperrt.
 *  K3  Erfolg: genau ein Request, Query nur `url`; Titel und Beschreibung erscheinen.
 *  K4  Fehler: privates Ziel (Loopback) → `node-preview-error`, Knoten unverändert (echter Endpunkt).
 *  K5  Leer: „Keine Metadaten gefunden“; beim nächsten Versuch verschwinden Fehler und Leer-Hinweis.
 *  K6  Bild nur auf Klick (nach Speichern und Neuladen bzw. erneutem Wählen), `referrerpolicy="no-referrer"`.
 *  K7  Präsentationsansicht: Karte zeigt Titel und Text, das Bild erst nach Klick.
 *  K8  Hinweis, Leer-Hinweis und Bild-Button auf Deutsch und Englisch.
 *
 * Die Karten kommen wie in rich-preview.spec.ts (#53) aus einer Mock-API (`page.route` auf `/api/mindmaps`): Das
 * Dev-System legt keine Dokumente an. `/api/link-preview` wird je Fall ersetzt, nur K4 geht gegen den echten
 * Endpunkt. Der Bild-Host ist ein nicht auflösbarer Name, dessen Requests der Test mitzählt und mit einem
 * 1×1-PNG beantwortet; so wird nie ein echter Fremdserver kontaktiert.
 *
 * Nicht geprüft:
 *  - Das echte Abrufen von `https://example.com` (Titel „Example Domain“): Das Dev-System hat keinen zugesicherten
 *    Zugang ins Internet. K3 prüft Anfrage (genau ein Request, nur `url`) und Anzeige mit der Beispielantwort.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };

const IMAGE_HOST = "bilder.t91-vorschau.invalid";
const IMAGE_URL = `https://${IMAGE_HOST}/vorschau.png`;
const PAGE_URL = "https://beispiel.t91-vorschau.invalid/artikel";
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function uniqueEmail(label: string) {
  return `e2e-t91-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T91", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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

async function prepare(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", "de");
    // Das Dev-System läuft über HTTP (kein sicherer Kontext): `crypto.randomUUID` fehlt dort. Die Shim gleicht nur das Testsystem aus.
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
  });
}

type NodeMeta = Record<string, unknown>;

function markdownWithNode(title: string, meta?: NodeMeta) {
  const slug = title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const metaComment = meta ? ` <!-- bloommd:meta=${JSON.stringify(meta)} -->` : "";
  return [
    "---",
    `title: ${title}`,
    `id: ${slug}`,
    'created: "2026-11-07T10:00:00.000Z"',
    'updated: "2026-11-07T10:00:00.000Z"',
    "tags:",
    "  - t91",
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${title} <!-- bloommd:id=root-${slug} -->`,
    "",
    `## Quelle <!-- bloommd:id=quelle-${slug} -->${metaComment}`,
    "",
    "Notiz zur Quelle.",
    "",
  ].join("\n");
}

function documentFromMarkdown(filename: string, markdown: string) {
  const title = /^title:\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? filename;
  const nodes: Record<string, { id: string; parentId: string | null; level: number; title: string; content: string; children: string[]; metadata?: NodeMeta }> = {};
  const stack: Array<{ level: number; id: string }> = [];
  const content = new Map<string, string[]>();
  let rootId = "";
  let current: string | null = null;
  let inFrontmatter = false;
  let frontmatterSeen = false;
  for (const line of markdown.split("\n")) {
    if (line === "---" && !frontmatterSeen) {
      inFrontmatter = true;
      frontmatterSeen = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === "---") inFrontmatter = false;
      continue;
    }
    const match = /^(#{1,6})\s+(.*?)\s*<!--\s*bloommd:id=([^\s>]+)\s*-->(?:\s*<!--\s*bloommd:meta=(\{.*\})\s*-->)?\s*$/.exec(line);
    if (match) {
      const level = match[1]!.length;
      const id = match[3]!;
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
      const parentId = stack[stack.length - 1]?.id ?? null;
      nodes[id] = { id, parentId, level, title: match[2]!.trim(), content: "", children: [], ...(match[4] ? { metadata: JSON.parse(match[4]) as NodeMeta } : {}) };
      if (parentId) nodes[parentId]!.children.push(id);
      else if (!rootId) rootId = id;
      stack.push({ level, id });
      current = id;
      content.set(id, []);
      continue;
    }
    if (current) content.get(current)!.push(line);
  }
  for (const [id, lines] of content) nodes[id]!.content = lines.join("\n").trim();
  return {
    filePath: filename,
    frontmatter: { title, id: filename, created: "2026-11-07T10:00:00.000Z", updated: "2026-11-07T10:00:00.000Z", layout: { direction: "LR" } },
    nodes,
    rootId,
    preamble: "",
  };
}

interface MockApi {
  /** Gespeicherte Markdown-Fassungen (alle PUTs der Oberfläche). */
  puts: string[];
  /** Alle Requests an `/api/link-preview` (aufgezeichnet vor der Antwort). */
  previews: URL[];
  /** Alle Requests an den Bild-Host. */
  imageRequests: string[];
  /** Antwort für `/api/link-preview`; `null` reicht den Request an den echten Server weiter. */
  reply: { status: number; body: unknown } | null;
}

async function installApis(page: Page, filename: string, title: string, meta?: NodeMeta): Promise<MockApi> {
  const api: MockApi = { puts: [], previews: [], imageRequests: [], reply: null };
  let saved = markdownWithNode(title, meta);
  await page.route(
    (url) => url.pathname === "/api/mindmaps" || /^\/api\/mindmaps\/[^/]+$/.test(url.pathname),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/mindmaps") {
        if (request.method() !== "GET") return route.fallback();
        const list = [{ filename, frontmatter: documentFromMarkdown(filename, saved).frontmatter }];
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ files: list, storageMode: "filesystem" }) });
      }
      if (request.method() === "GET") return route.fulfill({ contentType: "application/json", body: JSON.stringify(documentFromMarkdown(filename, saved)) });
      if (request.method() === "PUT") {
        const { markdown } = request.postDataJSON() as { markdown: string };
        api.puts.push(markdown);
        saved = markdown;
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ filePath: filename }) });
      }
      return route.fallback();
    },
  );
  await page.route(
    (url) => url.pathname === "/api/link-preview",
    async (route) => {
      api.previews.push(new URL(route.request().url()));
      if (!api.reply) return route.continue();
      return route.fulfill({ status: api.reply.status, contentType: "application/json", body: JSON.stringify(api.reply.body) });
    },
  );
  await page.route(`https://${IMAGE_HOST}/**`, async (route) => {
    api.imageRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });
  return api;
}

const knoten = (page: Page) => page.locator('[data-testid="mindmap-node"][data-node-label="Quelle"]').first();

async function openNodeEditor(page: Page) {
  await knoten(page).click();
  await page.getByTestId("node-action-open-editor").click();
  await expect(page.getByTestId("node-editor")).toBeVisible();
}

/** Legt ein Konto an, installiert die Mock-APIs, meldet an und öffnet den Editor des Knotens „Quelle“ (optional mit gespeicherten Metadaten). */
async function start(page: Page, request: APIRequestContext, label: string, meta?: NodeMeta) {
  const run = Date.now();
  const filename = `t91-${label}-${run}.md`;
  const email = uniqueEmail(label);
  await createAccount(request, email);
  await prepare(page);
  const api = await installApis(page, filename, `T91 ${label} ${run}`, meta);
  await login(page, email);
  await openNodeEditor(page);
  return api;
}

const BUTTON = (page: Page) => page.getByTestId("node-url-panel").getByRole("button", { name: "Website-Vorschau laden" });
const disclosure = (page: Page) => page.getByTestId("node-preview-disclosure");
const WEB_ONLY = { kind: "web" } as const;

async function toWebNode(page: Page, url: string) {
  await page.getByTestId("node-kind-select").selectOption("web");
  await expect(page.getByTestId("node-url-panel")).toBeVisible();
  await page.getByTestId("node-url-input").fill(url);
  await page.getByTestId("node-url-input").blur();
}

async function savePressed(page: Page, api: MockApi) {
  const before = api.puts.length;
  await page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => api.puts.length).toBeGreaterThan(before);
}

test.describe("Datenschutzfreundliche Website-Vorschau @t91", () => {
  test.setTimeout(120_000);

  test("K1: ohne Klick geht kein Request an /api/link-preview @t91", async ({ page, request }) => {
    const api = await start(page, request, "k1", { ...WEB_ONLY, url: PAGE_URL });
    api.reply = { status: 200, body: { preview: { url: PAGE_URL, finalUrl: PAGE_URL, title: "Sollte nie geladen werden" } } };

    // Knoten ist geöffnet (Editor mit Website-Panel und gespeicherter URL).
    await expect(page.getByTestId("node-url-input")).toHaveValue(PAGE_URL);
    // URL eintragen und verlassen (Blur).
    await page.getByTestId("node-url-input").fill(`${PAGE_URL}/zwei`);
    await page.getByTestId("node-url-input").blur();
    // Typwechsel Website → Quelle → Aufgabe → Website.
    await page.getByTestId("node-kind-select").selectOption("source");
    await expect(page.getByTestId("node-url-panel")).toBeVisible();
    await page.getByTestId("node-kind-select").selectOption("task");
    await page.getByTestId("node-kind-select").selectOption("web");
    await expect(page.getByTestId("node-url-panel")).toBeVisible();
    // Dem Knoten und der Karte etwas Zeit lassen, damit ein späterer Abruf nicht unbemerkt bleibt.
    await page.waitForTimeout(1_000);
    expect(api.previews).toHaveLength(0);
    await expect(page.getByTestId("node-metadata-editor")).not.toContainText("Sollte nie geladen werden");
  });

  test("K2: der Hinweis vor dem Klick nennt URL und Host, folgt dem URL-Feld und fehlt bei leerem Feld @t91", async ({ page, request }) => {
    const api = await start(page, request, "k2");
    await page.getByTestId("node-kind-select").selectOption("web");
    await expect(page.getByTestId("node-url-panel")).toBeVisible();

    // Leeres Feld: kein Hinweis, Button gesperrt.
    await expect(page.getByTestId("node-url-input")).toHaveValue("");
    await expect(disclosure(page)).toHaveCount(0);
    await expect(BUTTON(page)).toBeDisabled();

    // Mit URL: volle URL, Host, Datenschutzaussage; der Button ist frei.
    await page.getByTestId("node-url-input").fill("https://www.beispiel.org/pfad/seite?a=1");
    await expect(disclosure(page)).toBeVisible();
    await expect(disclosure(page)).toContainText("https://www.beispiel.org/pfad/seite?a=1");
    await expect(disclosure(page)).toContainText("beispiel.org");
    await expect(disclosure(page)).toContainText("Inhalte, Dateinamen und Ordnernamen deiner Maps werden nicht gesendet");
    await expect(BUTTON(page)).toBeEnabled();
    // Der Hinweis steht vor dem Button (zwischen URL-Feld und Abruf-Button).
    const order = await page.getByTestId("node-url-panel").evaluate((panel) => {
      const children = [...panel.children];
      const input = children.findIndex((el) => el.querySelector('[data-testid="node-url-input"]'));
      const hint = children.findIndex((el) => el.getAttribute("data-testid") === "node-preview-disclosure");
      const button = children.findIndex((el) => el.tagName === "BUTTON");
      return { input, hint, button };
    });
    expect(order.input).toBeGreaterThanOrEqual(0);
    expect(order.hint).toBeGreaterThan(order.input);
    expect(order.button).toBeGreaterThan(order.hint);

    // Der Hinweis folgt dem Feld, auch ohne Blur.
    await page.getByTestId("node-url-input").fill("https://andere-seite.net/x");
    await expect(disclosure(page)).toContainText("https://andere-seite.net/x");
    await expect(disclosure(page)).toContainText("andere-seite.net");
    await expect(disclosure(page)).not.toContainText("beispiel.org");

    // Wieder leer: Hinweis weg, Button gesperrt.
    await page.getByTestId("node-url-input").fill("");
    await expect(disclosure(page)).toHaveCount(0);
    await expect(BUTTON(page)).toBeDisabled();
    expect(api.previews).toHaveLength(0);
  });

  test("K3: ein Klick löst genau einen Request mit nur `url` aus, Titel und Beschreibung erscheinen @t91", async ({ page, request }) => {
    const api = await start(page, request, "k3");
    api.reply = {
      status: 200,
      body: { preview: { url: "https://example.com", finalUrl: "https://example.com/", title: "Example Domain", description: "Dieses Beispiel dient der Dokumentation." } },
    };
    await toWebNode(page, "https://example.com");
    expect(api.previews).toHaveLength(0);

    await BUTTON(page).click();
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Example Domain");
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Dieses Beispiel dient der Dokumentation.");
    expect(api.previews).toHaveLength(1);
    const query = api.previews[0]!.searchParams;
    expect([...query.keys()]).toEqual(["url"]);
    expect(query.get("url")).toBe("https://example.com");
    // Kein Folge-Request nach dem Anzeigen.
    await page.waitForTimeout(500);
    expect(api.previews).toHaveLength(1);
    await expect(page.getByTestId("node-preview-error")).toHaveCount(0);
    await expect(page.getByTestId("node-preview-empty")).toHaveCount(0);
  });

  test("K4: ein privates Ziel zeigt eine Fehlermeldung, der Knoten bleibt unverändert @t91", async ({ page, request }) => {
    const api = await start(page, request, "k4"); // reply = null: echter Endpunkt
    await toWebNode(page, "http://127.0.0.1:3000/app");
    await expect(knoten(page)).toHaveAttribute("data-node-kind", "web");
    await expect(page.getByTestId("node-metadata-editor")).not.toContainText("Gespeicherte Vorschau");

    await BUTTON(page).click();
    const error = page.getByTestId("node-preview-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Private network preview URLs are not allowed.");
    expect(api.previews).toHaveLength(1);
    expect([...api.previews[0]!.searchParams.keys()]).toEqual(["url"]);
    // Unverändert: weder gespeicherte Vorschau noch Leer-Hinweis, Typ und URL bleiben.
    await expect(page.getByTestId("node-metadata-editor")).not.toContainText("Gespeicherte Vorschau");
    await expect(page.getByTestId("node-preview-empty")).toHaveCount(0);
    await expect(page.getByTestId("node-preview-image-request")).toHaveCount(0);
    await expect(knoten(page)).toHaveAttribute("data-node-kind", "web");
    await expect(page.getByTestId("node-url-input")).toHaveValue("http://127.0.0.1:3000/app");
    await expect(BUTTON(page)).toBeEnabled();
  });

  test("K5: eine Antwort ohne Metadaten zeigt „Keine Metadaten gefunden“, beim nächsten Versuch verschwinden Fehler und Hinweis @t91", async ({ page, request }) => {
    const api = await start(page, request, "k5");
    await toWebNode(page, "http://127.0.0.1:3000/app");

    // Zuerst ein Fehler (echter Endpunkt).
    await BUTTON(page).click();
    await expect(page.getByTestId("node-preview-error")).toBeVisible();

    // Dann eine Antwort nur mit `url` und `finalUrl`: der Fehler verschwindet, der Leer-Hinweis erscheint.
    api.reply = { status: 200, body: { preview: { url: PAGE_URL, finalUrl: PAGE_URL } } };
    await page.getByTestId("node-url-input").fill(PAGE_URL);
    await BUTTON(page).click();
    const empty = page.getByTestId("node-preview-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toHaveText("Keine Metadaten gefunden");
    await expect(page.getByTestId("node-preview-error")).toHaveCount(0);
    await expect(page.getByTestId("node-metadata-editor")).not.toContainText("Gespeicherte Vorschau");

    // Nächster Versuch mit Inhalt: der Leer-Hinweis verschwindet.
    api.reply = { status: 200, body: { preview: { url: PAGE_URL, finalUrl: PAGE_URL, title: "Jetzt mit Titel" } } };
    await BUTTON(page).click();
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Jetzt mit Titel");
    await expect(empty).toHaveCount(0);
    await expect(page.getByTestId("node-preview-error")).toHaveCount(0);

    // Und ein Fehler nach einem Leer-Treffer räumt den Leer-Hinweis ebenfalls ab.
    api.reply = { status: 200, body: { preview: { url: PAGE_URL, finalUrl: PAGE_URL } } };
    await BUTTON(page).click();
    await expect(empty).toBeVisible();
    api.reply = { status: 422, body: { error: "Private network preview URLs are not allowed." } };
    await BUTTON(page).click();
    await expect(page.getByTestId("node-preview-error")).toBeVisible();
    await expect(empty).toHaveCount(0);
    expect(api.previews).toHaveLength(5);
  });

  test("K6: das Vorschaubild lädt nach dem eigenen Abruf sofort, später nur auf Klick und ohne Referrer @t91", async ({ page, request }) => {
    const api = await start(page, request, "k6");
    api.reply = { status: 200, body: { preview: { url: PAGE_URL, finalUrl: PAGE_URL, title: "Bildtitel", description: "Bildbeschreibung", image: IMAGE_URL } } };
    await toWebNode(page, PAGE_URL);
    expect(api.imageRequests).toHaveLength(0);

    // Direkt nach dem eigenen Abruf: Bild ohne Button.
    await BUTTON(page).click();
    const image = page.getByTestId("node-metadata-editor").getByTestId("node-preview-image");
    await expect(image).toBeVisible();
    await expect(page.getByTestId("node-preview-image-request")).toHaveCount(0);
    await expect.poll(() => api.imageRequests.length).toBeGreaterThan(0);
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Bildtitel");

    // Speichern und Neuladen.
    await savePressed(page, api);
    expect(api.puts.at(-1)).toContain(IMAGE_URL);
    api.imageRequests.length = 0;
    await page.reload();
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
    await openNodeEditor(page);

    // Titel und Beschreibung stehen ohne Klick da; statt des Bilds steht der Button; bis dahin kein Request an den Bild-Host.
    const request_ = page.getByTestId("node-preview-image-request");
    await expect(request_).toBeVisible();
    await expect(request_).toHaveText(`Vorschaubild von ${IMAGE_HOST} laden`);
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Bildtitel");
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Bildbeschreibung");
    await expect(page.getByTestId("node-preview-image")).toHaveCount(0);
    await page.waitForTimeout(1_000);
    expect(api.imageRequests).toHaveLength(0);

    // Nach dem Klick: `<img>` mit no-referrer, erst jetzt geht der Request raus.
    await request_.click();
    const loaded = page.getByTestId("node-metadata-editor").getByTestId("node-preview-image");
    await expect(loaded).toBeVisible();
    await expect(loaded).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(loaded).toHaveAttribute("src", IMAGE_URL);
    await expect.poll(() => api.imageRequests.length).toBeGreaterThan(0);
    await expect(page.getByTestId("node-preview-image-request")).toHaveCount(0);
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Bildtitel");
  });

  test("K6b: nach Abwählen und erneutem Wählen des Knotens verlangt das Bild wieder einen Klick @t91", async ({ page, request }) => {
    const api = await start(page, request, "k6b");
    api.reply = { status: 200, body: { preview: { url: PAGE_URL, finalUrl: PAGE_URL, title: "Bildtitel", image: IMAGE_URL } } };
    await toWebNode(page, PAGE_URL);
    await BUTTON(page).click();
    await expect(page.getByTestId("node-preview-image")).toBeVisible();

    // Anderen Knoten wählen (Wurzel), dann zurück zum Website-Knoten.
    api.imageRequests.length = 0;
    await page.locator('[data-testid="mindmap-node"]').first().click();
    await knoten(page).click();
    if ((await page.getByTestId("node-editor").count()) === 0) await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await expect(page.getByTestId("node-preview-image-request")).toBeVisible();
    await expect(page.getByTestId("node-preview-image")).toHaveCount(0);
    await expect(page.getByTestId("node-metadata-editor")).toContainText("Bildtitel");
    await page.waitForTimeout(500);
    expect(api.imageRequests).toHaveLength(0);
  });

  test("K7: die Präsentationsansicht zeigt Titel und Text, das Bild erst nach Klick @t91", async ({ page, request }) => {
    const api = await start(page, request, "k7", {
      kind: "web",
      url: PAGE_URL,
      previewTitle: "Gespeicherter Titel",
      previewDescription: "Gespeicherter Beschreibungstext",
      previewImage: IMAGE_URL,
    });
    await page.getByTestId("view-mode-presentation").click();
    const card = page.getByTestId("presentation-website-preview");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Gespeicherter Titel");
    await expect(card).toContainText("Gespeicherter Beschreibungstext");
    const button = card.getByTestId("node-preview-image-request");
    await expect(button).toBeVisible();
    await expect(button).toHaveText(`Vorschaubild von ${IMAGE_HOST} laden`);
    await expect(card.getByTestId("node-preview-image")).toHaveCount(0);
    await page.waitForTimeout(1_000);
    expect(api.imageRequests).toHaveLength(0);
    expect(api.previews).toHaveLength(0);

    await button.click();
    const image = card.getByTestId("node-preview-image");
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect.poll(() => api.imageRequests.length).toBeGreaterThan(0);
    await expect(card).toContainText("Gespeicherter Titel");
  });

  test("K8: Hinweis, Leer-Hinweis und Bild-Button stehen auf Deutsch und Englisch @t91", async ({ page, request }) => {
    const api = await start(page, request, "k8", {
      kind: "web",
      url: PAGE_URL,
      previewTitle: "Titel",
      previewImage: IMAGE_URL,
    });
    // Deutsch.
    await expect(disclosure(page)).toContainText("Beim Klick wird nur diese URL abgerufen");
    await expect(disclosure(page)).toContainText(PAGE_URL);
    await expect(disclosure(page)).toContainText("beispiel.t91-vorschau.invalid");
    await expect(page.getByTestId("node-preview-image-request")).toHaveText(`Vorschaubild von ${IMAGE_HOST} laden`);
    api.reply = { status: 200, body: { preview: { url: PAGE_URL, finalUrl: PAGE_URL } } };
    await BUTTON(page).click();
    await expect(page.getByTestId("node-preview-empty")).toHaveText("Keine Metadaten gefunden");

    // Englisch: Umstellen wie im Betrieb über das Hilfe-Menü (die App startet immer auf Deutsch).
    await page.getByTestId("toolbar-help-menu").click();
    await page.getByTestId("toolbar-locale").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("bloommd-locale"))).toBe("en");
    await expect(disclosure(page)).toContainText("On click, only this URL is requested");
    await expect(disclosure(page)).toContainText(PAGE_URL);
    await expect(disclosure(page)).toContainText("The contents, file names and folder names of your maps are not sent");
    await expect(page.getByTestId("node-preview-image-request")).toHaveText(`Load preview image from ${IMAGE_HOST}`);
    // Der Leer-Hinweis ist zustandsgebunden: erneuter Abruf liefert ihn auf Englisch.
    await page.getByTestId("node-url-panel").getByRole("button", { name: "Load website preview" }).click();
    await expect(page.getByTestId("node-preview-empty")).toHaveText("No metadata found");
    expect(api.imageRequests).toHaveLength(0);
  });
});
