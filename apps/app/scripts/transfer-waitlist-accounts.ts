import { readFileSync } from "node:fs";
import { isEmailConfigured } from "../src/lib/email";
import { checkWaitlistTransferBalance, parseWaitlistExportCsv, runWaitlistTransfer } from "../src/lib/waitlist-transfer";

/**
 * Prepares accounts for the confirmed addresses of the ended waitlist and sends each person one
 * activation mail (#105). Input is the CSV of `bun run --cwd apps/marketing waitlist export`.
 *
 *   bun run db:transfer-waitlist waitlist.csv                          dry run (default): counts, writes and sends nothing
 *   bun run db:transfer-waitlist waitlist.csv --apply --expected 123   creates accounts and sends the mails
 *   ... --limit 30                                                     at most 30 mails in this run (leaves mail budget for sign-ups)
 *
 * `--expected` is the M of the export's closing line "N Einträge, davon bestätigt M". With
 * `--apply` it is required (unless the file itself ends with that line), and the run refuses to
 * start when it differs from the rows read. The output is one line of numbers; no address is
 * printed. The exit code is 1 when the numbers do not add up, a mail failed or the run stopped
 * early (run it again; finished addresses are skipped).
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const USAGE = "Usage: transfer-waitlist-accounts.ts <waitlist.csv> [--apply] [--expected <M>] [--limit <n>]";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
let file: string | null = null;
let expected: number | null = null;
let limit: number | undefined;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]!;
  if (arg === "--apply") continue;
  if (arg === "--dry-run") {
    if (apply) throw new Error("--apply and --dry-run exclude each other.");
    continue;
  }
  if (arg === "--expected" || arg === "--limit") {
    const value = Number(args[index + 1]);
    if (!Number.isSafeInteger(value) || value < (arg === "--limit" ? 1 : 0)) throw new Error(`${arg} needs a number.\n${USAGE}`);
    if (arg === "--expected") expected = value;
    else limit = value;
    index += 1;
    continue;
  }
  if (arg.startsWith("--") || file) throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  file = arg;
}
if (!file) throw new Error(USAGE);

const parsed = parseWaitlistExportCsv(readFileSync(file, "utf8"));
const expectedConfirmed = expected ?? parsed.trailer?.confirmed ?? null;
if (expected != null && parsed.trailer && parsed.trailer.confirmed !== expected) {
  throw new Error("--expected differs from the summary line in the file.");
}
if (expectedConfirmed != null && expectedConfirmed !== parsed.confirmed.length) {
  throw new Error(`The CSV has ${parsed.confirmed.length} confirmed rows, the export said ${expectedConfirmed}. Nothing was done; export again.`);
}
if (apply && expectedConfirmed == null) {
  throw new Error("--apply needs --expected <M> from the closing line of the export (\"N Einträge, davon bestätigt M\").");
}
if (apply && !isEmailConfigured()) {
  throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL are missing: nothing is sent and nothing is created.");
}

const result = await runWaitlistTransfer(parsed.confirmed, { apply, rows: parsed.rows, limit });
const balance = checkWaitlistTransferBalance(result, expectedConfirmed);
console.log(JSON.stringify({ ...result, expectedConfirmed, ...balance }));

// The postgres client of the app keeps the process alive; the run is over.
const finished = balance.balanced && balance.matchesExport !== false && result.mailFailed === 0 && result.deferred === 0;
process.exit(finished ? 0 : 1);
