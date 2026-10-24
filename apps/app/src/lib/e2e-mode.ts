export function isE2EAuthBypassEnabled(): boolean {
  if (process.env.BLOOMMD_E2E_AUTH_BYPASS !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;

  return process.env.BLOOMMD_E2E_TEST_MODE === "1";
}
