import { isMailDeliveryAvailable } from "../src/lib/email";
import { runTrialReminders } from "../src/lib/trial-reminders";

/**
 * Sends the trial reminders (#274): 15 and 23 days after the email confirmation, each at most once.
 *
 *   bun run db:trial-reminders                  dry run (default): counts, writes and sends nothing
 *   bun run db:trial-reminders --apply          claims and sends the due reminders
 *   ... --limit 30                              at most 30 mails in this run (leaves mail budget for sign-ups)
 *   ... --jetzt 2026-12-05T10:00:00Z            runs as if it were this instant (tests: day 15, day 23)
 *
 * Run it regularly (daily is enough). A late run sends only the latest due reminder and nothing
 * after the trial ended; a failed send is repeated by the next run.
 *
 * Accounts that existed when migration 013 ran (fixed trial end 15 Dec 2026, reminders 30 Nov and
 * 8 Dec) are held back, in the dry run as `heldBackExisting`. They get their mails only with
 * BLOOMMD_TRIAL_REMINDERS_EXISTING=1, after the admin's go.
 *
 * `--jetzt` only moves the clock of this run. On a test system, mails go to the E2E outbox
 * (BLOOMMD_E2E_TEST_MODE=1 and BLOOMMD_E2E_MAIL_OUTBOX=<file>) or to delivered@resend.dev; never run it
 * with `--apply` against the production database, a claim made at a made-up time stays.
 *
 * The output is one line of numbers; no address is printed. The exit code is 1 when a mail failed or
 * the run stopped early (run it again; finished reminders are skipped).
 */
function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");

const USAGE = "Usage: trial-reminders.ts [--apply] [--limit <n>] [--jetzt <ISO time>]";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
let limit: number | undefined;
let now: Date | undefined;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]!;
  if (arg === "--apply") continue;
  if (arg === "--dry-run") {
    if (apply) fail("--apply and --dry-run exclude each other.");
    continue;
  }
  if (arg === "--limit") {
    const value = Number(args[index + 1]);
    if (!Number.isSafeInteger(value) || value < 1) fail(`--limit needs a number.\n${USAGE}`);
    limit = value;
    index += 1;
    continue;
  }
  if (arg === "--jetzt") {
    const value = new Date(args[index + 1] ?? "");
    if (Number.isNaN(value.getTime())) fail(`--jetzt needs an ISO time such as 2026-12-05T10:00:00Z.\n${USAGE}`);
    now = value;
    index += 1;
    continue;
  }
  fail(`Unknown argument: ${arg}\n${USAGE}`);
}
if (apply && !isMailDeliveryAvailable()) fail("RESEND_API_KEY and RESEND_FROM_EMAIL (or the E2E outbox of a test system) are missing: nothing is sent and nothing is claimed.");

const result = await runTrialReminders({ apply, limit, now, includeExisting: process.env.BLOOMMD_TRIAL_REMINDERS_EXISTING === "1" });
console.log(JSON.stringify(result));
process.exit(result.mailFailed > 0 || result.deferred > 0 ? 1 : 0);
