import * as Sentry from "@sentry/nextjs";
import { plausibleStartupLine } from "./lib/plausible";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // One line at start, also when switched off. Reads the environment only, no network.
    console.info(plausibleStartupLine());
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
