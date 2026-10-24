import postgres from "postgres";

/**
 * Tagged-template SQL client, provider neutral.
 *
 * BloomMD previously bound itself to `@neondatabase/serverless`. The private beta runs on platform
 * Postgres via CloudNativePG, so connectivity has to work against any TLS-reachable Postgres while
 * the schema and tenant isolation behaviour stay unchanged.
 *
 * The shape matches what the call sites already expect: `` await sql`select ...` `` resolves to an
 * array of row objects, and interpolated values are always sent as bound parameters.
 */
export type SqlClient = ReturnType<typeof postgres>;

/** Postgres URL schemes accepted for the cloud database. */
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export function isPostgresUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return POSTGRES_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * True when the connection string demands TLS.
 *
 * Only the two modes `postgres` actually implements are recognised. `verify-ca` is intentionally
 * absent: the driver has no such mode, so honouring it would mean silently applying `verify-full`
 * and its hostname check.
 */
export function requiresTls(value: string | undefined): boolean {
  if (!isPostgresUrl(value)) return false;
  const sslmode = new URL(value!).searchParams.get("sslmode");
  return sslmode === "require" || sslmode === "verify-full";
}

export function createSqlClient(databaseUrl: string): SqlClient {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  // postgres.js reads sslmode itself, but an explicit value keeps behaviour identical across
  // deployments where the parameter is dropped by an operator-managed connection string.
  return postgres(databaseUrl, {
    // Mapped one to one with what the release gate accepts, so a configuration cannot pass review
    // and then behave differently at runtime.
    ssl: sslmode === "verify-full" ? "verify-full" : sslmode === "require" ? "require" : undefined,
    // The web app runs serverless-ish request handlers; a small pool avoids exhausting the cluster.
    max: Number(process.env.BLOOMMD_DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
}
