-- First reviewable workspace-agent workflow. Agent endpoints and credentials stay in deployment
-- configuration; the database only stores workspace membership, requests and reviewable proposals.

create table if not exists bloom_workspace_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  provider text not null,
  display_name text not null,
  status text not null default 'active',
  pairing_token_hash text,
  pairing_expires_at timestamptz,
  agent_token_hash text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_by uuid not null references bloom_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (provider in ('openclaw')),
  check (status in ('active', 'revoked')),
  check (length(display_name) between 1 and 80)
);

drop index if exists bloom_workspace_agents_active_provider_idx;

create index if not exists bloom_workspace_agents_workspace_idx
on bloom_workspace_agents(workspace_id, created_at desc);

create table if not exists bloom_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  agent_id uuid not null references bloom_workspace_agents(id) on delete cascade,
  submitted_by uuid not null references bloom_users(id) on delete cascade,
  document_id uuid references bloom_documents(id) on delete set null,
  filename text,
  prompt text not null,
  status text not null default 'queued',
  result_summary text,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  source_version bigint,
  source_markdown_hash text,
  node_id text,
  node_title text,
  node_path text,
  context_markdown text,
  check (status in ('queued', 'running', 'proposed', 'completed', 'failed')),
  check (length(prompt) between 1 and 4000)
);

create index if not exists bloom_agent_tasks_workspace_created_idx
on bloom_agent_tasks(workspace_id, created_at desc);

create index if not exists bloom_agent_tasks_agent_created_idx
on bloom_agent_tasks(agent_id, created_at desc);

create table if not exists bloom_agent_proposals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references bloom_agent_tasks(id) on delete cascade,
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  document_id uuid not null references bloom_documents(id) on delete cascade,
  filename text not null,
  before_version bigint not null,
  before_markdown_hash text not null,
  proposed_markdown text not null,
  proposed_node_content text,
  rationale text not null,
  status text not null default 'pending',
  reviewed_by uuid references bloom_users(id) on delete set null,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('pending', 'rejected', 'applied', 'stale'))
);

create index if not exists bloom_agent_proposals_workspace_created_idx
on bloom_agent_proposals(workspace_id, created_at desc);

create index if not exists bloom_agent_proposals_task_idx
on bloom_agent_proposals(task_id);

-- Prevent a task or proposal from referring to a document in another workspace. The single-column
-- foreign keys above retain their deletion behavior; these composite constraints add tenant safety.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bloom_agent_tasks_document_workspace_fk') then
    alter table bloom_agent_tasks
      add constraint bloom_agent_tasks_document_workspace_fk
      foreign key (document_id, workspace_id)
      references bloom_documents (id, workspace_id)
      on delete set null (document_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bloom_agent_proposals_document_workspace_fk') then
    alter table bloom_agent_proposals
      add constraint bloom_agent_proposals_document_workspace_fk
      foreign key (document_id, workspace_id)
      references bloom_documents (id, workspace_id)
      on delete cascade;
  end if;
end $$;

alter table bloom_workspace_agents add column if not exists pairing_token_hash text;
alter table bloom_workspace_agents add column if not exists pairing_expires_at timestamptz;
alter table bloom_workspace_agents add column if not exists agent_token_hash text;
alter table bloom_workspace_agents add column if not exists paired_at timestamptz;
alter table bloom_workspace_agents add column if not exists last_seen_at timestamptz;
alter table bloom_agent_tasks add column if not exists source_version bigint;
alter table bloom_agent_tasks add column if not exists source_markdown_hash text;
alter table bloom_agent_tasks add column if not exists node_id text;
alter table bloom_agent_tasks add column if not exists node_title text;
alter table bloom_agent_tasks add column if not exists node_path text;
alter table bloom_agent_tasks add column if not exists context_markdown text;
alter table bloom_agent_proposals add column if not exists proposed_node_content text;
create unique index if not exists bloom_workspace_agents_agent_token_idx
on bloom_workspace_agents (agent_token_hash)
where agent_token_hash is not null;
alter table bloom_audit_events add column if not exists actor_agent_id uuid references bloom_workspace_agents(id) on delete set null;
create index if not exists bloom_audit_events_agent_created_idx on bloom_audit_events(actor_agent_id, created_at desc);
