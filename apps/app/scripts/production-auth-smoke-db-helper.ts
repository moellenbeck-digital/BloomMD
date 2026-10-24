import postgres from "postgres";

const email = process.env.EMAIL;
const action = process.env.ACTION;

if (!email) throw new Error("EMAIL is required");
if (!action) throw new Error("ACTION is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  onnotice: () => {},
});

async function cleanup() {
  const users = await sql`select id from bloom_users where lower(email) = lower(${email})`;
  const userIds = users.map((row) => row.id as string);
  if (userIds.length > 0) {
    await sql`delete from bloom_documents where created_by = any(${userIds}) or updated_by = any(${userIds})`;
    await sql`delete from bloom_workspaces where owner_user_id = any(${userIds})`;
    await sql`delete from bloom_users where id = any(${userIds})`;
  }
  await sql`delete from bloom_auth_tokens where lower(email) = lower(${email})`;
  await sql`delete from bloom_beta_invites where lower(email) = lower(${email})`;
  console.log(JSON.stringify({ cleanup: "done" }));
}

async function state() {
  const users = await sql`select id, email_verified_at from bloom_users where lower(email) = lower(${email})`;
  const tokens = await sql`
    select count(*)::int as count
    from bloom_auth_tokens
    where lower(email) = lower(${email})
      and purpose = 'email_verification'
      and consumed_at is null
  `;
  const invites = await sql`select status from bloom_beta_invites where lower(email) = lower(${email})`;
  console.log(JSON.stringify({
    users: users.length,
    userId: users[0]?.id ?? null,
    emailVerifiedAt: users[0]?.email_verified_at ?? null,
    verificationTokens: Number(tokens[0]?.count ?? 0),
    inviteStatus: invites[0]?.status ?? null,
  }));
}

async function markVerified() {
  await sql`
    update bloom_users
    set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
    where lower(email) = lower(${email})
  `;
  console.log(JSON.stringify({ verification_step: "db-marked-for-smoke" }));
}

try {
  if (action === "cleanup") await cleanup();
  else if (action === "state") await state();
  else if (action === "mark-verified") await markVerified();
  else throw new Error(`Unknown ACTION: ${action}`);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
