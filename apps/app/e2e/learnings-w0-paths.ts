import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ticket #345 — gemeinsame Pfade für Spec und Configs des E2E-Laufs „Learnings W0“.
 *
 * Vault-Wurzel (Ziel von `bloommd-wiki agent … --vault`) und Wiki-Ordner (`BLOOMMD_WIKI_DIR` der App) sind dieselben
 * Dateien: der Ordner `Learnings/` im Vault. Die Fixture wird vor jedem Lauf frisch dorthin kopiert (Reset).
 */
const here = path.dirname(fileURLToPath(import.meta.url));

export const LEARNINGS_W0_FIXTURE = path.join(here, "fixtures", "learnings-w0");
export const LEARNINGS_W0_VAULT = process.env.BLOOMMD_LEARNINGS_W0_DIR ?? path.join(tmpdir(), "bloommd-e2e-learnings-w0");
export const LEARNINGS_W0_WIKI_DIR = path.join(LEARNINGS_W0_VAULT, "Learnings");
export const WIKI_CLI = path.resolve(here, "../../../packages/wiki-cli/src/cli.ts");

/** Reset: Temp-Verzeichnis löschen und aus der Fixture neu anlegen. */
export function resetLearningsW0(): void {
  rmSync(LEARNINGS_W0_VAULT, { recursive: true, force: true });
  mkdirSync(LEARNINGS_W0_VAULT, { recursive: true });
  cpSync(LEARNINGS_W0_FIXTURE, LEARNINGS_W0_VAULT, { recursive: true });
}
