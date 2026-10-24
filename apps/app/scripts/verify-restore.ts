import { createSqlClient } from "../src/lib/sql-client";

const databaseUrl = process.env.RESTORE_DATABASE_URL;
if (!databaseUrl) throw new Error("RESTORE_DATABASE_URL must point to an isolated restore cluster, never the primary database.");
if (databaseUrl === process.env.DATABASE_URL) throw new Error("Refusing to verify restore against the primary DATABASE_URL.");

const sql = createSqlClient(databaseUrl);
const tables = await sql`
  select
    to_regclass('public.bloom_users') as users,
    to_regclass('public.bloom_workspaces') as workspaces,
    to_regclass('public.bloom_workspace_members') as members,
    to_regclass('public.bloom_documents') as documents,
    to_regclass('public.bloom_document_views') as views,
    to_regclass('public.bloom_sessions') as sessions,
    to_regclass('public.bloom_stripe_events') as stripe_events
`;
const tableRow = tables[0] as Record<string, string | null> | undefined;
const missing = Object.entries(tableRow ?? {}).filter(([, value]) => !value).map(([name]) => name);
if (!tableRow || missing.length > 0) throw new Error(`Restore is missing tables: ${missing.join(", ") || "unknown"}.`);

const integrity = await sql`
  select
    (select count(*)::int from bloom_users) as users,
    (select count(*)::int from bloom_workspaces) as workspaces,
    (select count(*)::int from bloom_documents where deleted_at is null) as active_documents,
    (select count(*)::int
      from bloom_documents d
      left join bloom_workspaces w on w.id = d.workspace_id
      where w.id is null) as orphan_documents,
    (select count(*)::int
      from bloom_workspace_members m
      left join bloom_workspaces w on w.id = m.workspace_id
      left join bloom_users u on u.id = m.user_id
      where w.id is null or u.id is null) as orphan_memberships
`;
const counts = integrity[0] as {
  users: number;
  workspaces: number;
  active_documents: number;
  orphan_documents: number;
  orphan_memberships: number;
};
if (Number(counts.orphan_documents) !== 0 || Number(counts.orphan_memberships) !== 0) {
  throw new Error("Restore contains orphaned tenant data.");
}

const expectedEventId = process.env.RESTORE_EXPECT_EVENT_ID;
let restoreDrillMarkerVerified = false;
let restoreDrillExportVerified = false;
let restoreDrillDeletionVerified = false;
if (expectedEventId) {
  const marker = await sql`select payload from bloom_stripe_events where id = ${expectedEventId} limit 1`;
  if (marker.length === 0) throw new Error("Expected pre-restore marker is missing.");
  let payloadValue = (marker[0] as { payload: unknown }).payload;
  for (let depth = 0; depth < 2 && typeof payloadValue === "string"; depth += 1) {
    payloadValue = JSON.parse(payloadValue) as unknown;
  }
  const payload = payloadValue as {
    restoreDrill?: {
      ids?: {
        userA?: string;
        userB?: string;
        workspace?: string;
        document?: string;
        view?: string;
        session?: string;
        authToken?: string;
        accessToken?: string;
        auditEvent?: string;
        filename?: string;
        markdown?: string;
      };
    };
  };
  const ids = payload.restoreDrill?.ids;
  if (!ids?.userA || !ids.userB || !ids.workspace || !ids.document || !ids.view || !ids.session || !ids.authToken || !ids.accessToken || !ids.auditEvent || !ids.filename || !ids.markdown) {
    throw new Error("Expected restore drill marker payload is incomplete.");
  }

  const drill = await sql`
    select
      (select count(*)::int from bloom_users where id in (${ids.userA}, ${ids.userB})) as users,
      (select count(*)::int from bloom_workspaces where id = ${ids.workspace} and owner_user_id = ${ids.userA}) as workspaces,
      (select count(*)::int from bloom_workspace_members where workspace_id = ${ids.workspace} and user_id in (${ids.userA}, ${ids.userB})) as members,
      (select count(*)::int from bloom_documents where id = ${ids.document} and workspace_id = ${ids.workspace} and filename = ${ids.filename} and markdown like '%Restore Drill%' and version >= 7 and deleted_at is null) as documents,
      (select count(*)::int from bloom_document_views where id = ${ids.view} and document_id = ${ids.document} and workspace_id = ${ids.workspace} and user_id = ${ids.userA}) as views,
      (select count(*)::int from bloom_sessions where id = ${ids.session} and user_id = ${ids.userA}) as sessions,
      (select count(*)::int from bloom_auth_tokens where id = ${ids.authToken} and user_id = ${ids.userA}) as auth_tokens,
      (select count(*)::int from bloom_access_tokens where id = ${ids.accessToken} and user_id = ${ids.userA}) as access_tokens,
      (select count(*)::int from bloom_audit_events where id = ${ids.auditEvent} and actor_user_id = ${ids.userA} and event_type = 'restore_drill.seeded') as audit_events
  `;
  const drillCounts = drill[0] as Record<string, number>;
  const missingDrillData = Object.entries(drillCounts).filter(([, value]) => Number(value) === 0).map(([name]) => name);
  if (missingDrillData.length > 0) throw new Error(`Restore drill marker is missing related data: ${missingDrillData.join(", ")}.`);
  restoreDrillMarkerVerified = true;

  const exportRows = await sql`
    select d.filename, d.markdown, v.view
    from bloom_documents d
    join bloom_document_views v on v.document_id = d.id and v.workspace_id = d.workspace_id
    where d.id = ${ids.document}
      and d.workspace_id = ${ids.workspace}
      and d.created_by = ${ids.userA}
      and v.user_id = ${ids.userA}
  `;
  const exportRow = exportRows[0] as { filename: string; markdown: string; view: unknown } | undefined;
  if (!exportRow || exportRow.filename !== ids.filename || !exportRow.markdown.includes("Restore Drill") || !exportRow.view) {
    throw new Error("Restore drill export check failed.");
  }
  restoreDrillExportVerified = true;

  await sql`delete from bloom_users where id = ${ids.userA}`;
  const deletion = await sql`
    select
      (select count(*)::int from bloom_workspaces where id = ${ids.workspace}) as workspaces,
      (select count(*)::int from bloom_workspace_members where workspace_id = ${ids.workspace}) as members,
      (select count(*)::int from bloom_documents where id = ${ids.document}) as documents,
      (select count(*)::int from bloom_document_views where id = ${ids.view}) as views,
      (select count(*)::int from bloom_sessions where id = ${ids.session}) as sessions,
      (select count(*)::int from bloom_auth_tokens where id = ${ids.authToken}) as auth_tokens,
      (select count(*)::int from bloom_access_tokens where id = ${ids.accessToken}) as access_tokens,
      (select count(*)::int from bloom_audit_events where id = ${ids.auditEvent} and actor_user_id is null) as anonymized_audit_events
  `;
  const deletionCounts = deletion[0] as Record<string, number>;
  const remainingCascadeData = Object.entries(deletionCounts)
    .filter(([name, value]) => name !== "anonymized_audit_events" && Number(value) !== 0)
    .map(([name]) => name);
  if (remainingCascadeData.length > 0) throw new Error(`Restore drill deletion check left tenant data behind: ${remainingCascadeData.join(", ")}.`);
  if (Number(deletionCounts.anonymized_audit_events) !== 1) throw new Error("Restore drill audit anonymization check failed.");
  restoreDrillDeletionVerified = true;
}

console.log(JSON.stringify({
  restore: "ok",
  users: Number(counts.users),
  workspaces: Number(counts.workspaces),
  activeDocuments: Number(counts.active_documents),
  orphanDocuments: 0,
  orphanMemberships: 0,
  markerVerified: restoreDrillMarkerVerified,
  exportVerified: restoreDrillExportVerified,
  deletionVerified: restoreDrillDeletionVerified,
}));
