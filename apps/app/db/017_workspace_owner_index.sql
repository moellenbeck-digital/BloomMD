-- Index for the storage quota of an account (#380): the usage of an account is the sum over the
-- documents of all workspaces it owns, so the workspaces are looked up by owner (the personal
-- workspace has a partial unique index, team workspaces had none). Idempotent; `ensureMarketSchema`
-- creates the same index.

create index if not exists bloom_workspaces_owner_idx
  on bloom_workspaces(owner_user_id);
