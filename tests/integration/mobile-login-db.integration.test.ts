/**
 * App sign-in (authorization code + PKCE) against a real Postgres: one-time codes, expiry, replay,
 * the issued app token, self-revocation and the schema check. Runs only with
 * BLOOMMD_TEST_DATABASE_URL (a throwaway database; it is migrated here), e.g.
 * `docker run -d -e POSTGRES_PASSWORD=qa -p 55434:5432 postgres:17-alpine`.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;

describe.skipIf(!url)("app sign-in (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let auth: typeof import("../../apps/app/src/lib/auth");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  let alice: string;

  const pkce = () => {
    const verifier = randomBytes(32).toString("base64url");
    return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
  };
  const newState = () => randomBytes(16).toString("base64url");
  const bearer = (method: string, path: string, token: string) =>
    new Request(`https://app.bloommd.test${path}`, { method, headers: { Authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    auth = await import("../../apps/app/src/lib/auth");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    await db.migrateMarketSchema();
    alice = (await db.upsertMarketUser({ provider: "password", email: `alice-app-${run}@bloommd.test`, name: "Alice" }))!.id;
    await db.getOrCreatePersonalWorkspace(alice);
  });

  afterAll(async () => {
    await sql?.end();
  });

  test("the migrated schema passes the readiness check", async () => {
    expect(await db.checkDatabaseReady()).toBe(true);
  });

  test("a code is exchanged once, with the right verifier, for an app token", async () => {
    const { verifier, challenge } = pkce();
    const state = newState();
    const { code } = await db.createMobileAuthCode({ userId: alice, challenge, state, deviceName: "iPad" });
    const stored = await sql`select code_hash, state_hash from bloom_mobile_auth_codes where user_id = ${alice} order by created_at desc limit 1`;
    expect(stored[0]!.code_hash).not.toBe(code);
    expect(stored[0]!.state_hash).not.toBe(state);

    const signIn = await db.exchangeMobileAuthCode({ code, verifier, state });
    expect(signIn).toMatchObject({ deviceName: "iPad", user: { id: alice, name: "Alice" } });
    expect(signIn!.token).toStartWith("bloom_pat_");
    expect(signIn!.workspaces.length).toBeGreaterThan(0);
    const days = (Date.parse(signIn!.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364);

    const listed = (await db.listAccessTokens(alice)).find((token) => token.id === signIn!.tokenId);
    expect(listed).toMatchObject({ name: "BloomMD App (iPad)", client: "mobile_app", scope: "write", workspaceIds: null, agentName: null });

    const identity = await auth.getApiRequestIdentity(bearer("GET", "/api/mobile/session", signIn!.token));
    expect(identity).toMatchObject({ authKind: "access-token", userId: alice, tokenClient: "mobile_app" });
    // Unlimited like a browser session for documents.
    expect(await auth.getApiRequestIdentity(bearer("PUT", "/api/mindmaps/plan.md", signIn!.token))).not.toBeNull();

    const audit = await sql`select event_type, details from bloom_audit_events where target_id = ${signIn!.tokenId} order by created_at`;
    expect(audit.map((row) => row.event_type)).toEqual(["access_token.created", "mobile_app.connected"]);
    expect(audit[1]!.details).toEqual({ device: "iPad" });
  });

  test("a replayed code is refused and revokes the token issued for it", async () => {
    const { verifier, challenge } = pkce();
    const state = newState();
    const { code } = await db.createMobileAuthCode({ userId: alice, challenge, state, deviceName: "iPhone" });
    const first = await db.exchangeMobileAuthCode({ code, verifier, state });
    expect(first).not.toBeNull();
    expect(await db.exchangeMobileAuthCode({ code, verifier, state })).toBeNull();
    expect(await db.resolveAccessToken(first!.token)).toBeNull();
    const audit = await sql`select event_type from bloom_audit_events where target_id = ${first!.tokenId} and event_type = 'mobile_app.code_replayed'`;
    expect(audit).toHaveLength(1);
  });

  test("a wrong verifier or state burns the code", async () => {
    const { verifier, challenge } = pkce();
    const state = newState();
    const { code } = await db.createMobileAuthCode({ userId: alice, challenge, state, deviceName: "iPad" });
    expect(await db.exchangeMobileAuthCode({ code, verifier: pkce().verifier, state })).toBeNull();
    expect(await db.exchangeMobileAuthCode({ code, verifier, state })).toBeNull();

    const second = await db.createMobileAuthCode({ userId: alice, challenge, state, deviceName: "iPad" });
    expect(await db.exchangeMobileAuthCode({ code: second.code, verifier, state: newState() })).toBeNull();
    expect(await db.exchangeMobileAuthCode({ code: second.code, verifier, state })).toBeNull();
  });

  test("an expired code is refused", async () => {
    const { verifier, challenge } = pkce();
    const state = newState();
    const { code } = await db.createMobileAuthCode({ userId: alice, challenge, state, deviceName: "iPad" });
    const hash = createHash("sha256").update(code).digest("hex");
    await sql`update bloom_mobile_auth_codes set expires_at = now() - interval '1 second' where code_hash = ${hash}`;
    expect(await db.exchangeMobileAuthCode({ code, verifier, state })).toBeNull();
  });

  test("sign-out revokes the app token and records the disconnect", async () => {
    const { verifier, challenge } = pkce();
    const state = newState();
    const { code } = await db.createMobileAuthCode({ userId: alice, challenge, state, deviceName: "iPad" });
    const signIn = (await db.exchangeMobileAuthCode({ code, verifier, state }))!;
    expect(await db.revokeMobileAppToken(alice, signIn.tokenId)).toBe(true);
    expect(await db.revokeMobileAppToken(alice, signIn.tokenId)).toBe(false);
    expect(await db.resolveAccessToken(signIn.token)).toBeNull();
    const audit = await sql`select event_type from bloom_audit_events where target_id = ${signIn.tokenId} order by created_at`;
    expect(audit.map((row) => row.event_type)).toContain("mobile_app.disconnected");
  });
});
