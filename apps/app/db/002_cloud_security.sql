-- Applied explicitly with `bun run --cwd apps/app db:migrate`.
-- The runtime migration helper is idempotent; this file documents the hosted schema contract.

alter table bloom_users add column if not exists password_hash text;
alter table bloom_users add column if not exists email_verified_at timestamptz;

create table if not exists bloom_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references bloom_users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bloom_sessions_user_idx on bloom_sessions(user_id, expires_at desc);

create table if not exists bloom_rate_limits (
  action text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (action, key_hash, window_started_at)
);
create index if not exists bloom_rate_limits_updated_idx on bloom_rate_limits(updated_at);

create table if not exists bloom_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references bloom_users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  kind text not null default 'personal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind in ('personal', 'team'))
);
create unique index if not exists bloom_workspaces_personal_owner_idx
  on bloom_workspaces(owner_user_id) where kind = 'personal';

create table if not exists bloom_workspace_members (
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  user_id uuid not null references bloom_users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  check (role in ('owner', 'editor', 'viewer'))
);
create index if not exists bloom_workspace_members_user_idx on bloom_workspace_members(user_id);

create table if not exists bloom_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  filename text not null,
  markdown text not null,
  frontmatter jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_by uuid references bloom_users(id) on delete set null,
  updated_by uuid references bloom_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists bloom_documents_workspace_filename_idx
  on bloom_documents(workspace_id, lower(filename)) where deleted_at is null;
create index if not exists bloom_documents_workspace_updated_idx on bloom_documents(workspace_id, updated_at desc);

create table if not exists bloom_document_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  document_id uuid not null references bloom_documents(id) on delete cascade,
  user_id uuid not null references bloom_users(id) on delete cascade,
  name text not null,
  view jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, user_id, name)
);
create index if not exists bloom_document_views_user_idx on bloom_document_views(user_id, updated_at desc);
