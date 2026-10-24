-- Applied explicitly with `bun run --cwd apps/app db:migrate`.
-- Durable operation identity lets the sync server prove an interrupted save committed before retrying.

alter table bloom_documents add column if not exists sync_persistence_operation_id uuid;
alter table bloom_documents add column if not exists sync_persistence_base_version bigint;
