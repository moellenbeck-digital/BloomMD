-- Trial period of an account (#274): 30 days from the email confirmation, reminders after 15 and
-- 23 days. Applied explicitly with `bun run --cwd apps/app db:migrate`; every statement is
-- idempotent, so it can run again at any time.
--
-- trial_legacy marks the accounts that existed when this migration first ran. Adding the column
-- gives exactly those rows `true`; the default is switched to `false` right after, so every
-- account created later is a new one. All existing rows, also never confirmed ones and prepared
-- waitlist accounts, share one fixed trial end: 2026-12-15 00:00 UTC (the trial counts from
-- 2026-11-15, reminders on 2026-11-30 and 2026-12-08). New accounts get trial_ends_at set once,
-- when the address is confirmed, and keep it empty until then.
-- locale is the language of the account mails ('de' or 'en'); the language of a waitlist transfer
-- is taken over, everything else is 'de'.

alter table bloom_users add column if not exists trial_legacy boolean not null default true;
alter table bloom_users alter column trial_legacy set default false;
alter table bloom_users add column if not exists trial_ends_at timestamptz;
update bloom_users set trial_ends_at = '2026-12-15T00:00:00Z' where trial_legacy and trial_ends_at is null;
alter table bloom_users add column if not exists locale text not null default 'de' check (locale in ('de', 'en'));
update bloom_users u set locale = t.locale from bloom_waitlist_transfers t where t.user_id = u.id and t.locale = 'en' and u.locale = 'de';

-- One row per reminder that was claimed for an account: claimed_at when the run took it, sent_at
-- when the mail went out. A failed send deletes the row again, so the next run tries once more.
-- A row that stays claimed without sent_at means a run died between claim and send; it is not
-- retried (at most one mail per reminder).
create table if not exists bloom_trial_reminders (
  user_id uuid not null references bloom_users(id) on delete cascade,
  kind text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (user_id, kind),
  check (kind in ('15', '23'))
);
