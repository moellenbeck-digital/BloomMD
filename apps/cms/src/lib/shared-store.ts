import type { Payload } from "payload";
import { NONCE_TTL_MS } from "./signature";

/**
 * Shared state in the CMS database (not per process): the nonce store of the signed calls and the
 * counters of the handler-level rate limits. Both must be shared because the CMS runs with two or more
 * replicas (ADR 3, spike deviations 3 and 4). The tables are created by a hand-written migration
 * (`*_svc_support`), not by Payload, and every statement is a single atomic SQL command.
 */
export interface SqlPool {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export function poolOf(payload: Payload): SqlPool {
  const pool = (payload.db as unknown as { pool?: SqlPool }).pool;
  if (!pool) throw new Error("The CMS database adapter has no SQL pool.");
  return pool;
}

/** Claims a nonce. True the first time, false for a replay (also from another replica). */
export async function claimNonce(pool: SqlPool, nonce: string, ttlMs: number = NONCE_TTL_MS): Promise<boolean> {
  const result = await pool.query(
    `with gc as (delete from svc_nonces where expires_at < now())
     insert into svc_nonces (nonce, expires_at) values ($1, now() + ($2::double precision * interval '1 millisecond'))
     on conflict (nonce) do nothing returning nonce`,
    [nonce, ttlMs],
  );
  return (result.rowCount ?? 0) === 1;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/** Fixed-window counter in the shared database; one statement, so concurrent replicas count together. */
export async function hitRateLimit(pool: SqlPool, bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const result = await pool.query(
    `with gc as (delete from svc_rate_limits where window_start < now() - interval '1 day'),
          win as (select to_timestamp(floor(extract(epoch from now()) / $2::double precision) * $2::double precision) as start)
     insert into svc_rate_limits (bucket, window_start, count)
     select $1, win.start, 1 from win
     on conflict (bucket, window_start) do update set count = svc_rate_limits.count + 1
     returning count, greatest(1, ceil(extract(epoch from (window_start + ($2::double precision * interval '1 second') - now()))))::int as retry_after`,
    [bucket, windowSeconds],
  );
  const row = result.rows[0] as { count: number | string; retry_after: number | string } | undefined;
  const count = Number(row?.count ?? 1);
  return { allowed: count <= limit, count, retryAfterSeconds: Number(row?.retry_after ?? windowSeconds) };
}
