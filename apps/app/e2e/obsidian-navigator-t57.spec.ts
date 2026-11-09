/**
 * Ticket #57 — BloomMD-Navigator im Obsidian-Plugin (Phase 1). Alle Fälle tragen @t57.
 *
 * Das Plugin läuft in Obsidian, nicht in der Web-App: Dieser Spec startet ein echtes Obsidian (Electron) mit
 * eigenem, isoliertem Profil, legt eine Kopie des Test-Vaults `obsidian-test-vaults/BloomMD Plugin Test Vault`
 * samt dem gebauten Plugin (`plugins/obsidian`: `bun run build`) in ein Temp-Verzeichnis und steuert die
 * Oberfläche per Playwright über CDP (Vorlage: `scripts/qa/obsidian-ink-smoke.ts`). Die Web-App und
 * `PLAYWRIGHT_BASE_URL` werden nicht berührt.
 *
 * Umgebung (ohne `OBSIDIAN_BIN` wird der Spec übersprungen, damit Läufe ohne Obsidian nicht rot werden):
 *  - `OBSIDIAN_BIN`   Pfad der Obsidian-Binärdatei (Linux: entpacktes `obsidian-<version>.tar.gz`, Datei `obsidian`;
 *                     macOS: `…/Obsidian.app/Contents/MacOS/Obsidian`).
 *  - `DISPLAY`        auf Servern ohne Bildschirm z. B. ein laufendes `Xvfb :97 -screen 0 1600x1000x24`.
 *  - Das Plugin muss gebaut sein (`bun run --cwd plugins/obsidian build`); fehlt `main.js`, schlägt der Lauf fehl.
 *
 * Kriterien (K1–K9 stehen im Testtitel). Testdaten: nur in der Temp-Kopie des Vaults (inkl. 80 erzeugter Notizen
 * im Ordner `Viele`), sie wird am Ende samt Profil entfernt; der Repo-Vault bleibt unberührt.
 *
 * Nicht oder nur eingeschränkt prüfbar:
 *  - K8 „Suche“: Das Suchfeld ist in Phase 1 reserviert (`disabled`, „Search (not available yet)“). Geprüft wird
 *    nur, dass es nicht bedienbar ist und die Navigation keine Markdown-Datei verändert (SHA-256 aller `.md`).
 *  - K9: Im Renderer-Prozess wird jede Netzanfrage aufgezeichnet und der Test läuft mit abgeschaltetem Netz
 *    (`context.setOffline`). Anfragen des Obsidian-Hauptprozesses (z. B. Update-Prüfung) sind darüber nicht sichtbar.
 *  - Strg/Cmd: Auf Linux ist `Mod` = Strg; die macOS-Belegung (Cmd) ist hier nicht geprüft.
 */
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const OBSIDIAN_BIN = process.env.OBSIDIAN_BIN?.trim();
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PLUGIN_DIR = path.join(REPO_ROOT, "plugins/obsidian");
const SOURCE_VAULT = path.join(REPO_ROOT, "obsidian-test-vaults/BloomMD Plugin Test Vault");
const VAULT_NAME = "BloomMD Plugin Test Vault";

const NAV = "Navigator";
const ALPHA = `${NAV}/Projekte/Alpha`;
const ARCHIV_2025 = `${ALPHA}/Archiv/2025`;

interface ObsidianApp {
  workspace: {
    layoutReady: boolean;
    getActiveFile(): { path: string } | null;
    openLinkText(link: string, source: string, newLeaf?: boolean): Promise<void>;
  };
  commands: { executeCommandById(id: string): boolean };
  plugins: {
    plugins: Record<string, { manifest: { version: string } } | undefined>;
    setEnable(enabled: boolean): Promise<void>;
    enablePlugin(id: string): Promise<void>;
  };
}
type ObsidianWindow = Window & { app: ObsidianApp };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

async function markdownHashes(root: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== ".obsidian") await walk(full);
      } else if (entry.name.toLowerCase().endsWith(".md")) {
        hashes[path.relative(root, full)] = createHash("sha256").update(await readFile(full)).digest("hex");
      }
    }
  };
  await walk(root);
  return hashes;
}

test.describe("Obsidian-Navigator @t57", () => {
  test.skip(!OBSIDIAN_BIN, "OBSIDIAN_BIN ist nicht gesetzt: Obsidian-Oberflächentest übersprungen (siehe Dateikopf).");
  test.setTimeout(120_000);

  let work = "";
  let vault = "";
  let child: ChildProcess | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext;
  let page: Page;
  let hashesBefore: Record<string, string> = {};
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];

  // ── Helfer ────────────────────────────────────────────────────────────────────
  const treeRow = (p: string) => page.locator(`.bloommd-nav-pane-tree .bloommd-nav-row[title="${p}"]`);
  const listRow = (p: string) => page.locator(`.bloommd-nav-pane-list .bloommd-nav-row[title="${p}"]`);
  const selectedTree = () => page.locator(".bloommd-nav-pane-tree .bloommd-nav-row.is-selected");
  const selectedList = () => page.locator(".bloommd-nav-pane-list .bloommd-nav-row.is-selected");
  const browsing = () => page.locator(".bloommd-nav-context-browse");
  const mapLine = () => page.locator(".bloommd-nav-context-map");
  const activeFile = () => page.evaluate(() => (window as unknown as ObsidianWindow).app.workspace.getActiveFile()?.path ?? null);
  const runCommand = (id: string) => page.evaluate((commandId) => (window as unknown as ObsidianWindow).app.commands.executeCommandById(commandId), id);
  /** Wo der Tastaturfokus liegt: Baum, Liste, Karte oder sonstwo. */
  const focusArea = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      const pane = el?.closest<HTMLElement>("[data-area]");
      if (pane) return pane.dataset.area ?? "?";
      if (el?.closest(".bloommd-react-shell, .bloommd-view")) return "map";
      // Die Karte nimmt den Fokus als aktives Blatt; `document.activeElement` bleibt dabei `body`.
      const leaf = (window as unknown as { app: { workspace: { activeLeaf?: { view?: { getViewType(): string } } } } }).app.workspace.activeLeaf;
      if (leaf?.view?.getViewType() === "bloommd-mindmap-view") return "map";
      if (el?.closest(".cm-editor")) return "editor";
      return `other:${el?.tagName}.${el?.className}`;
    });
  const openLink = (note: string) => page.evaluate((link) => (window as unknown as ObsidianWindow).app.workspace.openLinkText(link, "", false), note);

  async function openNavigatorViaRibbon() {
    await page.bringToFront();
    if (await page.locator(".bloommd-nav").count()) return;
    await page.locator('.side-dock-ribbon-action[aria-label="Open navigator"]').click();
    await expect(page.locator(".bloommd-nav-pane-tree .bloommd-nav-row").first()).toBeVisible();
  }

  async function expandFolder(p: string) {
    const row = treeRow(p);
    await expect(row).toBeVisible();
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.locator(".bloommd-nav-chevron").click();
    await expect(treeRow(p)).toHaveAttribute("aria-expanded", "true");
  }

  /** Wählt einen Ordner im Baum und klappt dazu bei Bedarf die übergeordneten Ordner auf. */
  async function selectFolderRow(p: string) {
    const parts = p.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) await expandFolder(parts.slice(0, depth).join("/"));
    await treeRow(p).locator(".bloommd-nav-label").click();
    await expect(selectedTree()).toHaveAttribute("title", p);
  }

  const listTitles = () => page.locator(".bloommd-nav-pane-list .bloommd-nav-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("title") ?? ""));

  // ── Aufbau / Abbau ───────────────────────────────────────────────────────────
  test.beforeAll(async () => {
    await stat(path.join(PLUGIN_DIR, "main.js")).catch(() => {
      throw new Error("plugins/obsidian/main.js fehlt: erst `bun run --cwd plugins/obsidian build`.");
    });
    work = await mkdtemp(path.join(tmpdir(), "bloommd-t57-"));
    vault = path.join(work, VAULT_NAME);
    const profile = path.join(work, "profile");
    await cp(SOURCE_VAULT, vault, { recursive: true, filter: (src) => !src.includes(`${path.sep}.obsidian`) });
    // Viele Notizen, damit Scrollen und „sichtbar machen“ geprüft werden kann (nur in der Temp-Kopie).
    await mkdir(path.join(vault, "Viele"), { recursive: true });
    for (let i = 1; i <= 80; i += 1) {
      const n = String(i).padStart(2, "0");
      await writeFile(path.join(vault, "Viele", `Notiz ${n}.md`), `# Notiz ${n}\n\n## Abschnitt\nNavigator test note: Viele/Notiz ${n}.md\n`);
    }
    const pluginTarget = path.join(vault, ".obsidian/plugins/bloommd");
    await mkdir(pluginTarget, { recursive: true });
    for (const file of ["manifest.json", "main.js", "shared-runtime.js", "styles.css"]) await cp(path.join(PLUGIN_DIR, file), path.join(pluginTarget, file));
    await writeFile(path.join(vault, ".obsidian/community-plugins.json"), JSON.stringify(["bloommd"]));
    await writeFile(path.join(vault, ".obsidian/app.json"), JSON.stringify({ legacyEditor: false, livePreview: true }));
    await mkdir(profile, { recursive: true });
    await writeFile(path.join(profile, "obsidian.json"), JSON.stringify({ vaults: { bloommdt57vault01: { path: vault, ts: Date.now(), open: true } } }));
    hashesBefore = await markdownHashes(vault);

    const port = await freePort();
    child = spawn(OBSIDIAN_BIN!, ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], {
      stdio: "ignore",
      env: process.env,
    });
    let ready = false;
    for (let attempt = 0; attempt < 90 && !ready; attempt += 1) {
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
      } catch {
        await sleep(500);
      }
    }
    if (!ready) throw new Error("Obsidian hat den DevTools-Port nicht innerhalb von 45 s geöffnet.");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    context = browser.contexts()[0]!;
    let found: Page | undefined;
    for (let attempt = 0; !found && attempt < 60; attempt += 1) {
      found = context.pages().find((candidate) => candidate.url().startsWith("app://obsidian.md") && !candidate.url().includes("starter"));
      if (!found) await sleep(500);
    }
    if (!found) throw new Error("Obsidian-Fenster mit dem Vault nicht gefunden.");
    page = found;
    page.on("request", (request) => {
      if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.waitForFunction(() => Boolean((window as unknown as ObsidianWindow).app?.workspace?.layoutReady), undefined, { timeout: 40_000 });
    // Obsidian lädt das Plugin selbst, sobald dem Vault vertraut wird. Nie parallel noch einmal aktivieren
    // (das registriert die Ansichten doppelt): erst auf den Vertrauensdialog bzw. das geladene Plugin warten.
    const pluginLoaded = () => page.evaluate(() => Boolean((window as unknown as ObsidianWindow).app.plugins.plugins.bloommd));
    const trust = page.locator(".modal button", { hasText: /Trust|vertrauen/i });
    for (let attempt = 0; attempt < 40 && !(await pluginLoaded()); attempt += 1) {
      if (await trust.count()) {
        await trust.first().click();
        break;
      }
      await sleep(250);
    }
    for (let attempt = 0; attempt < 60 && !(await pluginLoaded()); attempt += 1) await sleep(250);
    if (!(await pluginLoaded())) await page.evaluate(() => (window as unknown as ObsidianWindow).app.plugins.setEnable(true));
    for (let attempt = 0; attempt < 60 && !(await pluginLoaded()); attempt += 1) await sleep(250);
    const version = await page.evaluate(() => (window as unknown as ObsidianWindow).app.plugins.plugins.bloommd?.manifest.version ?? null);
    expect(version, "BloomMD-Plugin wurde nicht geladen").not.toBeNull();
    // Obsidian 1.15 öffnet beim Vertrauen/Aktivieren das Einstellungsfenster als eigenes Fenster. Bleibt es offen,
    // gilt es als „aktives Fenster“ (`activeWindow`) und Hinweise (`Notice`) erscheinen dort statt im Hauptfenster.
    await page.evaluate(() => (window as unknown as { app: { setting?: { close?: () => void } } }).app.setting?.close?.());
    await expect.poll(() => context.pages().length).toBe(1);
    await page.bringToFront();
    // K9: ab hier ohne Netz.
    await context.setOffline(true);
  });

  test.afterAll(async () => {
    await browser?.close().catch(() => undefined);
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
      child.kill("SIGTERM");
      if (!(await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)]))) child.kill("SIGKILL");
    }
    if (work) await rm(work, { recursive: true, force: true });
  });

  // ── K1 ────────────────────────────────────────────────────────────────────────
  test("K1: Navigator zeigt den Vault als aufklappbaren Ordnerbaum, die Notizen des gewählten Ordners stehen in einer eigenen Liste @t57", async () => {
    await openNavigatorViaRibbon();
    const root = treeRow(VAULT_NAME);
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute("aria-expanded", "true");
    await expect(treeRow(NAV)).toBeVisible();
    await expect(treeRow("Viele")).toBeVisible();
    // Auf- und zuklappen
    await expandFolder(NAV);
    await expandFolder(`${NAV}/Projekte`);
    await expandFolder(ALPHA);
    await expandFolder(`${ALPHA}/Archiv`);
    await expect(treeRow(ARCHIV_2025)).toBeVisible();
    await expect(treeRow(`${NAV}/Leer`)).toBeVisible();
    await expect(treeRow(`${NAV}/Lange Namen`)).toBeVisible();
    await treeRow(`${ALPHA}/Archiv`).locator(".bloommd-nav-chevron").click();
    await expect(treeRow(`${ALPHA}/Archiv`)).toHaveAttribute("aria-expanded", "false");
    await expect(treeRow(ARCHIV_2025)).toHaveCount(0);
    // Der Baum enthält nur Ordner, keine Notizen.
    const treeTitles = await page.locator(".bloommd-nav-pane-tree .bloommd-nav-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("title") ?? ""));
    expect(treeTitles.filter((title) => title.endsWith(".md")), "Der Baum darf keine Notizen enthalten").toEqual([]);
    // Liste: nur die Notizen des gewählten Ordners, natürlich sortiert (Plan 2 vor Plan 10), ohne Unterordner-Notizen.
    await selectFolderRow(ALPHA);
    await expect.poll(listTitles).toEqual([`${ALPHA}/Notizen.md`, `${ALPHA}/Plan 2.md`, `${ALPHA}/Plan 10.md`]);
    await expect(page.locator(".bloommd-nav-pane-list .bloommd-nav-pane-title")).toContainText("(3)");
    // Die Liste ist ein eigener Bereich neben dem Baum.
    const treeBox = await page.locator(".bloommd-nav-pane-tree").boundingBox();
    const listBox = await page.locator(".bloommd-nav-pane-list").boundingBox();
    expect(treeBox && listBox).toBeTruthy();
    expect(listBox!.y >= treeBox!.y + treeBox!.height - 1 || listBox!.x >= treeBox!.x + treeBox!.width - 1, "Liste und Baum überlappen").toBe(true);
    // Leerer Ordner und Ordner mit langem Namen
    await selectFolderRow(`${NAV}/Leer`);
    await expect.poll(listTitles).toEqual([]);
    await selectFolderRow(`${NAV}/Lange Namen`);
    await expect.poll(async () => (await listTitles()).length).toBe(1);
  });

  // ── K2 ────────────────────────────────────────────────────────────────────────
  test("K2: Datei-/Ordnerkontext und Map-Kontext stehen in zwei getrennten Header-Zeilen @t57", async () => {
    await openNavigatorViaRibbon();
    await selectFolderRow(ALPHA);
    await listRow(`${ALPHA}/Plan 2.md`).locator(".bloommd-nav-label").click();
    await expect(browsing()).toContainText("Browsing:");
    await expect(browsing()).toContainText("Plan 2");
    await expect(mapLine()).toContainText("Map:");
    await expect(mapLine()).toHaveAttribute("data-kind", "none");
    await expect(mapLine()).not.toContainText("Plan 2");
    const b = await browsing().boundingBox();
    const m = await mapLine().boundingBox();
    expect(b && m).toBeTruthy();
    expect(m!.y >= b!.y + b!.height - 1, "Browsing- und Map-Zeile stehen nicht untereinander").toBe(true);
    // Map für die Notiz öffnen: Map-Zeile ändert sich, Browsing-Zeile bleibt.
    const browseBefore = await browsing().innerText();
    await page.getByRole("button", { name: "Open map of the selected note" }).click();
    await expect(mapLine()).toHaveAttribute("data-kind", "file");
    await expect(mapLine()).toContainText("Plan 2");
    expect(await browsing().innerText()).toBe(browseBefore);
    // Wer weiter navigiert, ändert nur die Browsing-Zeile; die Map-Zeile zeigt weiter die geöffnete Map.
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await selectFolderRow(`${NAV}/Projekte`);
    await expect(browsing()).toContainText("Projekte");
    await expect(mapLine()).toContainText("note Plan 2");
  });

  // ── K3 ────────────────────────────────────────────────────────────────────────
  test("K3: Klick oder Enter öffnet eine Datei, „Map of the selected note / folder“ oder M öffnet sie als Map @t57", async () => {
    await openNavigatorViaRibbon();
    await selectFolderRow(ALPHA);
    // Klick
    await listRow(`${ALPHA}/Plan 2.md`).locator(".bloommd-nav-label").click();
    await expect.poll(activeFile).toBe(`${ALPHA}/Plan 2.md`);
    // Enter: Fokus in die Liste, ↓ auf „Plan 10“, Enter
    await page.locator(".bloommd-nav-pane-list .bloommd-nav-scroll").focus();
    await page.keyboard.press("ArrowDown");
    await expect(selectedList()).toHaveAttribute("title", `${ALPHA}/Plan 10.md`);
    await page.keyboard.press("Enter");
    await expect.poll(activeFile).toBe(`${ALPHA}/Plan 10.md`);
    // M auf der Notiz → Map der Notiz
    await page.locator(".bloommd-nav-pane-list .bloommd-nav-scroll").focus();
    await page.keyboard.press("m");
    await expect(mapLine()).toHaveAttribute("data-kind", "file");
    await expect(mapLine()).toContainText("Plan 10");
    await expect(page.locator(".bloommd-react-shell").first()).toBeVisible();
    // Header-Knopf „Map of the selected folder“
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await selectFolderRow(ALPHA);
    await page.getByRole("button", { name: "Open map of the selected folder" }).click();
    await expect(mapLine()).toHaveAttribute("data-kind", "folder");
    await expect(mapLine()).toContainText("Alpha");
    // M im Baum auf einem anderen Ordner
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await selectFolderRow(`${NAV}/Projekte`);
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await page.keyboard.press("m");
    await expect(mapLine()).toHaveAttribute("data-kind", "folder");
    await expect(mapLine()).toContainText("Projekte");
    // Der Vault selbst wird nie als Map geöffnet (Hinweis statt Map).
    await selectFolderRow(VAULT_NAME);
    await expect(page.getByRole("button", { name: "Open map of the selected folder" })).toBeDisabled();
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await page.keyboard.press("m");
    await expect(page.locator(".notice", { hasText: "whole vault is not mapped" })).toBeVisible();
    await expect(mapLine()).toContainText("Projekte");
  });

  // ── K4 ────────────────────────────────────────────────────────────────────────
  test("K4: Strg+Umschalt+R klappt den Weg zur Datei auf, scrollt sie sichtbar, markiert und fokussiert sie; der Navigator folgt der aktiven Datei @t57", async () => {
    await openNavigatorViaRibbon();
    // Tief verschachtelte Datei, der Baum ist dorthin zugeklappt.
    await selectFolderRow(VAULT_NAME);
    await openLink(`${ARCHIV_2025}/Notizen.md`);
    await expect.poll(activeFile).toBe(`${ARCHIV_2025}/Notizen.md`);
    // „Folgt der aktiven Datei“: ohne Tastenkürzel ist die Datei schon im Baum und in der Liste markiert.
    await expect(selectedTree()).toHaveAttribute("title", ARCHIV_2025);
    await expect(selectedList()).toHaveAttribute("title", `${ARCHIV_2025}/Notizen.md`);
    // Zuklappen und weg navigieren, dann mit dem Kürzel zurückholen (Fokus liegt im Editor).
    await selectFolderRow(NAV);
    await treeRow(NAV).locator(".bloommd-nav-chevron").click();
    await expect(treeRow(ARCHIV_2025)).toHaveCount(0);
    await page.locator(".cm-content").first().click();
    expect(await focusArea()).toBe("editor");
    await page.keyboard.press("Control+Shift+R");
    for (const folder of [NAV, `${NAV}/Projekte`, ALPHA, `${ALPHA}/Archiv`]) await expect(treeRow(folder)).toHaveAttribute("aria-expanded", "true");
    await expect(treeRow(ARCHIV_2025)).toBeVisible();
    await expect(selectedTree()).toHaveAttribute("title", ARCHIV_2025);
    await expect(selectedList()).toHaveAttribute("title", `${ARCHIV_2025}/Notizen.md`);
    await expect(selectedList()).toHaveAttribute("aria-selected", "true");
    await expect.poll(focusArea).toBe("list");
    // Wird sie gescrollt? Notiz 80 liegt weit unten in der 80-Einträge-Liste.
    await openLink("Viele/Notiz 80.md");
    await expect.poll(activeFile).toBe("Viele/Notiz 80.md");
    await selectFolderRow(VAULT_NAME);
    await page.locator(".cm-content").first().click();
    await page.keyboard.press("Control+Shift+R");
    await expect(selectedList()).toHaveAttribute("title", "Viele/Notiz 80.md");
    await expect.poll(focusArea).toBe("list");
    const scroll = page.locator(".bloommd-nav-pane-list .bloommd-nav-scroll");
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
    const visible = await page.evaluate(() => {
      const scrollEl = document.querySelector<HTMLElement>(".bloommd-nav-pane-list .bloommd-nav-scroll")!;
      const row = document.querySelector<HTMLElement>(".bloommd-nav-pane-list .bloommd-nav-row.is-selected")!;
      const s = scrollEl.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return r.top >= s.top - 1 && r.bottom <= s.bottom + 1;
    });
    expect(visible, "Die markierte Datei liegt nicht im sichtbaren Bereich der Liste").toBe(true);
    // Folgen ohne Kürzel: eine andere Datei öffnen, der Navigator springt von selbst dorthin.
    await openLink(`${NAV}/Projekte/Beta/Notizen.md`);
    await expect(selectedTree()).toHaveAttribute("title", `${NAV}/Projekte/Beta`);
    await expect(selectedList()).toHaveAttribute("title", `${NAV}/Projekte/Beta/Notizen.md`);
  });

  // ── K5 ────────────────────────────────────────────────────────────────────────
  test("K5: Tastatur ↑/↓, ←/→, Enter, Tab, Esc arbeiten je nach Fokusbereich; „Focus navigator“ holt den Fokus von der Map zurück @t57", async () => {
    await openNavigatorViaRibbon();
    // Baum: Ausgangspunkt Vault-Wurzel
    await selectFolderRow(VAULT_NAME);
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    expect(await focusArea()).toBe("tree");
    await page.keyboard.press("ArrowDown");
    const first = await selectedTree().getAttribute("title");
    expect(first).not.toBe(VAULT_NAME);
    await page.keyboard.press("ArrowDown");
    const second = await selectedTree().getAttribute("title");
    expect(second).not.toBe(first);
    await page.keyboard.press("ArrowUp");
    await expect(selectedTree()).toHaveAttribute("title", first!);
    // →/← auf „Navigator“: aufklappen, zuklappen
    await selectFolderRow(NAV);
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    if ((await treeRow(NAV).getAttribute("aria-expanded")) === "true") await page.keyboard.press("ArrowLeft");
    await expect(treeRow(NAV)).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowRight");
    await expect(treeRow(NAV)).toHaveAttribute("aria-expanded", "true");
    // → auf offenem Ordner: Fokus in die Liste
    await page.keyboard.press("ArrowRight");
    await expect.poll(focusArea).toBe("list");
    // ← in der Liste: zurück zum Baum
    await page.keyboard.press("ArrowLeft");
    await expect.poll(focusArea).toBe("tree");
    // Enter im Baum: Ordner öffnen, Fokus auf die Notizen
    await selectFolderRow(ALPHA);
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await page.keyboard.press("Enter");
    await expect.poll(focusArea).toBe("list");
    // ↑/↓ in der Liste
    const before = await selectedList().getAttribute("title");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => selectedList().getAttribute("title")).not.toBe(before);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => selectedList().getAttribute("title")).toBe(before);
    // Enter in der Liste öffnet die Notiz
    await page.keyboard.press("Enter");
    await expect.poll(activeFile).toBe(before);
    // Tab / Umschalt+Tab wechseln den Bereich (ohne Map: Baum ↔ Liste)
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await page.keyboard.press("Tab");
    await expect.poll(focusArea).toBe("list");
    await page.keyboard.press("Shift+Tab");
    await expect.poll(focusArea).toBe("tree");
    // Esc: Liste → Baum → Editor
    await page.keyboard.press("Tab");
    await expect.poll(focusArea).toBe("list");
    await page.keyboard.press("Escape");
    await expect.poll(focusArea).toBe("tree");
    await page.keyboard.press("Escape");
    await expect.poll(focusArea).toBe("editor");
  });

  test("K5 (Map): Tab und M bringen den Fokus in die Map, „Focus navigator“ holt ihn zurück @t57", async () => {
    await openNavigatorViaRibbon();
    await selectFolderRow(ALPHA);
    await listRow(`${ALPHA}/Plan 2.md`).locator(".bloommd-nav-label").click();
    await page.locator(".bloommd-nav-pane-list .bloommd-nav-scroll").focus();
    await page.keyboard.press("m");
    await expect(mapLine()).toHaveAttribute("data-kind", "file");
    await expect.poll(focusArea).toBe("map");
    await runCommand("bloommd:focus-navigator");
    await expect.poll(focusArea).toMatch(/^(tree|list)$/);
    // Tab: Baum → Liste → Map
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await page.keyboard.press("Tab");
    await expect.poll(focusArea).toBe("list");
    await page.keyboard.press("Tab");
    await expect.poll(focusArea).toBe("map");
    await runCommand("bloommd:focus-navigator");
    await expect.poll(focusArea).toBe("list");
  });

  test("K5 (Esc aus der Map): Esc führt aus der Map dorthin zurück, wo man herkam (Hilfe: „from the map back to where you came from“) @t57", async () => {
    await openNavigatorViaRibbon();
    await selectFolderRow(ALPHA);
    await listRow(`${ALPHA}/Plan 2.md`).locator(".bloommd-nav-label").click();
    await page.locator(".bloommd-nav-pane-list .bloommd-nav-scroll").focus();
    await page.keyboard.press("m");
    await expect.poll(focusArea).toBe("map");
    await page.keyboard.press("Escape");
    // Erwartet: zurück in die Liste (dorther kam man). Beobachtet bis jetzt: der Fokus landet im Editor.
    await expect.poll(focusArea, { message: "Esc in der Map führt nicht in den Navigator zurück" }).toBe("list");
  });

  // ── K6 ────────────────────────────────────────────────────────────────────────
  test("K6: Zurück/Vor per Strg+[ , Strg+] und per Header-Knopf; der Fokus bleibt nachvollziehbar @t57", async () => {
    await openNavigatorViaRibbon();
    await selectFolderRow(VAULT_NAME);
    await selectFolderRow("Viele");
    await selectFolderRow(`${NAV}/Projekte`);
    await selectFolderRow(ALPHA);
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    const back = page.getByRole("button", { name: "Back", exact: true });
    const forward = page.getByRole("button", { name: "Forward", exact: true });
    await expect(back).toBeEnabled();
    await expect(forward).toBeDisabled();
    // Tastatur: zurück
    await page.keyboard.press("Control+[");
    await expect(selectedTree()).toHaveAttribute("title", `${NAV}/Projekte`);
    await expect.poll(focusArea).toBe("tree");
    await page.keyboard.press("Control+[");
    await expect(selectedTree()).toHaveAttribute("title", "Viele");
    await expect(forward).toBeEnabled();
    // Tastatur: vor
    await page.keyboard.press("Control+]");
    await expect(selectedTree()).toHaveAttribute("title", `${NAV}/Projekte`);
    await expect.poll(focusArea).toBe("tree");
    // Knöpfe
    await back.click();
    await expect(selectedTree()).toHaveAttribute("title", "Viele");
    await expect(browsing()).toContainText("Viele");
    // Der Fokus bleibt am gedrückten Knopf im Navigator-Header (sichtbar, nachvollziehbar), nicht im Nichts.
    expect(await focusArea()).toMatch(/^other:BUTTON\.bloommd-nav-button/);
    await forward.click();
    await expect(selectedTree()).toHaveAttribute("title", `${NAV}/Projekte`);
    expect(await focusArea()).toMatch(/^other:BUTTON\.bloommd-nav-button/);
    // Auch mit Notiz: zurück geht zur vorherigen Auswahl.
    await selectFolderRow(ALPHA);
    await listRow(`${ALPHA}/Plan 2.md`).locator(".bloommd-nav-label").click();
    await selectFolderRow(`${NAV}/Leer`);
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await page.keyboard.press("Control+[");
    await expect(selectedTree()).toHaveAttribute("title", ALPHA);
  });

  test("K6 (Verlaufsende): Auch wenn „Vor“ per Klick das Ende des Verlaufs erreicht, bleibt der Fokus nachvollziehbar @t57", async () => {
    await openNavigatorViaRibbon();
    await selectFolderRow(VAULT_NAME);
    await selectFolderRow("Viele");
    await selectFolderRow(ALPHA);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    const forward = page.getByRole("button", { name: "Forward", exact: true });
    await forward.click();
    await forward.click();
    await expect(selectedTree()).toHaveAttribute("title", ALPHA);
    await expect(forward).toBeDisabled();
    // Erwartet: Fokus bleibt im Navigator. Beobachtet bis jetzt: der Knopf wird deaktiviert und der Fokus fällt auf <body>.
    const where = await focusArea();
    expect(where.startsWith("other:BODY"), `Fokus verloren: ${where.slice(0, 40)}`).toBe(false);
  });

  // ── K7 ────────────────────────────────────────────────────────────────────────
  test("K7: Die eingebaute Hilfe listet alle Shortcuts @t57", async () => {
    await openNavigatorViaRibbon();
    const help = page.locator(".bloommd-nav-help");
    await expect(help).toBeHidden();
    await page.getByRole("button", { name: "Keyboard help" }).click();
    await expect(help).toBeVisible();
    await expect(page.getByRole("button", { name: "Keyboard help" })).toHaveAttribute("aria-expanded", "true");
    const rows = await help.locator("tr").evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent ?? "")));
    expect(rows).toEqual([
      ["↑ / ↓", "Tree, list", "Previous / next entry"],
      ["←", "Tree", "Close the folder, or go to the parent folder"],
      ["→", "Tree", "Open the folder, or focus the list"],
      ["←", "List", "Back to the tree"],
      ["Enter", "Tree", "Open the folder and focus its notes"],
      ["Enter", "List", "Open the note"],
      ["M", "Tree, list", "Open the map of the selected note or folder"],
      ["Tab / Shift+Tab", "Navigator", "Next / previous area (tree, list, map)"],
      ["Esc", "Navigator", "List → tree → editor; from the map back to where you came from"],
      ["Ctrl+[ / Ctrl+]", "Navigator", "Back / forward in the navigation history"],
      ["Ctrl+Shift+R", "Anywhere", "Show the active note in the navigator"],
    ]);
    await expect(help).toContainText("Focus areas");
    await page.getByRole("button", { name: "Keyboard help" }).click();
    await expect(help).toBeHidden();
  });

  // ── K8 ────────────────────────────────────────────────────────────────────────
  test("K8: Navigation und Suche ändern keine Markdown-Inhalte @t57", async () => {
    await openNavigatorViaRibbon();
    // Suche ist in Phase 1 reserviert und nicht bedienbar.
    const search = page.locator(".bloommd-nav-search");
    await expect(search).toBeDisabled();
    await expect(search).toHaveAttribute("placeholder", /not available yet/);
    // Noch einmal quer durch den Vault navigieren und Maps öffnen, dann Hashes vergleichen.
    await selectFolderRow(ALPHA);
    await listRow(`${ALPHA}/Plan 2.md`).locator(".bloommd-nav-label").click();
    await expect.poll(activeFile).toBe(`${ALPHA}/Plan 2.md`);
    await page.locator(".bloommd-nav-pane-list .bloommd-nav-scroll").focus();
    await page.keyboard.press("m");
    await expect(mapLine()).toHaveAttribute("data-kind", "file");
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await selectFolderRow("Viele");
    await page.locator(".bloommd-nav-pane-tree .bloommd-nav-scroll").focus();
    await page.keyboard.press("m");
    await expect(mapLine()).toHaveAttribute("data-kind", "folder");
    await listRow("Viele/Notiz 07.md").locator(".bloommd-nav-label").click();
    await page.waitForTimeout(1500);
    const after = await markdownHashes(vault);
    // Erzeugte Notizen („Viele“) gehören zum Aufbau und sind schon in `hashesBefore` enthalten.
    expect(Object.keys(after).length).toBeGreaterThanOrEqual(80 + 8);
    // Bei einer Abweichung steht der Inhalt vorher/nachher im Fehlertext.
    const changed = Object.keys(hashesBefore).filter((file) => after[file] !== hashesBefore[file]);
    let report = "";
    for (const file of changed) {
      const original = await readFile(path.join(file.startsWith("Viele") ? path.join(work, "orig") : SOURCE_VAULT, file), "utf8").catch(() => "(Original nicht lesbar)");
      report += `\n--- ${file} (vorher)\n${original}\n+++ ${file} (nachher)\n${await readFile(path.join(vault, file), "utf8")}`;
    }
    expect(changed, `Markdown-Dateien wurden verändert:${report}`).toEqual([]);
  });

  // ── K9 ────────────────────────────────────────────────────────────────────────
  test("K9: Der Navigator läuft offline und sendet keine Vault-Inhalte @t57", async () => {
    await openNavigatorViaRibbon();
    // Der Kontext ist seit dem Start offline (setOffline): Navigation funktioniert trotzdem (siehe K1–K7).
    const online = await page.evaluate(() => navigator.onLine);
    expect(online, "Das Netz hätte abgeschaltet sein müssen").toBe(false);
    await selectFolderRow(VAULT_NAME);
    await selectFolderRow(ALPHA);
    await expect.poll(async () => (await listTitles()).length).toBe(3);
    // Der Renderer hat in der ganzen Sitzung keine http(s)-Anfrage gestellt.
    expect(externalRequests, `Anfragen nach außen: ${externalRequests.join(", ")}`).toEqual([]);
    // Und die Seite protokolliert keinen Fehler des Navigators.
    expect(consoleErrors.filter((text) => /navigator|bloommd/i.test(text)), consoleErrors.join("\n")).toEqual([]);
  });
});
