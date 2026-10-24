import postgres from "postgres";

/**
 * Tagged-template SQL client for the sync service, provider neutral.
 *
 * Mirrors `apps/app/src/lib/sql-client.ts`. The duplication is deliberate: the sync service is
 * deployed as its own process and must not import the web package.
 */
export type SqlClient = ReturnType<typeof postgres>;

export function createSqlClient(databaseUrl: string): SqlClient {
  const sslmode = new URL(databaseUrl).searchParams.get("sslmode");
  return postgres(databaseUrl, {
    // Mapped one to one with what the release gate accepts. `verify-ca` is not a mode postgres.js
    // implements, so it is neither accepted there nor silently upgraded here.
    ssl: sslmode === "verify-full" ? "verify-full" : sslmode === "require" ? "require" : undefined,
    max: Number(process.env.SYNC_DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
}
