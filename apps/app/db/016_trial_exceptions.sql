-- Exceptions of the rule "one trial account per mailbox" (#277). Applied explicitly with
-- `bun run --cwd apps/app db:migrate`; the statement is idempotent. Migration 014 is not changed.
--
-- Only the operator command (`bun run --cwd apps/app db:trial-admin --adresse <e-mail> --freischalten`)
-- writes this table; nothing else in the app does. A row allows one more trial account for one exact
-- address until `expires_at`: sign-up does not stop at the confirmed twin (hasConfirmedMailboxTwin), and
-- the confirmation (markEmailVerified) takes the account out of the mailbox rule (trial_guarded = false),
-- so the partial unique index bloom_users_trial_canonical_idx does not apply to it. The rule for
-- everybody else stays as it is.
--
-- email_hash is the SHA-256 (hex) of the lowercase address (trialExceptionKey in src/lib/trial-admin.ts;
-- markEmailVerified computes the same value in SQL): the table holds no address. created_by is the
-- operator handle of the run that created or renewed the row. Each run is also in bloom_audit_events
-- (`trial.exception_granted`).

create table if not exists bloom_trial_exceptions (
  email_hash text primary key,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (email_hash ~ '^[0-9a-f]{64}$')
);
