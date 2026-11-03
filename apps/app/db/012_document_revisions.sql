-- Applied explicitly with `bun run --cwd apps/app db:migrate`.
-- Version history of a cloud document (#3): every save of the sync server stores the version it
-- replaced in the same statement and keeps the newest 20 per document (NOTE_HISTORY_LIMIT in
-- @bloommd/core). Apply it before deploying a sync server that writes revisions: without the
-- table its saves fail.

create table if not exists bloom_document_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
  document_id uuid not null,
  version bigint not null,
  markdown text not null,
  saved_by uuid references bloom_users(id) on delete set null,
  saved_at timestamptz not null,
  replaced_at timestamptz not null default now(),
  unique (document_id, version),
  constraint bloom_document_revisions_document_workspace_fk
    foreign key (document_id, workspace_id)
    references bloom_documents (id, workspace_id)
    on delete cascade
);
create index if not exists bloom_document_revisions_document_idx
  on bloom_document_revisions(document_id, version desc);
