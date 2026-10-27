-- Rights, proposals and change log of agent tokens (bloom_access_tokens with an agent_name) live on
-- the server and are enforced there. Applied explicitly with `bun run --cwd apps/app db:migrate`.
-- Without a row an agent token may only propose changes (the rule the local agent.json used).

create table if not exists bloom_agent_token_rights (
  access_token_id uuid not null references bloom_access_tokens(id) on delete cascade,
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  default_access text not null default 'propose',
  updated_by uuid references bloom_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (access_token_id, workspace_id),
  check (default_access in ('read', 'propose', 'write'))
);

-- Rights per area ("Learnings" or "Learnings/dev-team"); the longest matching area wins.
create table if not exists bloom_agent_token_area_rights (
  access_token_id uuid not null references bloom_access_tokens(id) on delete cascade,
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  area_key text not null,
  area text not null,
  access text not null,
  primary key (access_token_id, workspace_id, area_key),
  check (access in ('read', 'propose', 'write')),
  check (length(area) between 1 and 200)
);

create table if not exists bloom_agent_token_proposals (
  id uuid primary key default gen_random_uuid(),
  access_token_id uuid not null references bloom_access_tokens(id) on delete cascade,
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  agent_name text not null,
  tool text not null,
  filename text not null,
  area text not null default '',
  -- Document version the proposal is based on; null: the map did not exist yet.
  base_version bigint,
  proposed_markdown text not null,
  summary text not null default '',
  reason text,
  source text,
  status text not null default 'pending',
  reviewed_by uuid references bloom_users(id) on delete set null,
  reviewer_name text,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  check (status in ('pending', 'approved', 'rejected', 'stale'))
);

create index if not exists bloom_agent_token_proposals_workspace_idx
on bloom_agent_token_proposals(workspace_id, status, created_at desc);

-- One entry per change: written directly, proposed, approved, rejected, undone, renamed, deleted.
-- before_markdown keeps the state before a change for undo (the newest 300 per token only).
create table if not exists bloom_agent_token_changes (
  id uuid primary key default gen_random_uuid(),
  access_token_id uuid not null references bloom_access_tokens(id) on delete cascade,
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  agent_name text not null,
  event text not null,
  origin text not null default 'agent',
  tool text,
  filename text,
  area text not null default '',
  proposal_id uuid,
  summary text,
  reason text,
  source text,
  reviewer_name text,
  reviewer_user_id uuid references bloom_users(id) on delete set null,
  before_markdown text,
  created_map boolean not null default false,
  after_version bigint,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  check (event in ('written', 'proposed', 'approved', 'rejected', 'undone', 'renamed', 'deleted')),
  check (origin in ('agent', 'approved', 'owner'))
);

create index if not exists bloom_agent_token_changes_workspace_idx
on bloom_agent_token_changes(workspace_id, created_at desc);

create index if not exists bloom_agent_token_changes_token_idx
on bloom_agent_token_changes(access_token_id, workspace_id, created_at desc);
