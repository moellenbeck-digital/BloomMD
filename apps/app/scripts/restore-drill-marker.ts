import { randomUUID } from "node:crypto";
import { createSqlClient } from "../src/lib/sql-client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const action = process.argv[2] ?? "seed";
const sql = createSqlClient(databaseUrl);

type DrillIds = {
  runId: string;
  eventId: string;
  userA: string;
  userB: string;
  workspace: string;
  document: string;
  view: string;
  session: string;
  authToken: string;
  accessToken: string;
  auditEvent: string;
  filename: string;
  markdown: string;
};

function buildPayload(ids: DrillIds) {
  return {
    restoreDrill: {
      version: 1,
      ids,
      seededAt: new Date().toISOString(),
    },
  };
}

function parseJsonPayload(payload: unknown): unknown {
  let value = payload;
  for (let depth = 0; depth < 2 && typeof value === "string"; depth += 1) {
    value = JSON.parse(value) as unknown;
  }
  return value;
}

function readDrillIds(payload: unknown): DrillIds {
  const record = parseJsonPayload(payload) as { restoreDrill?: { ids?: Partial<DrillIds> } };
  const ids = record.restoreDrill?.ids;
  if (!ids?.eventId || !ids.userA || !ids.userB || !ids.workspace || !ids.document || !ids.filename || !ids.markdown) {
    throw new Error("Restore drill marker payload is incomplete.");
  }
  return ids as DrillIds;
}

async function seed() {
  const runId = randomUUID();
  const ids: DrillIds = {
    runId,
    eventId: `restore-drill-${runId}`,
    userA: randomUUID(),
    userB: randomUUID(),
    workspace: randomUUID(),
    document: randomUUID(),
    view: randomUUID(),
    session: randomUUID(),
    authToken: randomUUID(),
    accessToken: randomUUID(),
    auditEvent: randomUUID(),
    filename: `restore-drill-${runId}.md`,
    markdown: `# Restore Drill ${runId}\n\nThis document proves that the CNPG restore contains seeded BloomMD tenant data.`,
  };

  await sql.begin(async (tx) => {
    await tx`
      insert into bloom_users (id, email, name, email_verified_at)
      values
        (${ids.userA}, ${`restore-drill+${runId}-a@bloommd.invalid`}, 'Restore Drill A', now()),
        (${ids.userB}, ${`restore-drill+${runId}-b@bloommd.invalid`}, 'Restore Drill B', now())
    `;
    await tx`
      insert into bloom_workspaces (id, owner_user_id, name, slug, kind)
      values (${ids.workspace}, ${ids.userA}, 'Restore Drill Workspace', ${`restore-drill-${runId}`}, 'team')
    `;
    await tx`
      insert into bloom_workspace_members (workspace_id, user_id, role)
      values
        (${ids.workspace}, ${ids.userA}, 'owner'),
        (${ids.workspace}, ${ids.userB}, 'editor')
    `;
    await tx`
      insert into bloom_documents (id, workspace_id, filename, markdown, frontmatter, version, created_by, updated_by)
      values (${ids.document}, ${ids.workspace}, ${ids.filename}, ${ids.markdown}, ${JSON.stringify({ restoreDrill: runId })}::jsonb, 7, ${ids.userA}, ${ids.userB})
    `;
    await tx`
      insert into bloom_document_views (id, workspace_id, document_id, user_id, name, view)
      values (${ids.view}, ${ids.workspace}, ${ids.document}, ${ids.userA}, 'Restore Drill View', ${JSON.stringify({ x: 12, y: 34, zoom: 1.25 })}::jsonb)
    `;
    await tx`
      insert into bloom_sessions (id, user_id, expires_at)
      values (${ids.session}, ${ids.userA}, now() + interval '1 day')
    `;
    await tx`
      insert into bloom_auth_tokens (id, user_id, email, purpose, token_hash, expires_at)
      values (${ids.authToken}, ${ids.userA}, ${`restore-drill+${runId}-a@bloommd.invalid`}, 'email-verification', ${`restore-drill-auth-${runId}`}, now() + interval '1 day')
    `;
    await tx`
      insert into bloom_access_tokens (id, user_id, name, token_hash, expires_at)
      values (${ids.accessToken}, ${ids.userA}, 'Restore Drill Access Token', ${`restore-drill-access-${runId}`}, now() + interval '1 day')
    `;
    await tx`
      insert into bloom_audit_events (id, actor_user_id, event_type, outcome, target_type, target_id)
      values (${ids.auditEvent}, ${ids.userA}, 'restore_drill.seeded', 'success', 'workspace', ${ids.workspace})
    `;
    await tx`
      insert into bloom_stripe_events (id, type, processed_at, payload)
      values (${ids.eventId}, 'restore.drill', now(), ${JSON.stringify(buildPayload(ids))}::jsonb)
    `;
  });

  console.log(JSON.stringify({ action: "seed", eventId: ids.eventId, workspaceId: ids.workspace, documentId: ids.document }));
}

async function cleanup() {
  const eventId = process.env.RESTORE_DRILL_EVENT_ID;
  if (!eventId) throw new Error("RESTORE_DRILL_EVENT_ID is required for cleanup.");

  const rows = await sql`select payload from bloom_stripe_events where id = ${eventId} limit 1`;
  if (rows.length === 0) {
    console.log(JSON.stringify({ action: "cleanup", eventId, cleaned: false, reason: "marker-missing" }));
    return;
  }

  const ids = readDrillIds((rows[0] as { payload: unknown }).payload);
  await sql.begin(async (tx) => {
    await tx`delete from bloom_audit_events where id = ${ids.auditEvent}`;
    await tx`delete from bloom_sessions where id = ${ids.session}`;
    await tx`delete from bloom_auth_tokens where id = ${ids.authToken}`;
    await tx`delete from bloom_access_tokens where id = ${ids.accessToken}`;
    await tx`delete from bloom_document_views where id = ${ids.view}`;
    await tx`delete from bloom_documents where id = ${ids.document}`;
    await tx`delete from bloom_workspace_members where workspace_id = ${ids.workspace}`;
    await tx`delete from bloom_workspaces where id = ${ids.workspace}`;
    await tx`delete from bloom_users where id in (${ids.userA}, ${ids.userB})`;
    await tx`delete from bloom_stripe_events where id = ${eventId}`;
  });

  console.log(JSON.stringify({ action: "cleanup", eventId, cleaned: true }));
}

try {
  if (action === "seed") await seed();
  else if (action === "cleanup") await cleanup();
  else throw new Error(`Unknown action: ${action}`);
} finally {
  await sql.end();
}
