"use client";

import { LocaleProvider } from "@bloommd/ui";
import type { Locale } from "@bloommd/ui";

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  return <LocaleProvider initialLocale={initialLocale}>{children}</LocaleProvider>;
}
