import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Hand-written migration (Payload cannot generate any of this):
 *
 * 1. Partial unique index "one confirmed account per mailbox" (#169, ADR 6, spike deviation 11). Only
 *    guarded accounts (created after the rule) that are confirmed are covered, so the index can always be
 *    created whatever data is imported later. It decides simultaneous confirmations: of three at the same
 *    moment exactly one succeeds. Payload cannot create a partial index.
 * 2. `svc_nonces`: the nonce store of the signed `/svc/v1` calls, shared by all replicas (spike deviation 3).
 * 3. `svc_rate_limits`: the counters of the handler-level rate limits, shared by all replicas (deviation 4).
 *
 * Not managed by Payload: the tables have no collection. Two steps rule (ADR 12): this migration only adds.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE UNIQUE INDEX IF NOT EXISTS "users_trial_canonical_idx" ON "users" USING btree ("email_canonical")
     WHERE "email_verified_at" IS NOT NULL AND "trial_guarded";

   CREATE TABLE IF NOT EXISTS "svc_nonces" (
     "nonce" varchar PRIMARY KEY NOT NULL,
     "expires_at" timestamp(3) with time zone NOT NULL
   );
   CREATE INDEX IF NOT EXISTS "svc_nonces_expires_idx" ON "svc_nonces" USING btree ("expires_at");

   CREATE TABLE IF NOT EXISTS "svc_rate_limits" (
     "bucket" varchar NOT NULL,
     "window_start" timestamp(3) with time zone NOT NULL,
     "count" integer NOT NULL DEFAULT 0,
     PRIMARY KEY ("bucket", "window_start")
   );
   CREATE INDEX IF NOT EXISTS "svc_rate_limits_window_idx" ON "svc_rate_limits" USING btree ("window_start");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "svc_rate_limits";
   DROP TABLE IF EXISTS "svc_nonces";
   DROP INDEX IF EXISTS "users_trial_canonical_idx";`)
}
