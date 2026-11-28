/**
 * Ticket #433 — /wiki zählt die Quelle aus dem Frontmatter-Feld `source` als Zitat. Alle Fälle tragen @t433.
 *
 * Gleicher Aufbau wie @t345: Fixture-Vault frisch kopieren, echte Dateien unter `BLOOMMD_WIKI_DIR`, echte API, kein `page.route`.
 * Zusätzlich legt die Spec zwei Seiten im Temp-Ordner an (nicht in der gemeinsamen Fixture, damit @t345 unverändert bleibt):
 * ein Learning ohne `source` und ohne `sources` sowie eine Seite mit `sources:`-Liste.
 *
 * Geprüft wird nur die Anzeige: Bereich „Zitate (n)“, Seitenliste („· ohne Quelle“) und Knowledge Map („ohne Quelle“).
 * Nicht geprüft: Links unter „Beleg“ (werden nicht ausgewertet).
 */
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { LEARNINGS_W0_VAULT, LEARNINGS_W0_WIKI_DIR, resetLearningsW0, WIKI_CLI } from "./learnings-w0-paths";

const GUELTIG_TITLE = "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer";
const GUELTIG_SOURCE = "bloommd-cluster, Commit 1da7950, 2026-10-26";
const OHNE_TITLE = "Learning ohne Quelle für @t433";
const LISTE_TITLE = "Seite mit sources-Liste für @t433";

const OHNE_QUELLE = `---
type: learning
title: "${OHNE_TITLE}"
area: "Learnings"
status: neu
scope: "BloomMD, coder"
stale_after: 2027-02-28
tags: ["bereich/learnings", "coder"]
---

# ${OHNE_TITLE}

Dieses Learning nennt weder \`source\` noch \`sources\`.
`;

const MIT_LISTE = `---
type: Concept
title: "${LISTE_TITLE}"
status: stable
source: "wird ignoriert, weil sources: Vorrang hat"
sources:
  - id: quelle-a
    resource: docs/quelle-a.md
    title: Quelle A
    contentHash: sha256:aaaa
  - id: quelle-b
    resource: docs/quelle-b.md
---

# ${LISTE_TITLE}

Diese Seite führt ihre Quellen in der Liste \`sources:\`.
`;

function wiki(...args: string[]) {
  const result = spawnSync("bun", [WIKI_CLI, ...args], { encoding: "utf8", env: process.env, timeout: 60_000 });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

async function openWiki(page: Page) {
  await page.goto("/wiki");
  await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 90_000 });
}

/** Seitenliste: der Eintrag zum Titel (Button mit Titel und Typzeile). */
const listEntry = (page: Page, title: string) => page.locator("nav").getByRole("button", { name: title });

async function openPage(page: Page, title: string) {
  await listEntry(page, title).first().click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test.describe("@t433 /wiki: Zitate aus `source`", () => {
  test.beforeAll(() => {
    test.setTimeout(240_000);
    resetLearningsW0();
    const setup = wiki("agent", "setup", LEARNINGS_W0_VAULT, "--access", "write");
    expect(setup.status, setup.stdout + setup.stderr).toBe(0);
    writeFileSync(path.join(LEARNINGS_W0_WIKI_DIR, "t433-ohne-quelle.md"), OHNE_QUELLE, "utf8");
    writeFileSync(path.join(LEARNINGS_W0_WIKI_DIR, "t433-mit-liste.md"), MIT_LISTE, "utf8");
  });

  test("@t433 Learning mit `source`: Zitate (1), Quelle gelistet, nicht „ohne Quelle“ in Liste und Karte", async ({ page }) => {
    await openWiki(page);
    await expect(listEntry(page, GUELTIG_TITLE)).not.toContainText("ohne Quelle");
    await openPage(page, GUELTIG_TITLE);
    const citations = page.getByTestId("wiki-citations");
    await expect(citations).toContainText("Zitate (1)");
    await expect(citations).toContainText(GUELTIG_SOURCE);
    await expect(citations).not.toContainText("Diese Seite nennt keine Quelle");

    await page.getByTestId("wiki-view-map").click();
    const node = page.getByTestId("wiki-knowledge-map").locator("li").filter({ has: page.getByRole("button", { name: GUELTIG_TITLE }) });
    await expect(node).toHaveCount(1);
    await expect(node).not.toContainText("ohne Quelle");
  });

  test("@t433 Learning ohne `source` und `sources`: weiter Zitate (0) und „ohne Quelle“", async ({ page }) => {
    await openWiki(page);
    await expect(listEntry(page, OHNE_TITLE)).toContainText("ohne Quelle");
    await openPage(page, OHNE_TITLE);
    const citations = page.getByTestId("wiki-citations");
    await expect(citations).toContainText("Zitate (0)");
    await expect(citations).toContainText("Diese Seite nennt keine Quelle");

    await page.getByTestId("wiki-view-map").click();
    const node = page.getByTestId("wiki-knowledge-map").locator("li").filter({ has: page.getByRole("button", { name: OHNE_TITLE }) });
    await expect(node).toContainText("ohne Quelle");
  });

  test("@t433 Seite mit `sources:`: Anzahl und Quellen unverändert, `source` wird nicht dazugemischt", async ({ page }) => {
    await openWiki(page);
    await expect(listEntry(page, LISTE_TITLE)).not.toContainText("ohne Quelle");
    await openPage(page, LISTE_TITLE);
    const citations = page.getByTestId("wiki-citations");
    await expect(citations).toContainText("Zitate (2)");
    await expect(citations).toContainText("Quelle A");
    await expect(citations).toContainText("docs/quelle-a.md");
    await expect(citations).toContainText("docs/quelle-b.md");
    await expect(citations).not.toContainText("wird ignoriert");
  });
});
