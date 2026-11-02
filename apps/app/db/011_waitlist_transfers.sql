-- Accounts prepared from the ended waitlist (#105). One row per account that the transfer script
-- created without a password and without a confirmed address: it marks the account's origin, whether
-- the one-time activation mail was claimed, and when the person activated it. Applied explicitly
-- with `bun run --cwd apps/app db:migrate`.

create table if not exists bloom_waitlist_transfers (
  user_id uuid primary key references bloom_users(id) on delete cascade,
  locale text not null default 'de',
  invited_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  check (locale in ('de', 'en'))
);
