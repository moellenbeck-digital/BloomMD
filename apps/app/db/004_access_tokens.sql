-- Personal access tokens let desktop clients use the same tenant identity as web sessions.
-- Only SHA-256 hashes are persisted; the plaintext token is returned once at creation.

create table if not exists bloom_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references bloom_users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bloom_access_tokens_user_idx
  on bloom_access_tokens(user_id, created_at desc);
