/**
 * Ticket #432 — /wiki zeigt nach `agent decide` keine BloomMD-Kommentare (`<!-- bloommd:id=… -->`) im Fließtext. Alle Fälle tragen @t432.
 *
 * Gleicher Aufbau wie @t345 (Schritt 4): Fixture-Vault frisch kopieren, `bloommd-wiki agent decide` auf `neu.md`,
 * `/wiki` neu laden, Seite öffnen. Kein `page.route`; die Seite liest die Datei über die echte API.
 * Geprüft wird nur die Anzeige: Die Markdown-Datei behält ihre Kommentare (byte-gleich nach dem Öffnen von /wiki), die API liefert sie weiter.
 */
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LEARNINGS_W0_VAULT, LEARNINGS_W0_WIKI_DIR, resetLearningsW0, WIKI_CLI } from "./learnings-w0-paths";

const NEU_TITLE = "Bun-Version des Repos im Lockfile-Check der CI festhalten";
const GUELTIG_TITLE = "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer";
const NEU_FILE = path.join(LEARNINGS_W0_WIKI_DIR, "neu.md");
const BLOOMMD_COMMENT = /<!--\s*bloommd:(?:id|meta)=/;

function wiki(...args: string[]) {
  const result = spawnSync("bun", [WIKI_CLI, ...args], { encoding: "utf8", env: process.env, timeout: 60_000 });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

test.describe("@t432 /wiki blendet BloomMD-Kommentare aus", () => {
  test.beforeAll(() => {
    test.setTimeout(180_000);
    resetLearningsW0();
    const setup = wiki("agent", "setup", LEARNINGS_W0_VAULT, "--access", "write");
    expect(setup.status, setup.stdout + setup.stderr).toBe(0);
  });

  test("@t432 nach agent decide: Artikel ohne bloommd:-Kommentare, Datei unverändert", async ({ page }) => {
    const decide = wiki(
      "agent", "decide", "Learnings/neu.md",
      "--entscheid", "bestaetigt",
      "--grund", "Gegen PR 306 im Repo BloomMD geprüft: BloomMD läuft seit dem 06.11.2026 auf Bun 1.4.4",
      "--quelle", "https://github.com/moellenbeck-digital/BloomMD/pull/306",
      "--name", "E2E t432",
      "--vault", LEARNINGS_W0_VAULT,
    );
    expect(decide.status, decide.stdout + decide.stderr).toBe(0);

    // Vorbedingung: decide hat die Kommentare in die Datei geschrieben (sonst prüft der Test nichts).
    const markdown = readFileSync(NEU_FILE, "utf8");
    expect(markdown).toMatch(/^## Entscheidung .*<!--\s*bloommd:id=/m);
    const hashBefore = sha256(NEU_FILE);

    await page.goto("/wiki");
    await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 120_000 });
    await page.reload();
    await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: NEU_TITLE }).first().click();
    await expect(page.getByRole("heading", { name: NEU_TITLE })).toBeVisible();

    const article = page.locator("article");
    await expect(article).toContainText("Entscheid: bestätigt");
    await expect(article).toContainText("Wer: E2E t432");
    await expect(article).toContainText("## Entscheidung");
    const text = (await article.textContent()) ?? "";
    expect(text).not.toContain("bloommd:");
    expect(text).not.toContain("bloommd:id");
    expect(text).not.toContain("bloommd:meta");
    expect(text).not.toContain("<!--");
    // Kein überzähliges Leerzeichen am Zeilenende der Überschrift.
    expect(await article.innerText()).toMatch(/^## Entscheidung$/m);

    // Seite ohne BloomMD-Kommentare: Anzeige wie vorher.
    await page.getByRole("button", { name: GUELTIG_TITLE }).first().click();
    await expect(page.getByRole("heading", { name: GUELTIG_TITLE })).toBeVisible();
    await expect(article).toContainText("## Beleg");
    expect(await article.textContent()).not.toContain("<!--");

    // Nur die Anzeige ändert sich: Datei byte-gleich, API liefert den Rohtext weiter.
    expect(sha256(NEU_FILE)).toBe(hashBefore);
    expect(readFileSync(NEU_FILE, "utf8")).toMatch(BLOOMMD_COMMENT);
    const api = await page.request.get("/api/wiki");
    expect(api.ok()).toBe(true);
    const body = (await api.json()) as { pages: Array<{ path: string; content: string }> };
    expect(body.pages.find((entry) => entry.path === "neu.md")?.content).toMatch(BLOOMMD_COMMENT);
  });
});
