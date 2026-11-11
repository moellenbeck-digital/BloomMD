-- Trial period of the existing accounts: 60 instead of 30 days (#364). Applied explicitly with
-- `bun run --cwd apps/app db:migrate`; the statement is idempotent, so it can run again at any
-- time. Migration 013 is not changed.
--
-- Why: the accounts that existed when migration 013 ran (trial_legacy, also former waitlist
-- accounts) get 60 days from the fixed start 2026-11-15, as recommended in ADR 0001 section 6
-- (open point O2, formally still open). The fixed end moves from 2026-12-15 00:00 UTC to
-- 2027-01-14 00:00 UTC. New accounts are not affected: they keep 30 days from the email
-- confirmation, with reminders after 15 and 23 days.
--
-- Data: only rows that still carry the value migration 013 wrote are moved. A trial_ends_at that
-- was changed by hand, and the end of every account that is not trial_legacy, stays as it is;
-- nothing is deleted. Reminder times follow
-- from the end (reminderDueAt in src/lib/trial.ts counts back from it): 2026-12-30 (day 45) and
-- 2027-01-07 (day 53). Nothing is sent by this migration; the reminders for existing accounts still
-- need BLOOMMD_TRIAL_REMINDERS_EXISTING, and the read-only lock BLOOMMD_TRIAL_READONLY (both off
-- by default). Keep the date in sync with LEGACY_TRIAL_ENDS_AT in src/lib/trial.ts.

update bloom_users set trial_ends_at = '2027-01-14T00:00:00Z' where trial_legacy and trial_ends_at = '2026-12-15T00:00:00Z';
