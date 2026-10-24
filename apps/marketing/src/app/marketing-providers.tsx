"use client";

import type { Locale } from "@bloommd/ui";
import { LocaleProvider } from "@bloommd/ui";
import { AnalyticsProvider } from "./analytics-provider";

export function MarketingProviders({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <AnalyticsProvider>{children}</AnalyticsProvider>
    </LocaleProvider>
  );
}
