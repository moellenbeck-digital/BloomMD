/**
 * Admin UI of #206 against a real Postgres: second factor (setup, code, recovery code, replay, rate limit, reset by an
 * admin), role matrix over the Local API and REST, audit (content, no secrets, append-only, retention), blocked
 * operators, the last admin, drafts and the preview. The REST calls go through the real route handler with the guard in
 * front of it, with cookies like a browser sends them. Every run creates a database of its own and migrates it with the
 * real migrations. Runs only with BLOOMMD_TEST_DATABASE_URL; in a process of its own (see "test" in package.json), like
 * `svc.db.test.ts`: it sets the environment first and then imports the configuration.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { purgeExpiredAudit } from "../lib/audit";
import { totpCodeAt } from "../lib/mfa";
import { signMfaCookie } from "../lib/mfa-session";
import { poolOf, type SqlPool } from "../lib/shared-store";
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from "./db";

const adminUrl = testDatabaseUrl();
const BASE = "http://localhost:3300";
const PASSWORD = "Sup3rGeheim123";

type Json = Record<string, any>;
interface Session {
  id: string;
  email: string;
  token: string;
  sid: string;
  cookie: string;
}

describe.skipIf(!adminUrl)("operators: second factor, roles, audit, preview (Postgres)", () => {
  let database: TestDatabase;
  let payload: Payload;
  let pool: SqlPool;
  const route: Record<string, any> = {};
  const run = Date.now().toString(36);
  const secrets: string[] = [];

  async function rest(method: string, path: string, options: { cookie?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { origin: BASE };
    if (options.cookie) headers.cookie = options.cookie;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const handler = route.api[method] as (request: Request, args: { params: Promise<{ slug: string[] }> }) => Promise<Response>;
    const slug = path.replace(/^\/api\//, "").split("?")[0]!.split("/");
    const response = await handler(new Request(BASE + path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }), { params: Promise.resolve({ slug }) });
    const text = await response.text();
    let json: Json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { status: response.status, json, headers: response.headers, text };
  }

  async function createOperator(role: "admin" | "support" | "editor", label: string = role) {
    const email = `${label}-${randomBytes(3).toString("hex")}@${run}.test`;
    const created = await payload.create({ collection: "operators", data: { email, password: PASSWORD, role }, overrideAccess: true });
    return { id: String(created.id), email };
  }

  /** Password login over REST, as the admin UI does it: the cookie of the session, nothing else. */
  async function login(operator: { id: string; email: string }): Promise<Session> {
    const response = await rest("POST", "/api/operators/login", { body: { email: operator.email, password: PASSWORD } });
    expect(response.status).toBe(200);
    const token = /payload-token=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
    expect(token).toBeTruthy();
    const sid = JSON.parse(Buffer.from(token!.split(".")[1]!, "base64url").toString()).sid as string;
    expect(sid).toBeTruthy();
    return { ...operator, token: token!, sid, cookie: `payload-token=${token}` };
  }

  /** Sets the second factor up through the endpoints; returns the session with both cookies, the secret and the recovery codes. */
  async function enroll(operator: { id: string; email: string }, now = Date.now()) {
    const session = await login(operator);
    const begin = await rest("POST", "/api/operators/mfa/begin", { cookie: session.cookie, body: {} });
    expect(begin.status).toBe(200);
    const secret = begin.json.secret as string;
    secrets.push(secret);
    const confirm = await rest("POST", "/api/operators/mfa/confirm", { cookie: session.cookie, body: { code: totpCodeAt(secret, now) } });
    expect(confirm.status).toBe(200);
    const mfa = /payload-mfa=([^;]+)/.exec(confirm.headers.get("set-cookie") ?? "")?.[1];
    expect(mfa).toBeTruthy();
    return { ...session, cookie: `${session.cookie}; payload-mfa=${mfa}`, secret, recoveryCodes: confirm.json.recoveryCodes as string[], enrolledAt: now };
  }

  /** A session of an operator who already passed the second factor (cookie signed like the verify endpoint does). */
  async function trusted(operator: { id: string; email: string }): Promise<Session> {
    const session = await login(operator);
    return { ...session, cookie: `${session.cookie}; payload-mfa=${signMfaCookie(session.id, session.sid)}` };
  }

  const audit = async (where: Json = {}) => (await payload.find({ collection: "operator-audit", where, limit: 200, sort: "createdAt", depth: 0, overrideAccess: true })).docs as unknown as Json[];

  beforeAll(async () => {
    database = await createTestDatabase(adminUrl!);
    process.env.CMS_DATABASE_URL = database.url;
    process.env.PAYLOAD_SECRET = randomBytes(32).toString("hex");
    process.env.CMS_SVC_APP_KEY = randomBytes(32).toString("hex");
    process.env.CMS_ADMIN_ORIGIN = BASE;
    process.env.CMS_MEDIA_DIR = `/tmp/cms-test-media-ops-${run}`;
    const [{ default: config }, { getPayload }] = await Promise.all([import("@payload-config"), import("payload")]);
    payload = await getPayload({ config });
    await payload.db.migrate();
    pool = poolOf(payload);
    route.api = await import("../app/(payload)/api/[...slug]/route");
    route.preview = await import("../app/preview/[kind]/[id]/route");
  }, 120_000);

  afterAll(async () => {
    const payloadPool = (payload?.db as unknown as { pool?: { on(event: "error", listener: () => void): void; end(): Promise<void> } } | undefined)?.pool;
    payloadPool?.on("error", () => {});
    await database?.drop();
    void payloadPool?.end().catch(() => {});
    await payload?.db.destroy?.();
  }, 60_000);

  describe("migration", () => {
    test("creates the audit table with its trigger and the columns of the second factor", async () => {
      const columns = (await pool.query("select column_name from information_schema.columns where table_name = 'operators' and column_name in ('blocked','blocked_at','totp_enabled_at','totp_secret','totp_pending','totp_last_step','recovery_hashes') order by 1")).rows.map((row) => row.column_name);
      expect(columns).toHaveLength(7);
      const trigger = (await pool.query("select tgname from pg_trigger where tgname = 'operator_audit_guard' and not tgisinternal")).rows;
      expect(trigger).toHaveLength(1);
      await payload.db.migrate();
    });
  });

  describe("second factor", () => {
    test("a password login alone gives a session that can do nothing: nothing readable over REST, setup is the only way", async () => {
      const admin = await createOperator("admin");
      const session = await login(admin);
      for (const path of ["/api/users", "/api/blog", "/api/operator-audit", "/api/globals/platform-settings", "/api/media", "/api/entitlements"]) {
        const reply = await rest("GET", path, { cookie: session.cookie });
        expect(reply.status, path).toBe(403);
      }
      // Only the own record is readable (Payload's "me" needs it), not even an admin's list of operators.
      const me = await rest("GET", "/api/operators/me", { cookie: session.cookie });
      expect(me.status).toBe(200);
      expect(me.json.user.email).toBe(admin.email);
      const list = await rest("GET", "/api/operators", { cookie: session.cookie });
      expect(list.json.docs.map((doc: Json) => doc.email)).toEqual([admin.email]);
      expect((await rest("PATCH", `/api/operators/${admin.id}`, { cookie: session.cookie, body: { name: "ohne Faktor" } })).status).toBe(403);
      expect((await rest("POST", "/api/operators", { cookie: session.cookie, body: { email: `x-${run}@example.test`, password: PASSWORD, role: "admin" } })).status).toBe(403);
      expect((await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: "123456" } })).status).toBe(409);
    });

    test("without a session the second-factor endpoints are 404 (guard)", async () => {
      for (const path of ["/api/operators/mfa/begin", "/api/operators/mfa/confirm", "/api/operators/mfa/verify"]) expect((await rest("POST", path, { body: {} })).status, path).toBe(404);
    });

    test("setup: begin gives secret, URI and QR; a wrong first code fails; the right one activates, returns ten recovery codes once and opens the session", async () => {
      const admin = await createOperator("admin");
      const session = await login(admin);
      const begin = await rest("POST", "/api/operators/mfa/begin", { cookie: session.cookie, body: {} });
      expect(begin.status).toBe(200);
      expect(begin.json.uri).toContain("otpauth://totp/");
      expect(begin.json.uri).toContain(`secret=${begin.json.secret}`);
      expect(begin.json.qr).toStartWith("data:image/svg+xml;base64,");
      const wrong = await rest("POST", "/api/operators/mfa/confirm", { cookie: session.cookie, body: { code: totpCodeAt(begin.json.secret, Date.now() + 10 * 60_000) } });
      expect(wrong.status).toBe(400);
      expect((await rest("GET", "/api/users", { cookie: session.cookie })).status).toBe(403);
      const confirm = await rest("POST", "/api/operators/mfa/confirm", { cookie: session.cookie, body: { code: totpCodeAt(begin.json.secret, Date.now()) } });
      expect(confirm.status).toBe(200);
      expect(confirm.json.recoveryCodes).toHaveLength(10);
      const cookie = `${session.cookie}; payload-mfa=${/payload-mfa=([^;]+)/.exec(confirm.headers.get("set-cookie") ?? "")![1]}`;
      expect(confirm.headers.get("set-cookie")).toContain("HttpOnly");
      expect(confirm.headers.get("set-cookie")).toContain("SameSite=Strict");
      expect((await rest("GET", "/api/users", { cookie })).status).toBe(200);
      expect((await rest("POST", "/api/operators/mfa/begin", { cookie, body: {} })).status).toBe(409);
      expect(await audit({ action: { equals: "operator.mfa_enabled" }, targetId: { equals: admin.id } })).toHaveLength(1);
    });

    test("secret and recovery codes are stored encrypted or hashed, and no response carries them", async () => {
      const operator = await createOperator("editor");
      const enrolled = await enroll(operator);
      const row = (await pool.query("select totp_secret, recovery_hashes from operators where id = $1", [operator.id])).rows[0] as { totp_secret: string; recovery_hashes: string[] };
      expect(row.totp_secret.startsWith("v1.")).toBe(true);
      expect(row.totp_secret).not.toContain(enrolled.secret);
      expect(row.recovery_hashes).toHaveLength(10);
      const stored = JSON.stringify(row);
      for (const code of enrolled.recoveryCodes) expect(stored).not.toContain(code.replace("-", ""));
      for (const [method, path] of [["GET", "/api/operators/me"], ["GET", `/api/operators/${operator.id}`], ["GET", "/api/operators"]] as const) {
        const reply = await rest(method, path, { cookie: enrolled.cookie });
        expect(reply.status, path).toBe(200);
        expect(reply.text, path).not.toMatch(/totpSecret|totpPending|recoveryHashes|totpLastStep|totp_secret/);
        expect(reply.text).not.toContain(enrolled.secret);
      }
    });

    test("verify after a new password login: a fresh code opens the session, the code of the setup step and an old one do not (replay)", async () => {
      const operator = await createOperator("support");
      const t0 = Date.now();
      const enrolled = await enroll(operator, t0);
      const session = await login(operator);
      const replay = await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: totpCodeAt(enrolled.secret, t0) } });
      expect(replay.status).toBe(400);
      const next = await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: totpCodeAt(enrolled.secret, t0 + 30_000) } });
      expect(next.status).toBe(200);
      const cookie = `${session.cookie}; payload-mfa=${/payload-mfa=([^;]+)/.exec(next.headers.get("set-cookie") ?? "")![1]}`;
      expect((await rest("GET", "/api/news", { cookie })).status).toBe(200);
      expect((await rest("GET", "/api/users", { cookie })).status).toBe(200);
      expect((await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: totpCodeAt(enrolled.secret, t0 + 30_000) } })).status).toBe(400);
    });

    test("the cookie belongs to its session: with the session of another login it opens nothing", async () => {
      const operator = await createOperator("admin");
      const first = await enroll(operator);
      const second = await login(operator);
      const mixed = `${second.cookie}; ${first.cookie.split("; ").find((part) => part.startsWith("payload-mfa="))}`;
      expect((await rest("GET", "/api/users", { cookie: mixed })).status).toBe(403);
    });

    test("a recovery code works once, is counted and audited; a wrong or used one fails", async () => {
      const operator = await createOperator("editor");
      const enrolled = await enroll(operator);
      const session = await login(operator);
      const first = await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: enrolled.recoveryCodes[2]!.toUpperCase() } });
      expect(first.status).toBe(200);
      expect(first.json.recoveryCodesLeft).toBe(9);
      const again = await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: enrolled.recoveryCodes[2] } });
      expect(again.status).toBe(400);
      expect((await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: "aaaaa-aaaaa" } })).status).toBe(400);
      const row = (await pool.query("select recovery_hashes from operators where id = $1", [operator.id])).rows[0] as { recovery_hashes: string[] };
      expect(row.recovery_hashes).toHaveLength(9);
      const entries = await audit({ action: { equals: "operator.mfa_recovery_used" }, targetId: { equals: operator.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.changes).toEqual([{ field: "recoveryCodesLeft", from: 10, to: 9 }]);
      expect(JSON.stringify(entries)).not.toContain(enrolled.recoveryCodes[2]!.replace("-", ""));
    });

    test("wrong codes are limited: after five tries even the right code is refused for the window", async () => {
      const operator = await createOperator("editor");
      const enrolled = await enroll(operator);
      const session = await login(operator);
      // Five tries per 15 minutes (the setup used one). The window is fixed on the clock, so a run that crosses its
      // border may need up to ten wrong codes; what matters is that the limit comes and then holds for the right code.
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 10 && statuses.at(-1) !== 429; attempt++) statuses.push((await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: "000000" } })).status);
      expect(statuses.at(-1)).toBe(429);
      expect(statuses.slice(0, -1).every((status) => status === 400)).toBe(true);
      const right = await rest("POST", "/api/operators/mfa/verify", { cookie: session.cookie, body: { code: totpCodeAt(enrolled.secret, enrolled.enrolledAt + 30_000) } });
      expect(right.status).toBe(429);
      expect(right.headers.get("retry-after")).toBeTruthy();
      expect((await rest("GET", "/api/users", { cookie: session.cookie })).status).toBe(403);
    });

    test("an admin resets the factor of another operator; others cannot; the operator's sessions end and the setup comes again", async () => {
      const admin = await trusted(await createOperator("admin"));
      const victim = await createOperator("editor");
      const enrolled = await enroll(victim);
      const support = await trusted(await createOperator("support"));
      expect((await rest("POST", `/api/operators/${victim.id}/mfa-reset`, { cookie: support.cookie, body: {} })).status).toBe(403);
      expect((await rest("POST", `/api/operators/${victim.id}/mfa-reset`, { cookie: enrolled.cookie, body: {} })).status).toBe(403);
      expect((await rest("POST", `/api/operators/${victim.id}/mfa-reset`, { cookie: admin.cookie, body: {} })).status).toBe(200);
      const row = (await pool.query("select totp_enabled_at, totp_secret, recovery_hashes from operators where id = $1", [victim.id])).rows[0] as Json;
      expect(row.totp_enabled_at).toBeNull();
      expect(row.totp_secret).toBeNull();
      expect(row.recovery_hashes).toEqual([]);
      expect((await rest("GET", "/api/users", { cookie: enrolled.cookie })).status).toBe(404);
      const again = await login(victim);
      expect((await rest("POST", "/api/operators/mfa/begin", { cookie: again.cookie, body: {} })).status).toBe(200);
      const entries = await audit({ action: { equals: "operator.mfa_reset" }, targetId: { equals: victim.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorEmail: admin.email, actorRole: "admin", targetLabel: victim.email });
      expect((await rest("POST", `/api/operators/999999/mfa-reset`, { cookie: admin.cookie, body: {} })).status).toBe(404);
    });
  });

  describe("roles", () => {
    test("admin: everything; support: reads accounts, entitlements, trial ends, settings, content and changes nothing; editor: only blog, news, media", async () => {
      const admin = await trusted(await createOperator("admin"));
      const support = await trusted(await createOperator("support"));
      const editor = await trusted(await createOperator("editor"));
      const userId = randomUUID();
      await payload.create({ collection: "users", data: { id: userId, email: `konto-${run}@example.test`, password: PASSWORD, trialEndsAt: "2026-12-15T00:00:00.000Z" } as never, overrideAccess: true });
      const read = async (session: Session, collection: string) => (await rest("GET", `/api/${collection}`, { cookie: session.cookie })).status;
      for (const collection of ["users", "entitlements", "blog", "news", "media", "operators", "operator-audit", "globals/platform-settings"]) expect(await read(admin, collection), `admin ${collection}`).toBe(200);
      for (const collection of ["users", "entitlements", "blog", "news", "media", "globals/platform-settings"]) expect(await read(support, collection), `support ${collection}`).toBe(200);
      for (const collection of ["operator-audit", "read-tokens"]) expect(await read(support, collection), `support ${collection}`).toBe(403);
      for (const collection of ["blog", "news", "media"]) expect(await read(editor, collection), `editor ${collection}`).toBe(200);
      for (const collection of ["users", "entitlements", "operator-audit", "read-tokens", "trial-reminders", "globals/platform-settings", "auth-tokens"]) expect(await read(editor, collection), `editor ${collection}`).toBe(403);
      const found = await rest("GET", `/api/users/${userId}`, { cookie: support.cookie });
      expect(found.status).toBe(200);
      expect(found.json.trialEndsAt).toBe("2026-12-15T00:00:00.000Z");
      // Support changes nothing: not the trial end, not the settings, not content; editors only content.
      expect((await rest("PATCH", `/api/users/${userId}`, { cookie: support.cookie, body: { trialEndsAt: "2027-01-01T00:00:00.000Z" } })).status).toBe(403);
      expect((await rest("POST", "/api/entitlements", { cookie: support.cookie, body: { user: userId, feature: "cloud", source: "manual" } })).status).toBe(403);
      expect((await rest("POST", "/api/globals/platform-settings", { cookie: support.cookie, body: { defaultTrialDays: 99 } })).status).toBe(403);
      expect((await rest("POST", "/api/blog", { cookie: support.cookie, body: { title: "x", slug: `x-${run}`, locale: "de" } })).status).toBe(403);
      expect((await rest("PATCH", `/api/users/${userId}`, { cookie: editor.cookie, body: { trialEndsAt: "2027-01-01T00:00:00.000Z" } })).status).toBe(403);
      const draft = await rest("POST", "/api/blog?draft=true", { cookie: editor.cookie, body: { title: "Entwurf Redaktion", slug: `redaktion-${run}`, locale: "de", _status: "draft" } });
      expect(draft.status).toBe(201);
      expect((await rest("PATCH", `/api/users/${userId}`, { cookie: admin.cookie, body: { trialEndsAt: "2027-01-01T00:00:00.000Z" } })).status).toBe(200);
    });

    test("a collection that is not allowed is closed by URL too (list and document), not only hidden in the menu", async () => {
      const editor = await trusted(await createOperator("editor"));
      const support = await trusted(await createOperator("support"));
      const userId = randomUUID();
      await payload.create({ collection: "users", data: { id: userId, email: `url-${run}@example.test`, password: PASSWORD } as never, overrideAccess: true });
      expect((await rest("GET", `/api/users/${userId}`, { cookie: editor.cookie })).status).toBe(403);
      expect((await rest("GET", "/api/operator-audit", { cookie: support.cookie })).status).toBe(403);
      const resolved = await (await import("@payload-config")).default;
      const hidden = (slug: string) => (resolved.collections.find((c) => c.slug === slug)!.admin.hidden as (args: { user: unknown }) => boolean);
      const editorUser = { collection: "operators", role: "editor" };
      const supportUser = { collection: "operators", role: "support" };
      const adminUser = { collection: "operators", role: "admin" };
      for (const slug of ["users", "entitlements", "trial-reminders", "operators", "operator-audit", "read-tokens"]) expect(hidden(slug)({ user: editorUser }), `editor ${slug}`).toBe(true);
      for (const slug of ["operators", "operator-audit", "read-tokens"]) expect(hidden(slug)({ user: supportUser }), `support ${slug}`).toBe(true);
      for (const slug of ["users", "entitlements", "trial-reminders"]) expect(hidden(slug)({ user: supportUser }), `support ${slug}`).toBe(false);
      for (const slug of ["users", "entitlements", "trial-reminders", "operators", "operator-audit", "read-tokens"]) expect(hidden(slug)({ user: adminUser }), `admin ${slug}`).toBe(false);
    });

    test("operators see only themselves unless they are admin; nobody raises their own role", async () => {
      const admin = await trusted(await createOperator("admin"));
      const editor = await trusted(await createOperator("editor"));
      const list = await rest("GET", "/api/operators", { cookie: editor.cookie });
      expect(list.status).toBe(200);
      expect(list.json.docs.map((doc: Json) => doc.id)).toEqual([Number(editor.id)]);
      const raise = await rest("PATCH", `/api/operators/${editor.id}`, { cookie: editor.cookie, body: { role: "admin", name: "Erika" } });
      expect(raise.status).toBe(200);
      const row = (await payload.findByID({ collection: "operators", id: editor.id, depth: 0, overrideAccess: true })) as Json;
      expect(row.role).toBe("editor");
      expect(row.name).toBe("Erika");
      expect((await rest("PATCH", `/api/operators/${editor.id}`, { cookie: editor.cookie, body: { blocked: false, totpEnabledAt: null } })).status).toBe(200);
      expect((await rest("POST", "/api/operators", { cookie: editor.cookie, body: { email: `neu-${run}@example.test`, password: PASSWORD, role: "admin" } })).status).toBe(403);
      const created = await rest("POST", "/api/operators", { cookie: admin.cookie, body: { email: `neu-${run}@example.test`, password: PASSWORD, role: "support" } });
      expect(created.status).toBe(201);
      expect(created.json.doc.role).toBe("support");
      expect(await audit({ action: { equals: "operator.role" }, targetId: { equals: editor.id } })).toHaveLength(0);
    });

    test("the audit cannot be created, changed or deleted by anybody through the API, not even an admin", async () => {
      const admin = await trusted(await createOperator("admin"));
      const entry = (await audit())[0]!;
      expect((await rest("POST", "/api/operator-audit", { cookie: admin.cookie, body: { action: "operator.create" } })).status).toBe(403);
      expect((await rest("PATCH", `/api/operator-audit/${entry.id}`, { cookie: admin.cookie, body: { actorEmail: "x" } })).status).toBe(403);
      expect((await rest("DELETE", `/api/operator-audit/${entry.id}`, { cookie: admin.cookie })).status).toBe(403);
      expect((await rest("GET", `/api/operator-audit/${entry.id}`, { cookie: admin.cookie })).status).toBe(200);
    });
  });

  describe("blocked operators and the last admin", () => {
    test("a blocked operator cannot sign in and an open session stops working at once", async () => {
      const admin = await trusted(await createOperator("admin"));
      const target = await createOperator("editor");
      const open = await trusted(target);
      expect((await rest("GET", "/api/blog", { cookie: open.cookie })).status).toBe(200);
      const blocked = await rest("PATCH", `/api/operators/${target.id}`, { cookie: admin.cookie, body: { blocked: true } });
      expect(blocked.status).toBe(200);
      expect(blocked.json.doc.blockedAt).toBeTruthy();
      expect((await rest("GET", "/api/blog", { cookie: open.cookie })).status).toBe(403);
      const retry = await rest("POST", "/api/operators/login", { body: { email: target.email, password: PASSWORD } });
      expect(retry.status).toBe(401);
      expect((await audit({ action: { equals: "operator.block" }, targetId: { equals: target.id } }))).toHaveLength(1);
      await rest("PATCH", `/api/operators/${target.id}`, { cookie: admin.cookie, body: { blocked: false } });
      expect((await audit({ action: { equals: "operator.unblock" }, targetId: { equals: target.id } }))).toHaveLength(1);
      expect((await rest("POST", "/api/operators/login", { body: { email: target.email, password: PASSWORD } })).status).toBe(200);
    });

    test("the last active admin can be neither demoted, blocked nor deleted; with a second admin each of it is fine", async () => {
      await pool.query("delete from operators");
      const only = await createOperator("admin", "only");
      const session = await trusted(only);
      for (const body of [{ role: "editor" }, { blocked: true }]) {
        const reply = await rest("PATCH", `/api/operators/${only.id}`, { cookie: session.cookie, body });
        expect(reply.status, JSON.stringify(body)).toBe(400);
        expect(JSON.stringify(reply.json)).toContain("mindestens ein aktiver Admin");
      }
      expect((await rest("DELETE", `/api/operators/${only.id}`, { cookie: session.cookie })).status).toBe(400);
      const second = await createOperator("admin", "second");
      expect((await rest("PATCH", `/api/operators/${second.id}`, { cookie: session.cookie, body: { role: "editor" } })).status).toBe(200);
      expect((await rest("PATCH", `/api/operators/${second.id}`, { cookie: session.cookie, body: { role: "admin" } })).status).toBe(200);
      expect((await rest("DELETE", `/api/operators/${second.id}`, { cookie: session.cookie })).status).toBe(200);
      expect((await audit({ action: { equals: "operator.delete" }, targetId: { equals: second.id } }))[0]).toMatchObject({ targetLabel: second.email, actorEmail: only.email });
    });
  });

  describe("audit", () => {
    test("account changes: one entry per changed field with who, when, what, old to new and the account; unchanged fields leave nothing", async () => {
      const admin = await trusted(await createOperator("admin"));
      const userId = randomUUID();
      await payload.create({ collection: "users", data: { id: userId, email: `audit-${run}@example.test`, password: PASSWORD, trialEndsAt: "2026-12-15T00:00:00.000Z" } as never, overrideAccess: true });
      const update = await rest("PATCH", `/api/users/${userId}`, {
        cookie: admin.cookie,
        body: { trialEndsAt: "2027-01-14T00:00:00.000Z", trialDaysOverride: 90, cloudAccess: false, platformRole: "beta", name: "Nicht im Audit" },
      });
      expect(update.status).toBe(200);
      const entries = await audit({ targetUser: { equals: userId } });
      expect(entries.map((entry) => entry.action).sort()).toEqual(["account.beta", "account.cloud_access", "account.trial_days_override", "account.trial_end"]);
      const byAction = Object.fromEntries(entries.map((entry) => [entry.action, entry]));
      expect(byAction["account.trial_end"].changes).toEqual([{ field: "trialEndsAt", from: "2026-12-15T00:00:00.000Z", to: "2027-01-14T00:00:00.000Z" }]);
      expect(byAction["account.trial_days_override"].changes).toEqual([{ field: "trialDaysOverride", from: null, to: 90 }]);
      expect(byAction["account.cloud_access"].changes).toEqual([{ field: "cloudAccess", from: true, to: false }]);
      expect(byAction["account.beta"].changes).toEqual([{ field: "platformRole", from: "user", to: "beta" }]);
      expect(entries[0]).toMatchObject({ actorEmail: admin.email, actorRole: "admin", actorId: admin.id, targetType: "users", targetId: userId });
      expect(entries[0]!.createdAt).toBeTruthy();
      const before = (await audit()).length;
      expect((await rest("PATCH", `/api/users/${userId}`, { cookie: admin.cookie, body: { cloudAccess: false, name: "Anders" } })).status).toBe(200);
      expect((await audit()).length).toBe(before);
    });

    test("changes of the app through the services (no operator) are not audited; deleting the account clears its link in the audit", async () => {
      const admin = await trusted(await createOperator("admin"));
      const userId = randomUUID();
      await payload.create({ collection: "users", data: { id: userId, email: `svc-${run}@example.test`, password: PASSWORD } as never, overrideAccess: true });
      await payload.update({ collection: "users", id: userId, data: { trialEndsAt: "2027-02-01T00:00:00.000Z", cloudAccess: false }, overrideAccess: true });
      expect(await audit({ targetUser: { equals: userId } })).toHaveLength(0);
      await rest("PATCH", `/api/users/${userId}`, { cookie: admin.cookie, body: { cloudAccess: true } });
      expect(await audit({ targetUser: { equals: userId } })).toHaveLength(1);
      await payload.delete({ collection: "users", id: userId, overrideAccess: true });
      const rows = (await pool.query("select action, target_id, target_user_id from operator_audit where target_id = $1", [userId])).rows as Json[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.target_user_id).toBeNull();
    });

    test("entitlements: create, change and delete are audited with the account; the account shows them as a list", async () => {
      const admin = await trusted(await createOperator("admin"));
      const userId = randomUUID();
      await payload.create({ collection: "users", data: { id: userId, email: `ent-${run}@example.test`, password: PASSWORD } as never, overrideAccess: true });
      const created = await rest("POST", "/api/entitlements", { cookie: admin.cookie, body: { user: userId, feature: "cloud-sync", source: "manual", active: true } });
      expect(created.status).toBe(201);
      const id = created.json.doc.id;
      expect((await rest("PATCH", `/api/entitlements/${id}`, { cookie: admin.cookie, body: { active: false, expiresAt: "2027-03-01T00:00:00.000Z" } })).status).toBe(200);
      const account = await rest("GET", `/api/users/${userId}?depth=1`, { cookie: admin.cookie });
      expect(account.json.entitlementList.docs.map((doc: Json) => doc.feature)).toEqual(["cloud-sync"]);
      expect((await rest("DELETE", `/api/entitlements/${id}`, { cookie: admin.cookie })).status).toBe(200);
      const entries = await audit({ targetType: { equals: "entitlements" }, targetUser: { equals: userId } });
      expect(entries.map((entry) => entry.action)).toEqual(["entitlement.create", "entitlement.update", "entitlement.delete"]);
      expect(entries[1]!.changes).toEqual([
        { field: "active", from: true, to: false },
        { field: "expiresAt", from: null, to: "2027-03-01T00:00:00.000Z" },
      ]);
      expect(entries[2]!.changes.find((change: Json) => change.field === "feature")).toEqual({ field: "feature", from: "cloud-sync", to: null });
    });

    test("platform settings: only admin changes the default duration, with audit old to new", async () => {
      const admin = await trusted(await createOperator("admin"));
      const support = await trusted(await createOperator("support"));
      const before = (await rest("GET", "/api/globals/platform-settings", { cookie: support.cookie })).json.defaultTrialDays;
      expect(before).toBe(30);
      expect((await rest("POST", "/api/globals/platform-settings", { cookie: support.cookie, body: { defaultTrialDays: 14 } })).status).toBe(403);
      const changed = await rest("POST", "/api/globals/platform-settings", { cookie: admin.cookie, body: { defaultTrialDays: 45 } });
      expect(changed.status).toBe(200);
      const entries = await audit({ action: { equals: "settings.default_trial_days" } });
      expect(entries.at(-1)!.changes).toEqual([{ field: "defaultTrialDays", from: before, to: 45 }]);
      expect(entries.at(-1)).toMatchObject({ actorEmail: admin.email, targetType: "platform-settings" });
    });

    test("operators: create, role, password and delete are audited; no password and no secret is ever in the audit", async () => {
      const admin = await trusted(await createOperator("admin"));
      const created = await rest("POST", "/api/operators", { cookie: admin.cookie, body: { email: `audited-${run}@example.test`, password: PASSWORD, role: "editor" } });
      expect(created.status).toBe(201);
      const id = String(created.json.doc.id);
      await rest("PATCH", `/api/operators/${id}`, { cookie: admin.cookie, body: { role: "support", name: "Neuer Name" } });
      await rest("PATCH", `/api/operators/${id}`, { cookie: admin.cookie, body: { password: "Anderes12345xy" } });
      await rest("DELETE", `/api/operators/${id}`, { cookie: admin.cookie });
      const entries = await audit({ targetId: { equals: id } });
      expect(entries.map((entry) => entry.action)).toEqual(["operator.create", "operator.role", "operator.profile", "operator.password", "operator.delete"]);
      expect(entries[1]!.changes).toEqual([{ field: "role", from: "editor", to: "support" }]);
      const everything = JSON.stringify(await audit());
      for (const secret of [PASSWORD, "Anderes12345xy", ...secrets]) expect(everything).not.toContain(secret);
      expect(everything).not.toMatch(/totpSecret|recoveryHashes|totp_secret|v1\.[A-Za-z0-9_-]{16}/);
    });

    test("append-only in the database: a row cannot be changed or deleted before 365 days; older rows go with the cleanup", async () => {
      await expect(pool.query("update operator_audit set actor_email = 'x'")).rejects.toThrow(/append-only/);
      await expect(pool.query("update operator_audit set changes = '[]'::jsonb where id = (select min(id) from operator_audit)")).rejects.toThrow(/append-only/);
      await expect(pool.query("delete from operator_audit")).rejects.toThrow(/kept for 365 days/);
      await pool.query("insert into operator_audit (action, actor_email, created_at, updated_at) values ('operator.create', 'alt@example.test', now() - interval '366 days', now() - interval '366 days'), ('operator.create', 'knapp@example.test', now() - interval '364 days', now() - interval '364 days')");
      expect(await purgeExpiredAudit(pool)).toBe(1);
      const left = (await pool.query("select actor_email from operator_audit where actor_email in ('alt@example.test', 'knapp@example.test')")).rows.map((row) => row.actor_email);
      expect(left).toEqual(["knapp@example.test"]);
    });

    test("every audited write cleans up the expired rows (no extra job)", async () => {
      await pool.query("insert into operator_audit (action, actor_email, created_at, updated_at) values ('operator.create', 'verfallen@example.test', now() - interval '400 days', now() - interval '400 days')");
      const admin = await trusted(await createOperator("admin"));
      const userId = randomUUID();
      await payload.create({ collection: "users", data: { id: userId, email: `purge-${run}@example.test`, password: PASSWORD } as never, overrideAccess: true });
      await rest("PATCH", `/api/users/${userId}`, { cookie: admin.cookie, body: { cloudAccess: false } });
      expect((await pool.query("select 1 from operator_audit where actor_email = 'verfallen@example.test'")).rowCount).toBe(0);
    });
  });

  describe("editorial work: drafts, publishing, preview", () => {
    const url = new URL("http://cms.test/svc/v1/content/blog");

    test("a draft never reaches /svc/v1/content, also not a newer draft of a published entry", async () => {
      const { publishedContent } = await import("../lib/content");
      const editor = await trusted(await createOperator("editor"));
      const slug = `veroeffentlicht-${run}`;
      const draftOnly = await rest("POST", "/api/blog?draft=true", { cookie: editor.cookie, body: { title: "Nur Entwurf", slug: `entwurf-${run}`, locale: "de", _status: "draft" } });
      expect(draftOnly.status).toBe(201);
      const published = await rest("POST", "/api/blog", { cookie: editor.cookie, body: { title: "Veröffentlichte Fassung", slug, locale: "de", _status: "published" } });
      expect(published.status).toBe(201);
      const id = published.json.doc.id;
      const newer = await rest("PATCH", `/api/blog/${id}?draft=true`, { cookie: editor.cookie, body: { title: "Neuer Entwurf, nicht veröffentlicht", _status: "draft" } });
      expect(newer.status).toBe(200);
      const titles = ((await publishedContent(payload, "blog", url)) as { items?: Json[]; docs?: Json[] }).items?.map((item) => item.title) ?? [];
      expect(titles).toContain("Veröffentlichte Fassung");
      expect(titles).not.toContain("Neuer Entwurf, nicht veröffentlicht");
      expect(titles).not.toContain("Nur Entwurf");
      expect(JSON.stringify(await publishedContent(payload, "blog", url))).not.toContain("Entwurf");
      // Publishing makes it appear.
      const publish = await rest("PATCH", `/api/blog/${id}`, { cookie: editor.cookie, body: { title: "Jetzt veröffentlicht", _status: "published" } });
      expect(publish.status).toBe(200);
      expect(JSON.stringify(await publishedContent(payload, "blog", url))).toContain("Jetzt veröffentlicht");
    });

    test("the preview shows the latest draft to every operator role with the second factor, and nothing to anybody else; its text is escaped", async () => {
      const editor = await trusted(await createOperator("editor"));
      const support = await trusted(await createOperator("support"));
      const pending = await login(await createOperator("editor"));
      const created = await rest("POST", "/api/news?draft=true", { cookie: editor.cookie, body: { title: "<script>alert(1)</script> Vorschau", slug: `vorschau-${run}`, locale: "de", body: "Zeile 1\n<b>fett</b>", _status: "draft" } });
      expect(created.status).toBe(201);
      const id = created.json.doc.id;
      const call = async (cookie?: string, kind = "news", target = String(id), site = "same-origin") => {
        const response = await route.preview.GET(new Request(`${BASE}/preview/${kind}/${target}`, { headers: { "sec-fetch-site": site, ...(cookie ? { cookie } : {}) } }), { params: Promise.resolve({ kind, id: target }) });
        return { status: response.status as number, text: (await response.text()) as string, headers: response.headers as Headers };
      };
      for (const session of [editor, support]) {
        const reply = await call(session.cookie);
        expect(reply.status).toBe(200);
        expect(reply.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Vorschau");
        expect(reply.text).toContain("&lt;b&gt;fett&lt;/b&gt;");
        expect(reply.text).not.toContain("<script>alert");
        expect(reply.text).toContain("Entwurf");
        expect(reply.headers.get("content-security-policy")).toContain("default-src 'none'");
        expect(reply.headers.get("x-robots-tag")).toContain("noindex");
        expect(reply.headers.get("cache-control")).toBe("no-store");
      }
      expect((await call()).status).toBe(404);
      expect((await call(pending.cookie)).status).toBe(404);
      // A cross-site request does not carry the session (same rule as for the REST API).
      expect((await call(editor.cookie, "news", String(id), "cross-site")).status).toBe(404);
      expect((await call(editor.cookie, "users", "1")).status).toBe(404);
      expect((await call(editor.cookie, "news", "abc")).status).toBe(404);
      expect((await call(editor.cookie, "news", "999999")).status).toBe(404);
    });

    test("media need an alternative text", async () => {
      const editor = await trusted(await createOperator("editor"));
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      const handler = route.api.POST as (request: Request, args: { params: Promise<{ slug: string[] }> }) => Promise<Response>;
      const send = (alt?: string) => {
        const form = new FormData();
        form.append("file", new File([png], `bild-${randomBytes(3).toString("hex")}.png`, { type: "image/png" }));
        if (alt !== undefined) form.append("_payload", JSON.stringify({ alt }));
        return handler(new Request(`${BASE}/api/media`, { method: "POST", headers: { cookie: editor.cookie, origin: BASE }, body: form }), { params: Promise.resolve({ slug: ["media"] }) });
      };
      expect((await send()).status).toBe(400);
      expect((await send("")).status).toBe(400);
      expect((await send("Ein einzelnes Pixel")).status).toBe(201);
    });
  });
});
