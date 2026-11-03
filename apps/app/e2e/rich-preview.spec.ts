/**
 * Ticket #53 — Rich Preview für Mermaid, Bilder und Diagramme im Knoteneditor von /app. Alle Fälle tragen @t53.
 *
 * Kriterien stehen je im Testtitel:
 *  K1  Gültiger Mermaid-Block (```mermaid) wird im Knoten als Diagramm angezeigt.
 *  K2  Ungültiger Mermaid-Block zeigt eine verständliche Fehlermeldung, der Quelltext bleibt sichtbar, die App läuft weiter.
 *  K3  Diagramm und Bild öffnen in einer Großansicht mit Zoom, Verschieben und Esc (per Tastatur bedienbar, mit aria-Labels).
 *  K4  Vorschau und Großansicht ändern den Markdown nie (kein Speichern, gleicher Text beim späteren Speichern).
 *  K5  Diagramm als SVG/PNG speichern liefert eine Datei (Download).
 *  K6  Nicht auflösbare Bildpfade zeigen einen Hinweis mit dem Pfad; Pfade aus dem Workspace heraus werden abgelehnt.
 *
 * Wie in document-tabs.spec.ts kommen die Dokumente aus einer Mock-API (`page.route` auf `/api/mindmaps`), nicht vom
 * Server: das Dev-System kann keine Dokumente anlegen. Geprüft wird die ausgelieferte Oberfläche. Der Test hat kein
 * lokales Workspace-Verzeichnis geöffnet, also antwortet die Seite auf `bloommd:preview-resource` mit „Öffne zuerst
 * einen lokalen Workspace“; geprüft wird damit der Hinweis mit Pfad, nicht das Laden einer echten Bilddatei (das deckt
 * der Unit-Test mit der Shell-Attrappe ab).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };

const VALID_DIAGRAM = ["graph TD", "  A[Start] --> B[Ende]"].join("\n");
const BROKEN_DIAGRAM = ["graph TD", "  A --> B", "  B -->"].join("\n");

function uniqueEmail(label: string) {
  return `e2e-t53-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T53", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
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
  }, locale);
}

interface MockDocApi {
  /** Alle PUTs der Oberfläche (Datei, Markdown). */
  puts: Array<{ filename: string; markdown: string }>;
}

function markdownWithBody(title: string, body: string) {
  const slug = title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return [
    "---",
    `title: ${title}`,
    `id: ${slug}`,
    'created: "2026-11-03T10:00:00.000Z"',
    'updated: "2026-11-03T10:00:00.000Z"',
    "tags:",
    "  - t53",
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${title} <!-- bloommd:id=root-${slug} -->`,
    "",
    `## Ablauf <!-- bloommd:id=ablauf-${slug} -->`,
    "",
    body,
    "",
  ].join("\n");
}

function documentFromMarkdown(filename: string, markdown: string) {
  const title = /^title:\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? filename;
  const nodes: Record<string, { id: string; parentId: string | null; level: number; title: string; content: string; children: string[] }> = {};
  const stack: Array<{ level: number; id: string }> = [];
  let rootId = "";
  let current: string | null = null;
  let inFrontmatter = false;
  let frontmatterSeen = false;
  const content = new Map<string, string[]>();
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
    const match = /^(#{1,6})\s+(.*?)\s*(?:<!--\s*bloommd:id=([^\s>]+)[^>]*-->)?\s*$/.exec(line);
    if (match && !(current && (content.get(current) ?? []).filter((entry) => entry.startsWith("```")).length % 2 === 1)) {
      const level = match[1]!.length;
      const id = match[3]!;
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
      const parentId = stack[stack.length - 1]?.id ?? null;
      nodes[id] = { id, parentId, level, title: match[2]!.trim(), content: "", children: [] };
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
    frontmatter: { title, id: filename, created: "2026-11-03T10:00:00.000Z", updated: "2026-11-03T10:00:00.000Z", layout: { direction: "LR" } },
    nodes,
    rootId,
    preamble: "",
  };
}

/** Liefert ein Dokument `<filename>` mit dem Knoten „Ablauf“ und `body` als dessen Inhalt; der Knoten hat Inhalt, damit der Editor ihn zeigt. */
async function installDocApi(page: Page, filename: string, title: string, body: string): Promise<MockDocApi> {
  const api: MockDocApi = { puts: [] };
  let saved = markdownWithBody(title, body);
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
        api.puts.push({ filename, markdown });
        saved = markdown;
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ filePath: filename }) });
      }
      return route.fallback();
    },
  );
  return api;
}

async function openNodeEditor(page: Page, label: string) {
  await page.locator(`[data-testid="mindmap-node"][data-node-label="${label}"]`).first().click();
  await page.getByTestId("node-action-open-editor").click();
  await expect(page.getByTestId("node-editor")).toBeVisible();
}

async function setup(page: Page, request: APIRequestContext, label: string, body: string, locale: "de" | "en" = "de") {
  const run = Date.now();
  const filename = `t53-${label}-${run}.md`;
  const email = uniqueEmail(label);
  await createAccount(request, email);
  await prepare(page, locale);
  const api = await installDocApi(page, filename, `T53 ${label} ${run}`, body);
  await login(page, email);
  await openNodeEditor(page, "Ablauf");
  return { api, filename };
}

const block = (page: Page) => page.getByTestId("mermaid-block");

test.describe("Rich Preview für Mermaid, Bilder und Diagramme @t53", () => {
  test.setTimeout(120_000);

  test("K1: ein gültiger Mermaid-Block wird als Diagramm angezeigt @t53", async ({ page, request }) => {
    await setup(page, request, "valid", ["```mermaid", VALID_DIAGRAM, "```"].join("\n"));

    await expect(block(page)).toHaveAttribute("data-mermaid-state", "ready", { timeout: 30_000 });
    const diagram = page.getByTestId("mermaid-diagram").locator("img");
    await expect(diagram).toBeVisible();
    // Ein echtes, geladenes Bild: ein SVG mit dem Beschriftungstext des Diagramms.
    await expect.poll(() => diagram.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(decodeURIComponent((await diagram.getAttribute("src")) ?? "")).toContain("Start");
    // Der Quelltext bleibt dem Codeblock vorbehalten und erscheint erst auf Wunsch.
    await expect(page.getByTestId("mermaid-source")).toHaveCount(0);
    await page.getByTestId("mermaid-edit").click();
    await expect(page.getByTestId("mermaid-source")).toHaveValue(VALID_DIAGRAM);
    await page.getByTestId("mermaid-preview").click();
    await expect(page.getByTestId("mermaid-source")).toHaveCount(0);
  });

  test("K2: ein ungültiger Mermaid-Block zeigt eine verständliche Fehlermeldung, der Quelltext bleibt sichtbar, die App läuft weiter @t53", async ({ page, request }) => {
    await setup(page, request, "broken", ["```mermaid", BROKEN_DIAGRAM, "```"].join("\n"));

    await expect(block(page)).toHaveAttribute("data-mermaid-state", "error", { timeout: 30_000 });
    const error = page.getByTestId("mermaid-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Das Diagramm konnte nicht dargestellt werden");
    await expect(error).toContainText(/Zeile \d+/);
    await expect(page.getByTestId("mermaid-error-message")).toContainText("Parse error");
    // Kein leerer Bereich, kein Diagramm: der Quelltext bleibt sichtbar und editierbar.
    await expect(page.getByTestId("mermaid-diagram")).toHaveCount(0);
    const source = page.getByTestId("mermaid-source");
    await expect(source).toHaveValue(BROKEN_DIAGRAM);
    await expect(source).toBeEditable();
    // Die App läuft weiter: Karte und Editor bleiben bedienbar.
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
    await expect(page.getByTestId("node-editor")).toBeVisible();
    // Den Fehler zu beheben ersetzt die Fehlerkarte durch das Diagramm.
    await source.fill(VALID_DIAGRAM);
    await expect(block(page)).toHaveAttribute("data-mermaid-state", "ready", { timeout: 30_000 });
    await expect(page.getByTestId("mermaid-error")).toHaveCount(0);
  });

  test("K3: Großansicht mit Zoom, Verschieben und Esc, per Tastatur bedienbar und beschriftet (DE/EN) @t53", async ({ page, request }) => {
    await setup(page, request, "zoom", ["```mermaid", VALID_DIAGRAM, "```"].join("\n"));
    await expect(block(page)).toHaveAttribute("data-mermaid-state", "ready", { timeout: 30_000 });

    // Per Tastatur öffnen: Fokus auf das Diagramm, Enter.
    await page.getByTestId("mermaid-diagram").focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Diagrammansicht" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    for (const name of ["Hineinzoomen", "Herauszoomen", "Zoom zurücksetzen", "Großansicht schließen"]) {
      await expect(dialog.getByRole("button", { name })).toBeVisible();
    }

    const level = page.getByTestId("visual-zoom-level");
    await expect(level).toHaveText("100 %");
    await page.keyboard.press("+");
    await expect(level).toHaveText("125 %");
    await dialog.getByRole("button", { name: "Hineinzoomen" }).click();
    await expect(level).toHaveText("156 %");
    const content = page.getByTestId("visual-viewer-content");
    const before = await content.boundingBox();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await content.boundingBox())?.x ?? 0).toBeGreaterThan((before?.x ?? 0));
    await page.getByTestId("visual-viewer-stage").hover();
    await page.mouse.wheel(0, -100);
    await expect(level).not.toHaveText("156 %");
    await page.keyboard.press("0");
    await expect(level).toHaveText("100 %");

    // Esc schließt, der Fokus kehrt zum Diagramm zurück, der Knoteneditor bleibt offen.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("mermaid-diagram")).toBeFocused();
    await expect(page.getByTestId("node-editor")).toBeVisible();

    // Zweisprachig: dieselbe Ansicht auf Englisch.
    await page.evaluate(() => window.localStorage.setItem("bloommd-locale", "en"));
    await page.reload();
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
    await openNodeEditor(page, "Ablauf");
    await expect(block(page)).toHaveAttribute("data-mermaid-state", "ready", { timeout: 30_000 });
    await page.getByTestId("mermaid-enlarge").click();
    const english = page.getByRole("dialog", { name: "Diagram viewer" });
    await expect(english).toBeVisible();
    await expect(english.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(english.getByRole("button", { name: "Close viewer" })).toBeVisible();
  });

  test("K4: Vorschau und Großansicht ändern den Markdown nie @t53", async ({ page, request }) => {
    const { api, filename } = await setup(page, request, "readonly", ["```mermaid", VALID_DIAGRAM, "```", "", "![Strand](bilder/strand.png)"].join("\n"));
    await expect(block(page)).toHaveAttribute("data-mermaid-state", "ready", { timeout: 30_000 });

    // Öffnen, zoomen, verschieben, wieder schließen — für Diagramm und Bild.
    await page.getByTestId("mermaid-enlarge").click();
    await page.keyboard.press("+");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("visual-viewer")).toHaveCount(0);
    await page.getByTestId("mermaid-edit").click();
    await page.getByTestId("mermaid-preview").click();

    // Nichts wurde gespeichert, und beim späteren Speichern ist der Text derselbe wie am Anfang.
    expect(api.puts).toEqual([]);
    await page.evaluate(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => api.puts.length).toBeGreaterThan(0);
    const saved = api.puts.at(-1)!;
    expect(saved.filename).toBe(filename);
    expect(saved.markdown).toContain(["```mermaid", VALID_DIAGRAM, "```"].join("\n"));
    expect(saved.markdown).toContain("![Strand](bilder/strand.png)");
    // Keine Konfliktkopie.
    expect(api.puts.every((put) => put.filename === filename)).toBe(true);
  });

  test("K5: Diagramm als SVG und als PNG speichern @t53", async ({ page, request }) => {
    await setup(page, request, "export", ["```mermaid", VALID_DIAGRAM, "```"].join("\n"));
    await expect(block(page)).toHaveAttribute("data-mermaid-state", "ready", { timeout: 30_000 });
    await page.getByTestId("mermaid-enlarge").click();

    const svgDownload = page.waitForEvent("download");
    await page.getByTestId("visual-action-diagram-svg").click();
    const svg = await svgDownload;
    expect(svg.suggestedFilename()).toMatch(/-diagram\.svg$/);
    const svgText = await readFile((await svg.path())!, "utf8");
    expect(svgText).toContain("<svg");
    expect(svgText).toContain("Start");

    const pngDownload = page.waitForEvent("download");
    await page.getByTestId("visual-action-diagram-png").click();
    const png = await pngDownload;
    expect(png.suggestedFilename()).toMatch(/-diagram\.png$/);
    const bytes = await readFile((await png.path())!);
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test("K6: nicht auflösbare Bildpfade zeigen einen Hinweis mit dem Pfad, Pfade aus dem Workspace heraus werden abgelehnt @t53", async ({ page, request }) => {
    await setup(page, request, "images", ["![Fehlt](bilder/Strand am Meer.png)", "", "![[fehlt-embed.png]]", "", "![Raus](../../geheim.png)"].join("\n"));

    const gallery = page.getByTestId("node-image-gallery");
    await expect(gallery).toBeVisible();
    const problems = page.getByTestId("node-image-problem");
    await expect(problems).toHaveCount(3);
    await expect(problems.nth(0)).toContainText("Bild nicht gefunden: bilder/Strand am Meer.png");
    await expect(problems.nth(1)).toContainText("Bild nicht gefunden:");
    await expect(problems.nth(1)).toContainText("fehlt-embed.png");
    await expect(problems.nth(2)).toContainText("Pfad nicht erlaubt: ../../geheim.png");
    // Statt eines kaputten Bildsymbols steht ein Hinweis; die Galerie selbst enthält kein Bild.
    await expect(gallery.locator("img")).toHaveCount(0);
  });
});
