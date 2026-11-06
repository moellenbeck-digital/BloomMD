/**
 * URL of the throwaway Postgres for the *-db.integration.test.ts files. Locally an unset variable
 * means "skip" (the files use `describe.skipIf(!url)`); in CI an unset or empty variable throws, so
 * a missing database service turns the run red instead of silently skipping the tests.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.BLOOMMD_TEST_DATABASE_URL;
  if (!url && env.CI === "true")
    throw new Error("BLOOMMD_TEST_DATABASE_URL fehlt in der CI, DB-Tests dürfen nicht übersprungen werden");
  return url;
}
