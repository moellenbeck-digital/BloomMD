import { createSqlClient, type SqlClient } from "./sql-client";
import { createHash, randomBytes } from "node:crypto";
import { parseFile, serializeToMarkdown } from "@bloommd/core/parser";
import { AGENT_ACCESS, areaKey, normalizeAreaPath, type AgentAccess, type AgentAccessConfig } from "@bloommd/core/agent-ledger";
import {
  hashSecret,
  isValidAuthCode,
  MOBILE_AUTH_CODE_PREFIX,
  MOBILE_AUTH_CODE_TTL_MS,
  MOBILE_TOKEN_DAYS,
  mobileTokenName,
  verifyPkce,
  verifyStateHash,
} from "./mobile-auth";
import type {
  FeedbackArea,
  FeedbackAttachmentKind,
  FeedbackType,
} from "./feedback";

let sqlClient: SqlClient | null = null;
let schemaPromise: Promise<void> | null = null;
const WORKSPACE_AGENT_EVENT_CHANNEL = "bloommd_workspace_agent_events";
type WorkspaceAgentEventType =
  | "task.queued"
  | "task.running"
  | "task.proposed"
  | "task.completed"
  | "task.failed"
  | "proposal.reviewed"
  | "agent.presence"
  | "token.proposal.created"
  | "token.proposal.reviewed"
  | "token.rights.changed";
export interface WorkspaceAgentEvent {
  workspaceId: string;
  agentId?: string;
  taskId?: string;
  type: WorkspaceAgentEventType;
}
const workspaceAgentEventListeners = new Set<
  (event: WorkspaceAgentEvent) => void
>();
let workspaceAgentEventSubscription: Promise<void> | null = null;

function parseWorkspaceAgentEvent(payload: string): WorkspaceAgentEvent | null {
  try {
    const value = JSON.parse(payload) as Partial<WorkspaceAgentEvent>;
    if (!value.workspaceId || !value.type) return null;
    return value as WorkspaceAgentEvent;
  } catch (error) {
    console.error("[BloomMD] Could not parse workspace agent event:", error);
    return null;
  }
}

async function ensureWorkspaceAgentEventSubscription(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  workspaceAgentEventSubscription ??= getSql()
    .listen(WORKSPACE_AGENT_EVENT_CHANNEL, (payload) => {
      const event = parseWorkspaceAgentEvent(payload);
      if (!event) return;
      for (const listener of workspaceAgentEventListeners) listener(event);
    })
    .then(() => undefined);
  await workspaceAgentEventSubscription;
}

export async function subscribeWorkspaceAgentEvents(
  workspaceId: string,
  listener: (event: WorkspaceAgentEvent) => void,
): Promise<() => void> {
  await ensureWorkspaceAgentEventSubscription();
  const scopedListener = (event: WorkspaceAgentEvent) => {
    if (event.workspaceId === workspaceId) listener(event);
  };
  workspaceAgentEventListeners.add(scopedListener);
  return () => workspaceAgentEventListeners.delete(scopedListener);
}

async function emitWorkspaceAgentEvent(
  event: WorkspaceAgentEvent,
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await getSql().notify(WORKSPACE_AGENT_EVENT_CHANNEL, JSON.stringify(event));
  } catch (error) {
    console.error("[BloomMD] Could not publish workspace agent event:", error);
  }
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  sqlClient ??= createSqlClient(process.env.DATABASE_URL);
  return sqlClient;
}

export function __setMarketSqlForTest(sql: SqlClient | null) {
  if (process.env.NODE_ENV !== "test") return;
  sqlClient = sql;
  schemaPromise = null;
}

export function normalizeUuid(value: string | null | undefined) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

export async function ensureMarketSchema() {
  if (!isDatabaseConfigured()) return;
  schemaPromise ??=
    process.env.NODE_ENV === "production" &&
    process.env.BLOOMMD_AUTO_MIGRATE !== "1"
      ? verifyMarketSchema()
      : createMarketSchema();
  await schemaPromise;
}

export async function migrateMarketSchema() {
  if (!isDatabaseConfigured())
    throw new Error("DATABASE_URL is not configured.");
  await createMarketSchema();
  schemaPromise = Promise.resolve();
}

async function verifyMarketSchema() {
  const rows = await getSql()`
    select
      to_regclass('public.bloom_users') as users,
      to_regclass('public.bloom_subscriptions') as subscriptions,
      to_regclass('public.bloom_entitlements') as entitlements,
      to_regclass('public.bloom_stripe_events') as stripe_events,
      to_regclass('public.bloom_auth_tokens') as auth_tokens,
      to_regclass('public.bloom_beta_invites') as beta_invites,
      to_regclass('public.bloom_access_tokens') as access_tokens,
      to_regclass('public.bloom_sessions') as sessions,
      to_regclass('public.bloom_rate_limits') as rate_limits,
      to_regclass('public.bloom_audit_events') as audit_events,
      to_regclass('public.bloom_share_links') as share_links,
      to_regclass('public.bloom_mobile_auth_codes') as mobile_auth_codes,
      to_regclass('public.bloom_feedback') as feedback,
      to_regclass('public.bloom_feedback_attachments') as feedback_attachments,
      to_regclass('public.bloom_workspaces') as workspaces,
      to_regclass('public.bloom_workspace_members') as workspace_members,
      to_regclass('public.bloom_workspace_invitations') as workspace_invitations,
      to_regclass('public.bloom_workspace_agents') as workspace_agents,
      to_regclass('public.bloom_agent_tasks') as agent_tasks,
      to_regclass('public.bloom_agent_proposals') as agent_proposals,
      to_regclass('public.bloom_agent_token_rights') as agent_token_rights,
      to_regclass('public.bloom_agent_token_area_rights') as agent_token_area_rights,
      to_regclass('public.bloom_agent_token_proposals') as agent_token_proposals,
      to_regclass('public.bloom_agent_token_changes') as agent_token_changes,
      to_regclass('public.bloom_documents') as documents,
      to_regclass('public.bloom_document_views') as document_views
  `;
  const row = rows[0] as Record<string, string | null> | undefined;
  const missing = Object.entries(row ?? {})
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (!row || missing.length > 0)
    throw new Error(
      `BloomMD database migration is incomplete: ${missing.join(", ") || "schema unavailable"}.`,
    );

  const columns = await getSql()`
    select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (
        ('bloom_users', 'password_hash'),
        ('bloom_users', 'email_verified_at'),
        ('bloom_stripe_events', 'processed_at'),
        ('bloom_stripe_events', 'processing_started_at'),
        ('bloom_stripe_events', 'attempts'),
        ('bloom_stripe_events', 'last_error'),
        ('bloom_beta_invites', 'status'),
        ('bloom_beta_invites', 'accepted_at'),
        ('bloom_beta_invites', 'expires_at'),
        ('bloom_beta_invites', 'revoked_at'),
        ('bloom_beta_invites', 'source'),
        ('bloom_beta_invites', 'note'),
        ('bloom_beta_invites', 'batch_id'),
        ('bloom_sessions', 'expires_at'),
        ('bloom_sessions', 'revoked_at'),
        ('bloom_access_tokens', 'token_hash'),
        ('bloom_access_tokens', 'revoked_at'),
        ('bloom_access_tokens', 'expires_at'),
        ('bloom_access_tokens', 'scope'),
        ('bloom_access_tokens', 'workspace_ids'),
        ('bloom_access_tokens', 'agent_name'),
        ('bloom_access_tokens', 'allow_share'),
        ('bloom_access_tokens', 'client'),
        ('bloom_mobile_auth_codes', 'user_id'),
        ('bloom_mobile_auth_codes', 'code_hash'),
        ('bloom_mobile_auth_codes', 'code_challenge'),
        ('bloom_mobile_auth_codes', 'state_hash'),
        ('bloom_mobile_auth_codes', 'device_name'),
        ('bloom_mobile_auth_codes', 'expires_at'),
        ('bloom_mobile_auth_codes', 'consumed_at'),
        ('bloom_mobile_auth_codes', 'access_token_id'),
        ('bloom_share_links', 'token_hash'),
        ('bloom_share_links', 'revoked_at'),
        ('bloom_documents', 'workspace_id'),
        ('bloom_documents', 'version'),
        ('bloom_documents', 'deleted_at'),
        ('bloom_workspace_invitations', 'workspace_id'),
        ('bloom_workspace_invitations', 'email'),
        ('bloom_workspace_invitations', 'role'),
        ('bloom_workspace_invitations', 'token_hash'),
        ('bloom_workspace_invitations', 'invited_by'),
        ('bloom_workspace_invitations', 'expires_at'),
        ('bloom_workspace_invitations', 'accepted_at'),
        ('bloom_workspace_invitations', 'revoked_at'),
        ('bloom_workspace_agents', 'workspace_id'),
        ('bloom_workspace_agents', 'provider'),
        ('bloom_workspace_agents', 'status'),
        ('bloom_workspace_agents', 'created_by'),
        ('bloom_workspace_agents', 'pairing_token_hash'),
        ('bloom_workspace_agents', 'pairing_expires_at'),
        ('bloom_workspace_agents', 'agent_token_hash'),
        ('bloom_workspace_agents', 'paired_at'),
        ('bloom_workspace_agents', 'last_seen_at'),
        ('bloom_agent_tasks', 'workspace_id'),
        ('bloom_agent_tasks', 'agent_id'),
        ('bloom_agent_tasks', 'status'),
        ('bloom_agent_tasks', 'document_id'),
        ('bloom_agent_tasks', 'source_version'),
        ('bloom_agent_tasks', 'source_markdown_hash'),
        ('bloom_agent_tasks', 'node_id'),
        ('bloom_agent_tasks', 'node_title'),
        ('bloom_agent_tasks', 'node_path'),
        ('bloom_agent_tasks', 'context_markdown'),
        ('bloom_audit_events', 'actor_agent_id'),
        ('bloom_agent_proposals', 'workspace_id'),
        ('bloom_agent_proposals', 'document_id'),
        ('bloom_agent_proposals', 'status'),
        ('bloom_agent_proposals', 'proposed_node_content'),
        ('bloom_document_views', 'view'),
        ('bloom_feedback', 'status'),
        ('bloom_feedback', 'github_issue_number'),
        ('bloom_feedback', 'github_issue_url'),
        ('bloom_feedback', 'github_project_item_id'),
        ('bloom_feedback_attachments', 'object_key'),
        ('bloom_feedback_attachments', 'sha256'),
        ('bloom_feedback_attachments', 'retention_expires_at')
      )
  `;
  if (
    Number((columns[0] as { count?: number } | undefined)?.count ?? 0) !== 76
  ) {
    throw new Error(
      "BloomMD database migration is incomplete: required columns are missing.",
    );
  }

  const tenantConstraints = await getSql()`
    select count(*)::int as count
    from pg_constraint
    where conname in (
      'bloom_documents_id_workspace_unique',
      'bloom_document_views_document_workspace_fk',
      'bloom_agent_tasks_document_workspace_fk',
      'bloom_agent_proposals_document_workspace_fk'
    )
  `;
  if (
    Number(
      (tenantConstraints[0] as { count?: number } | undefined)?.count ?? 0,
    ) !== 4
  ) {
    throw new Error(
      "BloomMD database migration is incomplete: tenant integrity constraints are missing.",
    );
  }
}

export async function checkDatabaseReady() {
  if (!isDatabaseConfigured()) return false;
  await verifyMarketSchema();
  await getSql()`select 1`;
  return true;
}

async function createMarketSchema() {
  const sql = getSql();

  await sql`create extension if not exists pgcrypto`;

  await sql`
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
    )
  `;
  await sql`
    create unique index if not exists bloom_users_auth_identity_idx
    on bloom_users (auth_provider, auth_user_id)
    where auth_user_id is not null
  `;
  await sql`create unique index if not exists bloom_users_email_idx on bloom_users (lower(email))`;
  await sql`alter table bloom_users add column if not exists password_hash text`;
  await sql`alter table bloom_users add column if not exists email_verified_at timestamptz`;

  await sql`
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
    )
  `;
  await sql`create index if not exists bloom_subscriptions_user_idx on bloom_subscriptions(user_id)`;
  await sql`create index if not exists bloom_subscriptions_customer_idx on bloom_subscriptions(stripe_customer_id)`;
  await sql`create index if not exists bloom_subscriptions_status_idx on bloom_subscriptions(status)`;

  await sql`
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
    )
  `;
  await sql`create index if not exists bloom_entitlements_user_idx on bloom_entitlements(user_id)`;
  await sql`create index if not exists bloom_entitlements_active_idx on bloom_entitlements(active)`;

  await sql`
    create table if not exists bloom_stripe_events (
      id text primary key,
      type text not null,
      processed_at timestamptz,
      processing_started_at timestamptz,
      attempts integer not null default 0,
      last_error text,
      payload jsonb not null
    )
  `;
  await sql`alter table bloom_stripe_events alter column processed_at drop default`;
  await sql`alter table bloom_stripe_events alter column processed_at drop not null`;
  await sql`alter table bloom_stripe_events add column if not exists processing_started_at timestamptz`;
  await sql`alter table bloom_stripe_events add column if not exists attempts integer not null default 0`;
  await sql`alter table bloom_stripe_events add column if not exists last_error text`;

  await sql`
    create table if not exists bloom_auth_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references bloom_users(id) on delete cascade,
      email text not null,
      purpose text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists bloom_auth_tokens_email_idx on bloom_auth_tokens(lower(email))`;
  await sql`create index if not exists bloom_auth_tokens_purpose_idx on bloom_auth_tokens(purpose)`;

  await sql`
    create table if not exists bloom_beta_invites (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      status text not null default 'invited',
      source text not null default 'manual',
      note text,
      batch_id text,
      invited_at timestamptz not null default now(),
      accepted_at timestamptz,
      expires_at timestamptz,
      revoked_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists bloom_beta_invites_email_idx on bloom_beta_invites (lower(email))`;
  await sql`create index if not exists bloom_beta_invites_status_idx on bloom_beta_invites(status)`;
  await sql`create index if not exists bloom_beta_invites_source_idx on bloom_beta_invites(source)`;
  await sql`alter table bloom_beta_invites add column if not exists status text not null default 'invited'`;
  await sql`alter table bloom_beta_invites add column if not exists source text not null default 'manual'`;
  await sql`alter table bloom_beta_invites add column if not exists note text`;
  await sql`alter table bloom_beta_invites add column if not exists batch_id text`;
  await sql`alter table bloom_beta_invites add column if not exists accepted_at timestamptz`;
  await sql`alter table bloom_beta_invites add column if not exists expires_at timestamptz`;
  await sql`alter table bloom_beta_invites add column if not exists revoked_at timestamptz`;

  await sql`
    create table if not exists bloom_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references bloom_users(id) on delete cascade,
      expires_at timestamptz not null,
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists bloom_sessions_user_idx on bloom_sessions(user_id, expires_at desc)`;

  await sql`
    create table if not exists bloom_access_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references bloom_users(id) on delete cascade,
      name text not null,
      token_hash text not null unique,
      expires_at timestamptz,
      last_used_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists bloom_access_tokens_user_idx on bloom_access_tokens(user_id, created_at desc)`;
  // Agent tokens: read-only or read/write, optionally limited to workspaces, named for the audit log.
  await sql`alter table bloom_access_tokens add column if not exists scope text not null default 'write'`;
  await sql`alter table bloom_access_tokens add column if not exists workspace_ids uuid[]`;
  await sql`alter table bloom_access_tokens add column if not exists agent_name text`;
  // Agent tokens may create read-only share links only when the owner allowed it explicitly.
  await sql`alter table bloom_access_tokens add column if not exists allow_share boolean not null default false`;
  // Which client a token was issued to without being pasted: 'mobile_app' for the app sign-in.
  await sql`alter table bloom_access_tokens add column if not exists client text`;

  // One-time codes of the app sign-in (authorization code + PKCE). Only hashes are stored; a code
  // is bound to the app's PKCE challenge, its state and the user who allowed the sign-in.
  await sql`
    create table if not exists bloom_mobile_auth_codes (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references bloom_users(id) on delete cascade,
      code_hash text not null unique,
      code_challenge text not null,
      state_hash text not null,
      device_name text not null,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      access_token_id uuid references bloom_access_tokens(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists bloom_mobile_auth_codes_expires_idx on bloom_mobile_auth_codes(expires_at)`;

  await sql`
    create table if not exists bloom_rate_limits (
      action text not null,
      key_hash text not null,
      window_started_at timestamptz not null,
      attempts integer not null default 1,
      updated_at timestamptz not null default now(),
      primary key (action, key_hash, window_started_at)
    )
  `;
  await sql`create index if not exists bloom_rate_limits_updated_idx on bloom_rate_limits(updated_at)`;

  await sql`
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
    )
  `;
  await sql`create index if not exists bloom_audit_events_actor_created_idx on bloom_audit_events(actor_user_id, created_at desc)`;
  await sql`alter table bloom_audit_events add column if not exists details jsonb`;

  await sql`create index if not exists bloom_audit_events_type_created_idx on bloom_audit_events(event_type, created_at desc)`;

  await sql`
    create table if not exists bloom_feedback (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references bloom_users(id) on delete set null,
      user_email text not null,
      type text not null,
      area text not null,
      message text not null,
      route text,
      user_agent text,
      app_version text,
      status text not null default 'received',
      github_issue_number integer,
      github_issue_url text,
      github_project_item_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (type in ('bug', 'idea', 'question', 'ux')),
      check (area in ('web', 'desktop', 'sync', 'docs', 'other')),
      check (status in ('received', 'reported', 'failed'))
    )
  `;
  await sql`create index if not exists bloom_feedback_user_created_idx on bloom_feedback(user_id, created_at desc)`;
  await sql`create index if not exists bloom_feedback_status_idx on bloom_feedback(status, created_at desc)`;
  await sql`alter table bloom_feedback alter column user_id drop not null`;
  await sql`alter table bloom_feedback add column if not exists status text not null default 'received'`;
  await sql`alter table bloom_feedback add column if not exists github_issue_number integer`;
  await sql`alter table bloom_feedback add column if not exists github_issue_url text`;
  await sql`alter table bloom_feedback add column if not exists github_project_item_id text`;

  await sql`
    create table if not exists bloom_feedback_attachments (
      id uuid primary key default gen_random_uuid(),
      feedback_id uuid not null references bloom_feedback(id) on delete cascade,
      kind text not null,
      filename text not null,
      object_key text not null,
      mime_type text not null,
      size_bytes integer not null,
      sha256 text not null,
      retention_expires_at timestamptz,
      created_at timestamptz not null default now(),
      check (kind in ('screenshot', 'video')),
      check (size_bytes > 0)
    )
  `;
  await sql`create unique index if not exists bloom_feedback_attachments_object_key_idx on bloom_feedback_attachments(object_key)`;
  await sql`create index if not exists bloom_feedback_attachments_feedback_idx on bloom_feedback_attachments(feedback_id)`;
  await sql`alter table bloom_feedback_attachments add column if not exists object_key text`;
  await sql`alter table bloom_feedback_attachments add column if not exists sha256 text`;
  await sql`alter table bloom_feedback_attachments add column if not exists retention_expires_at timestamptz`;

  await sql`
    create table if not exists bloom_workspaces (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid not null references bloom_users(id) on delete cascade,
      name text not null,
      slug text not null unique,
      kind text not null default 'personal',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (kind in ('personal', 'team'))
    )
  `;
  await sql`
    create unique index if not exists bloom_workspaces_personal_owner_idx
    on bloom_workspaces(owner_user_id)
    where kind = 'personal'
  `;

  await sql`
    create table if not exists bloom_workspace_members (
      workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
      user_id uuid not null references bloom_users(id) on delete cascade,
      role text not null default 'owner',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (workspace_id, user_id),
      check (role in ('owner', 'editor', 'viewer'))
    )
  `;
  await sql`create index if not exists bloom_workspace_members_user_idx on bloom_workspace_members(user_id)`;

  await sql`
    create table if not exists bloom_workspace_invitations (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
      email text not null,
      role text not null default 'editor',
      token_hash text not null unique,
      invited_by uuid not null references bloom_users(id) on delete cascade,
      expires_at timestamptz not null,
      accepted_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz not null default now(),
      check (role in ('owner', 'editor', 'viewer'))
    )
  `;
  await sql`
    create unique index if not exists bloom_workspace_invitations_pending_email_idx
    on bloom_workspace_invitations (workspace_id, lower(email))
    where accepted_at is null and revoked_at is null
  `;
  await sql`create index if not exists bloom_workspace_invitations_workspace_idx on bloom_workspace_invitations(workspace_id, created_at desc)`;
  await sql`create index if not exists bloom_workspace_invitations_token_idx on bloom_workspace_invitations(token_hash)`;

  // Agents are workspace-scoped service identities, not synthetic human users. Keeping their
  // provider configuration out of this table means a revoked agent can never retain an endpoint
  // credential in the product database.
  await sql`
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
    )
  `;
  await sql`alter table bloom_workspace_agents add column if not exists pairing_token_hash text`;
  await sql`alter table bloom_workspace_agents add column if not exists pairing_expires_at timestamptz`;
  await sql`alter table bloom_workspace_agents add column if not exists agent_token_hash text`;
  await sql`alter table bloom_workspace_agents add column if not exists paired_at timestamptz`;
  await sql`alter table bloom_workspace_agents add column if not exists last_seen_at timestamptz`;
  await sql`drop index if exists bloom_workspace_agents_active_provider_idx`;
  await sql`create unique index if not exists bloom_workspace_agents_agent_token_idx on bloom_workspace_agents (agent_token_hash) where agent_token_hash is not null`;
  await sql`create index if not exists bloom_workspace_agents_workspace_idx on bloom_workspace_agents(workspace_id, created_at desc)`;
  await sql`alter table bloom_audit_events add column if not exists actor_agent_id uuid references bloom_workspace_agents(id) on delete set null`;
  await sql`create index if not exists bloom_audit_events_agent_created_idx on bloom_audit_events(actor_agent_id, created_at desc)`;

  await sql`
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
    )
  `;

  // Read-only links that show one cloud map to people without an account.
  await sql`
    create table if not exists bloom_share_links (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references bloom_documents(id) on delete cascade,
      token_hash text not null unique,
      created_by uuid references bloom_users(id) on delete set null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      last_viewed_at timestamptz
    )
  `;
  await sql`create index if not exists bloom_share_links_document_idx on bloom_share_links(document_id, created_at desc)`;
  await sql`
    create unique index if not exists bloom_documents_workspace_filename_idx
    on bloom_documents(workspace_id, lower(filename))
    where deleted_at is null
  `;
  await sql`create index if not exists bloom_documents_workspace_updated_idx on bloom_documents(workspace_id, updated_at desc)`;
  await sql`alter table bloom_documents add column if not exists sync_persistence_operation_id uuid`;
  await sql`alter table bloom_documents add column if not exists sync_persistence_base_version bigint`;

  // A task retains the human request and bounded document context. The agent never receives a
  // mutation credential; a reviewer later applies a proposal through the sync server.
  await sql`
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
    )
  `;
  await sql`alter table bloom_agent_tasks add column if not exists source_version bigint`;
  await sql`alter table bloom_agent_tasks add column if not exists source_markdown_hash text`;
  await sql`alter table bloom_agent_tasks add column if not exists node_id text`;
  await sql`alter table bloom_agent_tasks add column if not exists node_title text`;
  await sql`alter table bloom_agent_tasks add column if not exists node_path text`;
  await sql`alter table bloom_agent_tasks add column if not exists context_markdown text`;
  await sql`create index if not exists bloom_agent_tasks_workspace_created_idx on bloom_agent_tasks(workspace_id, created_at desc)`;
  await sql`create index if not exists bloom_agent_tasks_agent_created_idx on bloom_agent_tasks(agent_id, created_at desc)`;

  await sql`
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
      proposed_child_nodes jsonb not null default '[]'::jsonb,
      rationale text not null,
      status text not null default 'pending',
      reviewed_by uuid references bloom_users(id) on delete set null,
      reviewed_at timestamptz,
      applied_at timestamptz,
      created_at timestamptz not null default now(),
      check (status in ('pending', 'rejected', 'applied', 'stale'))
    )
  `;
  await sql`alter table bloom_agent_proposals add column if not exists proposed_node_content text`;
  await sql`alter table bloom_agent_proposals add column if not exists proposed_child_nodes jsonb not null default '[]'::jsonb`;
  await sql`create index if not exists bloom_agent_proposals_workspace_created_idx on bloom_agent_proposals(workspace_id, created_at desc)`;
  await sql`create index if not exists bloom_agent_proposals_task_idx on bloom_agent_proposals(task_id)`;

  // Rights, proposals and change log of agent tokens (cloud workspaces); see db/009_agent_token_rights.sql.
  await sql`
    create table if not exists bloom_agent_token_rights (
      access_token_id uuid not null references bloom_access_tokens(id) on delete cascade,
      workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
      default_access text not null default 'propose',
      updated_by uuid references bloom_users(id) on delete set null,
      updated_at timestamptz not null default now(),
      primary key (access_token_id, workspace_id),
      check (default_access in ('read', 'propose', 'write'))
    )
  `;
  await sql`the longest matching area wins. create table if not exists bloom_agent_token_area_rights ( access_token_id uuid not null references bloom_access_tokens(id) on delete cascade, workspace_id uuid not null references bloom_workspaces(id) on delete cascade, area_key text not null, area text not null, access text not null, primary key (access_token_id, workspace_id, area_key), check (access in ('read', 'propose', 'write')), check (length(area) between 1 and 200) )`;
  await sql`
    create table if not exists bloom_agent_token_proposals (
      id uuid primary key default gen_random_uuid(),
      access_token_id uuid not null references bloom_access_tokens(id) on delete cascade,
      workspace_id uuid not null references bloom_workspaces(id) on delete cascade,
      agent_name text not null,
      tool text not null,
      filename text not null,
      area text not null default '',
  `;
  await sql`null: the map did not exist yet. base_version bigint, proposed_markdown text not null, summary text not null default '', reason text, source text, status text not null default 'pending', reviewed_by uuid references bloom_users(id) on delete set null, reviewer_name text, reviewed_at timestamptz, review_reason text, created_at timestamptz not null default now(), check (status in ('pending', 'approved', 'rejected', 'stale')) )`;
  await sql`create index if not exists bloom_agent_token_proposals_workspace_idx on bloom_agent_token_proposals(workspace_id, status, created_at desc)`;
  await sql`
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
    )
  `;
  await sql`create index if not exists bloom_agent_token_changes_workspace_idx on bloom_agent_token_changes(workspace_id, created_at desc)`;
  await sql`create index if not exists bloom_agent_token_changes_token_idx on bloom_agent_token_changes(access_token_id, workspace_id, created_at desc)`;

  await sql`
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
    )
  `;
  await sql`create index if not exists bloom_document_views_user_idx on bloom_document_views(user_id, updated_at desc)`;

  const tenantConstraints = await sql`
    select conname
    from pg_constraint
    where conname in (
      'bloom_documents_id_workspace_unique',
      'bloom_document_views_document_workspace_fk',
      'bloom_agent_tasks_document_workspace_fk',
      'bloom_agent_proposals_document_workspace_fk'
    )
  `;
  const tenantConstraintNames = new Set(
    tenantConstraints.map((row) => (row as { conname: string }).conname),
  );
  if (!tenantConstraintNames.has("bloom_documents_id_workspace_unique")) {
    await sql`
      alter table bloom_documents
      add constraint bloom_documents_id_workspace_unique unique (id, workspace_id)
    `;
  }
  if (
    !tenantConstraintNames.has("bloom_document_views_document_workspace_fk")
  ) {
    await sql`
      alter table bloom_document_views
      add constraint bloom_document_views_document_workspace_fk
      foreign key (document_id, workspace_id)
      references bloom_documents (id, workspace_id)
      on delete cascade
    `;
  }
  if (!tenantConstraintNames.has("bloom_agent_tasks_document_workspace_fk")) {
    await sql`
      alter table bloom_agent_tasks
      add constraint bloom_agent_tasks_document_workspace_fk
      foreign key (document_id, workspace_id)
      references bloom_documents (id, workspace_id)
      on delete set null (document_id)
    `;
  }
  if (
    !tenantConstraintNames.has("bloom_agent_proposals_document_workspace_fk")
  ) {
    await sql`
      alter table bloom_agent_proposals
      add constraint bloom_agent_proposals_document_workspace_fk
      foreign key (document_id, workspace_id)
      references bloom_documents (id, workspace_id)
      on delete cascade
    `;
  }
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
}

export type WorkspaceRole = WorkspaceRecord["role"];

export interface WorkspaceMemberRecord {
  userId: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  createdAt: string;
}

export type WorkspaceAgentProvider = "openclaw";
export type WorkspaceAgentStatus = "active" | "revoked";

export interface WorkspaceAgentRecord {
  id: string;
  workspaceId: string;
  provider: WorkspaceAgentProvider;
  displayName: string;
  status: WorkspaceAgentStatus;
  createdAt: string;
  revokedAt: string | null;
  pairedAt: string | null;
  lastSeenAt: string | null;
}

export interface WorkspaceAgentInvitation {
  agent: WorkspaceAgentRecord;
  pairingCode: string;
  pairingExpiresAt: string;
}

export type AgentTaskStatus =
  "queued" | "running" | "proposed" | "completed" | "failed";
export type AgentProposalStatus = "pending" | "rejected" | "applied" | "stale";

export interface AgentChildNodeProposal {
  title: string;
  content: string;
  kind: "task" | "decision";
}

export interface AgentProposalRecord {
  id: string;
  taskId: string;
  workspaceId: string;
  documentId: string;
  filename: string;
  beforeVersion: number;
  beforeMarkdownHash: string;
  proposedMarkdown: string;
  proposedNodeContent: string | null;
  proposedChildNodes: AgentChildNodeProposal[];
  nodeId: string | null;
  sourceNodeTitle?: string | null;
  sourceNodeContent?: string | null;
  rationale: string;
  status: AgentProposalStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface AgentTaskRecord {
  id: string;
  workspaceId: string;
  agentId: string;
  agentName: string;
  submittedBy: string;
  documentId: string | null;
  filename: string | null;
  prompt: string;
  status: AgentTaskStatus;
  resultSummary: string | null;
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
  sourceVersion: number | null;
  sourceMarkdownHash: string | null;
  nodeId: string | null;
  nodeTitle: string | null;
  nodePath: string | null;
  proposals: AgentProposalRecord[];
}

export interface ClaimedWorkspaceAgentTask {
  id: string;
  workspace: { id: string; name: string };
  command: string;
  context: {
    filename: string;
    markdown: string;
    version: number;
    node?: { id: string; title: string; path: string; content: string };
  };
}

export type WorkspaceInvitationStatus =
  "pending" | "accepted" | "revoked" | "expired";

export interface WorkspaceInvitationRecord {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  status: WorkspaceInvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface WorkspaceInvitationPreview extends WorkspaceInvitationRecord {
  workspaceName: string;
  inviterName: string | null;
  inviterEmail: string;
}

export interface CloudDocumentRecord {
  id: string;
  workspaceId: string;
  filename: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

export function normalizeWorkspaceName(name: string) {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) throw new Error("Workspace name is required.");
  if (normalized.length > 80)
    throw new Error("Workspace name must be 80 characters or less.");
  return normalized;
}

function normalizeWorkspaceEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("Please enter a valid email address.");
  return normalized;
}

function workspaceSlug(name: string) {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace";
  return `team-${base}-${randomBytes(4).toString("hex")}`;
}

function hashWorkspaceInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function workspaceInvitationFromRow(row: {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  status?: string;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
}): WorkspaceInvitationRecord {
  const expiresAt = toIsoStringOrNull(row.expires_at)!;
  const status: WorkspaceInvitationStatus = row.revoked_at
    ? "revoked"
    : row.accepted_at
      ? "accepted"
      : new Date(expiresAt).getTime() <= Date.now()
        ? "expired"
        : "pending";
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    role: row.role as WorkspaceRole,
    status,
    expiresAt,
    acceptedAt: toIsoStringOrNull(row.accepted_at),
    revokedAt: toIsoStringOrNull(row.revoked_at),
    createdAt: toIsoStringOrNull(row.created_at)!,
  };
}

export async function getOrCreatePersonalWorkspace(
  userId: string,
): Promise<WorkspaceRecord> {
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId)
    throw new Error("A database-backed workspace requires a UUID user id.");
  await ensureMarketSchema();

  const slug = `personal-${dbUserId}`;
  const rows = await getSql()`
    insert into bloom_workspaces (owner_user_id, name, slug, kind)
    values (${dbUserId}, 'My Workspace', ${slug}, 'personal')
    on conflict (owner_user_id) where kind = 'personal'
    do update set updated_at = bloom_workspaces.updated_at
    returning id, name, slug, kind
  `;
  const row = rows[0] as
    { id: string; name: string; slug: string; kind: "personal" } | undefined;
  if (!row) throw new Error("Could not create the personal workspace.");

  await getSql()`
    insert into bloom_workspace_members (workspace_id, user_id, role)
    values (${row.id}, ${dbUserId}, 'owner')
    on conflict (workspace_id, user_id)
    do update set role = 'owner', updated_at = now()
  `;

  return { ...row, role: "owner" };
}

export async function getWorkspaceForUser(
  userId: string,
  workspaceId?: string | null,
): Promise<WorkspaceRecord> {
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId)
    throw new Error("A database-backed workspace requires a UUID user id.");
  await ensureMarketSchema();

  if (!workspaceId) return getOrCreatePersonalWorkspace(dbUserId);
  const dbWorkspaceId = normalizeUuid(workspaceId);
  if (!dbWorkspaceId) throw new Error("Invalid workspace id.");

  const rows = await getSql()`
    select w.id, w.name, w.slug, w.kind, m.role
    from bloom_workspaces w
    join bloom_workspace_members m on m.workspace_id = w.id
    where w.id = ${dbWorkspaceId} and m.user_id = ${dbUserId}
    limit 1
  `;
  const row = rows[0] as WorkspaceRecord | undefined;
  if (!row) throw new Error("Workspace not found or access denied.");
  return row;
}

export async function listWorkspacesForUser(
  userId: string,
): Promise<WorkspaceRecord[]> {
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId)
    throw new Error("A database-backed workspace requires a UUID user id.");
  await ensureMarketSchema();
  const rows = await getSql()`
    select w.id, w.name, w.slug, w.kind, m.role
    from bloom_workspaces w
    join bloom_workspace_members m on m.workspace_id = w.id
    where m.user_id = ${dbUserId}
    order by case when w.kind = 'personal' then 0 else 1 end, lower(w.name), w.created_at
  `;
  return rows as unknown as WorkspaceRecord[];
}

export async function createTeamWorkspace(input: {
  userId: string;
  name: string;
}): Promise<WorkspaceRecord> {
  const dbUserId = normalizeUuid(input.userId);
  if (!dbUserId)
    throw new Error("A database-backed workspace requires a UUID user id.");
  await ensureMarketSchema();
  const name = normalizeWorkspaceName(input.name);
  const slug = workspaceSlug(name);
  const sql = getSql();
  const rows = await sql.begin(async (transaction) => {
    const created = await transaction`
      insert into bloom_workspaces (owner_user_id, name, slug, kind)
      values (${dbUserId}, ${name}, ${slug}, 'team')
      returning id, name, slug, kind
    `;
    const row = created[0] as
      { id: string; name: string; slug: string; kind: "team" } | undefined;
    if (!row) throw new Error("Team workspace could not be created.");
    await transaction`
      insert into bloom_workspace_members (workspace_id, user_id, role)
      values (${row.id}, ${dbUserId}, 'owner')
    `;
    return row;
  });
  const row = rows as unknown as {
    id: string;
    name: string;
    slug: string;
    kind: "team";
  };
  await recordAuditEvent({
    actorUserId: dbUserId,
    eventType: "workspace.created",
    targetType: "workspace",
    targetId: row.id,
  });
  return { ...row, role: "owner" };
}

export async function listWorkspaceMembers(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMemberRecord[]> {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  const rows = await getSql()`
    select u.id as user_id, u.email, u.name, m.role, m.created_at
    from bloom_workspace_members m
    join bloom_users u on u.id = m.user_id
    where m.workspace_id = ${workspace.id}
    order by case when m.role = 'owner' then 0 when m.role = 'editor' then 1 else 2 end, lower(u.email)
  `;
  return (
    rows as unknown as Array<{
      user_id: string;
      email: string;
      name: string | null;
      role: string;
      created_at: Date | string;
    }>
  ).map((row) => ({
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role as WorkspaceRole,
    createdAt: toIsoStringOrNull(row.created_at)!,
  }));
}

function workspaceAgentFromRow(row: {
  id: string;
  workspace_id: string;
  provider: string;
  display_name: string;
  status: string;
  created_at: Date | string;
  revoked_at: Date | string | null;
  paired_at: Date | string | null;
  last_seen_at: Date | string | null;
}): WorkspaceAgentRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider as WorkspaceAgentProvider,
    displayName: row.display_name,
    status: row.status as WorkspaceAgentStatus,
    createdAt: toIsoStringOrNull(row.created_at)!,
    revokedAt: toIsoStringOrNull(row.revoked_at),
    pairedAt: toIsoStringOrNull(row.paired_at),
    lastSeenAt: toIsoStringOrNull(row.last_seen_at),
  };
}

export async function listWorkspaceAgents(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAgentRecord[]> {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  const rows = await getSql()`
    select id, workspace_id, provider, display_name, status, created_at, revoked_at, paired_at, last_seen_at
    from bloom_workspace_agents
    where workspace_id = ${workspace.id}
    order by case when status = 'active' then 0 else 1 end, created_at desc
  `;
  return (
    rows as unknown as Array<Parameters<typeof workspaceAgentFromRow>[0]>
  ).map(workspaceAgentFromRow);
}

export async function addWorkspaceAgent(input: {
  userId: string;
  workspaceId: string;
  provider: WorkspaceAgentProvider;
  displayName?: string;
}): Promise<WorkspaceAgentInvitation> {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can add agents.");
  if (input.provider !== "openclaw")
    throw new Error("Unsupported workspace agent provider.");
  const displayName = (input.displayName?.trim() || "OpenClaw").slice(0, 80);
  if (!displayName) throw new Error("Agent name is required.");
  const pairingCode = `bloom_pair_${randomBytes(24).toString("base64url")}`;
  const pairingExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const rows = await getSql()`
    insert into bloom_workspace_agents (workspace_id, provider, display_name, created_by, pairing_token_hash, pairing_expires_at)
    values (${workspace.id}, ${input.provider}, ${displayName}, ${input.userId}, ${hashAuthToken(pairingCode)}, ${pairingExpiresAt})
    returning id, workspace_id, provider, display_name, status, created_at, revoked_at, paired_at, last_seen_at
  `;
  const row = rows[0] as
    Parameters<typeof workspaceAgentFromRow>[0] | undefined;
  if (!row) throw new Error("Workspace agent could not be added.");
  const agent = workspaceAgentFromRow(row);
  await recordAuditEvent({
    actorUserId: input.userId,
    eventType: "workspace.agent.added",
    targetType: "workspace_agent",
    targetId: agent.id,
  });
  return { agent, pairingCode, pairingExpiresAt };
}

export async function revokeWorkspaceAgent(input: {
  userId: string;
  workspaceId: string;
  agentId: string;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can revoke agents.");
  const agentId = normalizeUuid(input.agentId);
  if (!agentId) throw new Error("Invalid workspace agent.");
  const rows = await getSql()`
    update bloom_workspace_agents
    set status = 'revoked', revoked_at = now()
    where id = ${agentId} and workspace_id = ${workspace.id} and status = 'active'
    returning id
  `;
  if (rows.length > 0)
    await recordAuditEvent({
      actorUserId: input.userId,
      eventType: "workspace.agent.revoked",
      targetType: "workspace_agent",
      targetId: agentId,
    });
  return rows.length > 0;
}

type AgentTaskRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  agent_name: string;
  submitted_by: string;
  document_id: string | null;
  filename: string | null;
  prompt: string;
  status: string;
  result_summary: string | null;
  failure_code: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
  source_version: number | string | null;
  source_markdown_hash: string | null;
  node_id: string | null;
  node_title: string | null;
  node_path: string | null;
};

type AgentProposalRow = {
  id: string;
  task_id: string;
  workspace_id: string;
  document_id: string;
  filename: string;
  before_version: number | string;
  before_markdown_hash: string;
  proposed_markdown: string;
  proposed_node_content: string | null;
  proposed_child_nodes?: unknown;
  node_id?: string | null;
  node_title?: string | null;
  context_markdown?: string | null;
  rationale: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  applied_at: Date | string | null;
  created_at: Date | string;
};

function agentProposalFromRow(row: AgentProposalRow): AgentProposalRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    documentId: row.document_id,
    filename: row.filename,
    beforeVersion: Number(row.before_version),
    beforeMarkdownHash: row.before_markdown_hash,
    proposedMarkdown: row.proposed_markdown,
    proposedNodeContent: row.proposed_node_content,
    proposedChildNodes: parseAgentChildNodeProposals(row.proposed_child_nodes),
    nodeId: row.node_id ?? null,
    sourceNodeTitle: row.node_title ?? null,
    sourceNodeContent: row.context_markdown ?? null,
    rationale: row.rationale,
    status: row.status as AgentProposalStatus,
    reviewedBy: row.reviewed_by,
    reviewedAt: toIsoStringOrNull(row.reviewed_at),
    appliedAt: toIsoStringOrNull(row.applied_at),
    createdAt: toIsoStringOrNull(row.created_at)!,
  };
}

function parseAgentChildNodeProposals(value: unknown): AgentChildNodeProposal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((child) => {
    if (!child || typeof child !== "object") return [];
    const candidate = child as { title?: unknown; content?: unknown; kind?: unknown };
    if (
      typeof candidate.title !== "string" || !candidate.title.trim() ||
      typeof candidate.content !== "string" ||
      (candidate.kind !== "task" && candidate.kind !== "decision")
    ) return [];
    return [{ title: candidate.title, content: candidate.content, kind: candidate.kind }];
  });
}

function agentTaskFromRow(
  row: AgentTaskRow,
  proposals: AgentProposalRecord[] = [],
): AgentTaskRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    submittedBy: row.submitted_by,
    documentId: row.document_id,
    filename: row.filename,
    prompt: row.prompt,
    status: row.status as AgentTaskStatus,
    resultSummary: row.result_summary,
    failureCode: row.failure_code,
    createdAt: toIsoStringOrNull(row.created_at)!,
    completedAt: toIsoStringOrNull(row.completed_at),
    sourceVersion:
      row.source_version == null ? null : Number(row.source_version),
    sourceMarkdownHash: row.source_markdown_hash,
    nodeId: row.node_id,
    nodeTitle: row.node_title,
    nodePath: row.node_path,
    proposals,
  };
}

export async function createWorkspaceAgentTask(input: {
  userId: string;
  workspaceId: string;
  agentId: string;
  documentId: string;
  filename: string;
  prompt: string;
  node?: { id: string; title: string; path: string; content: string };
}): Promise<AgentTaskRecord> {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role === "viewer")
    throw new Error("This workspace is read-only.");
  const agentId = normalizeUuid(input.agentId);
  const documentId = normalizeUuid(input.documentId);
  const prompt = input.prompt.trim();
  if (!agentId || !documentId) throw new Error("Invalid agent task target.");
  if (!prompt || prompt.length > 4000)
    throw new Error("Agent task must contain between 1 and 4000 characters.");
  const rows = await getSql()`
    insert into bloom_agent_tasks (workspace_id, agent_id, submitted_by, document_id, filename, prompt, node_id, node_title, node_path, context_markdown)
    select ${workspace.id}, a.id, ${input.userId}, ${documentId}, ${input.filename}, ${prompt}, ${input.node?.id ?? null}, ${input.node?.title ?? null}, ${input.node?.path ?? null}, ${input.node?.content ?? null}
    from bloom_workspace_agents a
    join bloom_documents d on d.id = ${documentId} and d.workspace_id = ${workspace.id} and d.deleted_at is null
    where a.id = ${agentId} and a.workspace_id = ${workspace.id} and a.status = 'active'
    returning id, workspace_id, agent_id,
      (select display_name from bloom_workspace_agents where id = agent_id) as agent_name,
      submitted_by, document_id, filename, prompt, status, result_summary, failure_code, created_at, completed_at,
      source_version, source_markdown_hash, node_id, node_title, node_path
  `;
  const row = rows[0] as AgentTaskRow | undefined;
  if (!row) throw new Error("Workspace agent or document not found.");
  const task = agentTaskFromRow(row);
  await recordAuditEvent({
    actorUserId: input.userId,
    eventType: "agent.task.created",
    targetType: "agent_task",
    targetId: task.id,
  });
  await emitWorkspaceAgentEvent({
    workspaceId: task.workspaceId,
    agentId: task.agentId,
    taskId: task.id,
    type: "task.queued",
  });
  return task;
}

export async function listWorkspaceAgentTasks(
  userId: string,
  workspaceId: string,
): Promise<AgentTaskRecord[]> {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  const sql = getSql();
  const tasks = (await sql`
    select t.id, t.workspace_id, t.agent_id, a.display_name as agent_name, t.submitted_by, t.document_id, t.filename,
      t.prompt, t.status, t.result_summary, t.failure_code, t.created_at, t.completed_at,
      t.source_version, t.source_markdown_hash, t.node_id, t.node_title, t.node_path
    from bloom_agent_tasks t
    join bloom_workspace_agents a on a.id = t.agent_id
    where t.workspace_id = ${workspace.id}
    order by t.created_at desc
    limit 50
  `) as unknown as AgentTaskRow[];
  if (tasks.length === 0) return [];
  const taskIds = tasks.map((task) => task.id);
  const proposals = (await sql`
    select id, task_id, workspace_id, document_id, filename, before_version, before_markdown_hash,
      proposed_markdown, proposed_node_content, proposed_child_nodes, rationale, status, reviewed_by, reviewed_at, applied_at, created_at
    from bloom_agent_proposals
    where task_id in ${sql(taskIds)}
    order by created_at asc
  `) as unknown as AgentProposalRow[];
  const proposalsByTask = new Map<string, AgentProposalRecord[]>();
  for (const proposal of proposals) {
    const list = proposalsByTask.get(proposal.task_id) ?? [];
    list.push(agentProposalFromRow(proposal));
    proposalsByTask.set(proposal.task_id, list);
  }
  return tasks.map((task) =>
    agentTaskFromRow(task, proposalsByTask.get(task.id) ?? []),
  );
}

export interface PairedWorkspaceAgent {
  id: string;
  workspaceId: string;
  displayName: string;
}

function normalizeAgentToken(value: string | null | undefined) {
  return value && /^bloom_agent_[A-Za-z0-9_-]{32,}$/.test(value) ? value : null;
}

export async function pairWorkspaceAgent(
  pairingCode: string,
): Promise<{ agent: PairedWorkspaceAgent; token: string }> {
  if (!/^bloom_pair_[A-Za-z0-9_-]{32,}$/.test(pairingCode))
    throw new Error("Invalid or expired pairing code.");
  await ensureMarketSchema();
  const token = `bloom_agent_${randomBytes(32).toString("base64url")}`;
  const rows =
    await getSql()`update bloom_workspace_agents set agent_token_hash = ${hashAuthToken(token)}, pairing_token_hash = null, pairing_expires_at = null, paired_at = now(), last_seen_at = now() where pairing_token_hash = ${hashAuthToken(pairingCode)} and pairing_expires_at > now() and status = 'active' and agent_token_hash is null returning id, workspace_id, display_name`;
  const row = rows[0] as
    { id: string; workspace_id: string; display_name: string } | undefined;
  if (!row) throw new Error("Invalid or expired pairing code.");
  const agent = {
    id: row.id,
    workspaceId: row.workspace_id,
    displayName: row.display_name,
  };
  await recordAuditEvent({
    actorAgentId: agent.id,
    eventType: "workspace.agent.paired",
    targetType: "workspace_agent",
    targetId: agent.id,
  });
  await emitWorkspaceAgentEvent({
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    type: "agent.presence",
  });
  return { agent, token };
}

export async function authenticateWorkspaceAgent(
  token: string,
): Promise<PairedWorkspaceAgent> {
  const normalizedToken = normalizeAgentToken(token);
  if (!normalizedToken) throw new Error("Invalid agent token.");
  await ensureMarketSchema();
  const rows =
    await getSql()`update bloom_workspace_agents set last_seen_at = now() where agent_token_hash = ${hashAuthToken(normalizedToken)} and status = 'active' and paired_at is not null returning id, workspace_id, display_name`;
  const row = rows[0] as
    { id: string; workspace_id: string; display_name: string } | undefined;
  if (!row) throw new Error("Invalid agent token.");
  const agent = {
    id: row.id,
    workspaceId: row.workspace_id,
    displayName: row.display_name,
  };
  await emitWorkspaceAgentEvent({
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    type: "agent.presence",
  });
  return agent;
}

/**
 * Used after an agent has subscribed to its event stream. Notifications are intentionally
 * ephemeral in Postgres, so this closes the small race between pairing and opening the SSE
 * connection without exposing task content through the stream.
 */
export async function hasQueuedWorkspaceAgentTask(
  agent: PairedWorkspaceAgent,
): Promise<boolean> {
  await ensureMarketSchema();
  const rows = await getSql()`
    select exists(
      select 1
      from bloom_agent_tasks
      where agent_id = ${agent.id}
        and workspace_id = ${agent.workspaceId}
        and status = 'queued'
    ) as queued
  `;
  return Boolean((rows[0] as { queued?: boolean } | undefined)?.queued);
}

export async function claimWorkspaceAgentTask(
  agent: PairedWorkspaceAgent,
): Promise<ClaimedWorkspaceAgentTask | null> {
  await ensureMarketSchema();
  const sql = getSql();
  const claimed = await sql.begin(async (transaction) => {
    const rows =
      await transaction`select t.id, t.workspace_id, w.name as workspace_name, t.prompt, t.node_id, t.node_title, t.node_path, t.context_markdown, d.filename, d.markdown, d.version from bloom_agent_tasks t join bloom_workspaces w on w.id = t.workspace_id join bloom_documents d on d.id = t.document_id and d.workspace_id = t.workspace_id and d.deleted_at is null where t.agent_id = ${agent.id} and t.workspace_id = ${agent.workspaceId} and t.status = 'queued' order by t.created_at asc for update of t skip locked limit 1`;
    const row = rows[0] as
      | {
          id: string;
          workspace_id: string;
          workspace_name: string;
          prompt: string;
          node_id: string | null;
          node_title: string | null;
          node_path: string | null;
          context_markdown: string | null;
          filename: string;
          markdown: string;
          version: number | string;
        }
      | undefined;
    if (!row) return null;
    const sourceVersion = Number(row.version);
    await transaction`update bloom_agent_tasks set status = 'running', source_version = ${sourceVersion}, source_markdown_hash = ${createHash("sha256").update(row.markdown).digest("hex")} where id = ${row.id}`;
    const node =
      row.node_id && row.node_title && row.node_path && row.context_markdown
        ? {
            id: row.node_id,
            title: row.node_title,
            path: row.node_path,
            content: row.context_markdown,
          }
        : undefined;
    return {
      id: row.id,
      workspace: { id: row.workspace_id, name: row.workspace_name },
      command: row.prompt,
      context: {
        filename: row.filename,
        markdown: node ? row.context_markdown! : row.markdown,
        version: sourceVersion,
        ...(node ? { node } : {}),
      },
    } satisfies ClaimedWorkspaceAgentTask;
  });
  if (claimed) {
    await recordAuditEvent({
      actorAgentId: agent.id,
      eventType: "agent.task.claimed",
      targetType: "agent_task",
      targetId: claimed.id,
    });
    await emitWorkspaceAgentEvent({
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      taskId: claimed.id,
      type: "task.running",
    });
  }
  return claimed;
}

export async function completeWorkspaceAgentTaskByAgent(input: {
  agent: PairedWorkspaceAgent;
  taskId: string;
  summary: string;
  proposal?: { markdown?: string; nodeContent?: string; childNodes?: AgentChildNodeProposal[]; rationale: string };
}) {
  const taskId = normalizeUuid(input.taskId);
  if (!taskId) throw new Error("Invalid agent task.");
  await ensureMarketSchema();
  const summary = input.summary.trim().slice(0, 4000);
  const proposal = input.proposal && {
    markdown: input.proposal.markdown?.trim() ?? "",
    nodeContent: input.proposal.nodeContent?.trim() ?? "",
    childNodes: input.proposal.childNodes ?? [],
    rationale: input.proposal.rationale.trim(),
  };
  if (
    proposal &&
    ((!proposal.markdown && !proposal.nodeContent && proposal.childNodes.length === 0) ||
      proposal.markdown.length > 256 * 1024 ||
      proposal.nodeContent.length > 64 * 1024 ||
      proposal.childNodes.length > 12 ||
      proposal.childNodes.some((child) =>
        !child.title.trim() || child.title.length > 240 || child.content.length > 64 * 1024 ||
        (child.kind !== "task" && child.kind !== "decision"),
      ) ||
      !proposal.rationale ||
      proposal.rationale.length > 4000)
  )
    throw new Error("Invalid agent proposal.");
  const sql = getSql();
  const result = await sql.begin(async (transaction) => {
    const rows =
      await transaction`select id, workspace_id, document_id, filename, node_id, source_version, source_markdown_hash from bloom_agent_tasks where id = ${taskId} and agent_id = ${input.agent.id} and workspace_id = ${input.agent.workspaceId} and status = 'running' for update`;
    const task = rows[0] as
      | {
          id: string;
          workspace_id: string;
          document_id: string | null;
          filename: string | null;
          node_id: string | null;
          source_version: number | string | null;
          source_markdown_hash: string | null;
        }
      | undefined;
    if (
      !task ||
      !task.document_id ||
      !task.filename ||
      task.source_version == null ||
      !task.source_markdown_hash
    )
      throw new Error("Agent task is not available.");
    let proposalId: string | null = null;
    if (proposal) {
      if ((proposal.nodeContent || proposal.childNodes.length > 0) && !task.node_id)
        throw new Error("Node proposal requires a node-scoped task.");
      const proposalRows =
        await transaction`insert into bloom_agent_proposals (task_id, workspace_id, document_id, filename, before_version, before_markdown_hash, proposed_markdown, proposed_node_content, proposed_child_nodes, rationale) values (${task.id}, ${task.workspace_id}, ${task.document_id}, ${task.filename}, ${Number(task.source_version)}, ${task.source_markdown_hash}, ${proposal.markdown}, ${proposal.nodeContent || null}, ${JSON.stringify(proposal.childNodes)}::jsonb, ${proposal.rationale}) returning id`;
      proposalId = (proposalRows[0] as { id: string } | undefined)?.id ?? null;
      if (!proposalId) throw new Error("Agent proposal could not be stored.");
    }
    await transaction`update bloom_agent_tasks set status = ${proposalId ? "proposed" : "completed"}, result_summary = ${summary || null}, completed_at = now() where id = ${task.id}`;
    return { proposalId };
  });
  await recordAuditEvent({
    actorAgentId: input.agent.id,
    eventType: "agent.task.completed",
    targetType: "agent_task",
    targetId: taskId,
  });
  await emitWorkspaceAgentEvent({
    workspaceId: input.agent.workspaceId,
    agentId: input.agent.id,
    taskId,
    type: result.proposalId ? "task.proposed" : "task.completed",
  });
  return result;
}

export async function failWorkspaceAgentTaskByAgent(input: {
  agent: PairedWorkspaceAgent;
  taskId: string;
  failureCode: string;
}) {
  const taskId = normalizeUuid(input.taskId);
  if (!taskId) throw new Error("Invalid agent task.");
  await ensureMarketSchema();
  const rows =
    await getSql()`update bloom_agent_tasks set status = 'failed', failure_code = ${input.failureCode.trim().slice(0, 100) || "AGENT_TASK_FAILED"}, completed_at = now() where id = ${taskId} and agent_id = ${input.agent.id} and workspace_id = ${input.agent.workspaceId} and status = 'running' returning id`;
  if (rows.length > 0) {
    await recordAuditEvent({
      actorAgentId: input.agent.id,
      eventType: "agent.task.failed",
      targetType: "agent_task",
      targetId: taskId,
    });
    await emitWorkspaceAgentEvent({
      workspaceId: input.agent.workspaceId,
      agentId: input.agent.id,
      taskId,
      type: "task.failed",
    });
  }
  return rows.length > 0;
}

export async function reviewWorkspaceAgentProposal(input: {
  userId: string;
  workspaceId: string;
  proposalId: string;
  action: "reject" | "mark_stale";
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role === "viewer")
    throw new Error("This workspace is read-only.");
  const proposalId = normalizeUuid(input.proposalId);
  if (!proposalId) throw new Error("Invalid agent proposal.");
  const status = input.action === "reject" ? "rejected" : "stale";
  const rows = await getSql()`
    update bloom_agent_proposals
    set status = ${status}, reviewed_by = ${input.userId}, reviewed_at = now()
    where id = ${proposalId} and workspace_id = ${workspace.id} and status = 'pending'
    returning id
  `;
  if (!rows[0]) throw new Error("Agent proposal is not available.");
  await recordAuditEvent({
    actorUserId: input.userId,
    eventType:
      input.action === "reject"
        ? "agent.proposal.rejected"
        : "agent.proposal.stale",
    targetType: "agent_proposal",
    targetId: proposalId,
  });
  await emitWorkspaceAgentEvent({
    workspaceId: workspace.id,
    taskId: proposalId,
    type: "proposal.reviewed",
  });
}

export async function getWorkspaceAgentProposalForApply(
  userId: string,
  workspaceId: string,
  proposalId: string,
) {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (workspace.role === "viewer")
    throw new Error("This workspace is read-only.");
  const id = normalizeUuid(proposalId);
  if (!id) throw new Error("Invalid agent proposal.");
  const rows = await getSql()`
    select p.id, p.task_id, p.workspace_id, p.document_id, p.filename, p.before_version, p.before_markdown_hash,
      p.proposed_markdown, p.proposed_node_content, p.proposed_child_nodes, p.rationale, p.status, p.reviewed_by, p.reviewed_at, p.applied_at, p.created_at,
      t.node_id, t.node_title, t.context_markdown
    from bloom_agent_proposals p
    join bloom_agent_tasks t on t.id = p.task_id
    where p.id = ${id} and p.workspace_id = ${workspace.id} and p.status = 'pending'
    limit 1
  `;
  const row = rows[0] as AgentProposalRow | undefined;
  if (!row) throw new Error("Agent proposal is not available.");
  return agentProposalFromRow(row);
}

export async function markWorkspaceAgentProposalApplied(input: {
  userId: string;
  workspaceId: string;
  proposalId: string;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  const proposalId = normalizeUuid(input.proposalId);
  if (!proposalId) throw new Error("Invalid agent proposal.");
  const rows = await getSql()`
    update bloom_agent_proposals
    set status = 'applied', reviewed_by = ${input.userId}, reviewed_at = now(), applied_at = now()
    where id = ${proposalId} and workspace_id = ${workspace.id} and status = 'pending'
    returning id
  `;
  if (!rows[0]) throw new Error("Agent proposal is not available.");
  await recordAuditEvent({
    actorUserId: input.userId,
    eventType: "agent.proposal.applied",
    targetType: "agent_proposal",
    targetId: proposalId,
  });
  await emitWorkspaceAgentEvent({
    workspaceId: workspace.id,
    taskId: proposalId,
    type: "proposal.reviewed",
  });
}

export async function listWorkspaceInvitations(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceInvitationRecord[]> {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can view invitations.");
  const rows = await getSql()`
    select id, workspace_id, email, role, expires_at, accepted_at, revoked_at, created_at
    from bloom_workspace_invitations
    where workspace_id = ${workspace.id}
    order by created_at desc
    limit 100
  `;
  return (
    rows as unknown as Array<Parameters<typeof workspaceInvitationFromRow>[0]>
  ).map(workspaceInvitationFromRow);
}

type WorkspaceInvitationPreviewRow = Parameters<
  typeof workspaceInvitationFromRow
>[0] & {
  workspace_name: string;
  inviter_name: string | null;
  inviter_email: string;
};

function workspaceInvitationPreviewFromRow(
  row: WorkspaceInvitationPreviewRow,
): WorkspaceInvitationPreview {
  return {
    ...workspaceInvitationFromRow(row),
    workspaceName: row.workspace_name,
    inviterName: row.inviter_name,
    inviterEmail: row.inviter_email,
  };
}

async function getWorkspaceInvitationPreviewBySelector(
  selector: { token: string } | { invitationId: string },
) {
  if (!isDatabaseConfigured()) return null;
  await ensureMarketSchema();
  const rows =
    "token" in selector
      ? await getSql()`
      select i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
        w.name as workspace_name, inviter.name as inviter_name, inviter.email as inviter_email
      from bloom_workspace_invitations i
      join bloom_workspaces w on w.id = i.workspace_id
      join bloom_users inviter on inviter.id = i.invited_by
      where i.token_hash = ${hashWorkspaceInvitationToken(selector.token)}
      limit 1
    `
      : await getSql()`
      select i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
        w.name as workspace_name, inviter.name as inviter_name, inviter.email as inviter_email
      from bloom_workspace_invitations i
      join bloom_workspaces w on w.id = i.workspace_id
      join bloom_users inviter on inviter.id = i.invited_by
      where i.id = ${selector.invitationId}
      limit 1
    `;
  const row = rows[0] as WorkspaceInvitationPreviewRow | undefined;
  return row ? workspaceInvitationPreviewFromRow(row) : null;
}

export async function getWorkspaceInvitationPreview(token: string) {
  if (!token || token.length > 160) return null;
  return getWorkspaceInvitationPreviewBySelector({ token });
}

export async function getWorkspaceInvitationPreviewById(invitationId: string) {
  const dbInvitationId = normalizeUuid(invitationId);
  if (!dbInvitationId) return null;
  return getWorkspaceInvitationPreviewBySelector({
    invitationId: dbInvitationId,
  });
}

export async function inviteWorkspaceMember(input: {
  userId: string;
  workspaceId: string;
  email: string;
  role?: WorkspaceRole;
  expiresInDays?: number;
}) {
  const dbUserId = normalizeUuid(input.userId);
  const dbWorkspaceId = normalizeUuid(input.workspaceId);
  if (!dbUserId || !dbWorkspaceId)
    throw new Error("Invalid workspace invitation target.");
  const workspace = await getWorkspaceForUser(dbUserId, dbWorkspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can invite members.");
  const email = normalizeWorkspaceEmail(input.email);
  const role = input.role ?? "editor";
  if (role !== "editor" && role !== "viewer")
    throw new Error("New invitations must use the editor or viewer role.");
  const inviter =
    await getSql()`select email from bloom_users where id = ${dbUserId} limit 1`;
  if (
    String(
      (inviter[0] as { email?: string } | undefined)?.email ?? "",
    ).toLowerCase() === email
  ) {
    throw new Error("You cannot invite yourself.");
  }
  const existingMember = await getSql()`
    select m.user_id
    from bloom_workspace_members m
    join bloom_users u on u.id = m.user_id
    where m.workspace_id = ${workspace.id} and lower(u.email) = ${email}
    limit 1
  `;
  if (existingMember.length > 0)
    throw new Error("This user is already a workspace member.");

  const token = `bloom_workspace_invite_${randomBytes(32).toString("base64url")}`;
  const expiresInDays = Math.max(
    1,
    Math.min(30, Math.floor(input.expiresInDays ?? 7)),
  );
  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sql = getSql();
  const rows = await sql.begin(async (transaction) => {
    await transaction`
      update bloom_workspace_invitations
      set revoked_at = now()
      where workspace_id = ${workspace.id}
        and lower(email) = ${email}
        and accepted_at is null
        and revoked_at is null
    `;
    return transaction`
      insert into bloom_workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
      values (${workspace.id}, ${email}, ${role}, ${hashWorkspaceInvitationToken(token)}, ${dbUserId}, ${expiresAt})
      returning id, workspace_id, email, role, expires_at, accepted_at, revoked_at, created_at
    `;
  });
  const row = rows[0] as
    Parameters<typeof workspaceInvitationFromRow>[0] | undefined;
  if (!row) throw new Error("Workspace invitation could not be created.");
  const invitation = workspaceInvitationFromRow(row);
  await recordAuditEvent({
    actorUserId: dbUserId,
    eventType: "workspace.invitation.created",
    targetType: "workspace_invitation",
    targetId: invitation.id,
  });
  return { invitation, token };
}

async function acceptWorkspaceInvitationBySelector(input: {
  userId: string;
  token?: string;
  invitationId?: string;
}) {
  const dbUserId = normalizeUuid(input.userId);
  const dbInvitationId = normalizeUuid(input.invitationId);
  if (
    !dbUserId ||
    (!input.token && !dbInvitationId) ||
    (input.token && input.token.length > 160)
  )
    throw new Error("Invalid workspace invitation.");
  await ensureMarketSchema();
  const sql = getSql();
  const result = await sql.begin(async (transaction) => {
    const invitationRows = dbInvitationId
      ? await transaction`
        select i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.created_at, u.email as account_email
        from bloom_workspace_invitations i
        join bloom_users u on u.id = ${dbUserId}
        where i.id = ${dbInvitationId}
        limit 1
        for update
      `
      : await transaction`
        select i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.created_at, u.email as account_email
        from bloom_workspace_invitations i
        join bloom_users u on u.id = ${dbUserId}
        where i.token_hash = ${hashWorkspaceInvitationToken(input.token!)}
        limit 1
        for update
      `;
    const row = invitationRows[0] as
      | (Parameters<typeof workspaceInvitationFromRow>[0] & {
          account_email: string;
        })
      | undefined;
    if (
      !row ||
      row.revoked_at ||
      row.accepted_at ||
      new Date(String(row.expires_at)).getTime() <= Date.now()
    )
      throw new Error("INVITATION_INVALID");
    if (row.email.toLowerCase() !== row.account_email.toLowerCase())
      throw new Error("INVITATION_EMAIL_MISMATCH");
    await transaction`
      insert into bloom_workspace_members (workspace_id, user_id, role)
      values (${row.workspace_id}, ${dbUserId}, ${row.role})
      on conflict (workspace_id, user_id) do update set role = excluded.role, updated_at = now()
    `;
    await transaction`
      update bloom_workspace_invitations
      set accepted_at = now()
      where id = ${row.id} and accepted_at is null and revoked_at is null
    `;
    return { workspaceId: row.workspace_id, invitationId: row.id };
  });
  await recordAuditEvent({
    actorUserId: dbUserId,
    eventType: "workspace.invitation.accepted",
    targetType: "workspace_invitation",
    targetId: result.invitationId,
  });
  return result;
}

export async function acceptWorkspaceInvitation(input: {
  userId: string;
  token: string;
}) {
  return acceptWorkspaceInvitationBySelector(input);
}

export async function acceptWorkspaceInvitationById(input: {
  userId: string;
  invitationId: string;
}) {
  return acceptWorkspaceInvitationBySelector(input);
}

export async function revokeWorkspaceInvitation(input: {
  userId: string;
  workspaceId: string;
  invitationId: string;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can revoke invitations.");
  const invitationId = normalizeUuid(input.invitationId);
  if (!invitationId) throw new Error("Invalid invitation id.");
  const rows = await getSql()`
    update bloom_workspace_invitations
    set revoked_at = now()
    where id = ${invitationId} and workspace_id = ${workspace.id} and accepted_at is null and revoked_at is null
    returning id
  `;
  if (rows.length > 0)
    await recordAuditEvent({
      actorUserId: input.userId,
      eventType: "workspace.invitation.revoked",
      targetType: "workspace_invitation",
      targetId: invitationId,
    });
  return rows.length > 0;
}

export async function changeWorkspaceMemberRole(input: {
  userId: string;
  workspaceId: string;
  memberUserId: string;
  role: WorkspaceRole;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can change member roles.");
  const memberUserId = normalizeUuid(input.memberUserId);
  if (!memberUserId || !["owner", "editor", "viewer"].includes(input.role))
    throw new Error("Invalid member role.");
  const sql = getSql();
  await sql.begin(async (transaction) => {
    const currentRows =
      await transaction`select role from bloom_workspace_members where workspace_id = ${workspace.id} and user_id = ${memberUserId} for update`;
    const currentRole = (currentRows[0] as { role?: string } | undefined)?.role;
    if (!currentRole) throw new Error("Workspace member not found.");
    if (currentRole === "owner" && input.role !== "owner") {
      const owners =
        await transaction`select user_id from bloom_workspace_members where workspace_id = ${workspace.id} and role = 'owner' for update`;
      if (owners.length <= 1) throw new Error("LAST_OWNER");
    }
    await transaction`
      update bloom_workspace_members
      set role = ${input.role}, updated_at = now()
      where workspace_id = ${workspace.id} and user_id = ${memberUserId}
    `;
  });
  await recordAuditEvent({
    actorUserId: input.userId,
    eventType: "workspace.member.role_changed",
    targetType: "workspace_member",
    targetId: memberUserId,
  });
  return getWorkspaceForUser(memberUserId, workspace.id).catch(
    () => ({ ...workspace, role: input.role }) as WorkspaceRecord,
  );
}

export async function removeWorkspaceMember(input: {
  userId: string;
  workspaceId: string;
  memberUserId: string;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can remove members.");
  const memberUserId = normalizeUuid(input.memberUserId);
  if (!memberUserId || memberUserId === input.userId)
    throw new Error("Use leave workspace for your own membership.");
  const sql = getSql();
  const removed = await sql.begin(async (transaction) => {
    const ownerRows =
      await transaction`select role from bloom_workspace_members where workspace_id = ${workspace.id} and user_id = ${memberUserId} for update`;
    const targetRole = (ownerRows[0] as { role?: string } | undefined)?.role;
    if (!targetRole) throw new Error("Workspace member not found.");
    if (targetRole === "owner") {
      const owners =
        await transaction`select user_id from bloom_workspace_members where workspace_id = ${workspace.id} and role = 'owner' for update`;
      if (owners.length <= 1) throw new Error("LAST_OWNER");
    }
    const rows =
      await transaction`delete from bloom_workspace_members where workspace_id = ${workspace.id} and user_id = ${memberUserId} returning user_id`;
    if (rows.length > 0) {
      await transaction`update bloom_workspace_invitations set revoked_at = now() where workspace_id = ${workspace.id} and lower(email) = lower((select email from bloom_users where id = ${memberUserId})) and accepted_at is null and revoked_at is null`;
    }
    return rows.length > 0;
  });
  if (removed)
    await recordAuditEvent({
      actorUserId: input.userId,
      eventType: "workspace.member.removed",
      targetType: "workspace_member",
      targetId: memberUserId,
    });
  return removed;
}

export async function leaveWorkspace(input: {
  userId: string;
  workspaceId: string;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.kind === "personal")
    throw new Error("Personal workspaces cannot be left.");
  const sql = getSql();
  const left = await sql.begin(async (transaction) => {
    const memberRows =
      await transaction`select role from bloom_workspace_members where workspace_id = ${workspace.id} and user_id = ${input.userId} for update`;
    if (memberRows.length === 0) throw new Error("Workspace member not found.");
    if (workspace.role === "owner") {
      const owners =
        await transaction`select user_id from bloom_workspace_members where workspace_id = ${workspace.id} and role = 'owner' for update`;
      if (owners.length <= 1) throw new Error("LAST_OWNER");
    }
    const rows =
      await transaction`delete from bloom_workspace_members where workspace_id = ${workspace.id} and user_id = ${input.userId} returning user_id`;
    return rows.length > 0;
  });
  if (left)
    await recordAuditEvent({
      actorUserId: input.userId,
      eventType: "workspace.member.left",
      targetType: "workspace_member",
      targetId: input.userId,
    });
  return left;
}

export async function renameWorkspace(input: {
  userId: string;
  workspaceId?: string | null;
  name: string;
}): Promise<WorkspaceRecord> {
  const dbUserId = normalizeUuid(input.userId);
  if (!dbUserId)
    throw new Error("A database-backed workspace requires a UUID user id.");
  const workspace = await getWorkspaceForUser(dbUserId, input.workspaceId);
  if (workspace.role !== "owner")
    throw new Error("Only workspace owners can rename a workspace.");

  const name = normalizeWorkspaceName(input.name);
  const rows = await getSql()`
    update bloom_workspaces
    set name = ${name}, updated_at = now()
    where id = ${workspace.id}
    returning id, name, slug, kind
  `;
  const row = rows[0] as
    | { id: string; name: string; slug: string; kind: "personal" | "team" }
    | undefined;
  if (!row) throw new Error("Workspace not found or access denied.");
  return { ...row, role: workspace.role };
}

export async function listCloudDocuments(
  userId: string,
  workspaceId?: string | null,
) {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  const rows = await getSql()`
    select id, workspace_id, filename, frontmatter, version, updated_at
    from bloom_documents
    where workspace_id = ${workspace.id} and deleted_at is null
    order by updated_at desc, lower(filename)
  `;
  return {
    workspace,
    documents: rows.map((row) => {
      const item = row as {
        id: string;
        workspace_id: string;
        filename: string;
        frontmatter: Record<string, unknown>;
        version: string | number;
        updated_at: string;
      };
      return {
        id: item.id,
        workspaceId: item.workspace_id,
        filename: item.filename,
        frontmatter: item.frontmatter,
        version: Number(item.version),
        updatedAt: item.updated_at,
      };
    }),
  };
}

export async function readCloudDocument(
  userId: string,
  filename: string,
  workspaceId?: string | null,
): Promise<CloudDocumentRecord | null> {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  const rows = await getSql()`
    select id, workspace_id, filename, markdown, frontmatter, version, updated_at
    from bloom_documents
    where workspace_id = ${workspace.id}
      and lower(filename) = lower(${filename})
      and deleted_at is null
    limit 1
  `;
  const row = rows[0] as
    | {
        id: string;
        workspace_id: string;
        filename: string;
        markdown: string;
        frontmatter: Record<string, unknown>;
        version: string | number;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    filename: row.filename,
    markdown: row.markdown,
    frontmatter: row.frontmatter,
    version: Number(row.version),
    updatedAt: row.updated_at,
  };
}

/**
 * Verification-only database primitives used by `scripts/verify-database.ts`.
 * Runtime cloud document mutations must go through the Sync-Server command API;
 * these helpers are intentionally kept for isolated migration/release checks and
 * are not used by the web request paths.
 */
export async function writeCloudDocument(input: {
  userId: string;
  workspaceId?: string | null;
  filename: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  expectedVersion?: number | null;
}): Promise<CloudDocumentRecord> {
  const dbUserId = normalizeUuid(input.userId);
  if (!dbUserId)
    throw new Error("A database-backed workspace requires a UUID user id.");
  const workspace = await getWorkspaceForUser(dbUserId, input.workspaceId);
  if (workspace.role === "viewer")
    throw new Error("This workspace is read-only.");

  let rows;
  if (input.expectedVersion != null) {
    rows = await getSql()`
      update bloom_documents
      set markdown = ${input.markdown},
          frontmatter = ${JSON.stringify(input.frontmatter)}::jsonb,
          version = version + 1,
          updated_by = ${dbUserId},
          updated_at = now(),
          sync_persistence_operation_id = null,
          sync_persistence_base_version = null
      where workspace_id = ${workspace.id}
        and lower(filename) = lower(${input.filename})
        and deleted_at is null
        and version = ${input.expectedVersion}
      returning id, workspace_id, filename, markdown, frontmatter, version, updated_at
    `;
    if (rows.length === 0) throw new Error("VERSION_CONFLICT");
  } else {
    rows = await getSql()`
      insert into bloom_documents (workspace_id, filename, markdown, frontmatter, created_by, updated_by)
      values (${workspace.id}, ${input.filename}, ${input.markdown}, ${JSON.stringify(input.frontmatter)}::jsonb, ${dbUserId}, ${dbUserId})
      on conflict (workspace_id, lower(filename)) where deleted_at is null
      do update set
        markdown = excluded.markdown,
        frontmatter = excluded.frontmatter,
        version = bloom_documents.version + 1,
        updated_by = excluded.updated_by,
        updated_at = now(),
        sync_persistence_operation_id = null,
        sync_persistence_base_version = null
      returning id, workspace_id, filename, markdown, frontmatter, version, updated_at
    `;
  }

  const row = rows[0] as {
    id: string;
    workspace_id: string;
    filename: string;
    markdown: string;
    frontmatter: Record<string, unknown>;
    version: string | number;
    updated_at: string;
  };
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    filename: row.filename,
    markdown: row.markdown,
    frontmatter: row.frontmatter,
    version: Number(row.version),
    updatedAt: row.updated_at,
  };
}

export async function renameCloudDocument(input: {
  userId: string;
  workspaceId?: string | null;
  filename: string;
  newFilename: string;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  if (workspace.role === "viewer")
    throw new Error("This workspace is read-only.");
  const conflict = await getSql()`
    select 1
    from bloom_documents
    where workspace_id = ${workspace.id}
      and lower(filename) = lower(${input.newFilename})
      and lower(filename) <> lower(${input.filename})
      and deleted_at is null
    limit 1
  `;
  if (conflict.length > 0) throw new Error("DOCUMENT_NAME_CONFLICT");
  let rows: Array<{ id: string; filename: string; version: string | number }>;
  try {
    rows = await getSql()`
      update bloom_documents
      set filename = ${input.newFilename},
          updated_by = ${input.userId},
          updated_at = now(),
          version = version + 1,
          sync_persistence_operation_id = null,
          sync_persistence_base_version = null
      where workspace_id = ${workspace.id}
        and lower(filename) = lower(${input.filename})
        and deleted_at is null
      returning id, filename, version
    `;
  } catch (error: unknown) {
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (errorCode === "23505") throw new Error("DOCUMENT_NAME_CONFLICT");
    throw error;
  }
  if (!rows[0]) throw new Error("Document not found.");
  return rows[0] as { id: string; filename: string; version: string | number };
}

export async function deleteCloudDocument(
  userId: string,
  filename: string,
  workspaceId?: string | null,
) {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (workspace.role === "viewer")
    throw new Error("This workspace is read-only.");
  const rows = await getSql()`
    update bloom_documents
    set deleted_at = now(),
        updated_by = ${userId},
        updated_at = now(),
        version = version + 1,
        sync_persistence_operation_id = null,
        sync_persistence_base_version = null
    where workspace_id = ${workspace.id}
      and lower(filename) = lower(${filename})
      and deleted_at is null
    returning id
  `;
  return rows.length > 0;
}

export async function saveCloudDocumentView(input: {
  userId: string;
  workspaceId?: string | null;
  documentId: string;
  name: string;
  view: Record<string, unknown>;
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  const rows = await getSql()`
    insert into bloom_document_views (workspace_id, document_id, user_id, name, view)
    select ${workspace.id}, d.id, ${input.userId}, ${input.name}, ${JSON.stringify(input.view)}::jsonb
    from bloom_documents d
    where d.id = ${input.documentId} and d.workspace_id = ${workspace.id} and d.deleted_at is null
    on conflict (document_id, user_id, name)
    do update set view = excluded.view, updated_at = now()
    returning id, name, view, updated_at
  `;
  if (!rows[0]) throw new Error("Document not found or access denied.");
  return rows[0];
}

export async function listCloudDocumentViews(
  userId: string,
  documentId: string,
  workspaceId?: string | null,
) {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  return getSql()`
    select v.id, v.name, v.view, v.updated_at
    from bloom_document_views v
    join bloom_documents d on d.id = v.document_id and d.workspace_id = v.workspace_id
    where v.workspace_id = ${workspace.id}
      and v.user_id = ${userId}
      and v.document_id = ${documentId}
      and d.deleted_at is null
    order by v.updated_at desc
  `;
}

export interface MarketUserInput {
  provider: string;
  authUserId?: string | null;
  email: string;
  name?: string | null;
}

export interface MarketUser {
  id: string;
  email: string;
  stripeCustomerId: string | null;
}

export interface MarketAccount {
  user: MarketUser & {
    name: string | null;
    createdAt: string;
    emailVerifiedAt: string | null;
  };
  subscriptions: Array<{
    tier: string;
    status: string;
    mode: "payment" | "subscription";
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    updatedAt: string;
    stripeSubscriptionId: string | null;
  }>;
  entitlements: Array<{
    feature: string;
    active: boolean;
    expiresAt: string | null;
  }>;
}

export async function upsertMarketUser(
  input: MarketUserInput,
): Promise<MarketUser | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureMarketSchema();

  const sql = getSql();
  const normalizedEmail = input.email.trim().toLowerCase();
  const result = await sql`
    insert into bloom_users (auth_provider, auth_user_id, email, name)
    values (${input.provider}, ${input.authUserId ?? null}, ${normalizedEmail}, ${input.name ?? null})
    on conflict ((lower(email)))
    do update set
      auth_user_id = coalesce(bloom_users.auth_user_id, excluded.auth_user_id),
      name = coalesce(excluded.name, bloom_users.name),
      updated_at = now()
    returning id, email, stripe_customer_id
  `;

  const row = result[0] as
    | { id: string; email: string; stripe_customer_id: string | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    stripeCustomerId: row.stripe_customer_id,
  };
}

export async function updateStripeCustomer(
  userId: string,
  stripeCustomerId: string,
) {
  if (!isDatabaseConfigured()) return;
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId) return;

  await ensureMarketSchema();
  await getSql()`
    update bloom_users
    set stripe_customer_id = ${stripeCustomerId}, updated_at = now()
    where id = ${dbUserId}
  `;
}

export async function getMarketAccountByEmail(
  email: string,
): Promise<MarketAccount | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureMarketSchema();

  const normalizedEmail = email.trim().toLowerCase();
  const userRows = await getSql()`
    select id, email, name, stripe_customer_id, created_at, email_verified_at
    from bloom_users
    where lower(email) = ${normalizedEmail}
    limit 1
  `;
  const userRow = userRows[0] as
    | {
        id: string;
        email: string;
        name: string | null;
        stripe_customer_id: string | null;
        created_at: string;
        email_verified_at: string | null;
      }
    | undefined;
  if (!userRow) return null;

  const subscriptionRows = await getSql()`
    select tier, status, mode, current_period_end, cancel_at_period_end, updated_at, stripe_subscription_id
    from bloom_subscriptions
    where user_id = ${userRow.id}
    order by updated_at desc
    limit 10
  `;
  const entitlementRows = await getSql()`
    select feature, active, expires_at
    from bloom_entitlements
    where user_id = ${userRow.id}
    order by updated_at desc
  `;

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      stripeCustomerId: userRow.stripe_customer_id,
      createdAt: userRow.created_at,
      emailVerifiedAt: userRow.email_verified_at,
    },
    subscriptions: subscriptionRows.map((row) => {
      const subscription = row as {
        tier: string;
        status: string;
        mode: "payment" | "subscription";
        current_period_end: string | null;
        cancel_at_period_end: boolean;
        updated_at: string;
        stripe_subscription_id: string | null;
      };
      return {
        tier: subscription.tier,
        status: subscription.status,
        mode: subscription.mode,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: subscription.updated_at,
        stripeSubscriptionId: subscription.stripe_subscription_id,
      };
    }),
    entitlements: entitlementRows.map((row) => {
      const entitlement = row as {
        feature: string;
        active: boolean;
        expires_at: string | null;
      };
      return {
        feature: entitlement.feature,
        active: entitlement.active,
        expiresAt: entitlement.expires_at,
      };
    }),
  };
}

export interface PasswordUser {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
}

export type BetaInviteStatus =
  "none" | "invited" | "accepted" | "revoked" | "expired";

export interface BetaInvite {
  email: string;
  status: BetaInviteStatus;
  source: string;
  note: string | null;
  batchId: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface BetaInviteCreateResult {
  invite: BetaInvite;
  shouldSendEmail: boolean;
}

function toIsoStringOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function betaInviteFromRow(row: {
  email: string;
  status: string;
  source: string;
  note: string | null;
  batch_id: string | null;
  invited_at: Date | string;
  accepted_at: Date | string | null;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
}): BetaInvite {
  return {
    email: row.email,
    status: row.status as BetaInviteStatus,
    source: row.source,
    note: row.note,
    batchId: row.batch_id,
    invitedAt: toIsoStringOrNull(row.invited_at)!,
    acceptedAt: toIsoStringOrNull(row.accepted_at),
    expiresAt: toIsoStringOrNull(row.expires_at),
    revokedAt: toIsoStringOrNull(row.revoked_at),
  };
}

export async function createBetaInvite(input: {
  email: string;
  source?: string | null;
  note?: string | null;
  batchId?: string | null;
  expiresAt?: string | null;
}): Promise<BetaInviteCreateResult> {
  if (!isDatabaseConfigured())
    throw new Error("DATABASE_URL ist nicht konfiguriert.");
  await ensureMarketSchema();

  const normalizedEmail = input.email.trim().toLowerCase();
  const source = String(input.source || "manual").slice(0, 64);
  const rows = await getSql()`
    insert into bloom_beta_invites (email, status, source, note, batch_id, expires_at)
    values (${normalizedEmail}, 'invited', ${source}, ${input.note ?? null}, ${input.batchId ?? null}, ${input.expiresAt ?? null})
    on conflict ((lower(email))) do update
      set
        status = 'invited',
        source = excluded.source,
        note = excluded.note,
        batch_id = excluded.batch_id,
        invited_at = now(),
        accepted_at = null,
        expires_at = excluded.expires_at,
        revoked_at = null,
        updated_at = now()
      where
        bloom_beta_invites.revoked_at is not null
        or bloom_beta_invites.status = 'revoked'
        or (
          bloom_beta_invites.accepted_at is null
          and bloom_beta_invites.status <> 'accepted'
          and bloom_beta_invites.expires_at is not null
          and bloom_beta_invites.expires_at <= now()
        )
    returning
      email,
      case
        when revoked_at is not null or status = 'revoked' then 'revoked'
        when accepted_at is not null or status = 'accepted' then 'accepted'
        when expires_at is not null and expires_at <= now() then 'expired'
        else 'invited'
      end as status,
      source,
      note,
      batch_id,
      invited_at,
      accepted_at,
      expires_at,
      revoked_at,
      true as should_send_email
  `;
  if (rows[0]) {
    const row = rows[0] as Parameters<typeof betaInviteFromRow>[0] & {
      should_send_email: boolean;
    };
    return {
      invite: betaInviteFromRow(row),
      shouldSendEmail: row.should_send_email,
    };
  }

  const existingRows = await getSql()`
    select
      email,
      case
        when revoked_at is not null or status = 'revoked' then 'revoked'
        when accepted_at is not null or status = 'accepted' then 'accepted'
        when expires_at is not null and expires_at <= now() then 'expired'
        else 'invited'
      end as status,
      source,
      note,
      batch_id,
      invited_at,
      accepted_at,
      expires_at,
      revoked_at
    from bloom_beta_invites
    where lower(email) = ${normalizedEmail}
    limit 1
  `;
  return {
    invite: betaInviteFromRow(
      existingRows[0] as Parameters<typeof betaInviteFromRow>[0],
    ),
    shouldSendEmail: false,
  };
}

export async function listBetaInviteStatuses(emails: string[]) {
  if (!isDatabaseConfigured() || emails.length === 0)
    return new Map<string, BetaInviteStatus>();
  await ensureMarketSchema();

  const normalizedEmails = [
    ...new Set(
      emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const rows = await getSql()`
    select
      email,
      case
        when revoked_at is not null or status = 'revoked' then 'revoked'
        when accepted_at is not null or status = 'accepted' then 'accepted'
        when expires_at is not null and expires_at <= now() then 'expired'
        else 'invited'
      end as status
    from bloom_beta_invites
    where lower(email) = any(${normalizedEmails})
  `;
  return new Map(
    (rows as unknown as Array<{ email: string; status: BetaInviteStatus }>).map(
      (row) => [row.email.toLowerCase(), row.status],
    ),
  );
}

export async function hasActiveBetaInvite(email: string) {
  if (!isDatabaseConfigured()) return false;
  await ensureMarketSchema();

  const rows = await getSql()`
    select id
    from bloom_beta_invites
    where lower(email) = lower(${email.trim()})
      and status = 'invited'
      and accepted_at is null
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  `;
  return rows.length > 0;
}

export async function acceptBetaInvite(email: string) {
  if (!isDatabaseConfigured()) return false;
  await ensureMarketSchema();

  const rows = await getSql()`
    update bloom_beta_invites
    set status = 'accepted', accepted_at = coalesce(accepted_at, now()), updated_at = now()
    where lower(email) = lower(${email.trim()})
      and status = 'invited'
      and accepted_at is null
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    returning id
  `;
  return rows.length > 0;
}

export interface FeedbackAttachmentInput {
  id: string;
  kind: FeedbackAttachmentKind;
  filename: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  retentionExpiresAt?: string | null;
}

export interface FeedbackRecord {
  id: string;
  userId: string | null;
  userEmail: string;
  type: FeedbackType;
  area: FeedbackArea;
  message: string;
  route: string | null;
  userAgent: string | null;
  appVersion: string | null;
  status: "received" | "reported" | "failed";
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  githubProjectItemId: string | null;
  createdAt: string;
}

function feedbackFromRow(row: {
  id: string;
  user_id: string | null;
  user_email: string;
  type: string;
  area: string;
  message: string;
  route: string | null;
  user_agent: string | null;
  app_version: string | null;
  status: "received" | "reported" | "failed";
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_project_item_id: string | null;
  created_at: Date | string;
}): FeedbackRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    type: row.type as FeedbackType,
    area: row.area as FeedbackArea,
    message: row.message,
    route: row.route,
    userAgent: row.user_agent,
    appVersion: row.app_version,
    status: row.status,
    githubIssueNumber: row.github_issue_number,
    githubIssueUrl: row.github_issue_url,
    githubProjectItemId: row.github_project_item_id,
    createdAt: toIsoStringOrNull(row.created_at)!,
  };
}

export async function createFeedbackRecord(input: {
  userId?: string | null;
  userEmail: string;
  type: FeedbackType;
  area: FeedbackArea;
  message: string;
  route?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
}): Promise<FeedbackRecord> {
  if (!isDatabaseConfigured())
    throw new Error("DATABASE_URL ist nicht konfiguriert.");
  const dbUserId = normalizeUuid(input.userId);
  await ensureMarketSchema();

  const rows = await getSql()`
    insert into bloom_feedback (user_id, user_email, type, area, message, route, user_agent, app_version)
    values (
      ${dbUserId},
      ${input.userEmail.trim().toLowerCase()},
      ${input.type},
      ${input.area},
      ${input.message},
      ${input.route ?? null},
      ${input.userAgent ?? null},
      ${input.appVersion ?? null}
    )
    returning id, user_id, user_email, type, area, message, route, user_agent, app_version, status,
      github_issue_number, github_issue_url, github_project_item_id, created_at
  `;
  const row = rows[0] as Parameters<typeof feedbackFromRow>[0] | undefined;
  if (!row) throw new Error("Feedback could not be created.");
  return feedbackFromRow(row);
}

export async function addFeedbackAttachments(
  feedbackId: string,
  attachments: FeedbackAttachmentInput[],
) {
  const dbFeedbackId = normalizeUuid(feedbackId);
  if (!dbFeedbackId) throw new Error("Invalid feedback id.");
  if (attachments.length === 0) return [];
  await ensureMarketSchema();

  const inserted = [];
  for (const attachment of attachments) {
    const rows = await getSql()`
      insert into bloom_feedback_attachments (
        id,
        feedback_id,
        kind,
        filename,
        object_key,
        mime_type,
        size_bytes,
        sha256,
        retention_expires_at
      )
      values (
        ${attachment.id},
        ${dbFeedbackId},
        ${attachment.kind},
        ${attachment.filename},
        ${attachment.objectKey},
        ${attachment.mimeType},
        ${attachment.sizeBytes},
        ${attachment.sha256},
        ${attachment.retentionExpiresAt ?? null}
      )
      returning id, kind, filename, object_key, mime_type, size_bytes, sha256, retention_expires_at, created_at
    `;
    inserted.push(rows[0]);
  }
  return inserted;
}

export async function markFeedbackReported(input: {
  feedbackId: string;
  githubIssueNumber: number;
  githubIssueUrl: string;
  githubProjectItemId?: string | null;
}) {
  const dbFeedbackId = normalizeUuid(input.feedbackId);
  if (!dbFeedbackId) throw new Error("Invalid feedback id.");
  await ensureMarketSchema();
  await getSql()`
    update bloom_feedback
    set status = 'reported',
        github_issue_number = ${input.githubIssueNumber},
        github_issue_url = ${input.githubIssueUrl},
        github_project_item_id = ${input.githubProjectItemId ?? null},
        updated_at = now()
    where id = ${dbFeedbackId}
  `;
}

export async function markFeedbackFailed(feedbackId: string) {
  const dbFeedbackId = normalizeUuid(feedbackId);
  if (!dbFeedbackId) return;
  await ensureMarketSchema();
  await getSql()`
    update bloom_feedback
    set status = 'failed', updated_at = now()
    where id = ${dbFeedbackId} and status <> 'reported'
  `;
}

export async function createPasswordUser(input: {
  email: string;
  name?: string | null;
  passwordHash: string;
}) {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL ist nicht konfiguriert.");
  }
  await ensureMarketSchema();

  const normalizedEmail = input.email.trim().toLowerCase();
  const rows = await getSql()`
    insert into bloom_users (auth_provider, auth_user_id, email, name, password_hash)
    values ('password', ${normalizedEmail}, ${normalizedEmail}, ${input.name ?? null}, ${input.passwordHash})
    on conflict ((lower(email))) do nothing
    returning id, email, name, password_hash, email_verified_at
  `;

  const row = rows[0] as
    | {
        id: string;
        email: string;
        name: string | null;
        password_hash: string | null;
        email_verified_at: string | null;
      }
    | undefined;
  if (!row?.password_hash) {
    throw new Error("Für diese E-Mail existiert bereits ein Account.");
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
  } satisfies PasswordUser;
}

function hashAuthToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type AccessTokenScope = "read" | "write";

export interface AccessTokenRecord {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  scope: AccessTokenScope;
  /** Null: every workspace the user can access. */
  workspaceIds: string[] | null;
  /** Set for tokens used by an AI agent; shown in the audit log. */
  agentName: string | null;
  /** Agent tokens: may create read-only share links. */
  allowShare: boolean;
  /** 'mobile_app': issued by the app sign-in instead of being created and pasted by hand. */
  client: AccessTokenClient | null;
}

export type AccessTokenClient = "mobile_app";

type AuditEventType =
  | "access_token.created"
  | "access_token.revoked"
  | "auth_token.consumed"
  | "auth_token.issued"
  | "email.verified"
  | "password.changed"
  | "session.created"
  | "session.revoked"
  | "session.revoked_all"
  | "workspace.created"
  | "workspace.invitation.created"
  | "workspace.invitation.accepted"
  | "workspace.invitation.revoked"
  | "workspace.member.role_changed"
  | "workspace.member.removed"
  | "workspace.member.left"
  | "shared_document.bound"
  | "shared_document.unbound"
  | "workspace.agent.added"
  | "workspace.agent.revoked"
  | "workspace.agent.paired"
  | "agent.task.created"
  | "agent.task.claimed"
  | "agent.task.completed"
  | "agent.task.failed"
  | "agent.proposal.rejected"
  | "agent.proposal.stale"
  | "agent.proposal.applied"
  | "agent.token.rights_changed"
  | "agent.token.proposal_approved"
  | "agent.token.proposal_rejected"
  | "agent.token.change_undone"
  | "document.agent_write"
  | "document.share_link.created"
  | "document.share_link.revoked"
  | "mobile_app.connected"
  | "mobile_app.disconnected"
  | "mobile_app.code_replayed";

async function recordAuditEvent(input: {
  actorUserId?: string;
  actorAgentId?: string;
  eventType: AuditEventType;
  targetType?:
    | "access_token"
    | "auth_token"
    | "session"
    | "workspace"
    | "workspace_invitation"
    | "workspace_member"
    | "document"
    | "workspace_agent"
    | "agent_task"
    | "agent_proposal"
    | "agent_token_proposal"
    | "share_link";
  targetId?: string | null;
  details?: Record<string, string>;
}) {
  const actorUserId = normalizeUuid(input.actorUserId);
  const actorAgentId = normalizeUuid(input.actorAgentId);
  const targetId = normalizeUuid(input.targetId);
  if (
    (!actorUserId && !actorAgentId) ||
    (actorUserId && actorAgentId) ||
    !isDatabaseConfigured()
  )
    return false;

  try {
    await ensureMarketSchema();
    const sql = getSql();
    // sql.json stores an object; JSON.stringify(...)::jsonb would store a JSON string instead.
    await sql`
      insert into bloom_audit_events (actor_user_id, actor_agent_id, event_type, target_type, target_id, details)
      values (${actorUserId}, ${actorAgentId}, ${input.eventType}, ${input.targetType ?? null}, ${targetId}, ${input.details ? sql.json(input.details) : null})
    `;
    return true;
  } catch {
    console.error("BloomMD security audit event could not be persisted.");
    return false;
  }
}

export interface ShareLinkRecord {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
}

const SHARE_TOKEN_PREFIX = "bloom_share_";

/** The workspace role of a user for a document, or null when they cannot see it. */
async function documentRole(userId: string, documentId: string) {
  const rows = await getSql()`
    select d.id, d.workspace_id, m.role
    from bloom_documents d
    join bloom_workspace_members m on m.workspace_id = d.workspace_id and m.user_id = ${userId}
    where d.id = ${documentId} and d.deleted_at is null
    limit 1
  `;
  return (rows[0] as { id: string; workspace_id: string; role: WorkspaceRole } | undefined) ?? null;
}

/** Creates a read-only link to one cloud map. Only owners and editors may share. */
export async function createShareLink(input: { userId: string; documentId: string; expiresInDays?: number | null; tokenId?: string | null; agentName?: string | null }) {
  const userId = normalizeUuid(input.userId);
  const documentId = normalizeUuid(input.documentId);
  if (!userId || !documentId || !isDatabaseConfigured()) throw new Error("Shared document not found.");
  await ensureMarketSchema();
  const role = await documentRole(userId, documentId);
  if (!role) throw new Error("Shared document not found.");
  if (role.role === "viewer") throw new Error("This workspace is read-only.");
  const days = input.expiresInDays == null ? 30 : Math.max(1, Math.min(365, Math.floor(input.expiresInDays)));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const token = `${SHARE_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const rows = await getSql()`
    insert into bloom_share_links (document_id, token_hash, created_by, expires_at)
    values (${documentId}, ${hashAuthToken(token)}, ${userId}, ${expiresAt})
    returning id, created_at, expires_at
  `;
  const row = rows[0] as { id: string; created_at: string; expires_at: string };
  await recordAuditEvent({ actorUserId: userId, eventType: "document.share_link.created", targetType: "share_link", targetId: row.id, details: { documentId, expiresAt: row.expires_at, ...(input.tokenId ? { tokenId: input.tokenId } : {}), ...(input.agentName ? { agent: input.agentName } : {}) } });
  return { token, id: row.id, createdAt: row.created_at, expiresAt: row.expires_at };
}

export async function listShareLinks(userId: string, documentId: string): Promise<ShareLinkRecord[]> {
  const user = normalizeUuid(userId);
  const document = normalizeUuid(documentId);
  if (!user || !document || !isDatabaseConfigured()) return [];
  await ensureMarketSchema();
  if (!(await documentRole(user, document))) return [];
  const rows = await getSql()`
    select id, created_at, expires_at, revoked_at, last_viewed_at
    from bloom_share_links where document_id = ${document}
    order by created_at desc
  `;
  return rows.map((value) => {
    const row = value as { id: string; created_at: string; expires_at: string; revoked_at: string | null; last_viewed_at: string | null };
    return { id: row.id, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, lastViewedAt: row.last_viewed_at };
  });
}

export async function revokeShareLink(userId: string, documentId: string, linkId: string): Promise<boolean> {
  const user = normalizeUuid(userId);
  const document = normalizeUuid(documentId);
  const link = normalizeUuid(linkId);
  if (!user || !document || !link || !isDatabaseConfigured()) return false;
  await ensureMarketSchema();
  const role = await documentRole(user, document);
  if (!role || role.role === "viewer") return false;
  const rows = await getSql()`
    update bloom_share_links set revoked_at = now()
    where id = ${link} and document_id = ${document} and revoked_at is null
    returning id
  `;
  if (rows.length === 0) return false;
  await recordAuditEvent({ actorUserId: user, eventType: "document.share_link.revoked", targetType: "share_link", targetId: link, details: { documentId: document } });
  return true;
}

/** The map behind a valid, unexpired, unrevoked share link; null otherwise. */
export async function resolveShareLink(token: string): Promise<{ filename: string; markdown: string; updatedAt: string; expiresAt: string } | null> {
  if (!token.startsWith(SHARE_TOKEN_PREFIX) || token.length > 128 || !isDatabaseConfigured()) return null;
  await ensureMarketSchema();
  const rows = await getSql()`
    update bloom_share_links s
    set last_viewed_at = case
      when s.last_viewed_at is null or s.last_viewed_at < now() - interval '5 minutes' then now()
      else s.last_viewed_at
    end
    from bloom_documents d
    where s.token_hash = ${hashAuthToken(token)}
      and s.document_id = d.id
      and d.deleted_at is null
      and s.revoked_at is null
      and s.expires_at > now()
      -- A link only lives as long as its creator may still edit the workspace.
      and exists (
        select 1 from bloom_workspace_members m
        where m.workspace_id = d.workspace_id and m.user_id = s.created_by and m.role <> 'viewer'
      )
    returning d.filename, d.markdown, d.updated_at, s.expires_at
  `;
  const row = rows[0] as { filename: string; markdown: string; updated_at: string; expires_at: string } | undefined;
  return row ? { filename: row.filename, markdown: row.markdown, updatedAt: row.updated_at, expiresAt: row.expires_at } : null;
}

/** Audit entry for a document an AI agent wrote with an agent access token. */
export async function recordAgentDocumentWrite(input: { userId: string; documentId: string; tokenId: string; agentName: string; workspaceId?: string | null; action?: "rename" | "delete" }) {
  return recordAuditEvent({
    actorUserId: input.userId,
    eventType: "document.agent_write",
    targetType: "document",
    targetId: input.documentId,
    details: { tokenId: input.tokenId, agent: input.agentName, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), ...(input.action ? { action: input.action } : {}) },
  });
}

/**

 * Records the explicit local-to-cloud binding decision without ever receiving a local path,
 * local Markdown, or an access token. The document must already belong to a workspace the
 * acting user can access.
 */
export async function recordSharedDocumentBindingAudit(input: {
  userId: string;
  workspaceId: string;
  documentId: string;
  action: "bound" | "unbound";
}) {
  const workspace = await getWorkspaceForUser(input.userId, input.workspaceId);
  const documentId = normalizeUuid(input.documentId);
  if (!documentId) throw new Error("Invalid shared document.");

  const rows = await getSql()`
    select id
    from bloom_documents
    where id = ${documentId} and workspace_id = ${workspace.id} and deleted_at is null
    limit 1
  `;
  if (!rows[0]) throw new Error("Shared document not found.");

  await recordAuditEvent({
    actorUserId: input.userId,
    eventType: input.action === "bound" ? "shared_document.bound" : "shared_document.unbound",
    targetType: "document",
    targetId: documentId,
  });
}

export async function createAccessToken(input: {
  userId: string;
  name: string;
  expiresInDays?: number | null;
  scope?: AccessTokenScope;
  workspaceIds?: string[] | null;
  agentName?: string | null;
  allowShare?: boolean;
  client?: AccessTokenClient | null;
}) {
  const userId = normalizeUuid(input.userId);
  if (!userId || !isDatabaseConfigured())
    throw new Error("Access tokens require a database-backed user.");
  await ensureMarketSchema();

  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("A token name is required.");
  const days =
    input.expiresInDays == null
      ? 90
      : Math.max(1, Math.min(365, Math.floor(input.expiresInDays)));
  const expiresAt = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const scope: AccessTokenScope = input.scope === "read" ? "read" : "write";
  const workspaceIds = input.workspaceIds?.length
    ? [...new Set(input.workspaceIds.map((id) => normalizeUuid(id)))]
    : null;
  if (workspaceIds?.some((id) => !id)) throw new Error("Invalid workspace id.");
  if (workspaceIds) {
    // A token can only be limited to workspaces its owner belongs to.
    const memberships = await getSql()`
      select workspace_id from bloom_workspace_members
      where user_id = ${userId} and workspace_id = any(${workspaceIds}::uuid[])
    `;
    if (memberships.length !== workspaceIds.length) throw new Error("Workspace not found or access denied.");
  }
  const agentName = input.agentName?.trim().slice(0, 60) || null;
  // Sharing publishes content outside BloomMD; a read-only token never gets it.
  const allowShare = Boolean(input.allowShare) && scope === "write";
  const client: AccessTokenClient | null = input.client === "mobile_app" ? "mobile_app" : null;
  const token = `bloom_pat_${randomBytes(32).toString("base64url")}`;
  const tokenHash = hashAuthToken(token);
  const rows = await getSql()`
    insert into bloom_access_tokens (user_id, name, token_hash, expires_at, scope, workspace_ids, agent_name, allow_share, client)
    values (${userId}, ${name}, ${tokenHash}, ${expiresAt}, ${scope}, ${workspaceIds}::uuid[], ${agentName}, ${allowShare}, ${client})
    returning id, name, created_at, expires_at
  `;
  const row = rows[0] as
    | { id: string; name: string; created_at: string; expires_at: string }
    | undefined;
  if (!row) throw new Error("Access token could not be created.");
  await recordAuditEvent({
    actorUserId: userId,
    eventType: "access_token.created",
    targetType: "access_token",
    targetId: row.id,
  });
  return {
    token,
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    scope,
    workspaceIds,
    agentName,
    allowShare,
    client,
  };
}

export async function resolveAccessToken(token: string) {
  if (
    !token.startsWith("bloom_pat_") ||
    token.length > 128 ||
    !isDatabaseConfigured()
  )
    return null;
  await ensureMarketSchema();
  const tokenHash = hashAuthToken(token);
  const rows = await getSql()`
    update bloom_access_tokens t
    set last_used_at = case
      when t.last_used_at is null or t.last_used_at < now() - interval '5 minutes' then now()
      else t.last_used_at
    end
    from bloom_users u
    where t.token_hash = ${tokenHash}
      and t.user_id = u.id
      and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now())
    returning t.id, t.user_id, u.email, u.name, t.scope, t.workspace_ids, t.agent_name, t.allow_share, t.client, t.expires_at
  `;
  const row = rows[0] as
    | { id: string; user_id: string; email: string; name: string | null; scope: string | null; workspace_ids: string[] | null; agent_name: string | null; allow_share: boolean | null; client: string | null; expires_at: string | null }
    | undefined;
  return row
    ? {
        tokenId: row.id,
        userId: row.user_id,
        email: row.email,
        name: row.name,
        scope: (row.scope === "read" ? "read" : "write") as AccessTokenScope,
        workspaceIds: row.workspace_ids?.length ? row.workspace_ids : null,
        agentName: row.agent_name,
        allowShare: Boolean(row.allow_share),
        client: (row.client === "mobile_app" ? "mobile_app" : null) as AccessTokenClient | null,
        expiresAt: row.expires_at,
      }
    : null;
}

export async function listAccessTokens(
  userId: string,
): Promise<AccessTokenRecord[]> {
  const id = normalizeUuid(userId);
  if (!id || !isDatabaseConfigured()) return [];
  await ensureMarketSchema();
  const rows = await getSql()`
    select id, name, created_at, expires_at, last_used_at, revoked_at, scope, workspace_ids, agent_name, allow_share, client
    from bloom_access_tokens
    where user_id = ${id}
    order by created_at desc
  `;
  return rows.map((value) => {
    const row = value as {
      id: string;
      name: string;
      created_at: string;
      expires_at: string | null;
      last_used_at: string | null;
      revoked_at: string | null;
      scope: string | null;
      workspace_ids: string[] | null;
      agent_name: string | null;
      allow_share: boolean | null;
      client: string | null;
    };
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      scope: row.scope === "read" ? "read" : "write",
      workspaceIds: row.workspace_ids?.length ? row.workspace_ids : null,
      agentName: row.agent_name,
      allowShare: Boolean(row.allow_share),
      client: row.client === "mobile_app" ? "mobile_app" : null,
    };
  });
}

export async function revokeAccessToken(userId: string, tokenId: string) {
  const id = normalizeUuid(userId);
  const accessTokenId = normalizeUuid(tokenId);
  if (!id || !accessTokenId || !isDatabaseConfigured()) return false;
  await ensureMarketSchema();
  const rows = await getSql()`
    update bloom_access_tokens set revoked_at = now()
    where id = ${accessTokenId} and user_id = ${id} and revoked_at is null
    returning id
  `;
  const revoked = rows.length > 0;
  if (revoked) {
    await recordAuditEvent({
      actorUserId: id,
      eventType: "access_token.revoked",
      targetType: "access_token",
      targetId: accessTokenId,
    });
  }
  return revoked;
}

export interface MobileAppSignIn {
  token: string;
  tokenId: string;
  expiresAt: string;
  deviceName: string;
  user: { id: string; email: string; name: string | null };
  workspaces: Array<{ id: string; name: string; kind: WorkspaceRecord["kind"]; role: WorkspaceRecord["role"] }>;
}

/**
 * Step 2 of the app sign-in: the signed-in user allowed the app. Returns the one-time code for the
 * `bloommd://auth` redirect; only its hash is stored. Challenge, state and device name must already
 * be validated (see lib/mobile-auth).
 */
export async function createMobileAuthCode(input: { userId: string; challenge: string; state: string; deviceName: string }) {
  const userId = normalizeUuid(input.userId);
  if (!userId || !isDatabaseConfigured()) throw new Error("The app sign-in requires a database-backed user.");
  await ensureMarketSchema();
  const code = `${MOBILE_AUTH_CODE_PREFIX}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + MOBILE_AUTH_CODE_TTL_MS).toISOString();
  await getSql()`
    with cleanup as (
      delete from bloom_mobile_auth_codes where expires_at < now() - interval '1 day'
    )
    insert into bloom_mobile_auth_codes (user_id, code_hash, code_challenge, state_hash, device_name, expires_at)
    values (${userId}, ${hashSecret(code)}, ${input.challenge}, ${hashSecret(input.state)}, ${input.deviceName}, ${expiresAt})
  `;
  return { code, expiresAt };
}

/**
 * Step 3 of the app sign-in: exchanges a one-time code for an app access token. The code is
 * consumed before anything else is checked, so a wrong verifier burns it (no guessing). A code
 * presented again after it was exchanged revokes the token issued for it, as OAuth recommends for
 * code replay. Returns null for every kind of failure; the caller answers with one generic error.
 */
export async function exchangeMobileAuthCode(input: { code: string; verifier: string; state: string }): Promise<MobileAppSignIn | null> {
  if (!isValidAuthCode(input.code) || !isDatabaseConfigured()) return null;
  await ensureMarketSchema();
  const sql = getSql();
  const codeHash = hashSecret(input.code);
  const consumed = await sql`
    update bloom_mobile_auth_codes
    set consumed_at = now()
    where code_hash = ${codeHash} and consumed_at is null and expires_at > now()
    returning id, user_id, code_challenge, state_hash, device_name
  `;
  const row = consumed[0] as { id: string; user_id: string; code_challenge: string; state_hash: string; device_name: string } | undefined;
  if (!row) {
    const replayed = await sql`
      select user_id, access_token_id from bloom_mobile_auth_codes
      where code_hash = ${codeHash} and consumed_at is not null and access_token_id is not null
    `;
    const replay = replayed[0] as { user_id: string; access_token_id: string } | undefined;
    if (replay) {
      await revokeAccessToken(replay.user_id, replay.access_token_id);
      await recordAuditEvent({ actorUserId: replay.user_id, eventType: "mobile_app.code_replayed", targetType: "access_token", targetId: replay.access_token_id });
    }
    return null;
  }
  if (!verifyPkce(input.verifier, row.code_challenge) || !verifyStateHash(input.state, row.state_hash)) return null;

  const users = await sql`select id, email, name from bloom_users where id = ${row.user_id}`;
  const user = users[0] as { id: string; email: string; name: string | null } | undefined;
  if (!user) return null;
  const created = await createAccessToken({
    userId: user.id,
    name: mobileTokenName(row.device_name),
    expiresInDays: MOBILE_TOKEN_DAYS,
    scope: "write",
    client: "mobile_app",
  });
  await sql`update bloom_mobile_auth_codes set access_token_id = ${created.id} where id = ${row.id}`;
  await recordAuditEvent({ actorUserId: user.id, eventType: "mobile_app.connected", targetType: "access_token", targetId: created.id, details: { device: row.device_name } });
  const workspaces = await listWorkspacesForUser(user.id);
  return {
    token: created.token,
    tokenId: created.id,
    expiresAt: created.expiresAt,
    deviceName: row.device_name,
    user,
    workspaces: workspaces.map(({ id, name, kind, role }) => ({ id, name, kind, role })),
  };
}

/** Sign-out from the app: the token revokes itself. */
export async function revokeMobileAppToken(userId: string, tokenId: string) {
  const id = normalizeUuid(userId);
  const accessTokenId = normalizeUuid(tokenId);
  if (!id || !accessTokenId || !isDatabaseConfigured()) return false;
  await ensureMarketSchema();
  const rows = await getSql()`
    update bloom_access_tokens set revoked_at = now()
    where id = ${accessTokenId} and user_id = ${id} and revoked_at is null
    returning name, client
  `;
  const row = rows[0] as { name: string; client: string | null } | undefined;
  if (!row) return false;
  await recordAuditEvent({ actorUserId: id, eventType: "access_token.revoked", targetType: "access_token", targetId: accessTokenId });
  if (row.client === "mobile_app") {
    await recordAuditEvent({ actorUserId: id, eventType: "mobile_app.disconnected", targetType: "access_token", targetId: accessTokenId });
  }
  return true;
}

export async function createAuthToken(input: {
  userId: string;
  email: string;
  purpose: "email_verification" | "password_reset";
  ttlMinutes: number;
}) {
  if (!isDatabaseConfigured()) return null;
  await ensureMarketSchema();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAuthToken(token);
  const expiresAt = new Date(
    Date.now() + input.ttlMinutes * 60 * 1000,
  ).toISOString();

  await getSql()`
    with cleanup as (
      delete from bloom_auth_tokens
      where expires_at < now() - interval '7 days'
         or (consumed_at is not null and consumed_at < now() - interval '7 days')
    ), invalidate_previous as (
      update bloom_auth_tokens
      set consumed_at = now()
      where user_id = ${input.userId}
        and purpose = ${input.purpose}
        and consumed_at is null
    )
    insert into bloom_auth_tokens (user_id, email, purpose, token_hash, expires_at)
    values (${input.userId}, ${input.email.trim().toLowerCase()}, ${input.purpose}, ${tokenHash}, ${expiresAt})
  `;

  await recordAuditEvent({
    actorUserId: input.userId,
    eventType: "auth_token.issued",
    targetType: "auth_token",
  });

  return { token, expiresAt };
}

export async function consumeAuthToken(input: {
  token: string;
  purpose: "email_verification" | "password_reset";
}) {
  if (!isDatabaseConfigured()) return null;
  await ensureMarketSchema();

  const tokenHash = hashAuthToken(input.token);
  const rows = await getSql()`
    update bloom_auth_tokens
    set consumed_at = now()
    where token_hash = ${tokenHash}
      and purpose = ${input.purpose}
      and consumed_at is null
      and expires_at > now()
    returning user_id, email
  `;
  const row = rows[0] as { user_id: string; email: string } | undefined;
  if (!row) return null;
  await recordAuditEvent({
    actorUserId: row.user_id,
    eventType: "auth_token.consumed",
    targetType: "auth_token",
  });
  return { userId: row.user_id, email: row.email };
}

export async function markEmailVerified(userId: string) {
  if (!isDatabaseConfigured()) return;
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId) return;
  await ensureMarketSchema();

  await getSql()`
    update bloom_users
    set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
    where id = ${dbUserId}
  `;
  await recordAuditEvent({
    actorUserId: dbUserId,
    eventType: "email.verified",
  });
}

export async function updatePasswordForEmail(input: {
  email: string;
  passwordHash: string;
}) {
  if (!isDatabaseConfigured()) return false;
  await ensureMarketSchema();

  const result = await getSql()`
    update bloom_users
    set password_hash = ${input.passwordHash}, updated_at = now()
    where lower(email) = ${input.email.trim().toLowerCase()}
    returning id
  `;
  const row = result[0] as { id: string } | undefined;
  if (row)
    await recordAuditEvent({
      actorUserId: row.id,
      eventType: "password.changed",
    });
  return Boolean(row);
}

export async function createSessionRecord(userId: string, expiresAt: string) {
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId || !isDatabaseConfigured()) return null;
  await ensureMarketSchema();

  const rows = await getSql()`
    insert into bloom_sessions (user_id, expires_at)
    values (${dbUserId}, ${expiresAt})
    returning id
  `;
  const sessionId = (rows[0] as { id: string } | undefined)?.id ?? null;
  if (sessionId) {
    await recordAuditEvent({
      actorUserId: dbUserId,
      eventType: "session.created",
      targetType: "session",
      targetId: sessionId,
    });
  }
  return sessionId;
}

export async function isSessionRecordActive(userId: string, sessionId: string) {
  const dbUserId = normalizeUuid(userId);
  const dbSessionId = normalizeUuid(sessionId);
  if (!dbUserId || !dbSessionId || !isDatabaseConfigured()) return false;
  await ensureMarketSchema();

  const rows = await getSql()`
    select 1
    from bloom_sessions
    where id = ${dbSessionId}
      and user_id = ${dbUserId}
      and revoked_at is null
      and expires_at > now()
    limit 1
  `;
  return rows.length > 0;
}

export async function revokeSessionRecord(userId: string, sessionId: string) {
  const dbUserId = normalizeUuid(userId);
  const dbSessionId = normalizeUuid(sessionId);
  if (!dbUserId || !dbSessionId || !isDatabaseConfigured()) return false;
  await ensureMarketSchema();

  const rows = await getSql()`
    update bloom_sessions
    set revoked_at = coalesce(revoked_at, now())
    where id = ${dbSessionId} and user_id = ${dbUserId}
    returning id
  `;
  const revoked = rows.length > 0;
  if (revoked) {
    await recordAuditEvent({
      actorUserId: dbUserId,
      eventType: "session.revoked",
      targetType: "session",
      targetId: dbSessionId,
    });
  }
  return revoked;
}

export async function revokeAllSessionRecords(userId: string) {
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId || !isDatabaseConfigured()) return 0;
  await ensureMarketSchema();

  const rows = await getSql()`
    update bloom_sessions
    set revoked_at = coalesce(revoked_at, now())
    where user_id = ${dbUserId} and revoked_at is null
    returning id
  `;
  if (rows.length > 0) {
    await recordAuditEvent({
      actorUserId: dbUserId,
      eventType: "session.revoked_all",
    });
  }
  return rows.length;
}

export async function consumeRateLimit(input: {
  action: string;
  keyHash: string;
  windowStartedAt: string;
  limit: number;
}) {
  if (!isDatabaseConfigured()) return null;
  await ensureMarketSchema();

  const rows = await getSql()`
    with cleanup as (
      delete from bloom_rate_limits
      where updated_at < now() - interval '7 days'
    )
    insert into bloom_rate_limits (action, key_hash, window_started_at, attempts)
    values (${input.action}, ${input.keyHash}, ${input.windowStartedAt}, 1)
    on conflict (action, key_hash, window_started_at)
    do update set attempts = bloom_rate_limits.attempts + 1, updated_at = now()
    returning attempts
  `;
  const attempts = Number(
    (rows[0] as { attempts: number } | undefined)?.attempts ?? input.limit + 1,
  );
  return { allowed: attempts <= input.limit, attempts };
}

export async function findPasswordUserByEmail(
  email: string,
): Promise<PasswordUser | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureMarketSchema();

  const rows = await getSql()`
    select id, email, name, password_hash, email_verified_at
    from bloom_users
    where lower(email) = ${email.trim().toLowerCase()}
    limit 1
  `;
  const row = rows[0] as
    | {
        id: string;
        email: string;
        name: string | null;
        password_hash: string | null;
        email_verified_at: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
  };
}

export async function exportAccountData(userId: string) {
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId || !isDatabaseConfigured())
    throw new Error("Account export requires a database-backed user.");
  await ensureMarketSchema();

  const [
    users,
    subscriptions,
    entitlements,
    memberships,
    documents,
    views,
    accessTokens,
  ] = await Promise.all([
    getSql()`
      select id, email, name, auth_provider, email_verified_at, created_at, updated_at
      from bloom_users where id = ${dbUserId}
    `,
    getSql()`
      select tier, status, mode, current_period_end, cancel_at_period_end, created_at, updated_at
      from bloom_subscriptions where user_id = ${dbUserId}
      order by updated_at desc
    `,
    getSql()`
      select feature, source, active, expires_at, created_at, updated_at
      from bloom_entitlements where user_id = ${dbUserId}
      order by updated_at desc
    `,
    getSql()`
      select w.id as workspace_id, w.name, w.slug, w.kind, m.role, m.created_at
      from bloom_workspace_members m
      join bloom_workspaces w on w.id = m.workspace_id
      where m.user_id = ${dbUserId}
      order by w.created_at
    `,
    getSql()`
      select d.id, d.workspace_id, d.filename, d.markdown, d.frontmatter, d.version, d.created_at, d.updated_at
      from bloom_documents d
      join bloom_workspace_members m on m.workspace_id = d.workspace_id
      where m.user_id = ${dbUserId} and d.deleted_at is null
      order by d.workspace_id, lower(d.filename)
    `,
    getSql()`
      select id, workspace_id, document_id, name, view, created_at, updated_at
      from bloom_document_views where user_id = ${dbUserId}
      order by updated_at desc
    `,
    getSql()`
      select id, name, expires_at, last_used_at, revoked_at, created_at
      from bloom_access_tokens where user_id = ${dbUserId}
      order by created_at desc
    `,
  ]);

  if (!users[0]) throw new Error("Account not found.");
  return {
    exportedAt: new Date().toISOString(),
    format: "bloommd-account-export-v1",
    account: users[0],
    subscriptions,
    entitlements,
    memberships,
    documents,
    views,
    accessTokens,
  };
}

export async function deleteAccountData(userId: string) {
  const dbUserId = normalizeUuid(userId);
  if (!dbUserId || !isDatabaseConfigured())
    throw new Error("Account deletion requires a database-backed user.");
  await ensureMarketSchema();

  const sql = getSql();
  return sql.begin(async (transaction) => {
    const ownedWorkspaces = await transaction`
      select id
      from bloom_workspaces
      where owner_user_id = ${dbUserId} and kind = 'team'
      for update
    `;

    for (const workspaceRow of ownedWorkspaces as unknown as Array<{
      id: string;
    }>) {
      const members = (await transaction`
        select user_id, role
        from bloom_workspace_members
        where workspace_id = ${workspaceRow.id} and user_id <> ${dbUserId}
        order by case when role = 'owner' then 0 when role = 'editor' then 1 else 2 end, created_at
        for update
      `) as unknown as Array<{ user_id: string; role: WorkspaceRole }>;
      const replacement = members[0];

      if (!replacement) {
        await transaction`delete from bloom_workspaces where id = ${workspaceRow.id}`;
        continue;
      }

      if (replacement.role !== "owner") {
        await transaction`
          update bloom_workspace_members
          set role = 'owner', updated_at = now()
          where workspace_id = ${workspaceRow.id} and user_id = ${replacement.user_id}
        `;
      }
      await transaction`
        update bloom_workspaces
        set owner_user_id = ${replacement.user_id}, updated_at = now()
        where id = ${workspaceRow.id}
      `;
    }

    await transaction`
      update bloom_subscriptions
      set raw = jsonb_build_object('redacted', true),
          stripe_customer_id = null,
          updated_at = now()
      where user_id = ${dbUserId}
    `;
    const deleted =
      await transaction`delete from bloom_users where id = ${dbUserId} returning id`;
    return deleted.length > 0;
  });
}

export async function recordStripeEvent(event: {
  id: string;
  type: string;
  payload: unknown;
}) {
  if (!isDatabaseConfigured()) return false;
  await ensureMarketSchema();

  const result = await getSql()`
    insert into bloom_stripe_events (id, type, payload, processing_started_at, attempts)
    values (${event.id}, ${event.type}, ${JSON.stringify(event.payload)}::jsonb, now(), 1)
    on conflict (id) do update set
      type = excluded.type,
      payload = excluded.payload,
      processing_started_at = now(),
      attempts = bloom_stripe_events.attempts + 1,
      last_error = null
    where bloom_stripe_events.processed_at is null
      and (
        bloom_stripe_events.processing_started_at is null
        or bloom_stripe_events.processing_started_at < now() - interval '5 minutes'
      )
    returning id
  `;
  return result.length > 0;
}

export async function completeStripeEvent(eventId: string) {
  if (!isDatabaseConfigured()) return false;
  await ensureMarketSchema();
  const rows = await getSql()`
    update bloom_stripe_events
    set processed_at = now(), processing_started_at = null, last_error = null
    where id = ${eventId} and processed_at is null
    returning id
  `;
  return rows.length > 0;
}

export async function releaseStripeEvent(eventId: string, errorCode: string) {
  if (!isDatabaseConfigured()) return false;
  await ensureMarketSchema();
  const rows = await getSql()`
    update bloom_stripe_events
    set processing_started_at = null, last_error = ${errorCode.slice(0, 120)}
    where id = ${eventId} and processed_at is null
    returning id
  `;
  return rows.length > 0;
}

export interface StripeSubscriptionRecord {
  userId?: string | null;
  tier: string;
  status: string;
  mode: "payment" | "subscription";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
  raw: unknown;
}

export async function recordStripeSubscription(
  input: StripeSubscriptionRecord,
) {
  if (!isDatabaseConfigured()) return;
  await ensureMarketSchema();

  const dbUserId = normalizeUuid(input.userId);
  const periodEnd = input.currentPeriodEnd
    ? new Date(input.currentPeriodEnd * 1000).toISOString()
    : null;
  const source =
    input.stripeSubscriptionId ?? input.stripeCheckoutSessionId ?? null;
  const feature = input.tier;

  const rows = input.stripeSubscriptionId
    ? await getSql()`
        insert into bloom_subscriptions (
          user_id,
          tier,
          status,
          mode,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_checkout_session_id,
          current_period_end,
          cancel_at_period_end,
          raw
        )
        values (
          ${dbUserId},
          ${input.tier},
          ${input.status},
          ${input.mode},
          ${input.stripeCustomerId ?? null},
          ${input.stripeSubscriptionId},
          ${input.stripeCheckoutSessionId ?? null},
          ${periodEnd},
          ${input.cancelAtPeriodEnd ?? false},
          ${JSON.stringify(input.raw)}::jsonb
        )
        on conflict (stripe_subscription_id)
        do update set
          user_id = coalesce(excluded.user_id, bloom_subscriptions.user_id),
          tier = excluded.tier,
          status = excluded.status,
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_checkout_session_id = coalesce(excluded.stripe_checkout_session_id, bloom_subscriptions.stripe_checkout_session_id),
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          raw = excluded.raw,
          updated_at = now()
        returning user_id, status, tier
      `
    : await getSql()`
        insert into bloom_subscriptions (
          user_id,
          tier,
          status,
          mode,
          stripe_customer_id,
          stripe_checkout_session_id,
          current_period_end,
          cancel_at_period_end,
          raw
        )
        values (
          ${dbUserId},
          ${input.tier},
          ${input.status},
          ${input.mode},
          ${input.stripeCustomerId ?? null},
          ${input.stripeCheckoutSessionId ?? null},
          ${periodEnd},
          ${input.cancelAtPeriodEnd ?? false},
          ${JSON.stringify(input.raw)}::jsonb
        )
        on conflict (stripe_checkout_session_id)
        do update set
          user_id = coalesce(excluded.user_id, bloom_subscriptions.user_id),
          tier = excluded.tier,
          status = excluded.status,
          stripe_customer_id = excluded.stripe_customer_id,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          raw = excluded.raw,
          updated_at = now()
        returning user_id, status, tier
      `;

  const row = rows[0] as
    { user_id: string | null; status: string; tier: string } | undefined;
  if (!row?.user_id || !source) return;

  const active = ["active", "trialing", "complete", "paid"].includes(
    row.status,
  );
  await getSql()`
    insert into bloom_entitlements (user_id, feature, source, active, expires_at)
    values (${row.user_id}, ${feature}, ${source}, ${active}, ${periodEnd})
    on conflict (user_id, feature, source)
    do update set active = excluded.active, expires_at = excluded.expires_at, updated_at = now()
  `;
}

// ---------------------------------------------------------------------------
// Agent tokens: rights, proposals and change log of cloud workspaces.
// Tokens with an agent_name only change maps within these rights; the routes enforce them.
// ---------------------------------------------------------------------------

export const AGENT_TOKEN_HISTORY_LIMIT = 300;

function agentAccessOrPropose(value: unknown): AgentAccess {
  // An unknown value never grants more than a proposal.
  return AGENT_ACCESS.includes(value as AgentAccess) ? (value as AgentAccess) : "propose";
}

async function requireWorkspaceOwner(userId: string, workspaceId: string) {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (workspace.role !== "owner") throw new Error("Only workspace owners can manage agent rights and proposals.");
  return workspace;
}

/** The rights of an agent token in a workspace, read from the database on every call (no cache). */
export async function getAgentTokenRights(tokenId: string, workspaceId: string): Promise<AgentAccessConfig> {
  const token = normalizeUuid(tokenId);
  const workspace = normalizeUuid(workspaceId);
  if (!token || !workspace) return { access: "propose", areas: {} };
  await ensureMarketSchema();
  const sql = getSql();
  const [defaults, areas] = await Promise.all([
    sql`select default_access from bloom_agent_token_rights where access_token_id = ${token} and workspace_id = ${workspace}`,
    sql`select area, access from bloom_agent_token_area_rights where access_token_id = ${token} and workspace_id = ${workspace} order by area_key`,
  ]);
  return {
    access: agentAccessOrPropose((defaults[0] as { default_access?: string } | undefined)?.default_access),
    areas: Object.fromEntries((areas as unknown as Array<{ area: string; access: string }>).map((row) => [row.area, agentAccessOrPropose(row.access)])),
  };
}

export interface AgentTokenSummary {
  tokenId: string;
  tokenName: string;
  agentName: string;
  userEmail: string;
  userName: string | null;
  scope: AccessTokenScope;
  allowShare: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  rights: AgentAccessConfig;
}

/** Agent tokens that can work in the workspace, with their rights; for the workspace owner. */
export async function listAgentTokensForWorkspace(userId: string, workspaceId: string): Promise<AgentTokenSummary[]> {
  const workspace = await requireWorkspaceOwner(userId, workspaceId);
  const sql = getSql();
  const [tokens, defaults, areas] = await Promise.all([
    sql`
      select t.id, t.name, t.agent_name, t.scope, t.allow_share, t.expires_at, t.last_used_at, u.email, u.name as user_name
      from bloom_access_tokens t
      join bloom_workspace_members m on m.user_id = t.user_id and m.workspace_id = ${workspace.id}
      join bloom_users u on u.id = t.user_id
      where t.agent_name is not null and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())
        and (t.workspace_ids is null or ${workspace.id} = any(t.workspace_ids))
      order by t.created_at desc
    `,
    sql`select access_token_id, default_access from bloom_agent_token_rights where workspace_id = ${workspace.id}`,
    sql`select access_token_id, area, access from bloom_agent_token_area_rights where workspace_id = ${workspace.id} order by area_key`,
  ]);
  const defaultByToken = new Map((defaults as unknown as Array<{ access_token_id: string; default_access: string }>).map((row) => [row.access_token_id, row.default_access]));
  const areasByToken = new Map<string, Record<string, AgentAccess>>();
  for (const row of areas as unknown as Array<{ access_token_id: string; area: string; access: string }>) {
    areasByToken.set(row.access_token_id, { ...(areasByToken.get(row.access_token_id) ?? {}), [row.area]: agentAccessOrPropose(row.access) });
  }
  return (tokens as unknown as Array<{ id: string; name: string; agent_name: string; scope: string | null; allow_share: boolean | null; expires_at: string | null; last_used_at: string | null; email: string; user_name: string | null }>).map((row) => ({
    tokenId: row.id,
    tokenName: row.name,
    agentName: row.agent_name,
    userEmail: row.email,
    userName: row.user_name,
    scope: row.scope === "read" ? "read" : "write",
    allowShare: Boolean(row.allow_share),
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    rights: { access: agentAccessOrPropose(defaultByToken.get(row.id)), areas: areasByToken.get(row.id) ?? {} },
  }));
}

/** Replaces the rights of an agent token in a workspace; only its owner may. `rights` must be validated. */
export async function setAgentTokenRights(input: { userId: string; workspaceId: string; tokenId: string; rights: AgentAccessConfig }): Promise<AgentAccessConfig> {
  const workspace = await requireWorkspaceOwner(input.userId, input.workspaceId);
  const tokenId = normalizeUuid(input.tokenId);
  if (!tokenId) throw new Error("Agent token not found.");
  const sql = getSql();
  const eligible = await sql`
    select t.id
    from bloom_access_tokens t
    join bloom_workspace_members m on m.user_id = t.user_id and m.workspace_id = ${workspace.id}
    where t.id = ${tokenId} and t.agent_name is not null and t.revoked_at is null
      and (t.workspace_ids is null or ${workspace.id} = any(t.workspace_ids))
    limit 1
  `;
  if (!eligible[0]) throw new Error("Agent token not found.");
  const areas = Object.entries(input.rights.areas ?? {}).map(([area, access]) => ({ area: normalizeAreaPath(area), access }));
  await sql.begin(async (transaction) => {
    await transaction`
      insert into bloom_agent_token_rights (access_token_id, workspace_id, default_access, updated_by, updated_at)
      values (${tokenId}, ${workspace.id}, ${input.rights.access}, ${input.userId}, now())
      on conflict (access_token_id, workspace_id)
      do update set default_access = excluded.default_access, updated_by = excluded.updated_by, updated_at = now()
    `;
    await transaction`delete from bloom_agent_token_area_rights where access_token_id = ${tokenId} and workspace_id = ${workspace.id}`;
    for (const { area, access } of areas) {
      await transaction`
        insert into bloom_agent_token_area_rights (access_token_id, workspace_id, area_key, area, access)
        values (${tokenId}, ${workspace.id}, ${areaKey(area)}, ${area}, ${access})
      `;
    }
  });
  await recordAuditEvent({ actorUserId: input.userId, eventType: "agent.token.rights_changed", targetType: "access_token", targetId: tokenId, details: { workspaceId: workspace.id, access: input.rights.access, areas: String(areas.length) } });
  await emitWorkspaceAgentEvent({ workspaceId: workspace.id, type: "token.rights.changed" });
  return getAgentTokenRights(tokenId, workspace.id);
}

export type AgentTokenChangeEvent = "written" | "proposed" | "approved" | "rejected" | "undone" | "renamed" | "deleted";

export interface AgentTokenChangeInput {
  tokenId: string;
  workspaceId: string;
  agentName: string;
  event: AgentTokenChangeEvent;
  origin?: "agent" | "approved" | "owner";
  tool?: string | null;
  filename?: string | null;
  area?: string;
  proposalId?: string | null;
  summary?: string | null;
  reason?: string | null;
  source?: string | null;
  reviewerName?: string | null;
  reviewerUserId?: string | null;
  /** The map before the change, for undo. Not for entries that cannot be undone. */
  beforeMarkdown?: string | null;
  /** The change created the map: undoing it removes the map. */
  createdMap?: boolean;
  afterVersion?: number | null;
}

type Sql = ReturnType<typeof getSql>;

async function insertAgentTokenChange(sql: Sql, input: AgentTokenChangeInput): Promise<string> {
  const rows = await sql`
    insert into bloom_agent_token_changes (access_token_id, workspace_id, agent_name, event, origin, tool, filename, area, proposal_id, summary, reason, source, reviewer_name, reviewer_user_id, before_markdown, created_map, after_version)
    values (${input.tokenId}, ${input.workspaceId}, ${input.agentName}, ${input.event}, ${input.origin ?? "agent"}, ${input.tool ?? null}, ${input.filename ?? null}, ${input.area ?? ""}, ${input.proposalId ?? null}, ${input.summary ?? null}, ${input.reason ?? null}, ${input.source ?? null}, ${input.reviewerName ?? null}, ${normalizeUuid(input.reviewerUserId)}, ${input.beforeMarkdown ?? null}, ${input.createdMap ?? false}, ${input.afterVersion ?? null})
    returning id
  `;
  const id = (rows[0] as { id?: string } | undefined)?.id;
  if (!id) throw new Error("Agent change could not be logged.");
  if (input.beforeMarkdown != null) {
    // Only the newest changes keep their old state for undo.
    await sql`
      update bloom_agent_token_changes set before_markdown = null
      where id in (
        select id from bloom_agent_token_changes
        where access_token_id = ${input.tokenId} and workspace_id = ${input.workspaceId} and before_markdown is not null
        order by created_at desc, id offset ${AGENT_TOKEN_HISTORY_LIMIT}
      )
    `;
  }
  return id;
}

/** Writes one entry to the change log of an agent token and returns its id (the change id for undo). */
export async function recordAgentTokenChange(input: AgentTokenChangeInput): Promise<string> {
  await ensureMarketSchema();
  return insertAgentTokenChange(getSql(), input);
}

export interface AgentTokenChangeRecord {
  id: string;
  tokenId: string;
  agentName: string;
  event: AgentTokenChangeEvent;
  origin: "agent" | "approved" | "owner";
  tool: string | null;
  filename: string | null;
  area: string;
  proposalId: string | null;
  summary: string | null;
  reason: string | null;
  source: string | null;
  reviewerName: string | null;
  afterVersion: number | null;
  /** The entry kept the state before the change and was not undone yet. */
  undoable: boolean;
  undoneAt: string | null;
  createdAt: string;
}

interface AgentTokenChangeRow {
  id: string;
  access_token_id: string;
  agent_name: string;
  event: AgentTokenChangeEvent;
  origin: "agent" | "approved" | "owner";
  tool: string | null;
  filename: string | null;
  area: string;
  proposal_id: string | null;
  summary: string | null;
  reason: string | null;
  source: string | null;
  reviewer_name: string | null;
  after_version: string | number | null;
  undone_at: string | null;
  created_at: string;
  undoable?: boolean;
  before_markdown?: string | null;
  created_map?: boolean;
}

function agentTokenChangeFromRow(row: AgentTokenChangeRow): AgentTokenChangeRecord {
  return {
    id: row.id,
    tokenId: row.access_token_id,
    agentName: row.agent_name,
    event: row.event,
    origin: row.origin,
    tool: row.tool,
    filename: row.filename,
    area: row.area,
    proposalId: row.proposal_id,
    summary: row.summary,
    reason: row.reason,
    source: row.source,
    reviewerName: row.reviewer_name,
    afterVersion: row.after_version == null ? null : Number(row.after_version),
    undoable: Boolean(row.undoable),
    undoneAt: row.undone_at,
    createdAt: row.created_at,
  };
}

const AGENT_CHANGE_COLUMNS = `id, access_token_id, agent_name, event, origin, tool, filename, area, proposal_id, summary, reason, source, reviewer_name, after_version, undone_at, created_at`;

/**
 * The change log, newest first. With `tokenId` the entries of that agent token (the agent itself:
 * the caller has checked the workspace membership); without it all of the workspace, for its owner.
 */
export async function listAgentTokenChanges(input: { workspaceId: string; userId?: string; tokenId?: string; limit?: number }): Promise<AgentTokenChangeRecord[]> {
  // The agent's own entries need no owner check: its route has resolved the workspace membership.
  const workspaceId = input.tokenId ? normalizeUuid(input.workspaceId) : (await requireWorkspaceOwner(input.userId ?? "", input.workspaceId)).id;
  const tokenId = input.tokenId ? normalizeUuid(input.tokenId) : null;
  if (!workspaceId || (input.tokenId && !tokenId)) return [];
  const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? 50)));
  const rows = await getSql()`
    select id, access_token_id, agent_name, event, origin, tool, filename, area, proposal_id, summary, reason, source, reviewer_name, after_version, undone_at, created_at,
      (undone_at is null and event in ('written', 'approved') and (before_markdown is not null or created_map)) as undoable
    from bloom_agent_token_changes
    where workspace_id = ${workspaceId} and (${tokenId}::uuid is null or access_token_id = ${tokenId})
    order by created_at desc, id
    limit ${limit}
  `;
  return (rows as unknown as AgentTokenChangeRow[]).map(agentTokenChangeFromRow);
}

/** One change with the state before it, for undo. */
export async function getAgentTokenChangeForUndo(workspaceId: string, changeId: string) {
  const id = normalizeUuid(changeId);
  const workspace = normalizeUuid(workspaceId);
  if (!id || !workspace) return null;
  await ensureMarketSchema();
  const rows = await getSql()`
    select id, access_token_id, agent_name, event, origin, tool, filename, area, proposal_id, summary, reason, source, reviewer_name, after_version, undone_at, created_at, before_markdown, created_map,
      (undone_at is null and event in ('written', 'approved') and (before_markdown is not null or created_map)) as undoable
    from bloom_agent_token_changes
    where id = ${id} and workspace_id = ${workspace}
    limit 1
  `;
  const row = rows[0] as AgentTokenChangeRow | undefined;
  return row ? { ...agentTokenChangeFromRow(row), beforeMarkdown: row.before_markdown ?? null, createdMap: Boolean(row.created_map) } : null;
}

/** Marks a change as undone and logs the undo; false when it was already undone. */
export async function completeAgentTokenUndo(input: { workspaceId: string; changeId: string; tokenId: string; agentName: string; filename: string; area: string; byName: string; byUserId?: string | null; byAgent?: boolean }): Promise<boolean> {
  const id = normalizeUuid(input.changeId);
  if (!id) return false;
  await ensureMarketSchema();
  const sql = getSql();
  const rows = await sql`update bloom_agent_token_changes set undone_at = now(), before_markdown = null where id = ${id} and workspace_id = ${input.workspaceId} and undone_at is null returning id`;
  if (!rows[0]) return false;
  await insertAgentTokenChange(sql, {
    tokenId: input.tokenId,
    workspaceId: input.workspaceId,
    agentName: input.agentName,
    event: "undone",
    origin: input.byAgent ? "agent" : "owner",
    filename: input.filename,
    area: input.area,
    summary: `Undo of change ${id}`,
    reviewerName: input.byAgent ? null : input.byName,
    reviewerUserId: input.byUserId,
  });
  if (input.byUserId) await recordAuditEvent({ actorUserId: input.byUserId, eventType: "agent.token.change_undone", targetType: "access_token", targetId: input.tokenId, details: { workspaceId: input.workspaceId, changeId: id } });
  return true;
}

export interface AgentTokenProposalRecord {
  id: string;
  tokenId: string;
  workspaceId: string;
  agentName: string;
  tool: string;
  filename: string;
  area: string;
  /** Version of the map the proposal is based on; null for a new map. */
  baseVersion: number | null;
  proposedMarkdown: string;
  summary: string;
  reason: string | null;
  source: string | null;
  status: "pending" | "approved" | "rejected" | "stale";
  reviewerName: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface AgentTokenProposalRow {
  id: string;
  access_token_id: string;
  workspace_id: string;
  agent_name: string;
  tool: string;
  filename: string;
  area: string;
  base_version: string | number | null;
  proposed_markdown: string;
  summary: string;
  reason: string | null;
  source: string | null;
  status: AgentTokenProposalRecord["status"];
  reviewer_name: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function agentTokenProposalFromRow(row: AgentTokenProposalRow): AgentTokenProposalRecord {
  return {
    id: row.id,
    tokenId: row.access_token_id,
    workspaceId: row.workspace_id,
    agentName: row.agent_name,
    tool: row.tool,
    filename: row.filename,
    area: row.area,
    baseVersion: row.base_version == null ? null : Number(row.base_version),
    proposedMarkdown: row.proposed_markdown,
    summary: row.summary,
    reason: row.reason,
    source: row.source,
    status: row.status,
    reviewerName: row.reviewer_name,
    reviewReason: row.review_reason,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

/** A change an agent token may only propose: stored for the workspace owner to review, and logged. */
export async function createAgentTokenProposal(input: {
  tokenId: string;
  workspaceId: string;
  agentName: string;
  tool: string;
  filename: string;
  area: string;
  baseVersion: number | null;
  markdown: string;
  summary: string;
  reason?: string | null;
  source?: string | null;
}): Promise<string> {
  await ensureMarketSchema();
  const id = await getSql().begin(async (transaction) => {
    const rows = await transaction`
      insert into bloom_agent_token_proposals (access_token_id, workspace_id, agent_name, tool, filename, area, base_version, proposed_markdown, summary, reason, source)
      values (${input.tokenId}, ${input.workspaceId}, ${input.agentName}, ${input.tool}, ${input.filename}, ${input.area}, ${input.baseVersion}, ${input.markdown}, ${input.summary}, ${input.reason ?? null}, ${input.source ?? null})
      returning id
    `;
    const proposalId = (rows[0] as { id?: string } | undefined)?.id;
    if (!proposalId) throw new Error("Agent proposal could not be stored.");
    await insertAgentTokenChange(transaction as unknown as Sql, { tokenId: input.tokenId, workspaceId: input.workspaceId, agentName: input.agentName, event: "proposed", tool: input.tool, filename: input.filename, area: input.area, proposalId, summary: input.summary, reason: input.reason, source: input.source });
    return proposalId;
  });
  await emitWorkspaceAgentEvent({ workspaceId: input.workspaceId, taskId: id as string, type: "token.proposal.created" });
  return id as string;
}

/** Proposals of agent tokens, newest first; for the workspace owner. */
export async function listAgentTokenProposals(input: { userId: string; workspaceId: string; status?: AgentTokenProposalRecord["status"] | "all"; limit?: number }): Promise<AgentTokenProposalRecord[]> {
  const workspace = await requireWorkspaceOwner(input.userId, input.workspaceId);
  const status = input.status ?? "pending";
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 50)));
  const rows = await getSql()`
    select id, access_token_id, workspace_id, agent_name, tool, filename, area, base_version, proposed_markdown, summary, reason, source, status, reviewer_name, review_reason, reviewed_at, created_at
    from bloom_agent_token_proposals
    where workspace_id = ${workspace.id} and (${status} = 'all' or status = ${status})
    order by created_at desc
    limit ${limit}
  `;
  return (rows as unknown as AgentTokenProposalRow[]).map(agentTokenProposalFromRow);
}

export async function getAgentTokenProposal(input: { userId: string; workspaceId: string; proposalId: string }): Promise<AgentTokenProposalRecord> {
  const workspace = await requireWorkspaceOwner(input.userId, input.workspaceId);
  const id = normalizeUuid(input.proposalId);
  if (!id) throw new Error("Invalid agent proposal.");
  const rows = await getSql()`
    select id, access_token_id, workspace_id, agent_name, tool, filename, area, base_version, proposed_markdown, summary, reason, source, status, reviewer_name, review_reason, reviewed_at, created_at
    from bloom_agent_token_proposals
    where id = ${id} and workspace_id = ${workspace.id} and status = 'pending'
    limit 1
  `;
  const row = rows[0] as AgentTokenProposalRow | undefined;
  if (!row) throw new Error("Agent proposal is not available.");
  return agentTokenProposalFromRow(row);
}

/**
 * Closes a pending proposal and logs the decision with the reviewer's name. After an approval
 * `applied` carries the state before and after, so the owner can undo it later.
 */
export async function finishAgentTokenProposal(input: {
  userId: string;
  workspaceId: string;
  proposal: AgentTokenProposalRecord;
  action: "approved" | "rejected" | "stale";
  reviewerName: string;
  reason?: string | null;
  applied?: { beforeMarkdown: string | null; createdMap: boolean; afterVersion: number | null };
}): Promise<string> {
  const workspace = await requireWorkspaceOwner(input.userId, input.workspaceId);
  await ensureMarketSchema();
  const changeId = await getSql().begin(async (transaction) => {
    const rows = await transaction`
      update bloom_agent_token_proposals
      set status = ${input.action}, reviewed_by = ${input.userId}, reviewer_name = ${input.reviewerName}, reviewed_at = now(), review_reason = ${input.reason ?? null}
      where id = ${input.proposal.id} and workspace_id = ${workspace.id} and status = 'pending'
      returning id
    `;
    if (!rows[0]) throw new Error("Agent proposal is not available.");
    return insertAgentTokenChange(transaction as unknown as Sql, {
      tokenId: input.proposal.tokenId,
      workspaceId: workspace.id,
      agentName: input.proposal.agentName,
      event: input.action === "approved" ? "approved" : "rejected",
      origin: "approved",
      tool: input.proposal.tool,
      filename: input.proposal.filename,
      area: input.proposal.area,
      proposalId: input.proposal.id,
      summary: input.action === "stale" ? `Marked outdated: ${input.proposal.summary}` : input.proposal.summary,
      reason: input.reason ?? input.proposal.reason,
      source: input.proposal.source,
      reviewerName: input.reviewerName,
      reviewerUserId: input.userId,
      ...(input.applied ? { beforeMarkdown: input.applied.beforeMarkdown, createdMap: input.applied.createdMap, afterVersion: input.applied.afterVersion } : {}),
    });
  });
  await recordAuditEvent({ actorUserId: input.userId, eventType: input.action === "approved" ? "agent.token.proposal_approved" : "agent.token.proposal_rejected", targetType: "agent_token_proposal", targetId: input.proposal.id, details: { workspaceId: workspace.id } });
  await emitWorkspaceAgentEvent({ workspaceId: workspace.id, taskId: input.proposal.id, type: "token.proposal.reviewed" });
  return changeId as string;
}
