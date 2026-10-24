create table if not exists bloom_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references bloom_users(id) on delete set null,
  event_type text not null,
  outcome text not null default 'success',
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now(),
  check (event_type ~ '^[a-z0-9_.-]{3,100}$'),
  check (outcome in ('success', 'failure'))
);

create index if not exists bloom_audit_events_actor_created_idx
on bloom_audit_events(actor_user_id, created_at desc);

create index if not exists bloom_audit_events_type_created_idx
on bloom_audit_events(event_type, created_at desc);
