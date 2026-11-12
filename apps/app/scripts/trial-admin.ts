import { adminGrantTrialException, adminReleaseTrialGuard, adminSetTrialEnd } from "../src/lib/db";
import {
  DEFAULT_EXCEPTION_DAYS,
  MAX_EXCEPTION_DAYS,
  MAX_EXTEND_DAYS,
  parseAccountId,
  parseAddress,
  parseDays,
  parseInstant,
  parseOperator,
  TrialAdminError,
} from "../src/lib/trial-admin";

/**
 * Operator command for the trial period (#277): the only way to give an account a longer trial or
 * one more trial account for a mailbox. No route, no UI, no self-service. Each run that changes
 * something writes an audit event (`trial.extended`, `trial.guard_released`, `trial.exception_granted`)
 * with time, operator, account id and old and new value; no address is logged or printed.
 *
 *   bun run db:trial-admin --operator <handle> --konto <uuid> --bis 2027-02-01T00:00:00Z [--apply]
 *   bun run db:trial-admin --operator <handle> --konto <uuid> --um 30 [--apply]       30 days from the later of old end and now
 *   bun run db:trial-admin --operator <handle> --konto <uuid> --entsperren [--apply]  account leaves the mailbox rule
 *   bun run db:trial-admin --operator <handle> --adresse <e-mail> --freischalten [--tage 14] [--apply]
 *                                                       one more trial account for this exact address (valid 14 days by default)
 *
 * Dry run is the default: it prints what would change and writes nothing. `--apply` writes. Needs
 * DATABASE_URL. Exit 1: no such account; 2: bad arguments. Details: docs/TRIAL.md, section "Admin: Verlängerung und Freischaltung".
 */
function fail(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");

const USAGE =
  "Usage: trial-admin.ts --operator <handle> (--konto <uuid> (--bis <ISO instant> | --um <days> | --entsperren) | --adresse <e-mail> --freischalten [--tage <n>]) [--apply]";

const flags = new Map<string, string | true>();
const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--operator", "--konto", "--bis", "--um", "--adresse", "--tage"]);
const BOOLEAN_FLAGS = new Set(["--apply", "--dry-run", "--entsperren", "--freischalten"]);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]!;
  if (BOOLEAN_FLAGS.has(arg)) {
    flags.set(arg, true);
  } else if (VALUE_FLAGS.has(arg)) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`${arg} needs a value.\n${USAGE}`);
    flags.set(arg, value);
    index += 1;
  } else {
    fail(`Unknown argument: ${arg}\n${USAGE}`);
  }
}
const text = (flag: string) => (typeof flags.get(flag) === "string" ? (flags.get(flag) as string) : undefined);
const apply = flags.has("--apply");
if (apply && flags.has("--dry-run")) fail("--apply and --dry-run exclude each other.");

try {
  const operator = parseOperator(text("--operator"));
  const modes = [flags.has("--bis"), flags.has("--um"), flags.has("--entsperren"), flags.has("--freischalten")].filter(Boolean).length;
  if (modes !== 1) fail(`Exactly one of --bis, --um, --entsperren, --freischalten.\n${USAGE}`);

  let outcome;
  if (flags.has("--freischalten")) {
    if (flags.has("--konto")) fail(`--freischalten works on an address (--adresse), not on an account.\n${USAGE}`);
    const days = flags.has("--tage") ? parseDays(text("--tage"), MAX_EXCEPTION_DAYS, "--tage") : DEFAULT_EXCEPTION_DAYS;
    outcome = await adminGrantTrialException({ operator, address: parseAddress(text("--adresse")), validDays: days, apply });
  } else {
    if (flags.has("--adresse") || flags.has("--tage")) fail(`--adresse and --tage belong to --freischalten.\n${USAGE}`);
    const accountId = parseAccountId(text("--konto"));
    const result = flags.has("--entsperren")
      ? await adminReleaseTrialGuard({ operator, accountId, apply })
      : await adminSetTrialEnd({
          operator,
          accountId,
          apply,
          ...(flags.has("--bis") ? { endsAt: parseInstant(text("--bis")) } : { extendDays: parseDays(text("--um"), MAX_EXTEND_DAYS, "--um") }),
        });
    if (!result) fail("No such account.", 1);
    outcome = result;
  }
  // One line, no address.
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", operator, ...outcome }));
  process.exit(0);
} catch (error) {
  if (error instanceof TrialAdminError) fail(`${error.code}: ${error.message}`);
  throw error;
}
