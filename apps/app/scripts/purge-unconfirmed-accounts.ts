import { createSqlClient } from "../src/lib/sql-client";
import { purgeUnconfirmedAccounts, UNCONFIRMED_ACCOUNT_RETENTION_DAYS } from "../src/lib/unconfirmed-accounts";

/**
 * Removes accounts whose email address was never confirmed (#169).
 *
 *   bun run db:purge-unconfirmed                dry run (default): counts, deletes nothing
 *   bun run db:purge-unconfirmed --apply        deletes
 *   ... --days 14                               age limit, default 7 (or BLOOMMD_UNCONFIRMED_ACCOUNT_RETENTION_DAYS)
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const args = process.argv.slice(2);
const dayIndex = args.indexOf("--days");
const days = Number(dayIndex >= 0 ? args[dayIndex + 1] : process.env.BLOOMMD_UNCONFIRMED_ACCOUNT_RETENTION_DAYS ?? UNCONFIRMED_ACCOUNT_RETENTION_DAYS);
const unknown = args.filter((arg, index) => !["--apply", "--dry-run", "--days"].includes(arg) && args[index - 1] !== "--days");
if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(" ")}. Use --apply, --dry-run, --days <n>.`);
if (args.includes("--apply") && args.includes("--dry-run")) throw new Error("--apply and --dry-run exclude each other.");

const sql = createSqlClient(databaseUrl);
try {
  console.log(JSON.stringify(await purgeUnconfirmedAccounts(sql, { days, dryRun: !args.includes("--apply") })));
} finally {
  await sql.end();
}
