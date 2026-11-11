/** Fail fast at server start when the configuration is incomplete or unsafe. Not run by `next build`. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkRuntimeConfigOrExit } = await import("./instrumentation-node");
    checkRuntimeConfigOrExit();
  }
}
