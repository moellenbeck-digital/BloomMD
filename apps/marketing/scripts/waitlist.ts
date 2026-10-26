/**
 * Waitlist wind-down operations.
 *
 * The public waitlist is closed (registration replaces it). What remains is the data: it is
 * exported, every confirmed address gets one invitation mail, and everything is deleted after the
 * retention period. Run by a human, against the real database, on purpose.
 *
 * Deliberately not part of the `bloommd` CLI. That tool reads a folder of Markdown, needs nothing
 * and changes nothing — adding a database dependency would blur what it is. This lives in the
 * marketing app, where only `BLOOMMD_WAITLIST_DATABASE_URL` is expected.
 *
 *   bun run --cwd apps/marketing waitlist count
 *   bun run --cwd apps/marketing waitlist export [--out datei.csv]
 *   bun run --cwd apps/marketing waitlist invite [--apply]
 *   bun run --cwd apps/marketing waitlist purge [--apply]
 *   bun run --cwd apps/marketing waitlist list
 *   bun run --cwd apps/marketing waitlist allowlist [anzahl]
 *   bun run --cwd apps/marketing waitlist cleanup [--apply]
 */

import { writeFileSync } from "node:fs";
import { isEmailConfigured } from "../src/lib/email";
import { formatWaitlistExportSummary, summarizeWaitlistExport, waitlistEntriesToExportCsv } from "../src/lib/waitlist-export";
import { runWaitlistInvitation } from "../src/lib/waitlist-invite";
import {
  WAITLIST_PURGE_RETENTION_DAYS,
  WaitlistPurgeRefusedError,
  cleanupWaitlistRetention,
  countWaitlistAdmin,
  evaluateWaitlistPurge,
  listConfirmedWaitlist,
  listWaitlistAdminEntries,
  purgeWaitlist,
  waitlistPurgeStatus,
  waitlistRetentionPolicy,
} from "../src/lib/waitlist-db";

const USAGE = `waitlist — Warteliste abwickeln (Registrierung ersetzt sie)

  count                         Einträge nach Status: bestätigt, offen, abgemeldet, gesamt
  export [--out <datei>]        Alle Einträge als CSV (email, status, zeitpunkt, quelle).
                                Ohne --out auf stdout (Zusammenfassung dann auf stderr),
                                mit --out in die Datei (nur für den Besitzer lesbar,
                                überschreibt nichts). Letzte Zeile: "N Einträge, davon bestätigt M".
  invite [--apply]              Einmalige Einladungsmail an bestätigte, nicht abgemeldete
                                Adressen, die noch keine bekommen haben. Standard ist Dry-Run
                                (listet nur); gesendet wird nur mit --apply. Jede Adresse
                                höchstens einmal.
  purge [--apply]               ALLE Einträge löschen. Dry-Run zeigt, ob es erlaubt wäre;
                                --apply wird verweigert, solange jemand noch nicht eingeladen
                                wurde oder die Frist von ${WAITLIST_PURGE_RETENTION_DAYS} Tagen nach der
                                letzten Einladungsmail läuft.
  list                          Bestätigte Adressen mit Datum und Quelle
  allowlist [anzahl]            Die ersten N bestätigten Adressen im Format von
                                BLOOMMD_BETA_ALLOWED_EMAILS (Standard: alle)
  cleanup [optionen]            Alte unbestätigte/abgemeldete Einträge zählen
                                (Dry-Run; löscht nur mit --apply)

Cleanup-Optionen:
  --apply                       Einträge wirklich löschen
  --pending-days <tage>         Unbestätigte Einträge älter als N Tage
  --unsubscribed-days <tage>    Abgemeldete Einträge älter als N Tage

invite und purge verändern echte Daten bzw. schreiben echte Personen an: nur bewusst und nur mit
--apply gegen die Produktionsdatenbank ausführen.`;

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

function parseApplyOnly(values: string[], name: string) {
  let apply = false;
  for (const value of values) {
    if (value === "--apply") apply = true;
    else {
      console.error(`Unbekannte ${name}-Option: ${value}`);
      process.exit(2);
    }
  }
  return apply;
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

function parseExportArgs(values: string[]) {
  let out: string | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--out") {
      out = values[index + 1] ?? "";
      if (!out) {
        console.error("--out braucht einen Dateinamen.");
        process.exit(2);
      }
      index += 1;
    } else {
      console.error(`Unbekannte Export-Option: ${value}`);
      process.exit(2);
    }
  }
  return { out };
}

async function runExport(values: string[]) {
  const { out } = parseExportArgs(values);
  const entries = await listWaitlistAdminEntries();
  const summary = summarizeWaitlistExport(entries);

  // The closing line must equal `count` and the database. A concurrent unsubscribe between the two
  // reads would make it a lie, so compare before writing anything.
  const counts = await countWaitlistAdmin();
  if (counts.total !== summary.total || counts.confirmed !== summary.confirmed) {
    console.error(
      `Export weicht von der Datenbank ab (Export: ${summary.total}/${summary.confirmed}, Datenbank: ${counts.total}/${counts.confirmed}). Bitte erneut ausführen.`,
    );
    process.exit(1);
  }

  const csv = waitlistEntriesToExportCsv(entries);
  const line = formatWaitlistExportSummary(summary);
  if (out) {
    try {
      writeFileSync(out, csv, { flag: "wx", mode: 0o600 });
    } catch (error) {
      console.error(`Datei nicht geschrieben (${error instanceof Error ? error.message : "unbekannt"}). Existiert sie schon?`);
      process.exit(1);
    }
    console.log(`Geschrieben: ${out}`);
    console.log(line);
  } else {
    process.stdout.write(csv);
    console.error(line);
  }
}

async function runInvite(values: string[]) {
  const apply = parseApplyOnly(values, "Invite");
  if (apply && !isEmailConfigured()) {
    console.error("RESEND_API_KEY und RESEND_FROM_EMAIL fehlen — es wird nichts gesendet und nichts markiert.");
    process.exit(2);
  }

  const result = await runWaitlistInvitation({ apply });
  console.log(`Modus:     ${apply ? "Apply" : "Dry-Run"}`);
  if (!apply) {
    for (const email of result.candidates) console.log(email);
    console.log("");
    console.log(`${result.candidates.length} Adressen würden eingeladen. Nichts gesendet. Zum Senden denselben Befehl mit --apply ausführen.`);
    return;
  }
  console.log(`Gesendet:  ${result.sent.length}`);
  if (result.skipped.length > 0) console.log(`Übersprungen (schon eingeladen): ${result.skipped.length}`);
  if (result.failed.length > 0) {
    console.log(`Fehlgeschlagen: ${result.failed.length} (nicht markiert; ein weiterer Lauf versucht sie erneut)`);
    for (const email of result.failed) console.log(`  ${email}`);
    process.exitCode = 1;
  }
}

async function runPurge(values: string[]) {
  const apply = parseApplyOnly(values, "Purge");
  const status = await waitlistPurgeStatus();
  const verdict = evaluateWaitlistPurge(status);

  console.log(`Modus:               ${apply ? "Apply" : "Dry-Run"}`);
  console.log(`Einträge gesamt:     ${status.total}`);
  console.log(`Noch nicht eingeladen: ${status.notInvited}`);
  console.log(`Letzte Einladung:    ${status.lastInvitedAt ?? "—"}`);
  console.log(`Aufbewahrung:        ${WAITLIST_PURGE_RETENTION_DAYS} Tage nach der letzten Einladungsmail`);

  if (!verdict.allowed) {
    const why = {
      "invitation-pending": `${status.notInvited} bestätigte Adressen haben noch keine Einladung bekommen.`,
      "no-invitation-sent": "Es wurde noch keine Einladung gesendet.",
      "retention-running": `Die Frist läuft noch bis ${verdict.allowedFrom}.`,
    }[verdict.reason];
    console.log("");
    console.log(`Löschen ${apply ? "verweigert" : "wäre derzeit nicht erlaubt"}: ${why}`);
    if (apply) process.exit(1);
    return;
  }

  if (!apply) {
    console.log("");
    console.log(`Nichts gelöscht. ${status.total} Einträge wären löschbar; zum Anwenden denselben Befehl mit --apply ausführen.`);
    return;
  }

  try {
    const deleted = await purgeWaitlist();
    console.log("");
    console.log(`${deleted} Einträge gelöscht.`);
  } catch (error) {
    if (error instanceof WaitlistPurgeRefusedError) {
      console.error(`Löschen verweigert: ${error.verdict.reason}`);
      process.exit(1);
    }
    throw error;
  }
}

switch (command) {
  case "count": {
    const counts = await countWaitlistAdmin();
    console.log(`bestätigt:  ${counts.confirmed}`);
    console.log(`offen:      ${counts.pending}`);
    console.log(`abgemeldet: ${counts.unsubscribed}`);
    console.log(`gesamt:     ${counts.total}`);
    break;
  }

  case "export":
    await runExport(args);
    break;

  case "invite":
    await runInvite(args);
    break;

  case "purge":
    await runPurge(args);
    break;

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
    if (args[0] === "purge") {
      await runPurge(args.slice(1));
      break;
    }
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
