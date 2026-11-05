-- Protection against several free trials for one mailbox (#277). Applied explicitly with
-- `bun run --cwd apps/app db:migrate`; every statement is idempotent, so it can run again at any
-- time.
--
-- email_canonical is the canonical form of the address (lowercase; `+tag` of the local part dropped;
-- for gmail.com / googlemail.com also the dots of the local part dropped and googlemail.com read as
-- gmail.com; a local part that would end up empty is left as it was). It is a generated column, so
-- every account, existing or new, has it without any code having to set it, and it follows the
-- address. It mirrors canonicalEmail() in src/lib/email-canonical.ts; keep both in sync. Adding the
-- column backfills all existing accounts and changes nothing else: existing collisions stay as
-- they are, and nothing here is unique over them.
--
-- trial_guarded marks the accounts created after this migration: adding the column gives exactly the
-- existing rows `false`, the default is switched to `true` right after. Only guarded accounts are
-- checked when the address is confirmed, and only they are covered by the partial unique index, so
-- the index can always be created, whatever the existing data looks like. It is the race protection:
-- two guarded accounts of one mailbox can never both be confirmed, however close together the
-- confirmations come. (A confirmed account of any age still blocks a guarded one; that check is in
-- the confirming statement, see markEmailVerified in src/lib/db.ts.)

alter table bloom_users add column if not exists email_canonical text generated always as (
  case
    when position('@' in email) = 0 then lower(email)
    when substring(lower(email) from '@([^@]*)$') in ('gmail.com', 'googlemail.com') then
      coalesce(nullif(replace(split_part(regexp_replace(lower(email), '@[^@]*$', ''), '+', 1), '.', ''), ''), regexp_replace(lower(email), '@[^@]*$', '')) || '@gmail.com'
    else
      coalesce(nullif(split_part(regexp_replace(lower(email), '@[^@]*$', ''), '+', 1), ''), regexp_replace(lower(email), '@[^@]*$', '')) || '@' || substring(lower(email) from '@([^@]*)$')
  end
) stored;
alter table bloom_users add column if not exists trial_guarded boolean not null default false;
alter table bloom_users alter column trial_guarded set default true;
create index if not exists bloom_users_email_canonical_idx on bloom_users (email_canonical) where email_verified_at is not null;
create unique index if not exists bloom_users_trial_canonical_idx on bloom_users (email_canonical) where email_verified_at is not null and trial_guarded;
