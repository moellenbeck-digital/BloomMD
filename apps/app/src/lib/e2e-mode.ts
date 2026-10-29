/**
 * The E2E auth bypass signs people in without a password or a confirmed address, so it must never
 * work on a public instance by accident (#169).
 *
 * Outside a production build `BLOOMMD_E2E_AUTH_BYPASS=1` is enough (dev server, unit tests). A
 * production build needs two more explicit markers: `BLOOMMD_E2E_TEST_MODE=1` and
 * `BLOOMMD_LOCAL_DEPLOYMENT=1`, which marks a loopback or test-system deployment and is never set
 * on the public app. Fail-closed: a production environment that forgot `release:check` still needs
 * three variables to be wrong at once, and the bypass stays off unless all of them are set.
 */
export function isE2EAuthBypassEnabled(): boolean {
  if (process.env.BLOOMMD_E2E_AUTH_BYPASS !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;

  return process.env.BLOOMMD_E2E_TEST_MODE === "1" && process.env.BLOOMMD_LOCAL_DEPLOYMENT === "1";
}
