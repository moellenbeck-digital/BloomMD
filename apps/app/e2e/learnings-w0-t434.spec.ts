/**
 * Ticket #434 — `agent search --include-stale` nennt `replaced_by` im Treffer eines ersetzten Learnings. Alle Fälle tragen @t434.
 *
 * Nur CLI, keine Oberfläche: Fixture-Vault frisch kopieren (wie @t345), `bloommd-wiki agent search` aufrufen, die JSON-Ausgabe prüfen.
 */
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { LEARNINGS_W0_VAULT, resetLearningsW0, WIKI_CLI } from "./learnings-w0-paths";

interface Treffer {
  pfad: string;
  status: string | null;
  replaced_by?: string;
}

function search(...flags: string[]): Treffer[] {
  const result = spawnSync("bun", [WIKI_CLI, "agent", "search", "Bun", "--limit", "20", ...flags, "--vault", LEARNINGS_W0_VAULT], { encoding: "utf8", env: process.env, timeout: 60_000 });
  if (result.error) throw result.error;
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return (JSON.parse(result.stdout) as { treffer: Treffer[] }).treffer;
}

test.describe("@t434 agent search: replaced_by im Treffer", () => {
  test.beforeAll(() => resetLearningsW0());

  test("@t434 mit --include-stale nennt der Treffer des ersetzten Learnings replaced_by, andere Treffer haben das Feld nicht", () => {
    const treffer = search("--include-stale");
    const korrigiert = treffer.find((hit) => hit.pfad === "Learnings/korrigiert.md");
    expect(korrigiert).toMatchObject({ status: "ersetzt", replaced_by: "gueltig.md" });
    const others = treffer.filter((hit) => hit.pfad !== "Learnings/korrigiert.md");
    expect(others.length).toBeGreaterThan(0);
    for (const hit of others) expect("replaced_by" in hit).toBe(false);
  });

  test("@t434 ohne --include-stale fehlt das ersetzte Learning weiterhin", () => {
    expect(search().map((hit) => hit.pfad)).not.toContain("Learnings/korrigiert.md");
  });
});
