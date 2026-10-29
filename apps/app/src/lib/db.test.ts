import { afterEach, describe, expect, test } from "bun:test";
import { __setMarketSqlForTest, acceptBetaInvite, addFeedbackAttachments, addWorkspaceAgent, authenticateWorkspaceAgent, changeWorkspaceMemberRole, createBetaInvite, createFeedbackRecord, createTeamWorkspace, finishAgentTokenProposal, getAgentTokenRights, hasActiveBetaInvite, inviteWorkspaceMember, listAgentTokensForWorkspace, migrateMarketSchema, normalizeWorkspaceName, recordAgentTokenChange, renameWorkspace, resolveAccessToken, revokeAccessToken, revokeWorkspaceAgent, setAgentTokenRights } from "./db";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  test("a revoked workspace agent token is refused on the very next call, without any cache", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const agentId = "33333333-3333-4333-8333-333333333333";
    const token = `bloom_agent_${"a".repeat(43)}`;
    let revoked = false;
    let lookups = 0;
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      if (statement.startsWith("update bloom_workspace_agents set last_seen_at")) {
        lookups += 1;
        // The row is found only while the agent is active: the lookup carries the status check itself.
        expect(statement).toContain("status = 'active'");
        return Promise.resolve(revoked ? [] : [{ id: agentId, workspace_id: workspaceId, display_name: "OpenClaw" }]);
      }
      if (statement.startsWith("update bloom_workspace_agents")) { revoked = true; return Promise.resolve([{ id: agentId }]); }
      if (statement.startsWith("select w.id, w.name, w.slug, w.kind, m.role")) return Promise.resolve([{ id: workspaceId, name: "Research Team", slug: "team-research", kind: "team", role: "owner" }]);
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    (sql as unknown as { notify: unknown }).notify = async () => undefined;
    __setMarketSqlForTest(sql);

    await expect(authenticateWorkspaceAgent(token)).resolves.toMatchObject({ id: agentId });
    await revokeWorkspaceAgent({ userId, workspaceId, agentId });
    await expect(authenticateWorkspaceAgent(token)).rejects.toThrow("Invalid agent token.");
    expect(lookups).toBe(2);
  });
});

describe("agent token rights, proposals and log", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  const tokenId = "44444444-4444-4444-8444-444444444444";
  const proposalId = "55555555-5555-4555-8555-555555555555";

  function rightsSql(options: { role?: string; eligible?: boolean; defaultAccess?: string | null; areas?: Array<{ area: string; access: string }> } = {}) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: Array<{ statement: string; params: unknown[] }> = [];
    const sql = ((parts: TemplateStringsArray, ...params: unknown[]) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push({ statement, params });
      if (statement.startsWith("select w.id, w.name, w.slug, w.kind, m.role")) return Promise.resolve([{ id: workspaceId, name: "Team", slug: "team", kind: "team", role: options.role ?? "owner" }]);
      if (statement.startsWith("select t.id from bloom_access_tokens t")) return Promise.resolve(options.eligible === false ? [] : [{ id: tokenId }]);
      if (statement.startsWith("select default_access from bloom_agent_token_rights")) return Promise.resolve(options.defaultAccess === null ? [] : [{ default_access: options.defaultAccess ?? "write" }]);
      if (statement.startsWith("select area, access from bloom_agent_token_area_rights")) return Promise.resolve(options.areas ?? []);
      if (statement.startsWith("insert into bloom_agent_token_changes")) return Promise.resolve([{ id: "66666666-6666-4666-8666-666666666666" }]);
      if (statement.startsWith("update bloom_agent_token_proposals")) return Promise.resolve([{ id: proposalId }]);
      return Promise.resolve([]);
    }) as unknown as SqlClient & { begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown>; json: (value: unknown) => unknown };
    (sql as unknown as { begin: unknown }).begin = async (callback: (transaction: SqlClient) => Promise<unknown>) => callback(sql);
    (sql as unknown as { json: unknown }).json = (value: unknown) => value;
    (sql as unknown as { notify: unknown }).notify = async () => undefined;
    __setMarketSqlForTest(sql);
    return statements;
  }

  test("without an entry an agent token may only propose; an unknown value never grants more", async () => {
    rightsSql({ defaultAccess: null });
    expect(await getAgentTokenRights(tokenId, workspaceId)).toEqual({ access: "propose", areas: {} });
    rightsSql({ defaultAccess: "admin", areas: [{ area: "Arbeit", access: "root" }, { area: "Learnings/dev-team", access: "write" }] });
    expect(await getAgentTokenRights(tokenId, workspaceId)).toEqual({ access: "propose", areas: { Arbeit: "propose", "Learnings/dev-team": "write" } });
  });

  test("rights are read from the database on every call", async () => {
    const statements = rightsSql();
    await getAgentTokenRights(tokenId, workspaceId);
    await getAgentTokenRights(tokenId, workspaceId);
    expect(statements.filter(({ statement }) => statement.startsWith("select default_access from bloom_agent_token_rights"))).toHaveLength(2);
  });

  test("the workspace owner replaces the rights of an agent token; sub-areas are stored with a folded key", async () => {
    const statements = rightsSql();
    const rights = await setAgentTokenRights({ userId, workspaceId, tokenId, rights: { access: "read", areas: { "Learnings/dev-team": "write", Arbeit: "propose" } } });
    expect(rights.access).toBe("write"); // what the (mocked) database returns afterwards
    const writes = statements.filter(({ statement }) => /^(insert into|delete from) bloom_agent_token/.test(statement));
    expect(writes.map(({ statement }) => statement.split(" (")[0])).toEqual(["insert into bloom_agent_token_rights", "delete from bloom_agent_token_area_rights where access_token_id = ? and workspace_id = ?".split(" (")[0], "insert into bloom_agent_token_area_rights", "insert into bloom_agent_token_area_rights"]);
    expect(writes[2]!.params).toEqual([tokenId, workspaceId, "learnings/dev-team", "Learnings/dev-team", "write"]);
    expect(statements.some(({ statement }) => statement.startsWith("insert into bloom_audit_events"))).toBe(true);
  });

  test("only owners set rights, and only for an agent token that works in the workspace", async () => {
    rightsSql({ role: "editor" });
    await expect(setAgentTokenRights({ userId, workspaceId, tokenId, rights: { access: "write", areas: {} } })).rejects.toThrow("Only workspace owners");
    await expect(listAgentTokensForWorkspace(userId, workspaceId)).rejects.toThrow("Only workspace owners");
    const statements = rightsSql({ eligible: false });
    await expect(setAgentTokenRights({ userId, workspaceId, tokenId, rights: { access: "write", areas: {} } })).rejects.toThrow("Agent token not found.");
    expect(statements.some(({ statement }) => statement.startsWith("insert into bloom_agent_token_rights"))).toBe(false);
  });

  test("an approval names the reviewer in the log and keeps the old state for undo", async () => {
    const statements = rightsSql();
    const proposal = { id: proposalId, tokenId, workspaceId, agentName: "OpenClaw", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", baseVersion: 3, proposedMarkdown: "# Neu", summary: "1 node(s)", reason: null, source: null, status: "pending" as const, reviewerName: null, reviewReason: null, reviewedAt: null, createdAt: "2026-10-27T08:00:00Z" };
    expect(await finishAgentTokenProposal({ userId, workspaceId, proposal, action: "approved", reviewerName: "Olivia Owner", applied: { beforeMarkdown: "# Alt", createdMap: false, afterVersion: 4 } })).toBe("66666666-6666-4666-8666-666666666666");
    const update = statements.find(({ statement }) => statement.startsWith("update bloom_agent_token_proposals"))!;
    expect(update.statement).toContain("status = 'pending'");
    expect(update.params).toContain("Olivia Owner");
    const log = statements.find(({ statement }) => statement.startsWith("insert into bloom_agent_token_changes"))!;
    expect(log.params).toEqual(expect.arrayContaining([tokenId, "OpenClaw", "approved", "approved", "Arbeit", "Olivia Owner", "# Alt", false, 4]));
    // Only the newest changes keep their old state.
    expect(statements.some(({ statement }) => statement.startsWith("update bloom_agent_token_changes set before_markdown = null"))).toBe(true);
  });

  test("a change log entry is written for every agent change", async () => {
    const statements = rightsSql();
    await recordAgentTokenChange({ tokenId, workspaceId, agentName: "OpenClaw", event: "written", tool: "bloommd_create_map", filename: "Arbeit – Plan.md", area: "Arbeit", createdMap: true, afterVersion: 1 });
    expect(statements.filter(({ statement }) => statement.startsWith("insert into bloom_agent_token_changes"))).toHaveLength(1);
    // Nothing to prune without an old state.
    expect(statements.some(({ statement }) => statement.startsWith("update bloom_agent_token_changes set before_markdown = null"))).toBe(false);
  });

  test("a revoked access token is refused on the next call: the lookup checks revocation itself", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    let revoked = false;
    let lookups = 0;
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      if (statement.startsWith("update bloom_access_tokens t set last_used_at")) {
        lookups += 1;
        expect(statement).toContain("t.revoked_at is null");
        expect(statement).toContain("t.expires_at > now()");
        return Promise.resolve(revoked ? [] : [{ id: tokenId, user_id: userId, email: "o@example.test", name: "O", scope: "write", workspace_ids: null, agent_name: "OpenClaw", allow_share: false, client: null, expires_at: null }]);
      }
      if (statement.startsWith("update bloom_access_tokens set revoked_at")) { revoked = true; return Promise.resolve([{ id: tokenId }]); }
      return Promise.resolve([]);
    }) as unknown as SqlClient & { json: (value: unknown) => unknown };
    (sql as unknown as { json: unknown }).json = (value: unknown) => value;
    __setMarketSqlForTest(sql);

    const token = `bloom_pat_${"b".repeat(43)}`;
    expect(await resolveAccessToken(token)).toMatchObject({ tokenId, agentName: "OpenClaw" });
    expect(await revokeAccessToken(userId, tokenId)).toBe(true);
    expect(await resolveAccessToken(token)).toBeNull();
    expect(lookups).toBe(2);
  });

  test("the migration file and the schema db:migrate applies create the same agent token tables", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const normalize = (text: string) => text.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
    const file = readFileSync(join(import.meta.dir, "../../db/009_agent_token_rights.sql"), "utf8");
    const expected = file.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map(normalize).filter(Boolean);
    const statements: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      statements.push(normalize(parts.join("?")));
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);
    await migrateMarketSchema();
    expect(expected.length).toBe(7);
    // A semicolon inside an SQL comment once broke the inline copy; every statement must match exactly.
    for (const statement of expected) expect(statements).toContain(statement);
  });

  test("the migration file and the schema db:migrate applies create the same mail budget table (#169)", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const normalize = (text: string) => text.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
    const file = readFileSync(join(import.meta.dir, "../../db/010_account_mail_budget.sql"), "utf8");
    const expected = file.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map(normalize).filter(Boolean);
    const statements: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      statements.push(normalize(parts.join("?")));
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);
    await migrateMarketSchema();
    expect(expected.length).toBe(2);
    for (const statement of expected) expect(statements).toContain(statement);
  });
});
