/**
 * Ticket #345 — E2E-Abnahme „Learnings W0“ (Schema aus #259, `docs/LEARNINGS.md` → „Minimales Schema (W0)“). Alle Fälle tragen @t345.
 *
 * Echte Dateien, echte API: `BLOOMMD_WIKI_DIR` zeigt auf `<vault>/Learnings`, das vor dem Lauf frisch aus
 * `e2e/fixtures/learnings-w0/` kopiert wird (Reset, siehe `learnings-w0-paths.ts`). Kein `page.route` auf `/api/wiki`;
 * die Änderung schreibt `bloommd-wiki agent decide` in die Datei, die Seite liest sie danach neu.
 *
 * Ablauf (ein durchgehender Test, damit ein Video den ganzen Fall zeigt):
 *  1. Lint ist sauber.
 *  2. `agent search` liefert die Learnings wie in der Status-Tabelle von LEARNINGS.md.
 *  3. `/wiki` zeigt das gültige und das neue Learning mit Vertrauensstufe, Lebenszyklus und Beleg/Quelle.
 *  4. `agent decide` bestätigt `neu.md`: im Markdown `status: bestätigt`, `verified`, Knoten „Entscheidung“; `/wiki` zeigt es nach dem Neuladen.
 *  5. `korrigiert.md` fehlt in der Standardsuche und erscheint mit `--include-stale` (`replaced_by` über `agent read`).
 *  6. Negativfall `unbelegt.md`: `unbestätigt`, fehlender Beleg sichtbar, Bestätigen wird verweigert.
 *  7. Byte-Vergleich: `vergleich.md` (und alle nicht entschiedenen Dateien) vorher und nachher identisch.
 *
 * Nicht geprüft: das Videoformat (macht die Video-Config) und Cloud-Ziele (`--cloud`); getestet wird der Vault-Weg.
 */
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { LEARNINGS_W0_VAULT, LEARNINGS_W0_WIKI_DIR, resetLearningsW0, WIKI_CLI } from "./learnings-w0-paths";

const PAUSE_MS = Number(process.env.LEARNINGS_W0_PAUSE_MS ?? 0);
const NEU_TITLE = "Bun-Version des Repos im Lockfile-Check der CI festhalten";
const GUELTIG_TITLE = "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer";
const UNBELEGT_TITLE = "Auch andere Vault-Items könnten Platzhalter enthalten";
const KORRIGIERT_TITLE = "Eine Bun-Version reicht für alle Repos";

interface Treffer {
  pfad: string;
  titel: string;
  status: string | null;
}

function wiki(...args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", [WIKI_CLI, ...args], { encoding: "utf8", env: process.env, timeout: 60_000 });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function wikiJson<T>(...args: string[]): T {
  const result = wiki(...args);
  expect(result.status, `bloommd-wiki ${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as T;
}

const search = (text: string, ...flags: string[]) =>
  wikiJson<{ treffer: Treffer[] }>("agent", "search", text, "--limit", "20", ...flags, "--vault", LEARNINGS_W0_VAULT).treffer;

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

function hashes(): Record<string, string> {
  return Object.fromEntries(readdirSync(LEARNINGS_W0_WIKI_DIR).sort().map((name) => [name, sha256(path.join(LEARNINGS_W0_WIKI_DIR, name))]));
}

async function openPage(page: Page, title: string) {
  await page.getByRole("button", { name: title }).first().click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

const pause = (page: Page) => (PAUSE_MS > 0 ? page.waitForTimeout(PAUSE_MS) : Promise.resolve());

test.describe("@t345 Learnings W0 end to end", () => {
  test.beforeAll(() => {
    resetLearningsW0();
    // Schreibrecht für den Vault (Standard wäre „propose“: decide würde nur einen Vorschlag anlegen).
    wikiJson("agent", "setup", LEARNINGS_W0_VAULT, "--access", "write");
  });

  test("@t345 anlegen, wiederfinden, Quelle und Gültigkeit, Korrektur mit Beleg, Negativfall", async ({ page }) => {
    const before = hashes();

    await test.step("1. Lint ist sauber", () => {
      const lint = wiki("lint", LEARNINGS_W0_WIKI_DIR);
      expect(lint.status, lint.stdout + lint.stderr).toBe(0);
      expect(lint.stdout).toContain("0 Befunde");
    });

    await test.step("2. agent search wie in der Status-Tabelle", () => {
      const standard = search("Bun");
      const byPath = Object.fromEntries(standard.map((hit) => [hit.pfad, hit.status]));
      expect(byPath["Learnings/gueltig.md"]).toBe("bestätigt");
      expect(byPath["Learnings/neu.md"]).toBe("neu");
      expect(byPath, "ersetzt: nicht in der Standardsuche").not.toHaveProperty(["Learnings/korrigiert.md"]);

      const confirmed = search("", "--status", "bestätigt");
      expect(confirmed.map((hit) => hit.pfad)).toEqual(["Learnings/gueltig.md"]);

      const placeholder = search("Platzhalter");
      expect(placeholder.find((hit) => hit.pfad === "Learnings/unbelegt.md")?.status).toBe("unbestätigt");
    });

    await test.step("3. /wiki zeigt Status und Quelle", async () => {
      await page.goto("/wiki");
      // Der Dev-Server kompiliert beim ersten Aufruf; die Seite lädt das Bundle erst nach der Hydration.
      await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 60_000 });
      await openPage(page, GUELTIG_TITLE);
      const article = page.locator("article");
      await expect(article).toContainText("gueltig.md");
      await expect(article.getByText("verified", { exact: true })).toBeVisible();
      await expect(article.getByText("draft", { exact: true })).toHaveCount(0);
      await expect(article).toContainText("Entscheid: bestätigt");
      await expect(article).toContainText("Quelle: Commit `1da7950`, Repo `bloommd-cluster` (Forgejo)");
      await expect(article).toContainText("Commit `1da7950` im Repo `bloommd-cluster` (Forgejo), 2026-10-26");
      await pause(page);

      await openPage(page, NEU_TITLE);
      await expect(article.getByText("draft", { exact: true })).toBeVisible();
      await expect(article.getByText("verified", { exact: true })).toHaveCount(0);
      await expect(article).toContainText("https://github.com/moellenbeck-digital/BloomMD/pull/306");
      await expect(article).not.toContainText("Entscheidung");
      await pause(page);
    });

    await test.step("4. agent decide bestätigt neu.md", async () => {
      const decided = wikiJson<{ ok: boolean; modus: string; vorher: string; status: string; verified: { by: string } }>(
        "agent", "decide", "Learnings/neu.md",
        "--entscheid", "bestaetigt",
        "--grund", "Gegen PR 306 im Repo BloomMD geprüft: BloomMD läuft seit dem 06.11.2026 auf Bun 1.4.4",
        "--quelle", "https://github.com/moellenbeck-digital/BloomMD/pull/306",
        "--name", "E2E t345",
        "--vault", LEARNINGS_W0_VAULT,
      );
      expect(decided).toMatchObject({ ok: true, modus: "geschrieben", vorher: "neu", status: "bestätigt" });

      const markdown = readFileSync(path.join(LEARNINGS_W0_WIKI_DIR, "neu.md"), "utf8");
      const frontmatter = markdown.split(/^---$/m)[1] ?? "";
      expect(frontmatter).toMatch(/^status: "?bestätigt"?$/m);
      expect(frontmatter).toMatch(/^verified:\n\s+- by: "?E2E t345"?\n\s+at: "?\d{4}-\d{2}-\d{2}"?$/m);
      expect(frontmatter).not.toMatch(/^status: "?neu"?$/m);
      expect(markdown).toMatch(/^## Entscheidung\b/m);
      expect(markdown).toContain("- Entscheid: bestätigt");
      expect(markdown).toContain("- Quelle: https://github.com/moellenbeck-digital/BloomMD/pull/306");
      expect(markdown).toContain("- Wer: E2E t345");

      // Neuladen: die Seite liest die geänderte Datei über die echte API.
      await page.reload();
      await expect(page.getByTestId("wiki-search")).toBeVisible();
      await openPage(page, NEU_TITLE);
      const article = page.locator("article");
      await expect(article.getByText("verified", { exact: true })).toBeVisible();
      await expect(article.getByText("draft", { exact: true })).toHaveCount(0);
      await expect(article).toContainText("Entscheid: bestätigt");
      await expect(article).toContainText("Wer: E2E t345");

      const api = await page.request.get("/api/wiki");
      expect(api.ok()).toBe(true);
      const body = (await api.json()) as { pages: Array<{ path: string; lifecycle: string; trustTier: string; verified: Array<{ by: string }> }> };
      const neu = body.pages.find((entry) => entry.path === "neu.md");
      expect(neu).toMatchObject({ lifecycle: "stable", trustTier: "verified" });
      expect(neu?.verified.map((entry) => entry.by)).toEqual(["E2E t345"]);
      await pause(page);

      // Nach dem Entscheid zählt neu.md in der Bestätigt-Suche.
      expect(search("", "--status", "bestätigt").map((hit) => hit.pfad).sort()).toEqual(["Learnings/gueltig.md", "Learnings/neu.md"]);
    });

    await test.step("5. korrigiert.md: nicht in der Standardsuche, mit --include-stale samt replaced_by", async () => {
      expect(search("Bun").map((hit) => hit.pfad)).not.toContain("Learnings/korrigiert.md");
      expect(search("", "--status", "bestätigt").map((hit) => hit.pfad)).not.toContain("Learnings/korrigiert.md");

      const stale = search("Bun", "--include-stale");
      expect(stale.find((hit) => hit.pfad === "Learnings/korrigiert.md")?.status).toBe("ersetzt");

      // Die Trefferliste nennt replaced_by nicht; `agent read` liefert es.
      const read = wikiJson<{ frontmatter: { status: string; replaced_by?: string }; inhalt: string }>("agent", "read", "Learnings/korrigiert.md", "--vault", LEARNINGS_W0_VAULT);
      expect(read.frontmatter).toMatchObject({ status: "ersetzt", replaced_by: "gueltig.md" });
      expect(read.inhalt).toContain("Widerspruch: Das Lockfile von `md-agents` scheiterte auf Bun 1.3.14");

      await openPage(page, KORRIGIERT_TITLE);
      const article = page.locator("article");
      await expect(article.getByText("deprecated", { exact: true })).toBeVisible();
      await expect(article).toContainText("Nachfolger: [gueltig.md](./gueltig.md)");
      await pause(page);
    });

    await test.step("6. Negativfall unbelegt.md: unbestätigt, Beleg fehlt, Bestätigen wird verweigert", async () => {
      await openPage(page, UNBELEGT_TITLE);
      const article = page.locator("article");
      await expect(article.getByText("draft", { exact: true })).toBeVisible();
      await expect(article.getByText("unattributed", { exact: true })).toBeVisible();
      await expect(article).toContainText("Fehlt: ein Vorfall, Ticket, Commit oder CI-Lauf");
      await expect(article).toContainText("Fall: unbestätigt");
      await pause(page);

      const hit = search("Platzhalter").find((entry) => entry.pfad === "Learnings/unbelegt.md");
      expect(hit?.status).toBe("unbestätigt");
      expect(search("", "--status", "bestätigt").map((entry) => entry.pfad)).not.toContain("Learnings/unbelegt.md");

      const read = wikiJson<{ frontmatter: { status: string; verified?: unknown[] } }>("agent", "read", "Learnings/unbelegt.md", "--vault", LEARNINGS_W0_VAULT);
      expect(read.frontmatter.status).toBe("unbestätigt");
      expect(read.frontmatter.verified ?? []).toHaveLength(0);

      const refused = wiki("agent", "decide", "Learnings/unbelegt.md", "--entscheid", "bestaetigt", "--grund", "ohne Beleg", "--quelle", "keine", "--name", "E2E t345", "--vault", LEARNINGS_W0_VAULT);
      expect(refused.status).toBe(2);
      expect(refused.stdout + refused.stderr).toContain("Eine Ableitung ohne Vorfall bleibt unbestätigt");
    });

    await test.step("7. Byte-Vergleich: vergleich.md und alle nicht entschiedenen Dateien unverändert", () => {
      const after = hashes();
      expect(after["vergleich.md"]).toBe(before["vergleich.md"]);
      expect(Object.keys(after)).toEqual(Object.keys(before));
      const changed = Object.keys(after).filter((name) => after[name] !== before[name]);
      expect(changed, "nur neu.md wurde entschieden").toEqual(["neu.md"]);
    });
  });
});
