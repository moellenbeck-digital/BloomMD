import * as Sentry from "@sentry/nextjs";
import { filterTelemetryBreadcrumb, scrubTelemetryEvent } from "./lib/telemetryPrivacy";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0,
    maxBreadcrumbs: 20,
    beforeBreadcrumb: filterTelemetryBreadcrumb,
    beforeSend: scrubTelemetryEvent,
  });
}
