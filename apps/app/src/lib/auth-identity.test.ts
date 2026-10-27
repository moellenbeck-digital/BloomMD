import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getApiRequestIdentity } from "./auth";
import { __setMarketSqlForTest } from "./db";
import type { SqlClient } from "./sql-client";

const userId = "8f0c5b1e-1d2a-4b3c-9e4f-5a6b7c8d9e0f";
const tokenId = "0b5e8f3e-8a0c-4c55-9a43-6f4a3f9a0b11";
const token = `bloom_pat_${"c".repeat(43)}`;

type TokenState = "valid" | "expired" | "revoked";
let state: TokenState = "valid";
const saved = { databaseUrl: process.env.DATABASE_URL, requireAuth: process.env.BLOOMMD_REQUIRE_AUTH, apiKey: process.env.BLOOMMD_API_KEY };

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  state = "valid";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
  // Anonymous access and the instance key are open, so any fall-through would show up as an identity.
  process.env.BLOOMMD_REQUIRE_AUTH = "0";
  process.env.BLOOMMD_API_KEY = "instance-key";
  // The lookup of `resolveAccessToken`: an expired or revoked token matches no row.
  const sql = ((parts: TemplateStringsArray) => {
    const statement = parts.join("?").replace(/\s+/g, " ").trim();
    if (statement.startsWith("update bloom_access_tokens t set last_used_at")) {
      return Promise.resolve(state === "valid" ? [{ id: tokenId, user_id: userId, email: "o@example.test", name: "O", scope: "write", workspace_ids: null, agent_name: "OpenClaw", allow_share: false, client: null, expires_at: null }] : []);
    }
    return Promise.resolve([]);
  }) as unknown as SqlClient;
  __setMarketSqlForTest(sql);
});

afterEach(() => {
  __setMarketSqlForTest(null);
  restore("DATABASE_URL", saved.databaseUrl);
  restore("BLOOMMD_REQUIRE_AUTH", saved.requireAuth);
  restore("BLOOMMD_API_KEY", saved.apiKey);
});

const request = (method: string, path: string, headers: Record<string, string> = {}) => new Request(`https://app.bloommd.test${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers } });

describe("the identity of an agent token", () => {
  test("a valid agent token is the identity with its agent name", async () => {
    expect(await getApiRequestIdentity(request("GET", "/api/mindmaps"))).toMatchObject({ authKind: "access-token", userId, tokenId, agentName: "OpenClaw" });
  });

  test("an expired or revoked token is refused, not replaced by the instance key or anonymous access", async () => {
    for (const next of ["expired", "revoked"] as const) {
      state = next;
      // The same request carries a valid instance key: the token still decides, and it says no.
      expect(await getApiRequestIdentity(request("GET", "/api/mindmaps", { "X-API-Key": "instance-key" }))).toBeNull();
      expect(await getApiRequestIdentity(request("PATCH", "/api/mindmaps/plan.md/nodes/n1"))).toBeNull();
      expect(await getApiRequestIdentity(request("POST", "/api/sync-ticket"))).toBeNull();
      expect(await getApiRequestIdentity(request("GET", "/api/mindmaps/agent-access/rights"))).toBeNull();
    }
  });

  test("an unknown token is refused too", async () => {
    state = "revoked";
    expect(await getApiRequestIdentity(new Request("https://app.bloommd.test/api/mindmaps", { headers: { Authorization: "Bearer bloom_pat_nope" } }))).toBeNull();
  });

  test("an agent token never reaches the owner tools, even while valid", async () => {
    for (const path of ["/api/workspaces/w1/agent-rights", "/api/workspaces/w1/agent-token-proposals/p1", "/api/workspaces/w1/agent-log/c1", "/api/account/access-tokens"]) {
      expect(await getApiRequestIdentity(request("POST", path))).toBeNull();
    }
  });
});
