import { runtimeConfigErrors } from "./lib/env";

/**
 * Node-only part of `instrumentation.ts`. Next logs an error thrown by `register()` and keeps serving, so a
 * throw would leave a half-configured service running; the process ends instead (no unsafe start).
 */
export function checkRuntimeConfigOrExit(): void {
  const errors = runtimeConfigErrors();
  if (errors.length === 0) return;
  console.error(`BloomMD CMS configuration is incomplete:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
