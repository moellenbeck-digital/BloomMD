import { createSqlClient } from "../src/lib/sql-client";
import { purgeUnconfirmedAccounts, UNCONFIRMED_ACCOUNT_RETENTION_DAYS } from "../src/lib/unconfirmed-accounts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for maintenance.");

function positiveDays(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

const deletedDocumentDays = positiveDays("BLOOMMD_DELETED_DOCUMENT_RETENTION_DAYS", 30);
const stripeEventDays = positiveDays("BLOOMMD_STRIPE_EVENT_RETENTION_DAYS", 180);
const auditEventDays = positiveDays("BLOOMMD_AUDIT_EVENT_RETENTION_DAYS", 365);
const unconfirmedAccountDays = positiveDays("BLOOMMD_UNCONFIRMED_ACCOUNT_RETENTION_DAYS", UNCONFIRMED_ACCOUNT_RETENTION_DAYS);
const sql = createSqlClient(databaseUrl);

const [tokens, accessTokens, sessions, rates, documents, events, auditEvents] = await Promise.all([
  sql`delete from bloom_auth_tokens where expires_at < now() - interval '7 days' or consumed_at < now() - interval '7 days' returning id`,
  sql`delete from bloom_access_tokens where expires_at < now() - interval '30 days' or revoked_at < now() - interval '30 days' returning id`,
  sql`delete from bloom_sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days' returning id`,
  sql`delete from bloom_rate_limits where updated_at < now() - interval '7 days' returning action`,
  sql`delete from bloom_documents where deleted_at < now() - (${deletedDocumentDays} * interval '1 day') returning id`,
  sql`delete from bloom_stripe_events where processed_at < now() - (${stripeEventDays} * interval '1 day') returning id`,
  sql`delete from bloom_audit_events where created_at < now() - (${auditEventDays} * interval '1 day') returning id`,
]);

// Unconfirmed sign-ups (#169); `bun run db:purge-unconfirmed` shows what would go, without deleting.
const unconfirmed = await purgeUnconfirmedAccounts(sql, { days: unconfirmedAccountDays, dryRun: false });

console.log(JSON.stringify({
  deletedAuthTokens: tokens.length,
  deletedAccessTokens: accessTokens.length,
  deletedSessions: sessions.length,
  deletedRateBuckets: rates.length,
  purgedDocuments: documents.length,
  deletedStripeEvents: events.length,
  deletedAuditEvents: auditEvents.length,
  deletedUnconfirmedAccounts: unconfirmed.accounts,
}));
