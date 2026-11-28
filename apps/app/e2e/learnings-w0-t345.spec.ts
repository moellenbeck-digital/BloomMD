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
 *  6. Negativfall `unbelegt.md`: `unbestätigt`, fehlender Beleg sichtbar, Bestätigen wird verweigert (Exitcode 2).
 *  7. Byte-Vergleich: `vergleich.md` (und alle nicht entschiedenen Dateien) vorher und nachher identisch.
 *
 * Video (`LEARNINGS_W0_PAUSE_MS` > 0, siehe `playwright.learnings-w0.video.config.ts`): Der Dev-Server wird vor dem Test
 * aufgewärmt, damit kein Ladebildschirm im Bild steht. Die Abschnitte der Wiki-Seite werden markiert und ins Bild geholt,
 * die CLI-Schritte erscheinen als Terminal-Ansicht (`page.setContent`, `learnings-w0-video.ts`) mit Kommando und gekürzter
 * Ausgabe, SHA und Fixture sind eingeblendet. Die Asserts laufen auf den echten, ungekürzten Ausgaben; die Ansicht ist nur Darstellung.
 * Ohne Video (Pause 0) laufen dieselben Schritte ohne Wartezeiten.
 *
 * Nicht geprüft: das Videoformat (macht die Video-Config) und Cloud-Ziele (`--cloud`); getestet wird der Vault-Weg.
 */
import { chromium, expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { LEARNINGS_W0_VAULT, LEARNINGS_W0_WIKI_DIR, resetLearningsW0, WIKI_CLI } from "./learnings-w0-paths";
import { gitSha, hideTerminal, highlightText, installOverlay, showTerminal, terminalHtml, type ShownCommand } from "./learnings-w0-video";

const PAUSE_MS = Number(process.env.LEARNINGS_W0_PAUSE_MS ?? 0);
const SHORT_MS = Math.round(PAUSE_MS * 0.4);
const NEU_TITLE = "Bun-Version des Repos im Lockfile-Check der CI festhalten";
const GUELTIG_TITLE = "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer";
const UNBELEGT_TITLE = "Auch andere Vault-Items könnten Platzhalter enthalten";
const KORRIGIERT_TITLE = "Eine Bun-Version reicht für alle Repos";
const BANNER = { sha: gitSha(), fixture: "e2e/fixtures/learnings-w0" };

interface Treffer {
  pfad: string;
  titel: string;
  status: string | null;
  replaced_by?: string;
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
  /** Kommando in der Schreibweise des Aufrufs, für die Terminal-Ansicht. */
  cmd: string;
}

function wiki(...args: string[]): Run {
  const result = spawnSync("bun", [WIKI_CLI, ...args], { encoding: "utf8", env: process.env, timeout: 60_000 });
  if (result.error) throw result.error;
  const quote = (arg: string) => (arg === LEARNINGS_W0_VAULT ? "<vault>" : arg === "" || /[\s"']/.test(arg) ? `"${arg}"` : arg);
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr, cmd: ["bloommd-wiki", ...args.map(quote)].join(" ") };
}

function wikiJson<T>(...args: string[]): T {
  const result = wiki(...args);
  expect(result.status, `bloommd-wiki ${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as T;
}

/** Suche; liefert Treffer und das Kommando für die Terminal-Ansicht. */
function searchShown(text: string, ...flags: string[]): { treffer: Treffer[]; shown: ShownCommand } {
  const run = wiki("agent", "search", text, "--limit", "20", ...flags, "--vault", LEARNINGS_W0_VAULT);
  expect(run.status, run.stdout + run.stderr).toBe(0);
  const treffer = (JSON.parse(run.stdout) as { treffer: Treffer[] }).treffer;
  const lines = treffer.map((hit) => `${(hit.status ?? "-").padEnd(12)} ${hit.pfad}`);
  return { treffer, shown: { cmd: run.cmd, out: `${lines.join("\n") || "(keine Treffer)"}\n# Ausgabe gekürzt: Status und Pfad je Treffer` } };
}

const search = (text: string, ...flags: string[]) => searchShown(text, ...flags).treffer;

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

function hashes(): Record<string, string> {
  return Object.fromEntries(readdirSync(LEARNINGS_W0_WIKI_DIR).sort().map((name) => [name, sha256(path.join(LEARNINGS_W0_WIKI_DIR, name))]));
}

async function openPage(page: Page, title: string) {
  await page.getByRole("button", { name: title }).first().click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** Öffnet /wiki; der Server ist aufgewärmt, die Seite lädt in Sekunden. */
async function openWiki(page: Page) {
  await page.goto("/wiki");
  await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 60_000 });
}

const dwell = (page: Page, ms: number = PAUSE_MS) => (ms > 0 ? page.waitForTimeout(ms) : Promise.resolve());

test.describe("@t345 Learnings W0 end to end", () => {
  test.beforeAll(async ({}, testInfo) => {
    test.setTimeout(300_000);
    resetLearningsW0();
    // Schreibrecht für den Vault (Standard wäre „propose“: decide würde nur einen Vorschlag anlegen).
    wikiJson("agent", "setup", LEARNINGS_W0_VAULT, "--access", "write");
    // Aufwärmen: Der Dev-Server kompiliert Seite, API und Client-Bundle beim ersten Aufruf (bis zu einer Minute).
    // Das passiert hier in einem eigenen Browser, vor dem Test und damit vor der Aufnahme.
    const base = String(testInfo.project.use.baseURL);
    const browser = await chromium.launch();
    try {
      const warm = await browser.newPage({ baseURL: base });
      for (let round = 0; round < 2; round += 1) {
        await warm.goto("/wiki");
        await expect(warm.getByTestId("wiki-search")).toBeVisible({ timeout: 150_000 });
        await warm.getByRole("button", { name: GUELTIG_TITLE }).first().click();
        await expect(warm.getByRole("heading", { name: GUELTIG_TITLE })).toBeVisible();
      }
    } finally {
      await browser.close();
    }
  });

  test("@t345 anlegen, wiederfinden, Quelle und Gültigkeit, Korrektur mit Beleg, Negativfall", async ({ page }) => {
    const before = hashes();
    if (PAUSE_MS > 0) {
      // Die Einstiegsansicht steht schon beim Laden von /wiki im Bild; der Ladebildschirm der Seite bleibt darunter.
      await installOverlay(
        page,
        BANNER,
        terminalHtml("Learnings W0: E2E-Abnahme", [
          {
            cmd: "bun run --cwd apps/app test:e2e:learnings-w0:video",
            out: [
              "1  Lint sauber, Suche wie in der Status-Tabelle",
              "2  /wiki: gültiges Learning mit Beleg und Entscheidung",
              "3  agent decide: neu → bestätigt, /wiki nach Neuladen",
              "4  Korrektur: ersetzt, nur mit --include-stale, replaced_by",
              "5  Negativfall: unbelegt, Bestätigen wird verweigert (Exit 2)",
              "6  Byte-Vergleich vergleich.md",
            ].join("\n"),
          },
        ]),
      );
    }
    await openWiki(page);
    await dwell(page, PAUSE_MS > 0 ? 1500 : 0);

    const lint = wiki("lint", LEARNINGS_W0_WIKI_DIR);
    await test.step("1. Lint ist sauber", () => {
      expect(lint.status, lint.stdout + lint.stderr).toBe(0);
      expect(lint.stdout).toContain("0 Befunde");
    });

    await test.step("2. agent search wie in der Status-Tabelle", async () => {
      const standard = searchShown("Bun");
      const byPath = Object.fromEntries(standard.treffer.map((hit) => [hit.pfad, hit.status]));
      expect(byPath["Learnings/gueltig.md"]).toBe("bestätigt");
      expect(byPath["Learnings/neu.md"]).toBe("neu");
      expect(byPath, "ersetzt: nicht in der Standardsuche").not.toHaveProperty(["Learnings/korrigiert.md"]);

      const confirmed = searchShown("", "--status", "bestätigt");
      expect(confirmed.treffer.map((hit) => hit.pfad)).toEqual(["Learnings/gueltig.md"]);

      const placeholder = searchShown("Platzhalter");
      expect(placeholder.treffer.find((hit) => hit.pfad === "Learnings/unbelegt.md")?.status).toBe("unbestätigt");

      if (PAUSE_MS > 0) {
        await showTerminal(page, "1–2  Lint und Suche (agent search)", [
          { cmd: lint.cmd.replace(LEARNINGS_W0_WIKI_DIR, "<vault>/Learnings"), out: lint.stdout.trim() },
          standard.shown,
          confirmed.shown,
          placeholder.shown,
        ]);
        await dwell(page, 4000);
        await hideTerminal(page);
      }
    });

    await test.step("3. /wiki zeigt Status und Quelle", async () => {
      await openPage(page, GUELTIG_TITLE);
      const article = page.locator("article");
      await expect(article).toContainText("gueltig.md");
      await expect(article.getByText("verified", { exact: true })).toBeVisible();
      await expect(article.getByText("draft", { exact: true })).toHaveCount(0);
      await dwell(page, SHORT_MS);
      await expect(article).toContainText("Commit `1da7950` im Repo `bloommd-cluster` (Forgejo), 2026-10-26");
      await highlightText(page, "## Beleg", "Offen: Ticket- und CI-Link (nicht bekannt)");
      await dwell(page);
      await expect(article).toContainText("Entscheid: bestätigt");
      await expect(article).toContainText("Quelle: Commit `1da7950`, Repo `bloommd-cluster` (Forgejo)");
      await highlightText(page, "## Entscheidung", "Wer: Brand-Chief bloommd");
      await dwell(page);

      await openPage(page, NEU_TITLE);
      await expect(article.getByText("draft", { exact: true })).toBeVisible();
      await expect(article.getByText("verified", { exact: true })).toHaveCount(0);
      await expect(article).toContainText("https://github.com/moellenbeck-digital/BloomMD/pull/306");
      await expect(article).not.toContainText("Entscheidung");
      await dwell(page, SHORT_MS);
      await highlightText(page, "## Beleg", "pull/306");
      await dwell(page, SHORT_MS);
    });

    await test.step("4. agent decide bestätigt neu.md", async () => {
      const decideRun = wiki(
        "agent", "decide", "Learnings/neu.md",
        "--entscheid", "bestaetigt",
        "--grund", "Gegen PR 306 im Repo BloomMD geprüft: BloomMD läuft seit dem 06.11.2026 auf Bun 1.4.4",
        "--quelle", "https://github.com/moellenbeck-digital/BloomMD/pull/306",
        "--name", "E2E t345",
        "--vault", LEARNINGS_W0_VAULT,
      );
      expect(decideRun.status, decideRun.stdout + decideRun.stderr).toBe(0);
      const decided = JSON.parse(decideRun.stdout) as { ok: boolean; modus: string; vorher: string; status: string; verified: { by: string; at: string }; stale_after: string };
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

      if (PAUSE_MS > 0) {
        const excerpt = [
          ...frontmatter.split("\n").filter((line) => /^(status|stale_after|verified):|^\s+(- by|at):/.test(line)),
          ...(markdown.match(/^## Entscheidung[^\n]*\n[\s\S]*?(?=\n## |$)/m)?.[0].replace(/ <!--.*?-->/, "").trim().split("\n") ?? []),
        ].join("\n");
        await showTerminal(page, "3  agent decide: neu → bestätigt", [
          {
            cmd: decideRun.cmd.replace(/--grund "[^"]*"/, '--grund "Gegen PR 306 … geprüft"'),
            out: JSON.stringify({ ok: decided.ok, pfad: "Learnings/neu.md", modus: decided.modus, vorher: decided.vorher, status: decided.status, verified: decided.verified, stale_after: decided.stale_after }, null, 1) + "\n# Ausgabe gekürzt",
          },
          { cmd: "# Auszug aus <vault>/Learnings/neu.md (vom Test gelesen)", out: excerpt },
        ]);
        await dwell(page, 5000);
      }

      // Neuladen: die Seite liest die geänderte Datei über die echte API (im Video unter der Terminal-Ansicht).
      await page.reload();
      await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 60_000 });
      if (PAUSE_MS > 0) await hideTerminal(page);
      await openPage(page, NEU_TITLE);
      const article = page.locator("article");
      await expect(article.getByText("verified", { exact: true })).toBeVisible();
      await expect(article.getByText("draft", { exact: true })).toHaveCount(0);
      await dwell(page, SHORT_MS);
      await expect(article).toContainText("Entscheid: bestätigt");
      await expect(article).toContainText("Wer: E2E t345");
      await highlightText(page, "## Entscheidung", "Wer: E2E t345");

      const api = await page.request.get("/api/wiki");
      expect(api.ok()).toBe(true);
      const body = (await api.json()) as { pages: Array<{ path: string; lifecycle: string; trustTier: string; verified: Array<{ by: string }> }> };
      const neu = body.pages.find((entry) => entry.path === "neu.md");
      expect(neu).toMatchObject({ lifecycle: "stable", trustTier: "verified" });
      expect(neu?.verified.map((entry) => entry.by)).toEqual(["E2E t345"]);
      await dwell(page);

      // Nach dem Entscheid zählt neu.md in der Bestätigt-Suche.
      expect(search("", "--status", "bestätigt").map((hit) => hit.pfad).sort()).toEqual(["Learnings/gueltig.md", "Learnings/neu.md"]);
    });

    await test.step("5. korrigiert.md: nicht in der Standardsuche, mit --include-stale samt replaced_by", async () => {
      const standard = searchShown("Bun");
      expect(standard.treffer.map((hit) => hit.pfad)).not.toContain("Learnings/korrigiert.md");
      expect(search("", "--status", "bestätigt").map((hit) => hit.pfad)).not.toContain("Learnings/korrigiert.md");

      const staleSearch = searchShown("Bun", "--include-stale");
      expect(staleSearch.treffer.find((hit) => hit.pfad === "Learnings/korrigiert.md")?.status).toBe("ersetzt");

      // Seit #434 nennt die Trefferliste replaced_by; `agent read` liefert es weiterhin.
      expect(staleSearch.treffer.find((hit) => hit.pfad === "Learnings/korrigiert.md")?.replaced_by).toBe("gueltig.md");
      const readRun = wiki("agent", "read", "Learnings/korrigiert.md", "--vault", LEARNINGS_W0_VAULT);
      expect(readRun.status, readRun.stdout + readRun.stderr).toBe(0);
      const read = JSON.parse(readRun.stdout) as { frontmatter: { status: string; replaced_by?: string; stale_after?: string }; inhalt: string };
      expect(read.frontmatter).toMatchObject({ status: "ersetzt", replaced_by: "gueltig.md" });
      expect(read.inhalt).toContain("Widerspruch: Das Lockfile von `md-agents` scheiterte auf Bun 1.3.14");

      if (PAUSE_MS > 0) {
        await showTerminal(page, "4  Korrektur: Standardsuche gegen --include-stale, agent read", [
          standard.shown,
          staleSearch.shown,
          {
            cmd: readRun.cmd,
            out: `status: ${read.frontmatter.status}\nreplaced_by: ${read.frontmatter.replaced_by}\nstale_after: ${read.frontmatter.stale_after}\n# Ausgabe gekürzt: Kopfdaten`,
          },
        ]);
        await dwell(page, 5000);
        await hideTerminal(page);
      }

      await openPage(page, KORRIGIERT_TITLE);
      const article = page.locator("article");
      await expect(article.getByText("deprecated", { exact: true })).toBeVisible();
      await dwell(page, SHORT_MS);
      await expect(article).toContainText("Nachfolger: [gueltig.md](./gueltig.md)");
      await highlightText(page, "## Beleg", "Nachfolger: [gueltig.md](./gueltig.md)");
      await dwell(page);
    });

    await test.step("6. Negativfall unbelegt.md: unbestätigt, Beleg fehlt, Bestätigen wird verweigert", async () => {
      await openPage(page, UNBELEGT_TITLE);
      const article = page.locator("article");
      await expect(article.getByText("draft", { exact: true })).toBeVisible();
      await expect(article.getByText("unattributed", { exact: true })).toBeVisible();
      await expect(article).toContainText("Fall: unbestätigt");
      await dwell(page, SHORT_MS);
      await expect(article).toContainText("Fehlt: ein Vorfall, Ticket, Commit oder CI-Lauf");
      await highlightText(page, "## Beleg", "nicht die Verallgemeinerung.");
      await dwell(page);

      const hit = search("Platzhalter").find((entry) => entry.pfad === "Learnings/unbelegt.md");
      expect(hit?.status).toBe("unbestätigt");
      expect(search("", "--status", "bestätigt").map((entry) => entry.pfad)).not.toContain("Learnings/unbelegt.md");

      const read = wikiJson<{ frontmatter: { status: string; verified?: unknown[] } }>("agent", "read", "Learnings/unbelegt.md", "--vault", LEARNINGS_W0_VAULT);
      expect(read.frontmatter.status).toBe("unbestätigt");
      expect(read.frontmatter.verified ?? []).toHaveLength(0);

      const unbelegtBefore = sha256(path.join(LEARNINGS_W0_WIKI_DIR, "unbelegt.md"));
      const refused = wiki("agent", "decide", "Learnings/unbelegt.md", "--entscheid", "bestaetigt", "--grund", "ohne Beleg", "--quelle", "keine", "--name", "E2E t345", "--vault", LEARNINGS_W0_VAULT);
      expect(refused.status).toBe(2);
      expect(refused.stdout + refused.stderr).toContain("Eine Ableitung ohne Vorfall bleibt unbestätigt");
      expect(sha256(path.join(LEARNINGS_W0_WIKI_DIR, "unbelegt.md"))).toBe(unbelegtBefore);

      if (PAUSE_MS > 0) {
        const message = (JSON.parse(refused.stdout) as { fehler: string }).fehler;
        await showTerminal(page, "5  Negativfall: unbelegt.md bestätigen wird verweigert", [
          { cmd: refused.cmd, out: `${message}\n# Datei unverändert (SHA-256 vorher = nachher)`, exit: refused.status },
        ]);
        await dwell(page, 3500);
      }
    });

    await test.step("7. Byte-Vergleich: vergleich.md und alle nicht entschiedenen Dateien unverändert", async () => {
      const after = hashes();
      expect(after["vergleich.md"]).toBe(before["vergleich.md"]);
      expect(Object.keys(after)).toEqual(Object.keys(before));
      const changed = Object.keys(after).filter((name) => after[name] !== before[name]);
      expect(changed, "nur neu.md wurde entschieden").toEqual(["neu.md"]);

      if (PAUSE_MS > 0) {
        const rows = Object.keys(after).map((name) => `${name.padEnd(14)} ${before[name]!.slice(0, 12)} → ${after[name]!.slice(0, 12)}  ${after[name] === before[name] ? "byte-gleich" : "geändert (agent decide)"}`);
        await showTerminal(page, "6  Ergebnis: Byte-Vergleich (SHA-256, vorher → nachher)", [
          { cmd: "# vergleich.md bleibt byte-gleich; nur neu.md wurde entschieden", out: rows.join("\n") },
        ], "Ergebnis: Lint 0 Befunde · Suche wie Status-Tabelle · neu → bestätigt · ersetzt nur mit --include-stale · unbestätigt bleibt unbestätigt");
        await dwell(page, 3500);
      }
    });
  });
});
