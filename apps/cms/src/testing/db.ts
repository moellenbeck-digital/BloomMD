import { randomBytes } from "node:crypto";
import { Client } from "pg";

/**
 * URL of the throwaway Postgres for `*.db.test.ts`. Locally an unset variable means "skip"
 * (`describe.skipIf`); in CI an unset or empty variable throws, so a missing database service turns the
 * run red instead of silently skipping the tests (same rule as tests/integration/db-test-url.ts).
 * The user needs the right to create databases: every run uses a fresh database of its own.
 */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const url = env.BLOOMMD_TEST_DATABASE_URL;
  if (!url && env.CI === "true") throw new Error("BLOOMMD_TEST_DATABASE_URL fehlt in der CI, DB-Tests dürfen nicht übersprungen werden");
  return url || undefined;
}

export interface TestDatabase {
  url: string;
  name: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(adminUrl: string): Promise<TestDatabase> {
  const name = `cms_test_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    name,
    async drop() {
      const client = new Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`drop database if exists ${name} with (force)`);
      } finally {
        await client.end();
      }
    },
  };
}
