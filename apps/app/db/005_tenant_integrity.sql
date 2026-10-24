-- Enforce that a saved view and its document always belong to the same tenant.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bloom_documents_id_workspace_unique') then
    alter table bloom_documents
      add constraint bloom_documents_id_workspace_unique unique (id, workspace_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bloom_document_views_document_workspace_fk') then
    alter table bloom_document_views
      add constraint bloom_document_views_document_workspace_fk
      foreign key (document_id, workspace_id)
      references bloom_documents (id, workspace_id)
      on delete cascade;
  end if;
end $$;
