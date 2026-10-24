/**
 * Waitlist operations for an invitation wave.
 *
 * Deliberately not part of the `bloommd` CLI. That tool reads a folder of Markdown, needs nothing
 * and changes nothing — adding a database dependency would blur what it is. This lives in the
 * marketing app, where only `BLOOMMD_WAITLIST_DATABASE_URL` is expected.
 *
 *   bun run --cwd apps/marketing waitlist count
 *   bun run --cwd apps/marketing waitlist list
 *   bun run --cwd apps/marketing waitlist allowlist [anzahl]
 *   bun run --cwd apps/marketing waitlist cleanup [--apply]
 */

import { cleanupWaitlistRetention, countWaitlist, listConfirmedWaitlist, waitlistRetentionPolicy } from "../src/lib/waitlist-db";

const USAGE = `waitlist — Warteliste für Einladungswellen

  count                         Wie viele bestätigt und wie viele offen sind
  list                          Bestätigte Adressen mit Datum und Quelle
  allowlist [anzahl]            Die ersten N bestätigten Adressen im Format von
                                BLOOMMD_BETA_ALLOWED_EMAILS (Standard: alle)
  cleanup [optionen]            Alte unbestätigte/abgemeldete Einträge zählen
                                (Dry-Run; löscht nur mit --apply)

Cleanup-Optionen:
  --apply                       Einträge wirklich löschen
  --pending-days <tage>         Unbestätigte Einträge älter als N Tage
  --unsubscribed-days <tage>    Abgemeldete Einträge älter als N Tage

Nur bestätigte, nicht abgemeldete Adressen werden ausgegeben. Eine unbestätigte Adresse ist ein
Tippfehler, ein Bot oder die Adresse einer fremden Person — sie gehört in keine Einladung.`;

const [command = "count", ...args] = process.argv.slice(2);

if (command === "--help" || command === "-h") {
  console.log(USAGE);
  process.exit(0);
}

if (!process.env.BLOOMMD_WAITLIST_DATABASE_URL) {
  console.error("BLOOMMD_WAITLIST_DATABASE_URL fehlt.");
  process.exit(2);
}

function readPositiveInteger(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    console.error(`Ungültiger Wert für ${label}: ${value ?? ""}`);
    process.exit(2);
  }
  return parsed;
}

function parseCleanupArgs(values: string[]) {
  const options: { dryRun: boolean; pendingDays?: number; unsubscribedDays?: number } = { dryRun: true };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    switch (value) {
      case "--apply":
        options.dryRun = false;
        break;
      case "--pending-days":
        options.pendingDays = readPositiveInteger(values[index + 1], "--pending-days");
        index += 1;
        break;
      case "--unsubscribed-days":
        options.unsubscribedDays = readPositiveInteger(values[index + 1], "--unsubscribed-days");
        index += 1;
        break;
      default:
        console.error(`Unbekannte Cleanup-Option: ${value}`);
        process.exit(2);
    }
  }
  return options;
}

switch (command) {
  case "count": {
    const counts = await countWaitlist();
    console.log(`bestätigt: ${counts.confirmed}`);
    console.log(`offen:     ${counts.pending}`);
    break;
  }

  case "list": {
    const entries = await listConfirmedWaitlist();
    for (const entry of entries) {
      console.log(`${entry.confirmedAt.slice(0, 10)}  ${entry.email}${entry.source ? `  (${entry.source})` : ""}`);
    }
    console.log("");
    console.log(`${entries.length} ${entries.length === 1 ? "Adresse" : "Adressen"}`);
    break;
  }

  case "allowlist": {
    const entries = await listConfirmedWaitlist();
    const [rawLimit] = args;
    const limit = rawLimit ? Number(rawLimit) : entries.length;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      console.error(`Ungültige Anzahl: ${rawLimit}`);
      process.exit(2);
    }

    const selected = entries.slice(0, limit);
    if (selected.length === 0) {
      console.error("Keine bestätigten Adressen vorhanden.");
      process.exit(1);
    }

    // Oldest first: whoever waited longest is invited first. `listConfirmedWaitlist` already
    // orders by confirmation time, so slicing preserves that.
    console.log(`BLOOMMD_BETA_ALLOWED_EMAILS=${selected.map((entry) => entry.email).join(",")}`);
    console.error(`\n${selected.length} von ${entries.length} bestätigten Adressen.`);
    break;
  }

  case "cleanup": {
    const policy = waitlistRetentionPolicy();
    const result = await cleanupWaitlistRetention(parseCleanupArgs(args));
    console.log(`Modus:          ${result.dryRun ? "Dry-Run" : "Apply"}`);
    console.log(`Unbestätigt:   ${result.pending} älter als ${result.pendingDays} Tage`);
    console.log(`Abgemeldet:    ${result.unsubscribed} älter als ${result.unsubscribedDays} Tage`);
    console.log(`Gesamt:        ${result.total}`);
    if (result.dryRun) {
      console.log("");
      console.log("Nichts gelöscht. Zum Anwenden denselben Befehl mit --apply ausführen.");
    }
    if (result.pendingDays !== policy.pendingDays || result.unsubscribedDays !== policy.unsubscribedDays) {
      console.error(
        `\nPolicy überschrieben: Standard ist pending=${policy.pendingDays} Tage, unsubscribed=${policy.unsubscribedDays} Tage.`,
      );
    }
    break;
  }

  default:
    console.error(`Unbekannter Befehl: ${command}\n`);
    console.error(USAGE);
    process.exit(2);
}
