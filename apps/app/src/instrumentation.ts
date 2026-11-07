import * as Sentry from "@sentry/nextjs";
import { getBuildInfo } from "./lib/build-info";
import { plausibleStartupLine } from "./lib/plausible";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // One line at start, also when switched off. Reads the environment only.
    const { version } = getBuildInfo("app");
    console.info(plausibleStartupLine(process.env, version));
    // Fire and forget: the request is not awaited, so nothing here waits for the network.
    const { startServerSignal } = await import("./lib/plausible-server-signal");
    startServerSignal(version);
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
