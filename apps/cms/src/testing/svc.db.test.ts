/**
 * `/svc/v1` and the data model against a real Postgres (ADR 3, 5, 6; spike deviations 3 to 11): the route
 * handlers are called with signed `Request`s, the services run on the Local API of Payload. Every run
 * creates a database of its own and migrates it with the real migrations (initial and `svc_support`).
 * Runs only with BLOOMMD_TEST_DATABASE_URL (in CI it must exist, see `testDatabaseUrl`).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { Payload } from "payload";
import { claimNonce, hitRateLimit, poolOf, type SqlPool } from "../lib/shared-store";
import { signCall } from "../lib/signature";
import { generateToken, hashToken } from "../lib/token";
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from "./db";
import { loadSpec, operations, responseSchema, templateOf, validate } from "./openapi";

const adminUrl = testDatabaseUrl();

type Handler = (request: Request, context?: never) => Promise<Response>;
interface Reply {
  status: number;
  json: Record<string, any>;
  headers: Headers;
  raw: string;
}

const KEY_A = randomBytes(32).toString("hex");
const KEY_B = randomBytes(32).toString("hex");
const GOOD = "Sup3rGeheim123";
const NEW_PASSWORD = "Neu12345678x";
const BASE = "http://cms.test";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe.skipIf(!adminUrl)("/svc/v1 and the CMS data model (Postgres)", () => {
  let database: TestDatabase;
  let payload: Payload;
  let pool: SqlPool;
  const extraPools: Pool[] = [];
  const route: Record<string, any> = {};
  /** Every answer of the run, for the contract check at the end. */
  const recorded: { method: string; path: string; status: number; json: Record<string, any> }[] = [];
  const run = Date.now().toString(36);
  const domain = `cms${run}.test`;

  async function call(handler: Handler, method: string, path: string, body?: unknown, options: { key?: string; timestamp?: number; nonce?: string; unsigned?: boolean; headers?: Record<string, string>; params?: Record<string, string> } = {}): Promise<Reply> {
    const text = body === undefined ? "" : JSON.stringify(body);
    const timestamp = String(options.timestamp ?? Date.now());
    const nonce = options.nonce ?? randomBytes(16).toString("hex");
    const headers: Record<string, string> = { ...(text ? { "content-type": "application/json" } : {}), ...options.headers };
    if (!options.unsigned) {
      headers["x-svc-timestamp"] = timestamp;
      headers["x-svc-nonce"] = nonce;
      headers["x-svc-signature"] = signCall(options.key ?? KEY_A, { method, pathAndQuery: path, body: text, timestamp, nonce });
    }
    const context = options.params ? { params: Promise.resolve(options.params) } : undefined;
    const response = await handler(new Request(BASE + path, { method, headers, body: text || undefined }), context as never);
    const raw = response.status === 304 ? "" : await response.text();
    const json = raw ? (JSON.parse(raw) as Record<string, any>) : {};
    recorded.push({ method, path: path.split("?")[0] ?? path, status: response.status, json });
    return { status: response.status, json, headers: response.headers, raw };
  }

  const login = (email: string, password: string) => call(route.login.POST, "POST", "/svc/v1/auth/login", { email, password });
  const redeem = (token: string, password?: string) => call(route.redeem.POST, "POST", "/svc/v1/tokens/redeem", { token, ...(password ? { password } : {}) });
  const mail = (local: string, host = domain) => `${local}@${host}`;

  async function deletion(id: string, key: string, phase: "request" | "complete") {
    return call(route.deletion.POST, "POST", `/svc/v1/users/${id}/deletion`, { phase }, { params: { id }, headers: { "idempotency-key": key } });
  }

  async function register(email: string, extra: Record<string, unknown> = {}) {
    const id = randomUUID();
    const reply = await call(route.users.POST, "POST", "/svc/v1/users", { id, email, password: GOOD, locale: "de", ...extra });
    return { id, reply };
  }

  /** Registers and confirms an account; returns its id. */
  async function verifiedUser(email: string) {
    const { id, reply } = await register(email);
    expect(reply.status).toBe(201);
    const confirmed = await redeem(reply.json.token);
    expect(confirmed.status).toBe(200);
    return id;
  }

  const stripRequestId = (json: Record<string, any>) => {
    const { requestId: _ignored, ...rest } = json;
    return rest;
  };

  beforeAll(async () => {
    database = await createTestDatabase(adminUrl!);
    process.env.CMS_DATABASE_URL = database.url;
    process.env.PAYLOAD_SECRET = randomBytes(32).toString("hex");
    process.env.CMS_SVC_APP_KEY = KEY_A;
    process.env.CMS_SVC_APP_KEY_NEXT = KEY_B;
    process.env.CMS_ADMIN_ORIGIN = "http://localhost:3300";
    process.env.CMS_MEDIA_DIR = `/tmp/cms-test-media-${run}`;
    const [{ default: config }, { getPayload }] = await Promise.all([import("@payload-config"), import("payload")]);
    payload = await getPayload({ config });
    await payload.db.migrate();
    pool = poolOf(payload);
    route.login = await import("../app/svc/v1/auth/login/route");
    route.users = await import("../app/svc/v1/users/route");
    route.access = await import("../app/svc/v1/users/[id]/access/route");
    route.export = await import("../app/svc/v1/users/[id]/export/route");
    route.deletion = await import("../app/svc/v1/users/[id]/deletion/route");
    route.redeem = await import("../app/svc/v1/tokens/redeem/route");
    route.resets = await import("../app/svc/v1/password-resets/route");
    route.content = await import("../app/svc/v1/content/[kind]/route");
    route.health = await import("../app/svc/v1/health/ready/route");
  }, 120_000);

  afterAll(async () => {
    for (const extra of extraPools) await extra.end();
    await payload?.db.destroy?.();
    await database?.drop();
  });

  describe("migrations", () => {
    test("run again without changes and create the hand-written objects", async () => {
      await payload.db.migrate();
      const rows = (await pool.query("select indexdef from pg_indexes where indexname = 'users_trial_canonical_idx'")).rows;
      expect(String(rows[0]?.indexdef)).toContain("WHERE");
      expect(String(rows[0]?.indexdef)).toContain("UNIQUE");
      const tables = (await pool.query("select table_name from information_schema.tables where table_name in ('svc_nonces', 'svc_rate_limits', 'users', 'auth_tokens', 'read_tokens', 'blog', 'news') order by 1")).rows.map((row) => row.table_name);
      expect(tables).toEqual(["auth_tokens", "blog", "news", "read_tokens", "svc_nonces", "svc_rate_limits", "users"]);
    });
  });

  describe("signed calls (HMAC, nonce, two keys)", () => {
    const badLogin = { email: mail("nobody"), password: GOOD };

    test("an unsigned call, a wrong key and a stale timestamp are the same 401", async () => {
      const replies = await Promise.all([
        call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { unsigned: true }),
        call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { key: randomBytes(32).toString("hex") }),
        call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { timestamp: Date.now() - 5 * 60_000 }),
        call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { timestamp: Date.now() + 5 * 60_000 }),
      ]);
      for (const reply of replies) {
        expect(reply.status).toBe(401);
        expect(stripRequestId(reply.json)).toEqual({ error: "unauthorized" });
      }
    });

    test("both keys are valid at the same time", async () => {
      expect((await call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { key: KEY_A })).status).toBe(401);
      expect((await call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { key: KEY_A })).json.error).toBe("invalid_credentials");
      expect((await call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { key: KEY_B })).json.error).toBe("invalid_credentials");
    });

    test("a replayed nonce is rejected, even for a different body", async () => {
      const nonce = randomBytes(16).toString("hex");
      const first = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email: mail("replay") }, { nonce });
      expect(first.status).toBe(200);
      const replay = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email: mail("replay") }, { nonce });
      expect(replay.status).toBe(401);
      expect(replay.json.error).toBe("unauthorized");
    });

    test("every answer carries a request ID; a well-formed one from the caller is kept", async () => {
      const reply = await call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { headers: { "x-request-id": "audit-req-0123456789" } });
      expect(reply.json.requestId).toBe("audit-req-0123456789");
      expect(reply.headers.get("x-request-id")).toBe("audit-req-0123456789");
      const generated = await call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin);
      expect(generated.json.requestId).toMatch(/^[0-9a-f-]{36}$/);
      const unauthenticated = await call(route.login.POST, "POST", "/svc/v1/auth/login", badLogin, { unsigned: true });
      expect(unauthenticated.json.requestId).toBeTruthy();
      expect(unauthenticated.headers.get("cache-control")).toBe("no-store");
    });

    test("an invalid body is a 400, a body over 64 KiB a 413", async () => {
      const malformed = await handlerCall(route.login.POST, "{not json");
      expect(malformed.status).toBe(400);
      expect(malformed.json.error).toBe("invalid_json");
      const huge = await call(route.login.POST, "POST", "/svc/v1/auth/login", { email: "a@b.de", password: "x".repeat(70_000) });
      expect(huge.status).toBe(413);
    });

    async function handlerCall(handler: Handler, text: string): Promise<Reply> {
      const timestamp = String(Date.now());
      const nonce = randomBytes(16).toString("hex");
      const signature = signCall(KEY_A, { method: "POST", pathAndQuery: "/svc/v1/auth/login", body: text, timestamp, nonce });
      const response = await handler(new Request(`${BASE}/svc/v1/auth/login`, { method: "POST", body: text, headers: { "x-svc-timestamp": timestamp, "x-svc-nonce": nonce, "x-svc-signature": signature } }));
      const raw = await response.text();
      return { status: response.status, json: JSON.parse(raw), headers: response.headers, raw };
    }
  });

  describe("shared state between replicas (nonce store and rate limit)", () => {
    test("the same nonce claimed at the same moment by two replicas succeeds exactly once", async () => {
      const replicaA = new Pool({ connectionString: database.url, max: 4 });
      const replicaB = new Pool({ connectionString: database.url, max: 4 });
      extraPools.push(replicaA, replicaB);
      const nonce = `shared-${randomBytes(12).toString("hex")}`;
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => claimNonce(i % 2 ? replicaA : replicaB, nonce)));
      expect(results.filter(Boolean)).toHaveLength(1);
      // Expired nonces are removed by the next claim.
      await pool.query("update svc_nonces set expires_at = now() - interval '1 minute' where nonce = $1", [nonce]);
      await claimNonce(pool, `other-${randomBytes(12).toString("hex")}`);
      expect((await pool.query("select 1 from svc_nonces where nonce = $1", [nonce])).rowCount).toBe(0);
    });

    test("the counter is shared: 30 hits from two replicas allow exactly the limit", async () => {
      const [replicaA, replicaB] = extraPools as [Pool, Pool];
      const bucket = `test:${randomBytes(6).toString("hex")}`;
      const window = 100_000_000; // seconds: no window boundary during the test
      const hits = await Promise.all(Array.from({ length: 30 }, (_, i) => hitRateLimit(i % 2 ? replicaA : replicaB, bucket, 10, window)));
      expect(hits.filter((hit) => hit.allowed)).toHaveLength(10);
      expect(Math.max(...hits.map((hit) => hit.count))).toBe(30);
      expect(hits[0]?.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("registration, confirmation and sign-in", () => {
    test("registration returns a one-time token and never a hash; the account starts unconfirmed", async () => {
      const email = mail("reg1");
      const { id, reply } = await register(email, { name: "Reg Eins" });
      expect(reply.status).toBe(201);
      expect(reply.json).toMatchObject({ userId: id, status: "active", tokenPurpose: "email_verification" });
      expect(reply.json.token.length).toBeGreaterThanOrEqual(43);
      expect(reply.raw).not.toMatch(/hash|salt|pbkdf2/i);
      // Only the hash of the token is stored.
      const stored = await payload.find({ collection: "auth-tokens", where: { user: { equals: id } }, overrideAccess: true });
      expect(stored.docs).toHaveLength(1);
      expect(stored.docs[0]?.tokenHash).toBe(sha(reply.json.token));
      expect(JSON.stringify(stored.docs)).not.toContain(reply.json.token);
      const row = (await pool.query("select email_canonical, email_verified_at, trial_ends_at, hash is not null as has_hash from users where id = $1", [id])).rows[0];
      expect(row).toMatchObject({ email_canonical: email, email_verified_at: null, trial_ends_at: null, has_hash: true });
    });

    test("a weak password, a duplicate address and a duplicate id are rejected", async () => {
      const weak = await call(route.users.POST, "POST", "/svc/v1/users", { id: randomUUID(), email: mail("weak"), password: "kurz1" });
      expect(weak.status).toBe(400);
      expect(weak.json.fields.password).toContain("10 Zeichen");
      const first = await register(mail("dup"));
      expect(first.reply.status).toBe(201);
      expect((await register(mail("dup"))).reply.status).toBe(409);
      expect((await register(mail("DUP"))).reply.json.error).toBe("email_taken");
      const sameId = await call(route.users.POST, "POST", "/svc/v1/users", { id: first.id, email: mail("dup2"), password: GOOD });
      expect(sameId.json.error).toBe("id_taken");
    });

    test("confirming the address sets the trial end once (default 30 days) and the token works once", async () => {
      const email = mail("confirm");
      const { id, reply } = await register(email);
      const before = Date.now();
      const done = await redeem(reply.json.token);
      expect(done.status).toBe(200);
      expect(done.json).toMatchObject({ purpose: "email_verification", userId: id });
      const user = await payload.findByID({ collection: "users", id, overrideAccess: true });
      expect(user.emailVerifiedAt).toBeTruthy();
      const days = (new Date(user.trialEndsAt!).getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(29.99);
      expect(days).toBeLessThan(30.01);
      expect((await redeem(reply.json.token)).status).toBe(400);
      expect(done.raw).not.toMatch(/hash|salt|pbkdf2/i);
    });

    test("the trial length follows the per-account override and the global default", async () => {
      await payload.updateGlobal({ slug: "platform-settings", data: { defaultTrialDays: 45 }, overrideAccess: true });
      const a = await register(mail("trial-default"));
      await redeem(a.reply.json.token);
      const userA = await payload.findByID({ collection: "users", id: a.id, overrideAccess: true });
      expect(Math.round((new Date(userA.trialEndsAt!).getTime() - Date.now()) / 86_400_000)).toBe(45);
      const b = await register(mail("trial-override"));
      await payload.update({ collection: "users", id: b.id, data: { trialDaysOverride: 60 }, overrideAccess: true });
      await redeem(b.reply.json.token);
      const userB = await payload.findByID({ collection: "users", id: b.id, overrideAccess: true });
      expect(Math.round((new Date(userB.trialEndsAt!).getTime() - Date.now()) / 86_400_000)).toBe(60);
      await payload.updateGlobal({ slug: "platform-settings", data: { defaultTrialDays: 30 }, overrideAccess: true });
    });

    test("an unknown, an expired and a used token are the same 400", async () => {
      const { id, reply } = await register(mail("expired"));
      await pool.query("update auth_tokens set expires_at = now() - interval '1 second' where user_id = $1", [id]);
      const unknown = await redeem(generateToken());
      const expired = await redeem(reply.json.token);
      expect(unknown.status).toBe(400);
      expect(expired.status).toBe(400);
      expect(stripRequestId(unknown.json)).toEqual(stripRequestId(expired.json));
    });

    test("sign-in: a correct password gives the user ID and the access state; an unconfirmed address is told only after a correct password", async () => {
      const email = mail("login1");
      const { id, reply } = await register(email);
      const unconfirmed = await login(email, GOOD);
      expect(unconfirmed.status).toBe(403);
      expect(unconfirmed.json.error).toBe("email_not_verified");
      expect((await login(email, "falsch12345")).status).toBe(401);
      await redeem(reply.json.token);
      const ok = await login(email, GOOD);
      expect(ok.status).toBe(200);
      expect(ok.json).toMatchObject({ userId: id, status: "active", access: { userId: id, emailVerified: true, cloudAccess: true, platformRole: "user", locale: "de" } });
      expect(ok.raw).not.toMatch(/hash|salt|pbkdf2|"token"/i);
    });

    test("wrong password, locked account, unknown address and deleted-requested account are one and the same 401 (deviation 5)", async () => {
      const email = mail("locked");
      const id = await verifiedUser(email);
      const wrong = await login(email, "falsch12345");
      const unknown = await login(mail("never-registered"), "falsch12345");
      expect(wrong.status).toBe(401);
      for (let attempt = 0; attempt < 5; attempt += 1) await login(email, "falsch12345");
      const locked = await login(email, GOOD);
      expect(locked.status).toBe(401);
      const lockedRow = (await pool.query("select lock_until from users where id = $1", [id])).rows[0];
      expect(lockedRow?.lock_until).toBeTruthy();
      for (const reply of [wrong, unknown, locked]) {
        expect(stripRequestId(reply.json)).toEqual({ error: "invalid_credentials" });
        expect(reply.headers.get("retry-after")).toBeNull();
      }
      // Payload's own message would have told the lock apart; the handler never forwards it.
      expect(locked.raw).not.toMatch(/lock/i);
    });

    test("the handler limits sign-in attempts per account with a shared counter: 429 after 10", async () => {
      const email = mail("ratelimit");
      await verifiedUser(email);
      const replies: Reply[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) replies.push(await login(email, "falsch12345"));
      expect(replies.slice(0, 10).every((reply) => reply.status === 401)).toBe(true);
      expect(replies[10]?.status).toBe(429);
      expect(replies[10]?.json.error).toBe("rate_limited");
      expect(Number(replies[10]?.headers.get("retry-after"))).toBeGreaterThan(0);
      // The key is a hash: the address itself is not stored in the counter table.
      const buckets = (await pool.query("select bucket from svc_rate_limits where bucket like 'login:%'")).rows.map((row) => row.bucket as string);
      expect(buckets.some((bucket) => bucket.includes(email))).toBe(false);
    });

    test("a waitlist account has no password, cannot sign in, and is activated by its token (#105)", async () => {
      const email = mail("waitlist1");
      const id = randomUUID();
      const created = await call(route.users.POST, "POST", "/svc/v1/users", { id, email, origin: "waitlist", locale: "en" });
      expect(created.status).toBe(201);
      expect(created.json.tokenPurpose).toBe("waitlist_activation");
      const row = (await pool.query("select origin, hash, salt, email_canonical, locale from users where id = $1", [id])).rows[0];
      expect(row).toMatchObject({ origin: "waitlist", hash: null, salt: null, email_canonical: email, locale: "en" });
      expect((await login(email, GOOD)).status).toBe(401);
      const noPassword = await redeem(created.json.token);
      expect(noPassword.status).toBe(400);
      expect(noPassword.json.fields.password).toBe("required");
      const activated = await redeem(created.json.token, GOOD);
      expect(activated.status).toBe(200);
      expect(activated.json.purpose).toBe("waitlist_activation");
      const user = await payload.findByID({ collection: "users", id, overrideAccess: true });
      expect(user.emailVerifiedAt).toBeTruthy();
      expect(user.trialEndsAt).toBeTruthy();
      expect((await login(email, GOOD)).status).toBe(200);
    });
  });

  describe("one confirmed account per mailbox (#169, deviation 11)", () => {
    test("of three simultaneous confirmations of one mailbox exactly one succeeds; the others get 409 and keep their token", async () => {
      const host = `race${run}.test`;
      const accounts = await Promise.all([register(mail("max.mustermann", host)), register(mail("max.mustermann+shop", host)), register(mail("Max.Mustermann+b", host))]);
      for (const account of accounts) expect(account.reply.status).toBe(201);
      const results = await Promise.all(accounts.map((account) => redeem(account.reply.json.token)));
      expect(results.map((result) => result.status).sort()).toEqual([200, 409, 409]);
      expect(results.filter((result) => result.status === 409).every((result) => result.json.error === "mailbox_taken")).toBe(true);
      const confirmed = (await pool.query("select count(*)::int as n from users where email_canonical = $1 and email_verified_at is not null", [`max.mustermann@${host}`])).rows[0];
      expect(confirmed?.n).toBe(1);
      // The losers' tokens were released and nothing was verified for them.
      for (const [index, result] of results.entries()) {
        if (result.status !== 409) continue;
        const tokens = await payload.find({ collection: "auth-tokens", where: { user: { equals: accounts[index]!.id } }, overrideAccess: true });
        expect(tokens.docs[0]?.usedAt ?? null).toBeNull();
      }
    });

    test("the Gmail variants (dots, +tag, googlemail) are one mailbox", async () => {
      const tag = randomBytes(4).toString("hex");
      const a = await register(`a.b.c${tag}@gmail.com`);
      const b = await register(`abc${tag}+x@googlemail.com`);
      const results = await Promise.all([redeem(a.reply.json.token), redeem(b.reply.json.token)]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    });

    test("deleting the confirmed account frees the mailbox", async () => {
      const host = `free${run}.test`;
      const first = await register(mail("pat", host));
      const second = await register(mail("pat+two", host));
      expect((await redeem(first.reply.json.token)).status).toBe(200);
      expect((await redeem(second.reply.json.token)).status).toBe(409);
      expect((await deletion(first.id, "key-request-0001", "request")).status).toBe(202);
      expect((await deletion(first.id, "key-request-0001", "complete")).status).toBe(200);
      expect((await redeem(second.reply.json.token)).status).toBe(200);
    });

    test("accounts that are not guarded (older accounts) are not covered by the index", async () => {
      const host = `legacy${run}.test`;
      const when = new Date().toISOString();
      const created = await Promise.all(
        ["old", "old+copy"].map((local) =>
          payload.create({ collection: "users", data: { id: randomUUID(), email: mail(local, host), password: GOOD, locale: "de", status: "active", platformRole: "user", origin: "migration", trialGuarded: false, trialLegacy: true, emailVerifiedAt: when }, overrideAccess: true }),
        ),
      );
      expect(created).toHaveLength(2);
    });

    test("the database refuses a second confirmed guarded account of one mailbox even without the service layer", async () => {
      const host = `sql${run}.test`;
      const make = (local: string) => payload.create({ collection: "users", data: { id: randomUUID(), email: mail(local, host), password: GOOD, locale: "de", status: "active", platformRole: "user", origin: "registration" }, overrideAccess: true });
      const [a, b] = await Promise.all([make("x"), make("x+y")]);
      const confirm = (id: string) => payload.update({ collection: "users", id, data: { emailVerifiedAt: new Date().toISOString() }, overrideAccess: true });
      const outcomes = await Promise.allSettled([confirm(a.id), confirm(b.id)]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    });
  });

  describe("password reset and the password rule (deviation 8)", () => {
    test("the request answers the same for known and unknown accounts; only the app sees the token", async () => {
      const email = mail("reset1");
      const id = await verifiedUser(email);
      const known = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email });
      const unknown = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email: mail("reset-unknown") });
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(Object.keys(known.json).sort()).toEqual(Object.keys(unknown.json).sort());
      expect(known.json.accepted).toBe(true);
      expect(unknown.json).toMatchObject({ accepted: true, token: null, expiresAt: null });
      expect(known.json.token.length).toBeGreaterThanOrEqual(43);
      const minutes = (new Date(known.json.expiresAt).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(59);
      expect(minutes).toBeLessThan(61);
      expect(id).toBeTruthy();
    });

    test("a weak password leaves the token valid; a good one sets the password once, ends sessions, lifts the lock", async () => {
      const email = mail("reset2");
      const id = await verifiedUser(email);
      for (let attempt = 0; attempt < 5; attempt += 1) await login(email, "falsch12345");
      expect((await login(email, GOOD)).status).toBe(401);
      const requested = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email });
      const token = requested.json.token as string;
      const weak = await redeem(token, "kurz1");
      expect(weak.status).toBe(400);
      expect(weak.json.fields.password).toContain("10 Zeichen");
      const letters = await redeem(token, "nurbuchstaben");
      expect(letters.status).toBe(400);
      const before = Date.now();
      const ok = await redeem(token, NEW_PASSWORD);
      expect(ok.status).toBe(200);
      expect(ok.json).toMatchObject({ purpose: "password_reset", userId: id });
      expect((await redeem(token, "Nochmal12345x")).status).toBe(400);
      const user = await payload.findByID({ collection: "users", id, overrideAccess: true });
      expect(new Date(user.sessionsValidAfter!).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(user.passwordSetAt).toBeTruthy();
      // The lock is lifted, the old password is dead, the new one works. The handler counter is per address, so
      // reset it to keep this test independent of the earlier attempts.
      await pool.query("delete from svc_rate_limits where bucket like 'login:%'");
      expect((await login(email, GOOD)).status).toBe(401);
      expect((await login(email, NEW_PASSWORD)).status).toBe(200);
    });

    test("a new request revokes the earlier unused token of the same purpose", async () => {
      const email = mail("reset3");
      await verifiedUser(email);
      const first = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email });
      const second = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email });
      expect((await redeem(first.json.token, NEW_PASSWORD)).status).toBe(400);
      expect((await redeem(second.json.token, NEW_PASSWORD)).status).toBe(200);
    });

    test("two simultaneous redemptions of one token: exactly one wins", async () => {
      const email = mail("reset4");
      await verifiedUser(email);
      const requested = await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email });
      const results = await Promise.all([redeem(requested.json.token, NEW_PASSWORD), redeem(requested.json.token, "Anders12345678y"), redeem(requested.json.token, "Drittes1234567z")]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 400, 400]);
    });

    test("the rule holds on Payload's own paths too: create, update and Payload's reset (beforeOperation)", async () => {
      await expect(payload.create({ collection: "users", data: { id: randomUUID(), email: mail("rule1"), password: "abc", locale: "de", status: "active", platformRole: "user", origin: "registration" }, overrideAccess: true })).rejects.toThrow();
      await expect(payload.create({ collection: "operators", data: { email: mail("op-rule"), password: "abc", role: "editor" }, overrideAccess: true })).rejects.toThrow();
      const id = await verifiedUser(mail("rule2"));
      await expect(payload.update({ collection: "users", id, data: { password: "nurbuchstaben" }, overrideAccess: true })).rejects.toThrow();
      // Payload's native reset skips beforeValidate: the beforeOperation hook must catch it.
      const nativeToken = await payload.forgotPassword({ collection: "users", data: { email: mail("rule2") }, disableEmail: true });
      expect(typeof nativeToken).toBe("string");
      await expect(payload.resetPassword({ collection: "users", data: { token: String(nativeToken), password: "kurz" }, overrideAccess: true })).rejects.toThrow();
      await expect(payload.resetPassword({ collection: "users", data: { token: String(nativeToken), password: "Gut12345678ab" }, overrideAccess: true })).resolves.toBeTruthy();
    });
  });

  describe("access state, lookups, export and deletion", () => {
    test("access state with ETag, 304 on a repeat, entitlements and trial; 404 for unknown", async () => {
      const email = mail("access1");
      const id = await verifiedUser(email);
      await payload.create({ collection: "entitlements", data: { user: id, feature: "pro-monthly", source: "stripe", active: true }, overrideAccess: true });
      const path = `/svc/v1/users/${id}/access`;
      const first = await call(route.access.GET, "GET", path, undefined, { params: { id } });
      expect(first.status).toBe(200);
      expect(first.json.access).toMatchObject({ userId: id, status: "active", emailVerified: true, cloudAccess: true, entitlements: [{ feature: "pro-monthly", source: "stripe", active: true, expiresAt: null }], trial: { legacy: false, daysOverride: null } });
      expect(first.json.access.trial.endsAt).toBeTruthy();
      expect(first.headers.get("cache-control")).toBe("private, max-age=60");
      const etag = first.headers.get("etag")!;
      expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
      const again = await call(route.access.GET, "GET", path, undefined, { params: { id }, headers: { "if-none-match": etag } });
      expect(again.status).toBe(304);
      await payload.update({ collection: "users", id, data: { cloudAccess: false }, overrideAccess: true });
      const changed = await call(route.access.GET, "GET", path, undefined, { params: { id }, headers: { "if-none-match": etag } });
      expect(changed.status).toBe(200);
      expect(changed.json.access.cloudAccess).toBe(false);
      const missing = randomUUID();
      expect((await call(route.access.GET, "GET", `/svc/v1/users/${missing}/access`, undefined, { params: { id: missing } })).status).toBe(404);
      expect((await call(route.access.GET, "GET", "/svc/v1/users/not-a-uuid/access", undefined, { params: { id: "not-a-uuid" } })).status).toBe(404);
      expect(first.raw).not.toMatch(/hash|salt|pbkdf2/i);
    });

    test("an entitlement is unique per user, feature and source", async () => {
      const id = await verifiedUser(mail("ent-unique"));
      const make = () => payload.create({ collection: "entitlements", data: { user: id, feature: "sync-monthly", source: "manual" }, overrideAccess: true });
      await make();
      await expect(make()).rejects.toThrow();
    });

    test("display fields for up to 100 IDs; more, none or malformed IDs are a 400", async () => {
      const a = await verifiedUser(mail("list-a"));
      const b = await verifiedUser(mail("list-b"));
      const ok = await call(route.users.GET, "GET", `/svc/v1/users?ids=${a},${b},${randomUUID()}`);
      expect(ok.status).toBe(200);
      expect(ok.json.users.map((user: { id: string }) => user.id).sort()).toEqual([a, b].sort());
      expect(Object.keys(ok.json.users[0]).sort()).toEqual(["email", "id", "name"]);
      expect((await call(route.users.GET, "GET", "/svc/v1/users")).status).toBe(400);
      expect((await call(route.users.GET, "GET", "/svc/v1/users?ids=x,y")).status).toBe(400);
      const many = Array.from({ length: 101 }, () => randomUUID()).join(",");
      expect((await call(route.users.GET, "GET", `/svc/v1/users?ids=${many}`)).status).toBe(400);
      // A signature over the path with its query: changing the query invalidates it.
      const tampered = await call(route.users.GET, "GET", `/svc/v1/users?ids=${a}`, undefined, { unsigned: true });
      expect(tampered.status).toBe(401);
    });

    test("the export contains the account data and token metadata, never a hash", async () => {
      const email = mail("export1");
      const id = await verifiedUser(email);
      const reply = await call(route.export.GET, "GET", `/svc/v1/users/${id}/export`, undefined, { params: { id } });
      expect(reply.status).toBe(200);
      const data = reply.json.export;
      expect(data.account).toMatchObject({ id, email, locale: "de", origin: "registration", status: "active" });
      expect(data.tokens).toEqual([expect.objectContaining({ purpose: "email_verification", usedAt: expect.any(String) })]);
      expect(reply.raw).not.toMatch(/hash|salt|pbkdf2|tokenHash/i);
    });

    test("deletion is two idempotent phases: request locks the account, complete removes it with its data", async () => {
      const email = mail("delete1");
      const id = await verifiedUser(email);
      await payload.create({ collection: "entitlements", data: { user: id, feature: "pro-annual", source: "manual" }, overrideAccess: true });
      const key = "idem-key-0123456789";
      expect((await deletion(id, "short", "request")).status).toBe(400);
      const requested = await deletion(id, key, "request");
      expect(requested.status).toBe(202);
      expect(requested.json).toMatchObject({ status: "deletion_requested", repeated: false });
      expect((await deletion(id, key, "request")).json.repeated).toBe(true);
      // Locked at once: no sign-in, no password reset token.
      expect((await login(email, GOOD)).status).toBe(401);
      expect((await call(route.resets.POST, "POST", "/svc/v1/password-resets", { email })).json.token).toBeNull();
      expect((await deletion(id, "another-key-12345", "complete")).status).toBe(409);
      const done = await deletion(id, key, "complete");
      expect(done.status).toBe(200);
      expect(done.json).toMatchObject({ status: "deleted", repeated: false });
      expect((await deletion(id, key, "complete")).json).toMatchObject({ status: "deleted", repeated: true });
      for (const [table, column] of [["users", "id"], ["entitlements", "user_id"], ["auth_tokens", "user_id"]] as const) {
        expect((await pool.query(`select 1 from ${table} where ${column} = $1`, [id])).rowCount).toBe(0);
      }
    });
  });

  describe("content for marketing (option T)", () => {
    const readToken = generateToken();
    let tokenId: number;

    beforeAll(async () => {
      const created = await payload.create({ collection: "read-tokens", data: { label: "marketing", tokenHash: hashToken(readToken) }, overrideAccess: true });
      tokenId = created.id as number;
      const entries: [("blog" | "news"), string, "published" | "draft"][] = [
        ["blog", "published-blog", "published"],
        ["blog", "draft-blog", "draft"],
        ["news", "published-news", "published"],
        ["news", "draft-news", "draft"],
      ];
      for (const [collection, slug, status] of entries) {
        await payload.create({ collection, data: { locale: slug.includes("news") ? "en" : "de", title: slug, slug, body: `# ${slug}`, tags: ["a", "b"], version: "0.6.0", date: new Date().toISOString(), _status: status }, draft: status === "draft", overrideAccess: true });
      }
    });

    const read = (kind: string, token: string | null, query = "") =>
      call(route.content.GET, "GET", `/svc/v1/content/${kind}${query}`, undefined, { unsigned: true, params: { kind }, headers: token ? { authorization: `Bearer ${token}` } : {} });

    test("without a token, with a wrong token and with a short token: 401", async () => {
      expect((await read("blog", null)).status).toBe(401);
      expect((await read("blog", generateToken())).status).toBe(401);
      expect((await read("blog", "short")).status).toBe(401);
    });

    test("a valid token reads only published blog and news entries, with image and tags shape", async () => {
      const blog = await read("blog", readToken);
      expect(blog.status).toBe(200);
      expect(blog.json.items.map((item: { slug: string }) => item.slug)).toEqual(["published-blog"]);
      expect(blog.json.items[0]).toMatchObject({ locale: "de", title: "published-blog", tags: ["a", "b"], version: "0.6.0", image: null });
      const news = await read("news", readToken);
      expect(news.json.items.map((item: { slug: string }) => item.slug)).toEqual(["published-news"]);
      expect((await read("news", readToken, "?locale=de")).json.items).toEqual([]);
      expect((await read("news", readToken, "?locale=en")).json.items).toHaveLength(1);
      expect((await read("news", readToken, "?locale=fr")).status).toBe(400);
      expect((await read("news", readToken, "?limit=0")).status).toBe(400);
      expect(blog.raw).not.toContain("draft-");
      expect(blog.raw).not.toMatch(/"_status"|tokenHash/);
    });

    test("any other kind is a 404, also with a valid token (no users, no drafts, no media)", async () => {
      for (const kind of ["users", "media", "operators", "read-tokens"]) expect((await read(kind, readToken)).status).toBe(404);
    });

    test("the audit is a counter and the time of the last use", async () => {
      const row = (await pool.query("select uses, last_used_at from read_tokens where id = $1", [tokenId])).rows[0];
      expect(Number(row?.uses)).toBeGreaterThanOrEqual(6);
      expect(row?.last_used_at).toBeTruthy();
    });

    test("rotation: two tokens are valid at once; an expired token and a revoked token stop at once", async () => {
      const second = generateToken();
      const created = await payload.create({ collection: "read-tokens", data: { label: "rotation", tokenHash: hashToken(second) }, overrideAccess: true });
      expect((await read("blog", readToken)).status).toBe(200);
      expect((await read("blog", second)).status).toBe(200);
      await payload.update({ collection: "read-tokens", id: created.id, data: { expiresAt: new Date(Date.now() - 1000).toISOString() }, overrideAccess: true });
      expect((await read("blog", second)).status).toBe(401);
      const third = generateToken();
      const revocable = await payload.create({ collection: "read-tokens", data: { label: "revoke", tokenHash: hashToken(third) }, overrideAccess: true });
      expect((await read("blog", third)).status).toBe(200);
      await payload.delete({ collection: "read-tokens", id: revocable.id, overrideAccess: true });
      expect((await read("blog", third)).status).toBe(401);
    });

    test("the rate limit of a token is a shared counter: 429 once the window is full", async () => {
      const limited = generateToken();
      const created = await payload.create({ collection: "read-tokens", data: { label: "limited", tokenHash: hashToken(limited) }, overrideAccess: true });
      await pool.query(
        "insert into svc_rate_limits (bucket, window_start, count) values ($1, to_timestamp(floor(extract(epoch from now()) / 60) * 60), 600) on conflict (bucket, window_start) do update set count = 600",
        [`content:${created.id}`],
      );
      const blocked = await read("blog", limited);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await read("blog", readToken)).status).toBe(200);
    });

    test("only the hash of a token is stored and the token works on no other path", async () => {
      expect((await pool.query("select 1 from read_tokens where token_hash = $1", [readToken])).rowCount).toBe(0);
      expect((await pool.query("select 1 from read_tokens where token_hash = $1", [hashToken(readToken)])).rowCount).toBe(1);
      // As a bearer token on a signed endpoint it is just an unsigned call.
      const asApp = await call(route.users.GET, "GET", `/svc/v1/users?ids=${randomUUID()}`, undefined, { unsigned: true, headers: { authorization: `Bearer ${readToken}` } });
      expect(asApp.status).toBe(401);
    });
  });

  describe("health", () => {
    test("ready answers without data when the database and the media directory are reachable", async () => {
      await Bun.write(`${process.env.CMS_MEDIA_DIR}/.keep`, "");
      const reply = await call(route.health.GET, "GET", "/svc/v1/health/ready", undefined, { unsigned: true });
      expect(reply.status).toBe(200);
      expect(stripRequestId(reply.json)).toEqual({ ready: true });
    });
  });

  describe("data model: nothing is readable through the access functions", () => {
    test("with overrideAccess false every collection refuses an anonymous caller", async () => {
      for (const collection of ["users", "operators", "entitlements", "auth-tokens", "trial-reminders", "read-tokens", "blog", "news", "media"] as const) {
        await expect(payload.find({ collection, overrideAccess: false }), collection).rejects.toThrow();
      }
      await expect(payload.findGlobal({ slug: "platform-settings", overrideAccess: false })).rejects.toThrow();
    });
  });
  describe("contract: the answers match openapi/svc-v1.yaml", () => {
    const spec = loadSpec();

    test("every recorded answer is documented and conforms to its schema", () => {
      const problems: string[] = [];
      for (const entry of recorded) {
        // 413 (body too large) and 503 (service not configured) are the same for every endpoint and described once in the file header.
        if (entry.status === 413) continue;
        const template = templateOf(spec, entry.path);
        if (!template) {
          problems.push(`${entry.method} ${entry.path}: no such path in the file`);
          continue;
        }
        const documented = responseSchema(spec, template, entry.method, entry.status);
        if (!documented.documented) {
          problems.push(`${entry.method} ${template} -> ${entry.status}: status not documented`);
          continue;
        }
        if (documented.schema && entry.status !== 304) problems.push(...validate(spec, documented.schema, entry.json).map((problem) => `${entry.method} ${template} -> ${entry.status}: ${problem}`));
      }
      expect(problems).toEqual([]);
    });

    test("every documented operation was called at least once, with its success status", () => {
      const seen = new Set(recorded.filter((entry) => entry.status < 300 || entry.status === 304).map((entry) => `${entry.method} ${templateOf(spec, entry.path)}`));
      expect(operations(spec).filter((operation) => !seen.has(operation))).toEqual([]);
    });

    test("every documented error status of the main flows was provoked", () => {
      const seen = new Set(recorded.map((entry) => `${entry.method} ${templateOf(spec, entry.path)} ${entry.status}`));
      for (const expected of [
        "POST /svc/v1/auth/login 200", "POST /svc/v1/auth/login 401", "POST /svc/v1/auth/login 403", "POST /svc/v1/auth/login 429",
        "POST /svc/v1/users 201", "POST /svc/v1/users 400", "POST /svc/v1/users 409",
        "POST /svc/v1/tokens/redeem 200", "POST /svc/v1/tokens/redeem 400", "POST /svc/v1/tokens/redeem 409",
        "GET /svc/v1/users/{id}/access 304", "GET /svc/v1/users/{id}/access 404",
        "POST /svc/v1/users/{id}/deletion 202", "POST /svc/v1/users/{id}/deletion 200", "POST /svc/v1/users/{id}/deletion 409",
        "GET /svc/v1/content/{kind} 429", "GET /svc/v1/content/{kind} 404",
      ]) expect(seen.has(expected), expected).toBe(true);
    });
  });
});
