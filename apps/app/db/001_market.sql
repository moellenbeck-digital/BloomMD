create extension if not exists pgcrypto;

create table if not exists bloom_users (
  id uuid primary key default gen_random_uuid(),
  auth_provider text not null default 'local',
  auth_user_id text,
  email text not null,
  name text,
  password_hash text,
  email_verified_at timestamptz,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bloom_users_auth_identity_idx
  on bloom_users (auth_provider, auth_user_id)
  where auth_user_id is not null;

create unique index if not exists bloom_users_email_idx
  on bloom_users (lower(email));

create table if not exists bloom_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references bloom_users(id) on delete set null,
  tier text not null,
  status text not null,
  mode text not null default 'subscription',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bloom_subscriptions_user_idx on bloom_subscriptions(user_id);
create index if not exists bloom_subscriptions_customer_idx on bloom_subscriptions(stripe_customer_id);
create index if not exists bloom_subscriptions_status_idx on bloom_subscriptions(status);

create table if not exists bloom_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references bloom_users(id) on delete cascade,
  feature text not null,
  source text not null default 'stripe',
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature, source)
);

create index if not exists bloom_entitlements_user_idx on bloom_entitlements(user_id);
create index if not exists bloom_entitlements_active_idx on bloom_entitlements(active);

create table if not exists bloom_stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz,
  processing_started_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null
);

create table if not exists bloom_auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references bloom_users(id) on delete cascade,
  email text not null,
  purpose text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bloom_auth_tokens_email_idx on bloom_auth_tokens(lower(email));
create index if not exists bloom_auth_tokens_purpose_idx on bloom_auth_tokens(purpose);
