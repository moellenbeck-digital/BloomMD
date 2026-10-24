import { createHash, randomUUID } from "node:crypto";
import { createSqlClient } from "../src/lib/sql-client";
import { hashPassword } from "../src/lib/passwordAuth";
import { getApiRequestIdentity } from "../src/lib/auth";
import { getMindmapStorage } from "../src/lib/mindmap-storage";
import {
  consumeRateLimit,
  completeStripeEvent,
  createAccessToken,
  createPasswordUser,
  createSessionRecord,
  deleteAccountData,
  exportAccountData,
  findPasswordUserByEmail,
  getOrCreatePersonalWorkspace,
  getWorkspaceForUser,
  isSessionRecordActive,
  listCloudDocumentViews,
  markEmailVerified,
  migrateMarketSchema,
  recordStripeEvent,
  readCloudDocument,
  releaseStripeEvent,
  revokeAccessToken,
  revokeSessionRecord,
  resolveAccessToken,
  saveCloudDocumentView,
  writeCloudDocument,
} from "../src/lib/db";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the database release verification.");

await migrateMarketSchema();
const runId = randomUUID();
const emailA = `release-a-${runId}@bloommd.invalid`;
const emailB = `release-b-${runId}@bloommd.invalid`;
let userA: Awaited<ReturnType<typeof createPasswordUser>> | null = null;
let userB: Awaited<ReturnType<typeof createPasswordUser>> | null = null;
const stripeEventId = `release-event-${runId}`;

try {
  userA = await createPasswordUser({ email: emailA, name: "Release A", passwordHash: hashPassword(`Release-${runId}-A1`) });
  userB = await createPasswordUser({ email: emailB, name: "Release B", passwordHash: hashPassword(`Release-${runId}-B1`) });
  await Promise.all([markEmailVerified(userA.id), markEmailVerified(userB.id)]);

  const [workspaceA, workspaceB] = await Promise.all([
    getOrCreatePersonalWorkspace(userA.id),
    getOrCreatePersonalWorkspace(userB.id),
  ]);
  const markdownA = "# Tenant A\n\nPrivate A";
  const markdownB = "# Tenant B\n\nPrivate B";
  const [documentA, documentB] = await Promise.all([
    writeCloudDocument({ userId: userA.id, workspaceId: workspaceA.id, filename: "same-name.md", markdown: markdownA, frontmatter: {} }),
    writeCloudDocument({ userId: userB.id, workspaceId: workspaceB.id, filename: "same-name.md", markdown: markdownB, frontmatter: {} }),
  ]);

  let crossWorkspaceViewDenied = false;
  try {
    const sql = createSqlClient(process.env.DATABASE_URL!);
    await sql`
      insert into bloom_document_views (workspace_id, document_id, user_id, name, view)
      values (${workspaceA.id}, ${documentB.id}, ${userA.id}, ${`invalid-${runId}`}, '{}'::jsonb)
    `;
  } catch {
    crossWorkspaceViewDenied = true;
  }
  if (!crossWorkspaceViewDenied) throw new Error("Database accepted a document view from another workspace.");

  let foreignWorkspaceDenied = false;
  try {
    await getWorkspaceForUser(userA.id, workspaceB.id);
  } catch {
    foreignWorkspaceDenied = true;
  }
  if (!foreignWorkspaceDenied) throw new Error("Cross-workspace access was not denied.");

  const [readA, readB] = await Promise.all([
    readCloudDocument(userA.id, "same-name.md", workspaceA.id),
    readCloudDocument(userB.id, "same-name.md", workspaceB.id),
  ]);
  if (readA?.markdown !== markdownA || readB?.markdown !== markdownB) throw new Error("Tenant document isolation failed.");

  const versioned = await writeCloudDocument({
    userId: userA.id,
    workspaceId: workspaceA.id,
    filename: documentA.filename,
    markdown: `${markdownA}\n\nUpdated`,
    frontmatter: {},
    expectedVersion: documentA.version,
  });
  if (versioned.version !== documentA.version + 1) throw new Error("Optimistic versioning failed.");

  await saveCloudDocumentView({
    userId: userA.id,
    workspaceId: workspaceA.id,
    documentId: documentA.id,
    name: "Release view",
    view: { x: 10, y: 20, zoom: 1.2 },
  });
  const views = await listCloudDocumentViews(userA.id, documentA.id, workspaceA.id);
  if (views.length !== 1) throw new Error("Cloud view persistence failed.");

  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const sessionId = await createSessionRecord(userA.id, expiresAt);
  if (!sessionId || !(await isSessionRecordActive(userA.id, sessionId))) throw new Error("Session creation failed.");
  await revokeSessionRecord(userA.id, sessionId);
  if (await isSessionRecordActive(userA.id, sessionId)) throw new Error("Session revocation failed.");

  const accessToken = await createAccessToken({ userId: userA.id, name: "Release verification", expiresInDays: 1 });
  const accessIdentity = await resolveAccessToken(accessToken.token);
  if (accessIdentity?.userId !== userA.id) throw new Error("Personal access token identity failed.");
  const tokenRequest = new Request("https://bloommd.app/api/mindmaps", {
    headers: { Authorization: `Bearer ${accessToken.token}` },
  });
  const requestIdentity = await getApiRequestIdentity(tokenRequest);
  if (requestIdentity?.userId !== userA.id || requestIdentity.authKind !== "access-token") {
    throw new Error("API request identity did not resolve the personal access token.");
  }
  const tokenStorage = await getMindmapStorage(tokenRequest, requestIdentity);
  const tokenDocument = await tokenStorage.read("same-name.md");
  if (tokenDocument.storage?.workspaceId !== workspaceA.id) throw new Error("Access token did not resolve its tenant workspace.");

  let tokenCrossTenantDenied = false;
  try {
    const foreignRequest = new Request("https://bloommd.app/api/mindmaps", {
      headers: { Authorization: `Bearer ${accessToken.token}`, "X-BloomMD-Workspace-ID": workspaceB.id },
    });
    await getMindmapStorage(foreignRequest, requestIdentity);
  } catch {
    tokenCrossTenantDenied = true;
  }
  if (!tokenCrossTenantDenied) throw new Error("Access token crossed a workspace boundary.");
  if (!(await revokeAccessToken(userA.id, accessToken.id)) || await resolveAccessToken(accessToken.token)) {
    throw new Error("Personal access token revocation failed.");
  }
  const cascadingToken = await createAccessToken({ userId: userA.id, name: "Cascade verification", expiresInDays: 1 });

  const auditSql = createSqlClient(process.env.DATABASE_URL!);
  const auditRows = await auditSql`
    select event_type
    from bloom_audit_events
    where actor_user_id = ${userA.id}
  `;
  const auditEvents = new Set(auditRows.map((row) => (row as { event_type: string }).event_type));
  for (const requiredEvent of ["email.verified", "session.created", "session.revoked", "access_token.created", "access_token.revoked"]) {
    if (!auditEvents.has(requiredEvent)) throw new Error(`Security audit event was not persisted: ${requiredEvent}`);
  }

  const rateKey = createHash("sha256").update(runId).digest("hex");
  const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const firstAttempt = await consumeRateLimit({ action: `release-${runId}`, keyHash: rateKey, windowStartedAt, limit: 1 });
  const secondAttempt = await consumeRateLimit({ action: `release-${runId}`, keyHash: rateKey, windowStartedAt, limit: 1 });
  if (!firstAttempt?.allowed || secondAttempt?.allowed) throw new Error("Database rate limiting failed.");

  const claimed = await recordStripeEvent({ id: stripeEventId, type: "release.verification", payload: { runId } });
  const concurrentClaim = await recordStripeEvent({ id: stripeEventId, type: "release.verification", payload: { runId } });
  if (!claimed || concurrentClaim) throw new Error("Stripe event claim lease failed.");
  await releaseStripeEvent(stripeEventId, "verification-retry");
  if (!(await recordStripeEvent({ id: stripeEventId, type: "release.verification", payload: { runId } }))) {
    throw new Error("Stripe event retry was not reclaimable.");
  }
  await completeStripeEvent(stripeEventId);
  if (await recordStripeEvent({ id: stripeEventId, type: "release.verification", payload: { runId } })) {
    throw new Error("Completed Stripe event was claimed again.");
  }

  const exported = await exportAccountData(userA.id);
  if (exported.documents.length !== 1 || exported.documents[0]?.markdown !== `${markdownA}\n\nUpdated`) {
    throw new Error("Account export did not include the tenant document.");
  }

  await auditSql`delete from bloom_audit_events where actor_user_id in (${userA.id}, ${userB.id})`;
  await Promise.all([deleteAccountData(userA.id), deleteAccountData(userB.id)]);
  const [deletedA, deletedB] = await Promise.all([findPasswordUserByEmail(emailA), findPasswordUserByEmail(emailB)]);
  if (deletedA || deletedB) throw new Error("Account deletion did not remove temporary users.");
  if (await resolveAccessToken(cascadingToken.token)) throw new Error("Account deletion did not revoke access tokens.");
  userA = null;
  userB = null;

  console.log(JSON.stringify({
    schema: "ok",
    workspaceIsolation: true,
    sameFilenameIsolated: true,
    tenantViewConstraint: true,
    optimisticVersioning: true,
    savedViews: true,
    sessionRevocation: true,
    accessTokenIsolation: true,
    accessTokenRequestPath: true,
    accessTokenRevocation: true,
    securityAuditEvents: true,
    databaseRateLimit: true,
    stripeDeliveryRetry: true,
    accountExport: true,
    accountDeletion: true,
    documentIdsDistinct: documentA.id !== documentB.id,
  }));
} finally {
  const sql = createSqlClient(process.env.DATABASE_URL!);
  await sql`delete from bloom_stripe_events where id = ${stripeEventId}`.catch(() => undefined);
  if (userA) await sql`delete from bloom_audit_events where actor_user_id = ${userA.id}`.catch(() => undefined);
  if (userB) await sql`delete from bloom_audit_events where actor_user_id = ${userB.id}`.catch(() => undefined);
  if (userA) await deleteAccountData(userA.id).catch(() => undefined);
  if (userB) await deleteAccountData(userB.id).catch(() => undefined);
}
