import { isAccountQuotaEnforced, summarizeQuotaUsage } from "../src/lib/account-quota";
import { listAccountStorageUsage } from "../src/lib/db";

/**
 * Ops report on the storage quota (#380): how much the accounts use, how many are near or over the limit.
 *
 *   bun run db:quota-report            dry run (the only mode): reads, writes nothing, mails nothing
 *   bun run db:quota-report --alle     lists every account, not only those from 80 %
 *
 * The output is one JSON line: `limitBytes`, `enforced` (BLOOMMD_ACCOUNT_QUOTA), `accounts`, `totalBytes`
 * (sum over all accounts), `over80` (from 80 % of the limit, includes `over100`), `over100` (at or over
 * the limit) and `perAccount` (account id, bytes, percent). Account ids only, never addresses; no prices,
 * no Stripe. Usage = UTF-8 bytes of the Markdown of all documents that are not deleted in the workspaces
 * an account owns (see docs/QUOTA.md). The exit code is 2 for a wrong call or a missing DATABASE_URL.
 */
function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");

const USAGE = "Usage: quota-report.ts [--alle] [--dry-run]";
let all = false;
for (const arg of process.argv.slice(2)) {
  if (arg === "--alle") all = true;
  else if (arg === "--dry-run") continue;
  else fail(`Unknown argument: ${arg}\n${USAGE}`);
}

const report = summarizeQuotaUsage(await listAccountStorageUsage(), { enforced: isAccountQuotaEnforced(), all });
console.log(JSON.stringify({ dryRun: true, ...report }));
process.exit(0);
