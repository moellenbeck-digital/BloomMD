import postgres from "postgres";

interface AuthSmokeResult {
  production_auth_smoke: "pass";
  email: string;
  invite_status: number;
  invite_mail: string;
  signup_status: number;
  signup_location: string | null;
  verification_tokens: number;
  beta_invite_status_after_signup: string | null;
  pre_verified_login_status: number;
  pre_verified_login_location: string | null;
  verification_step: "db-marked-for-smoke";
  login_status: number;
  login_location: string | null;
  session_cookie: "set" | "missing";
  workspace_rename_status: number;
  workspace_name: string | null;
  create_status: number;
  create_storage_mode: string | null;
  create_workspace_id: string | null;
  sync_ticket_status: number;
  sync_permission: string | null;
  sync_url_protocol: string | null;
  desktop_token_status: number;
  desktop_list_status: number;
  desktop_workspace_name: string | null;
  desktop_sync_ticket_status: number;
  desktop_sync_permission: string | null;
  websocket: string;
}

interface Options {
  appUrl: string;
  email: string;
  password: string;
  timeoutMs: number;
  cleanup: boolean;
  skipWebSocket: boolean;
  verbose: boolean;
}

function usage() {
  return `BloomMD production auth smoke

Usage:
  bun run production-auth-smoke [options]

Required env:
  DATABASE_URL
  BLOOMMD_INTERNAL_INVITE_SECRET

Options:
  --app-url <url>      App origin (default: https://bloommd.app)
  --email <email>      Smoke account (default: smoke+auth-<timestamp>@bloommd.io)
  --password <value>   Smoke password (default: generated)
  --timeout-ms <ms>    Per network step timeout (default: 10000)
  --no-cleanup         Leave the smoke account in the database
  --skip-websocket     Verify sync-ticket shape but do not open the WebSocket
  --verbose            Print step progress to stderr
  --help               Show this help

The script verifies signup, email-verification gating, Cloud workspace rename, Cloud document
creation, sync tickets and a Desktop-style personal access token flow. It marks the smoke account
as verified in the DB because mailbox access is outside this automated smoke test.
`;
}

function requireValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv: string[]): Options {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const options: Options = {
    appUrl: "https://bloommd.app",
    email: `smoke+auth-${timestamp}@bloommd.io`,
    password: `SmokePassword-${Date.now()}-M1`,
    timeoutMs: 10_000,
    cleanup: true,
    skipWebSocket: false,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--app-url") {
      options.appUrl = new URL(requireValue(argv, ++index, arg)).origin;
      continue;
    }
    if (arg === "--email") {
      options.email = requireValue(argv, ++index, arg).trim().toLowerCase();
      continue;
    }
    if (arg === "--password") {
      options.password = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--timeout-ms") {
      const timeoutMs = Number(requireValue(argv, ++index, arg));
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) throw new Error("--timeout-ms must be an integer >= 1000");
      options.timeoutMs = timeoutMs;
      continue;
    }
    if (arg === "--no-cleanup") {
      options.cleanup = false;
      continue;
    }
    if (arg === "--skip-websocket") {
      options.skipWebSocket = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(options.email)) throw new Error("--email must be a valid email address");
  if (options.password.length < 10) throw new Error("--password must contain at least 10 characters");
  return options;
}

function progress(options: Options, message: string) {
  if (options.verbose) console.error(`[production-auth-smoke] ${message}`);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function cookieHeader(headers: Headers) {
  const raw = headers.get("set-cookie");
  if (!raw) return "";
  return raw
    .split(/,(?=\s*[^;,]+=)/)
    .map((part) => part.split(";", 1)[0].trim())
    .filter(Boolean)
    .join("; ");
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "BloomMD-Production-Auth-Smoke/1.0",
      ...(init.headers ?? {}),
    },
  });
}

async function expectWebSocketOpen(url: string, timeoutMs: number) {
  return new Promise<string>((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // Best-effort cleanup only.
      }
      resolve("timeout");
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      ws.close();
      resolve("open");
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve("error");
    };
  });
}

async function cleanupSmokeData(sql: postgres.Sql, email: string) {
  const users = await sql`select id from bloom_users where lower(email) = lower(${email})`;
  const userIds = users.map((row) => row.id as string);
  if (userIds.length > 0) {
    await sql`delete from bloom_documents where created_by = any(${userIds}) or updated_by = any(${userIds})`;
    await sql`delete from bloom_workspaces where owner_user_id = any(${userIds})`;
    await sql`delete from bloom_users where id = any(${userIds})`;
  }
  await sql`delete from bloom_auth_tokens where lower(email) = lower(${email})`;
  await sql`delete from bloom_beta_invites where lower(email) = lower(${email})`;
}

async function run() {
  const options = parseArgs(Bun.argv.slice(2));
  const databaseUrl = requiredEnv("DATABASE_URL");
  const inviteSecret = requiredEnv("BLOOMMD_INTERNAL_INVITE_SECRET");
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 10, onnotice: () => {} });
  const documentName = `smoke-auth-sync-${Date.now()}.md`;
  const workspaceName = `Smoke Workspace ${Date.now()}`;

  try {
    await cleanupSmokeData(sql, options.email);
    progress(options, "cleanup complete");

    const inviteRes = await fetchWithTimeout(`${options.appUrl}/api/internal/beta-invites`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inviteSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: options.email,
        source: "production-auth-smoke",
        note: "Temporary live auth/sync smoke",
        sendEmail: true,
        forceSendEmail: true,
      }),
    }, options.timeoutMs);
    const inviteJson = await inviteRes.json().catch(() => ({})) as { mail?: { sent?: boolean; reason?: string } };
    progress(options, `invite response ${inviteRes.status}`);

    const signupRes = await fetchWithTimeout(`${options.appUrl}/api/auth/signup`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: options.appUrl,
      },
      body: new URLSearchParams({
        email: options.email,
        name: "BloomMD Smoke",
        password: options.password,
        next: "/app",
        formStartedAt: String(Date.now() - 2_000),
        website: "",
      }),
    }, options.timeoutMs);
    progress(options, `signup response ${signupRes.status}`);

    const userRows = await sql`select id from bloom_users where lower(email) = lower(${options.email}) limit 1`;
    const user = userRows[0] as { id?: string } | undefined;
    const tokenRows = await sql`
      select count(*)::int as count
      from bloom_auth_tokens
      where lower(email) = lower(${options.email})
        and purpose = 'email_verification'
        and consumed_at is null
    `;
    const inviteRows = await sql`select status from bloom_beta_invites where lower(email) = lower(${options.email}) limit 1`;
    progress(options, "signup database state read");

    const preVerifiedLoginRes = await fetchWithTimeout(`${options.appUrl}/api/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: options.appUrl,
      },
      body: new URLSearchParams({ email: options.email, password: options.password, next: "/app" }),
    }, options.timeoutMs);
    progress(options, `pre-verified login response ${preVerifiedLoginRes.status}`);

    if (!user?.id) throw new Error(`signup did not create user: ${signupRes.status} ${signupRes.headers.get("location") ?? ""}`);
    const verificationTokens = Number((tokenRows[0] as { count?: number } | undefined)?.count ?? 0);
    if (verificationTokens < 1) throw new Error("signup did not create an email verification token");

    await sql`update bloom_users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = ${user.id}`;
    progress(options, "email marked verified for smoke");

    const loginRes = await fetchWithTimeout(`${options.appUrl}/api/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: options.appUrl,
      },
      body: new URLSearchParams({ email: options.email, password: options.password, next: "/app" }),
    }, options.timeoutMs);
    const cookies = cookieHeader(loginRes.headers);
    progress(options, `verified login response ${loginRes.status}`);

    const renameWorkspaceRes = await fetchWithTimeout(`${options.appUrl}/api/workspaces`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: options.appUrl,
        cookie: cookies,
      },
      body: JSON.stringify({ name: workspaceName }),
    }, options.timeoutMs);
    const renameWorkspaceJson = await renameWorkspaceRes.json().catch(() => ({})) as {
      workspace?: { id?: string; name?: string };
    };
    progress(options, `workspace rename response ${renameWorkspaceRes.status}`);

    const createRes = await fetchWithTimeout(`${options.appUrl}/api/mindmaps`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: options.appUrl,
        cookie: cookies,
      },
      body: JSON.stringify({
        filename: documentName,
        markdown: "# Smoke Auth Sync\n\n## Live\n\n- sync ticket check\n",
      }),
    }, options.timeoutMs);
    const createJson = await createRes.json().catch(() => ({})) as { storage?: { mode?: string; workspaceId?: string } };
    progress(options, `document create response ${createRes.status}`);

    const ticketRes = await fetchWithTimeout(`${options.appUrl}/api/sync-ticket`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: options.appUrl,
        cookie: cookies,
      },
      body: JSON.stringify({ filename: documentName }),
    }, options.timeoutMs);
    const ticketJson = await ticketRes.json().catch(() => ({})) as { websocketUrl?: string; permission?: string };
    progress(options, `sync-ticket response ${ticketRes.status}`);

    const desktopTokenRes = await fetchWithTimeout(`${options.appUrl}/api/account/access-tokens`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: options.appUrl,
        cookie: cookies,
      },
      body: JSON.stringify({ name: "Production smoke desktop token", expiresInDays: 1 }),
    }, options.timeoutMs);
    const desktopTokenJson = await desktopTokenRes.json().catch(() => ({})) as { token?: string };
    progress(options, `desktop token response ${desktopTokenRes.status}`);

    const desktopListRes = desktopTokenJson.token
      ? await fetchWithTimeout(`${options.appUrl}/api/mindmaps`, {
        headers: { Authorization: `Bearer ${desktopTokenJson.token}` },
      }, options.timeoutMs)
      : new Response("missing token", { status: 599 });
    const desktopListJson = await desktopListRes.json().catch(() => ({})) as {
      workspace?: { id?: string; name?: string } | null;
    };
    progress(options, `desktop list response ${desktopListRes.status}`);

    const desktopTicketRes = desktopTokenJson.token
      ? await fetchWithTimeout(`${options.appUrl}/api/sync-ticket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${desktopTokenJson.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filename: documentName,
          workspaceId: desktopListJson.workspace?.id,
        }),
      }, options.timeoutMs)
      : new Response("missing token", { status: 599 });
    const desktopTicketJson = await desktopTicketRes.json().catch(() => ({})) as { permission?: string };
    progress(options, `desktop sync-ticket response ${desktopTicketRes.status}`);

    const websocket = options.skipWebSocket
      ? "skipped"
      : ticketJson.websocketUrl
        ? await expectWebSocketOpen(ticketJson.websocketUrl, options.timeoutMs)
        : "not-run";
    progress(options, `websocket ${websocket}`);

    const result: AuthSmokeResult = {
      production_auth_smoke: "pass",
      email: options.email,
      invite_status: inviteRes.status,
      invite_mail: inviteJson.mail?.sent === true ? "sent" : inviteJson.mail?.reason ?? "unknown",
      signup_status: signupRes.status,
      signup_location: signupRes.headers.get("location"),
      verification_tokens: verificationTokens,
      beta_invite_status_after_signup: (inviteRows[0] as { status?: string } | undefined)?.status ?? null,
      pre_verified_login_status: preVerifiedLoginRes.status,
      pre_verified_login_location: preVerifiedLoginRes.headers.get("location"),
      verification_step: "db-marked-for-smoke",
      login_status: loginRes.status,
      login_location: loginRes.headers.get("location"),
      session_cookie: cookies.includes("bloommd_session=") ? "set" : "missing",
      workspace_rename_status: renameWorkspaceRes.status,
      workspace_name: renameWorkspaceJson.workspace?.name ?? null,
      create_status: createRes.status,
      create_storage_mode: createJson.storage?.mode ?? null,
      create_workspace_id: createJson.storage?.workspaceId ?? null,
      sync_ticket_status: ticketRes.status,
      sync_permission: ticketJson.permission ?? null,
      sync_url_protocol: ticketJson.websocketUrl ? new URL(ticketJson.websocketUrl).protocol : null,
      desktop_token_status: desktopTokenRes.status,
      desktop_list_status: desktopListRes.status,
      desktop_workspace_name: desktopListJson.workspace?.name ?? null,
      desktop_sync_ticket_status: desktopTicketRes.status,
      desktop_sync_permission: desktopTicketJson.permission ?? null,
      websocket,
    };

    if (inviteRes.status !== 200) throw new Error(`invite failed: ${JSON.stringify(result)}`);
    if (result.invite_mail !== "sent") throw new Error(`invite mail not sent: ${JSON.stringify(result)}`);
    if (signupRes.status !== 303) throw new Error(`signup failed: ${JSON.stringify(result)}`);
    if (!String(result.pre_verified_login_location || "").includes("Bitte%20best%C3%A4tige")) {
      throw new Error(`unverified login did not require verification: ${JSON.stringify(result)}`);
    }
    if (loginRes.status !== 303) throw new Error(`login failed: ${JSON.stringify(result)}`);
    if (result.session_cookie !== "set") throw new Error(`login did not set a session cookie: ${JSON.stringify(result)}`);
    if (renameWorkspaceRes.status !== 200 || result.workspace_name !== workspaceName) {
      throw new Error(`workspace rename failed: ${JSON.stringify(result)}`);
    }
    if (createRes.status !== 201) throw new Error(`document create failed: ${JSON.stringify(result)}`);
    if (result.create_storage_mode !== "database" || result.create_workspace_id !== renameWorkspaceJson.workspace?.id) {
      throw new Error(`cloud document workspace metadata failed: ${JSON.stringify(result)}`);
    }
    if (ticketRes.status !== 200 || result.sync_permission !== "write" || result.sync_url_protocol !== "wss:") {
      throw new Error(`sync ticket failed: ${JSON.stringify(result)}`);
    }
    if (
      desktopTokenRes.status !== 201 ||
      desktopListRes.status !== 200 ||
      result.desktop_workspace_name !== workspaceName ||
      desktopTicketRes.status !== 200 ||
      result.desktop_sync_permission !== "write"
    ) {
      throw new Error(`desktop token cloud flow failed: ${JSON.stringify(result)}`);
    }
    if (!options.skipWebSocket && websocket !== "open") throw new Error(`websocket failed: ${JSON.stringify(result)}`);

    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (options.cleanup) await cleanupSmokeData(sql, options.email).catch(() => {});
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

await run();
