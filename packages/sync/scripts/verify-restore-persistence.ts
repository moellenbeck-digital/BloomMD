import { createDatabasePersistence } from "../src/persistence";
import { createSqlClient } from "../src/sql-client";

const databaseUrl = process.env.RESTORE_DATABASE_URL;
const expectedEventId = process.env.RESTORE_EXPECT_EVENT_ID;
if (!databaseUrl) throw new Error("RESTORE_DATABASE_URL is required.");
if (!expectedEventId) throw new Error("RESTORE_EXPECT_EVENT_ID is required.");
if (databaseUrl === process.env.DATABASE_URL) throw new Error("Refusing to verify sync persistence against the primary DATABASE_URL.");

type DrillIds = {
  userA: string;
  workspace: string;
  document: string;
  filename: string;
};

function parsePayload(payload: unknown): { restoreDrill?: { ids?: Partial<DrillIds> } } {
  let value = payload;
  for (let depth = 0; depth < 2 && typeof value === "string"; depth += 1) {
    value = JSON.parse(value) as unknown;
  }
  return value as { restoreDrill?: { ids?: Partial<DrillIds> } };
}

const sql = createSqlClient(databaseUrl);
const marker = await sql`select payload from bloom_stripe_events where id = ${expectedEventId} limit 1`;
if (marker.length === 0) throw new Error("Expected restore drill marker is missing.");
const ids = parsePayload((marker[0] as { payload: unknown }).payload).restoreDrill?.ids;
if (!ids?.userA || !ids.workspace || !ids.document || !ids.filename) throw new Error("Restore drill marker payload is incomplete.");

const persistence = createDatabasePersistence(databaseUrl);
const descriptor = {
  filename: ids.filename,
  documentId: ids.document,
  workspaceId: ids.workspace,
  userId: ids.userA,
  permission: "write" as const,
};

const authorized = await persistence.authorize(descriptor);
if (authorized !== "write") throw new Error(`Expected write authorization for restored sync document, got ${authorized}.`);

const document = await persistence.load(descriptor);
if (document.storage?.mode !== "database" || document.storage.documentId !== ids.document || document.storage.version !== 7) {
  throw new Error("Restored sync document did not preserve database storage metadata.");
}

document.frontmatter = { ...document.frontmatter, restoreDrillSyncPersistence: true };
const saved = await persistence.save(descriptor, document);
if (saved.storage?.version !== 8) throw new Error(`Expected sync persistence save to advance version to 8, got ${saved.storage?.version ?? "<missing>"}.`);

const rows = await sql`select version, frontmatter from bloom_documents where id = ${ids.document} and workspace_id = ${ids.workspace}`;
const row = rows[0] as { version: string | number; frontmatter: string | Record<string, unknown> } | undefined;
const frontmatter = typeof row?.frontmatter === "string" ? JSON.parse(row.frontmatter) as Record<string, unknown> : row?.frontmatter;
if (!row || Number(row.version) !== 8 || frontmatter?.restoreDrillSyncPersistence !== true) {
  throw new Error("Sync persistence save was not visible in the restored database.");
}

console.log(JSON.stringify({
  syncRestorePersistence: "ok",
  authorization: authorized,
  loadedVersion: 7,
  savedVersion: 8,
}));

await sql.end();
