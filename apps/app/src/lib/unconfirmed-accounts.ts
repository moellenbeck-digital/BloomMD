import type { SqlClient } from "./sql-client";
import { WAITLIST_UNACTIVATED_RETENTION_DAYS } from "./waitlist-transfer-constants";

/** Unconfirmed accounts are removed after this many days (#169); they are junk and addresses of third parties. */
export const UNCONFIRMED_ACCOUNT_RETENTION_DAYS = 7;

export interface UnconfirmedAccountCleanup {
  dryRun: boolean;
  days: number;
  /** Accounts that match (dry run) or were deleted. */
  accounts: number;
  /** Open or used auth tokens of those accounts (removed with them). */
  tokens: number;
  oldestCreatedAt: string | null;
}

/**
 * Deletes password accounts whose address was never confirmed within `days`, with their auth tokens.
 *
 * Only accounts nobody could have used are touched: registered with a password, never confirmed
 * (so no login), no billing customer, no workspace, membership, access token or invitation sent.
 * Invitations *to* the address (workspace or beta) are keyed by email, not by account, so they stay
 * valid and the person can register again and accept. Every other table references the account
 * with on delete cascade/set null. With `dryRun` nothing is deleted. No
 * address is returned or logged.
 */
export async function purgeUnconfirmedAccounts(
  sql: SqlClient,
  options: { days?: number; dryRun: boolean },
): Promise<UnconfirmedAccountCleanup> {
  const days = options.days ?? UNCONFIRMED_ACCOUNT_RETENTION_DAYS;
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("days must be a positive integer.");

  if (options.dryRun) {
    const rows = await sql`
      with candidates as (
        select u.id, u.email, u.created_at
        from bloom_users u
        where u.auth_provider = 'password'
          and u.password_hash is not null
          and u.email_verified_at is null
          and u.stripe_customer_id is null
          and u.created_at < now() - (${days} * interval '1 day')
          and not exists (select 1 from bloom_workspace_members m where m.user_id = u.id)
          and not exists (select 1 from bloom_workspaces w where w.owner_user_id = u.id)
          and not exists (select 1 from bloom_access_tokens a where a.user_id = u.id)
          and not exists (select 1 from bloom_workspace_invitations i where i.invited_by = u.id)
      )
      select
        (select count(*) from candidates)::int as accounts,
        (select count(*) from bloom_auth_tokens t join candidates c on t.user_id = c.id or (t.user_id is null and lower(t.email) = lower(c.email)))::int as tokens,
        (select min(created_at) from candidates) as oldest_created_at
    `;
    return summarize(rows[0], days, true);
  }

  const rows = await sql`
    with candidates as (
      select u.id, u.email, u.created_at
      from bloom_users u
      where u.auth_provider = 'password'
        and u.password_hash is not null
        and u.email_verified_at is null
        and u.stripe_customer_id is null
        and u.created_at < now() - (${days} * interval '1 day')
        and not exists (select 1 from bloom_workspace_members m where m.user_id = u.id)
        and not exists (select 1 from bloom_workspaces w where w.owner_user_id = u.id)
        and not exists (select 1 from bloom_access_tokens a where a.user_id = u.id)
        and not exists (select 1 from bloom_workspace_invitations i where i.invited_by = u.id)
    ),
    -- Tokens with a user are removed by the cascade of the account; only orphans need their own delete.
    orphan_tokens as (
      delete from bloom_auth_tokens t
      using candidates c
      where t.user_id is null and lower(t.email) = lower(c.email)
      returning t.id
    ),
    removed as (
      delete from bloom_users u
      using candidates c
      where u.id = c.id
      returning u.id
    )
    select
      (select count(*) from removed)::int as accounts,
      (select count(*) from bloom_auth_tokens t join candidates c on t.user_id = c.id)::int + (select count(*) from orphan_tokens)::int as tokens,
      (select min(created_at) from candidates) as oldest_created_at
  `;
  return summarize(rows[0], days, false);
}

function summarize(row: unknown, days: number, dryRun: boolean): UnconfirmedAccountCleanup {
  const value = (row ?? {}) as { accounts?: number; tokens?: number; oldest_created_at?: Date | string | null };
  const oldest = value.oldest_created_at;
  return {
    dryRun,
    days,
    accounts: Number(value.accounts ?? 0),
    tokens: Number(value.tokens ?? 0),
    oldestCreatedAt: oldest == null ? null : new Date(oldest).toISOString(),
  };
}

export interface UnactivatedWaitlistAccountCleanup {
  dryRun: boolean;
  days: number;
  /** Prepared accounts that match (dry run) or were deleted. */
  accounts: number;
}

/**
 * Deletes prepared waitlist accounts (#105) that nobody activated within `days` of the activation
 * mail (or of their creation, when the mail never went out), with their transfer row and tokens.
 *
 * `purgeUnconfirmedAccounts` leaves them alone because they have no password; without this the
 * address of someone who ignored the mail would stay forever, while the waitlist entry itself is
 * deleted after the same number of days. Only accounts nobody could have used are touched:
 * no password, never confirmed, nothing attached. No address is returned or logged.
 */
export async function purgeUnactivatedWaitlistAccounts(
  sql: SqlClient,
  options: { days?: number; dryRun: boolean },
): Promise<UnactivatedWaitlistAccountCleanup> {
  const days = options.days ?? WAITLIST_UNACTIVATED_RETENTION_DAYS;
  if (!Number.isSafeInteger(days) || days < 1) throw new Error("days must be a positive integer.");

  if (options.dryRun) {
    const rows = await sql`
      select count(*)::int as accounts
      from bloom_users u
      join bloom_waitlist_transfers t on t.user_id = u.id
      where t.activated_at is null
        and u.password_hash is null
        and u.email_verified_at is null
        and u.stripe_customer_id is null
        and coalesce(t.invited_at, t.created_at) < now() - (${days} * interval '1 day')
        and not exists (select 1 from bloom_workspace_members m where m.user_id = u.id)
        and not exists (select 1 from bloom_workspaces w where w.owner_user_id = u.id)
        and not exists (select 1 from bloom_access_tokens a where a.user_id = u.id)
    `;
    return { dryRun: true, days, accounts: Number((rows[0] as { accounts?: number } | undefined)?.accounts ?? 0) };
  }

  // The transfer row and the auth tokens of the account go with it (on delete cascade).
  const rows = await sql`
    with removed as (
      delete from bloom_users u
      using bloom_waitlist_transfers t
      where t.user_id = u.id
        and t.activated_at is null
        and u.password_hash is null
        and u.email_verified_at is null
        and u.stripe_customer_id is null
        and coalesce(t.invited_at, t.created_at) < now() - (${days} * interval '1 day')
        and not exists (select 1 from bloom_workspace_members m where m.user_id = u.id)
        and not exists (select 1 from bloom_workspaces w where w.owner_user_id = u.id)
        and not exists (select 1 from bloom_access_tokens a where a.user_id = u.id)
      returning u.id
    )
    select count(*)::int as accounts from removed
  `;
  return { dryRun: false, days, accounts: Number((rows[0] as { accounts?: number } | undefined)?.accounts ?? 0) };
}
