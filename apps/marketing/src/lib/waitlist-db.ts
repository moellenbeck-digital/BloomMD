import { createHash, randomBytes } from "node:crypto";
import { createSqlClient, type SqlClient } from "./sql-client";

let waitlistClient: SqlClient | null = null;
let waitlistSchemaPromise: Promise<void> | null = null;
const WAITLIST_SCHEMA_LOCK_ID = 3_231_097_401;

export interface WaitlistSignupResult {
  created: boolean;
  token: string | null;
}

export interface ConfirmedWaitlistEntry {
  email: string;
  confirmedAt: string;
  source: string | null;
}

export interface WaitlistAdminEntry {
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  source: string | null;
}

export interface WaitlistAdminCounts {
  pending: number;
  confirmed: number;
  unsubscribed: number;
  total: number;
}

export interface WaitlistRetentionPolicy {
  pendingDays: number;
  unsubscribedDays: number;
}

export interface WaitlistCleanupResult extends WaitlistRetentionPolicy {
  dryRun: boolean;
  pending: number;
  unsubscribed: number;
  total: number;
}

const DEFAULT_WAITLIST_PENDING_RETENTION_DAYS = 30;
const DEFAULT_WAITLIST_UNSUBSCRIBED_RETENTION_DAYS = 90;

function hashWaitlistToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getWaitlistSql() {
  const url = process.env.BLOOMMD_WAITLIST_DATABASE_URL;
  if (!url) throw new Error("BLOOMMD_WAITLIST_DATABASE_URL is not configured.");
  waitlistClient ??= createSqlClient(url);
  return waitlistClient;
}

export function __setWaitlistSqlForTest(sql: SqlClient | null) {
  if (process.env.NODE_ENV !== "test") return;
  waitlistClient = sql;
  waitlistSchemaPromise = null;
}

export function isWaitlistConfigured() {
  return Boolean(process.env.BLOOMMD_WAITLIST_DATABASE_URL);
}

function normalizeRetentionDays(value: string | number | undefined, fallback: number) {
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) return fallback;
  return days;
}

export function waitlistRetentionPolicy(env: Record<string, string | undefined> = process.env): WaitlistRetentionPolicy {
  return {
    pendingDays: normalizeRetentionDays(env.BLOOMMD_WAITLIST_PENDING_RETENTION_DAYS, DEFAULT_WAITLIST_PENDING_RETENTION_DAYS),
    unsubscribedDays: normalizeRetentionDays(
      env.BLOOMMD_WAITLIST_UNSUBSCRIBED_RETENTION_DAYS,
      DEFAULT_WAITLIST_UNSUBSCRIBED_RETENTION_DAYS,
    ),
  };
}

export async function checkWaitlistDatabaseReady() {
  if (!isWaitlistConfigured()) return false;
  const rows = await getWaitlistSql()`select 1 as ok`;
  return rows.length > 0;
}

async function ensureWaitlistSchema() {
  waitlistSchemaPromise ??= (async () => {
    const sql = getWaitlistSql();
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${WAITLIST_SCHEMA_LOCK_ID}::bigint)`;
      await tx`create extension if not exists pgcrypto`;
      await tx`
        create table if not exists bloom_waitlist (
          id uuid primary key default gen_random_uuid(),
          email text not null,
          source text,
          confirm_token_hash text not null,
          confirmed_at timestamptz,
          unsubscribed_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await tx`create unique index if not exists bloom_waitlist_email_idx on bloom_waitlist (lower(email))`;
      await tx`create index if not exists bloom_waitlist_confirmed_idx on bloom_waitlist (confirmed_at) where confirmed_at is not null`;
      await tx`
        create table if not exists bloom_waitlist_rate_limits (
          action text not null,
          key_hash text not null,
          window_started_at timestamptz not null,
          attempts integer not null default 1,
          updated_at timestamptz not null default now(),
          primary key (action, key_hash, window_started_at)
        )
      `;
      await tx`create index if not exists bloom_waitlist_rate_limits_updated_idx on bloom_waitlist_rate_limits(updated_at)`;
    });
  })();
  return waitlistSchemaPromise;
}

export async function addWaitlistSignup(email: string, source: string | null): Promise<WaitlistSignupResult> {
  if (!isWaitlistConfigured()) return { created: false, token: null };
  await ensureWaitlistSchema();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashWaitlistToken(token);

  const rows = await getWaitlistSql()`
    insert into bloom_waitlist (email, source, confirm_token_hash)
    values (${email.trim()}, ${source}, ${tokenHash})
    on conflict (lower(email)) do update
      set
        source = excluded.source,
        confirm_token_hash = excluded.confirm_token_hash,
        confirmed_at = null,
        unsubscribed_at = null,
        updated_at = now()
      where bloom_waitlist.unsubscribed_at is not null
    returning id
  `;
  return rows.length > 0 ? { created: true, token } : { created: false, token: null };
}

export async function renewPendingWaitlistConfirmation(email: string): Promise<WaitlistSignupResult> {
  if (!isWaitlistConfigured()) return { created: false, token: null };
  await ensureWaitlistSchema();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashWaitlistToken(token);

  const rows = await getWaitlistSql()`
    update bloom_waitlist
    set confirm_token_hash = ${tokenHash}, updated_at = now()
    where lower(email) = ${email.trim().toLowerCase()}
      and confirmed_at is null
      and unsubscribed_at is null
    returning id
  `;
  return rows.length > 0 ? { created: true, token } : { created: false, token: null };
}

export async function confirmWaitlistSignup(token: string): Promise<boolean> {
  if (!isWaitlistConfigured()) return false;
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    update bloom_waitlist
    set confirmed_at = now(), updated_at = now()
    where confirm_token_hash = ${hashWaitlistToken(token)}
      and confirmed_at is null
      and unsubscribed_at is null
    returning id
  `;
  return rows.length > 0;
}

export async function unsubscribeFromWaitlist(token: string): Promise<boolean> {
  if (!isWaitlistConfigured()) return false;
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    update bloom_waitlist
    set unsubscribed_at = now(), updated_at = now()
    where confirm_token_hash = ${hashWaitlistToken(token)} and unsubscribed_at is null
    returning id
  `;
  return rows.length > 0;
}

export async function deleteUnsubscribedWaitlistEntry(email: string): Promise<boolean> {
  if (!isWaitlistConfigured()) return false;
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    delete from bloom_waitlist
    where lower(email) = ${email.trim().toLowerCase()}
      and unsubscribed_at is not null
    returning id
  `;
  return rows.length > 0;
}

export async function deleteWaitlistEntryByEmail(email: string): Promise<boolean> {
  if (!isWaitlistConfigured()) return false;
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    delete from bloom_waitlist
    where lower(email) = ${email.trim().toLowerCase()}
    returning id
  `;
  return rows.length > 0;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function listConfirmedWaitlist(): Promise<ConfirmedWaitlistEntry[]> {
  if (!isWaitlistConfigured()) return [];
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    select email, confirmed_at, source
    from bloom_waitlist
    where confirmed_at is not null and unsubscribed_at is null
    order by confirmed_at asc
  `;
  return (rows as unknown as Array<{ email: string; confirmed_at: Date | string; source: string | null }>).map((row) => ({
    email: row.email,
    confirmedAt: toIsoString(row.confirmed_at),
    source: row.source,
  }));
}

export async function listWaitlistAdminEntries(): Promise<WaitlistAdminEntry[]> {
  if (!isWaitlistConfigured()) return [];
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    select email, confirmed_at, unsubscribed_at, created_at, source
    from bloom_waitlist
    order by created_at desc
  `;
  return (rows as unknown as Array<{
    email: string;
    confirmed_at: Date | string | null;
    unsubscribed_at: Date | string | null;
    created_at: Date | string;
    source: string | null;
  }>).map((row) => {
    const confirmedAt = row.confirmed_at ? toIsoString(row.confirmed_at) : null;
    const unsubscribedAt = row.unsubscribed_at ? toIsoString(row.unsubscribed_at) : null;
    return {
      email: row.email,
      status: unsubscribedAt ? "unsubscribed" : confirmedAt ? "confirmed" : "pending",
      confirmedAt,
      unsubscribedAt,
      createdAt: toIsoString(row.created_at),
      source: row.source,
    };
  });
}

export async function countWaitlistAdmin(): Promise<WaitlistAdminCounts> {
  if (!isWaitlistConfigured()) return { pending: 0, confirmed: 0, unsubscribed: 0, total: 0 };
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    select
      count(*) filter (where confirmed_at is null and unsubscribed_at is null)::int as pending,
      count(*) filter (where confirmed_at is not null and unsubscribed_at is null)::int as confirmed,
      count(*) filter (where unsubscribed_at is not null)::int as unsubscribed,
      count(*)::int as total
    from bloom_waitlist
  `;
  const row = (rows[0] as Partial<WaitlistAdminCounts> | undefined) ?? {};
  return {
    pending: Number(row.pending ?? 0),
    confirmed: Number(row.confirmed ?? 0),
    unsubscribed: Number(row.unsubscribed ?? 0),
    total: Number(row.total ?? 0),
  };
}

export async function countWaitlist(): Promise<{ pending: number; confirmed: number }> {
  const counts = await countWaitlistAdmin();
  return { pending: counts.pending, confirmed: counts.confirmed };
}

export async function cleanupWaitlistRetention(input: {
  dryRun?: boolean;
  pendingDays?: number;
  unsubscribedDays?: number;
} = {}): Promise<WaitlistCleanupResult> {
  const policy = waitlistRetentionPolicy();
  const pendingDays = normalizeRetentionDays(input.pendingDays, policy.pendingDays);
  const unsubscribedDays = normalizeRetentionDays(input.unsubscribedDays, policy.unsubscribedDays);
  const dryRun = input.dryRun ?? true;

  if (!isWaitlistConfigured()) return { dryRun, pendingDays, unsubscribedDays, pending: 0, unsubscribed: 0, total: 0 };
  await ensureWaitlistSchema();

  const sql = getWaitlistSql();
  const rows = dryRun
    ? await sql`
        select
          count(*) filter (
            where confirmed_at is null
              and unsubscribed_at is null
              and created_at < now() - make_interval(days => ${pendingDays})
          )::int as pending,
          count(*) filter (
            where unsubscribed_at is not null
              and unsubscribed_at < now() - make_interval(days => ${unsubscribedDays})
          )::int as unsubscribed
        from bloom_waitlist
      `
    : await sql`
        with pending_cleanup as (
          delete from bloom_waitlist
          where confirmed_at is null
            and unsubscribed_at is null
            and created_at < now() - make_interval(days => ${pendingDays})
          returning id
        ),
        unsubscribed_cleanup as (
          delete from bloom_waitlist
          where unsubscribed_at is not null
            and unsubscribed_at < now() - make_interval(days => ${unsubscribedDays})
          returning id
        )
        select
          (select count(*)::int from pending_cleanup) as pending,
          (select count(*)::int from unsubscribed_cleanup) as unsubscribed
      `;
  const row = (rows[0] as { pending?: number; unsubscribed?: number } | undefined) ?? {};
  const pending = Number(row.pending ?? 0);
  const unsubscribed = Number(row.unsubscribed ?? 0);
  return { dryRun, pendingDays, unsubscribedDays, pending, unsubscribed, total: pending + unsubscribed };
}

export async function consumeWaitlistRateLimit(input: {
  action: string;
  keyHash: string;
  windowStartedAt: string;
  limit: number;
}) {
  if (!isWaitlistConfigured()) return null;
  await ensureWaitlistSchema();

  const rows = await getWaitlistSql()`
    with cleanup as (
      delete from bloom_waitlist_rate_limits
      where updated_at < now() - interval '7 days'
    )
    insert into bloom_waitlist_rate_limits (action, key_hash, window_started_at, attempts)
    values (${input.action}, ${input.keyHash}, ${input.windowStartedAt}, 1)
    on conflict (action, key_hash, window_started_at)
    do update set attempts = bloom_waitlist_rate_limits.attempts + 1, updated_at = now()
    returning attempts
  `;
  const attempts = Number((rows[0] as { attempts: number } | undefined)?.attempts ?? input.limit + 1);
  return { allowed: attempts <= input.limit, attempts };
}
