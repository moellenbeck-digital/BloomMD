import { afterEach, describe, expect, test } from "bun:test";
import { __setMarketSqlForTest, acceptBetaInvite, addFeedbackAttachments, addWorkspaceAgent, changeWorkspaceMemberRole, createBetaInvite, createFeedbackRecord, createTeamWorkspace, hasActiveBetaInvite, inviteWorkspaceMember, normalizeWorkspaceName, renameWorkspace, revokeWorkspaceAgent } from "./db";
import type { SqlClient } from "./sql-client";

const originalDatabaseUrl = process.env.DATABASE_URL;

function betaInviteRow(extra: { status?: string; should_send_email?: boolean } = {}) {
  return {
    email: "tester@example.test",
    status: extra.status ?? "invited",
    source: "waitlist",
    note: null,
    batch_id: null,
    invited_at: "2026-08-15T10:00:00.000Z",
    accepted_at: null,
    expires_at: null,
    revoked_at: null,
    ...(extra.should_send_email == null ? {} : { should_send_email: extra.should_send_email }),
  };
}

function sqlClientForBetaInvite(insertRows: unknown[], selectRows: unknown[] = []) {
  const statements: string[] = [];
  const sql = ((parts: TemplateStringsArray) => {
    const statement = parts.join("?").replace(/\s+/g, " ").trim();
    statements.push(statement);
    if (statement.startsWith("insert into bloom_beta_invites")) return Promise.resolve(insertRows);
    if (statement.startsWith("select email, case when revoked_at")) return Promise.resolve(selectRows);
    return Promise.resolve([]);
  }) as unknown as SqlClient;
  return { sql, statements };
}

afterEach(() => {
  if (originalDatabaseUrl == null) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  __setMarketSqlForTest(null);
});

describe("beta invite persistence", () => {
  test("sends mail for a newly created beta invite", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const { sql } = sqlClientForBetaInvite([betaInviteRow({ should_send_email: true })]);
    __setMarketSqlForTest(sql);

    const result = await createBetaInvite({ email: "Tester@Example.test", source: "waitlist" });

    expect(result.invite.email).toBe("tester@example.test");
    expect(result.shouldSendEmail).toBe(true);
  });

  test("does not resend mail for an already active beta invite", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const { sql, statements } = sqlClientForBetaInvite([], [betaInviteRow()]);
    __setMarketSqlForTest(sql);

    const result = await createBetaInvite({ email: "tester@example.test", source: "waitlist" });

    expect(result.invite.status).toBe("invited");
    expect(result.shouldSendEmail).toBe(false);
    expect(statements.some((statement) => statement.includes("where bloom_beta_invites.revoked_at is not null"))).toBe(true);
  });

  test("recognizes an active invite as signup access and marks it accepted", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("select id from bloom_beta_invites")) return Promise.resolve([{ id: "invite-1" }]);
      if (statement.startsWith("update bloom_beta_invites")) return Promise.resolve([{ id: "invite-1" }]);
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);

    await expect(hasActiveBetaInvite("Tester@Example.test")).resolves.toBe(true);
    await expect(acceptBetaInvite("Tester@Example.test")).resolves.toBe(true);
    expect(statements.some((statement) => statement.includes("status = 'invited'"))).toBe(true);
    expect(statements.some((statement) => statement.includes("accepted_at = coalesce"))).toBe(true);
  });

  test("does not accept missing or inactive beta invites", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      if (statement.startsWith("select id from bloom_beta_invites")) return Promise.resolve([]);
      if (statement.startsWith("update bloom_beta_invites")) return Promise.resolve([]);
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);

    await expect(hasActiveBetaInvite("missing@example.test")).resolves.toBe(false);
    await expect(acceptBetaInvite("missing@example.test")).resolves.toBe(false);
  });
});

describe("feedback persistence", () => {
  test("stores feedback and attachment metadata without storing binary attachment bodies", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("insert into bloom_feedback ")) {
        return Promise.resolve([{
          id: "22222222-2222-4222-8222-222222222222",
          user_id: "11111111-1111-4111-8111-111111111111",
          user_email: "tester@example.test",
          type: "bug",
          area: "web",
          message: "Die Map verschwindet nach dem Ordnerwechsel.",
          route: "/app",
          user_agent: "BunTest",
          app_version: "sha-test",
          status: "received",
          github_issue_number: null,
          github_issue_url: null,
          github_project_item_id: null,
          created_at: "2026-08-15T10:00:00.000Z",
        }]);
      }
      if (statement.startsWith("insert into bloom_feedback_attachments")) {
        return Promise.resolve([{ id: "33333333-3333-4333-8333-333333333333" }]);
      }
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);

    const feedback = await createFeedbackRecord({
      userId: "11111111-1111-4111-8111-111111111111",
      userEmail: "Tester@Example.test",
      type: "bug",
      area: "web",
      message: "Die Map verschwindet nach dem Ordnerwechsel.",
      route: "/app",
      userAgent: "BunTest",
      appVersion: "sha-test",
    });
    await addFeedbackAttachments(feedback.id, [{
      id: "33333333-3333-4333-8333-333333333333",
      kind: "screenshot",
      filename: "screen.png",
      objectKey: "feedback/222/screen.png",
      mimeType: "image/png",
      sizeBytes: 128,
      sha256: "a".repeat(64),
      retentionExpiresAt: "2026-11-13T10:00:00.000Z",
    }]);

    expect(feedback.userEmail).toBe("tester@example.test");
    expect(statements.some((statement) => statement.includes("object_key"))).toBe(true);
    expect(statements.some((statement) => statement.includes("bytea"))).toBe(false);
  });
});

describe("workspace persistence", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";

  test("normalizes workspace names before persisting them", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const values: unknown[] = [];
    const sql = ((parts: TemplateStringsArray, ...params: unknown[]) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      values.push(...params);
      if (statement.startsWith("select w.id, w.name, w.slug, w.kind, m.role")) {
        return Promise.resolve([{ id: workspaceId, name: "My Workspace", slug: "personal-111", kind: "personal", role: "owner" }]);
      }
      if (statement.startsWith("update bloom_workspaces")) {
        return Promise.resolve([{ id: workspaceId, name: "Research Team", slug: "personal-111", kind: "personal" }]);
      }
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);

    const workspace = await renameWorkspace({ userId, workspaceId, name: "  Research   Team  " });

    expect(workspace.name).toBe("Research Team");
    expect(workspace.role).toBe("owner");
    expect(statements.some((statement) => statement.startsWith("update bloom_workspaces"))).toBe(true);
    expect(values).toContain("Research Team");
  });

  test("allows only workspace owners to rename workspaces", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      if (statement.startsWith("select w.id, w.name, w.slug, w.kind, m.role")) {
        return Promise.resolve([{ id: workspaceId, name: "My Workspace", slug: "personal-111", kind: "personal", role: "editor" }]);
      }
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);

    await expect(renameWorkspace({ userId, workspaceId, name: "Research" })).rejects.toThrow("Only workspace owners");
  });

  test("rejects empty workspace names", () => {
    expect(() => normalizeWorkspaceName(" \n\t ")).toThrow("Workspace name is required.");
  });

  test("creates a team workspace and owner membership in one transaction", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const sql = ((parts: TemplateStringsArray, ...params: unknown[]) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("insert into bloom_workspaces")) {
        return Promise.resolve([{ id: workspaceId, name: "Research Team", slug: "team-research-team-1234", kind: "team" }]);
      }
      return Promise.resolve([]);
    }) as unknown as SqlClient & { begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown> };
    (sql as unknown as { begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown> }).begin = async (callback) => callback(sql);
    __setMarketSqlForTest(sql);

    const workspace = await createTeamWorkspace({ userId, name: "  Research   Team  " });

    expect(workspace.kind).toBe("team");
    expect(workspace.role).toBe("owner");
    expect(statements.some((statement) => statement.startsWith("insert into bloom_workspace_members"))).toBe(true);
  });

  test("creates a single-use editor invitation after revoking an older pending invitation", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const sql = ((parts: TemplateStringsArray, ...params: unknown[]) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("select w.id, w.name, w.slug, w.kind, m.role")) return Promise.resolve([{ id: workspaceId, name: "Research Team", slug: "team-research", kind: "team", role: "owner" }]);
      if (statement.startsWith("select email from bloom_users")) return Promise.resolve([{ email: "owner@example.test" }]);
      if (statement.startsWith("select m.user_id")) return Promise.resolve([]);
      if (statement.startsWith("insert into bloom_workspace_invitations")) return Promise.resolve([{
        id: "33333333-3333-4333-8333-333333333333",
        workspace_id: workspaceId,
        email: "editor@example.test",
        role: "editor",
        expires_at: "2099-08-15T10:00:00.000Z",
        accepted_at: null,
        revoked_at: null,
        created_at: "2026-08-15T10:00:00.000Z",
      }]);
      return Promise.resolve([]);
    }) as unknown as SqlClient & { begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown> };
    (sql as unknown as { begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown> }).begin = async (callback) => callback(sql);
    __setMarketSqlForTest(sql);

    const result = await inviteWorkspaceMember({ userId, workspaceId, email: "Editor@Example.test" });

    expect(result.invitation.email).toBe("editor@example.test");
    expect(result.invitation.role).toBe("editor");
    expect(result.token.startsWith("bloom_workspace_invite_")).toBe(true);
    expect(statements.some((statement) => statement.startsWith("update bloom_workspace_invitations"))).toBe(true);
  });

  test("protects the last owner from demotion", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      if (statement.startsWith("select w.id, w.name, w.slug, w.kind, m.role")) return Promise.resolve([{ id: workspaceId, name: "Research Team", slug: "team-research", kind: "team", role: "owner" }]);
      if (statement.startsWith("select role from bloom_workspace_members")) return Promise.resolve([{ role: "owner" }]);
      if (statement.startsWith("select user_id from bloom_workspace_members")) return Promise.resolve([{ user_id: userId }]);
      return Promise.resolve([]);
    }) as unknown as SqlClient & { begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown> };
    (sql as unknown as { begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown> }).begin = async (callback) => callback(sql);
    __setMarketSqlForTest(sql);

    await expect(changeWorkspaceMemberRole({ userId, workspaceId, memberUserId: userId, role: "viewer" })).rejects.toThrow("LAST_OWNER");
  });

  test("adds and revokes an OpenClaw service identity with a content-free audit trail", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const agentId = "33333333-3333-4333-8333-333333333333";
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("select w.id, w.name, w.slug, w.kind, m.role")) return Promise.resolve([{ id: workspaceId, name: "Research Team", slug: "team-research", kind: "team", role: "owner" }]);
      if (statement.startsWith("insert into bloom_workspace_agents")) return Promise.resolve([{
        id: agentId,
        workspace_id: workspaceId,
        provider: "openclaw",
        display_name: "OpenClaw",
        status: "active",
        created_at: "2026-09-09T10:00:00.000Z",
        revoked_at: null,
      }]);
      if (statement.startsWith("update bloom_workspace_agents")) return Promise.resolve([{ id: agentId }]);
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);

    const agent = await addWorkspaceAgent({ userId, workspaceId, provider: "openclaw" });
    await expect(revokeWorkspaceAgent({ userId, workspaceId, agentId })).resolves.toBe(true);

    expect(agent.agent.displayName).toBe("OpenClaw");
    expect(agent.pairingCode).toMatch(/^bloom_pair_/);
    expect(statements.some((statement) => statement.startsWith("insert into bloom_audit_events"))).toBe(true);
    expect(statements.some((statement) => statement.includes("insert into bloom_workspace_agents"))).toBe(true);
    expect(statements.some((statement) => statement.includes("update bloom_workspace_agents"))).toBe(true);
  });
});
