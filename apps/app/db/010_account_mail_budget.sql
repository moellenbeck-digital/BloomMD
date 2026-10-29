-- Global cap for outgoing account mails (confirmation and password reset, #169). One row per
-- window: scope 'hour' or 'day' (UTC), counted in the database so it holds across instances and
-- restarts. Applied explicitly with `bun run --cwd apps/app db:migrate`.

create table if not exists bloom_mail_budget (
  scope text not null,
  window_started_at timestamptz not null,
  sent integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, window_started_at),
  check (scope in ('hour', 'day'))
);

create index if not exists bloom_mail_budget_updated_idx on bloom_mail_budget(updated_at);
