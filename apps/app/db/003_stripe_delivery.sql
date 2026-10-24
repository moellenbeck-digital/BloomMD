alter table bloom_stripe_events alter column processed_at drop default;
alter table bloom_stripe_events alter column processed_at drop not null;
alter table bloom_stripe_events add column if not exists processing_started_at timestamptz;
alter table bloom_stripe_events add column if not exists attempts integer not null default 0;
alter table bloom_stripe_events add column if not exists last_error text;
