import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { THEME_BOOT_SCRIPT } from "@bloommd/ui/theme-boot";
import { AnalyticsProvider } from "./analytics-provider";
import { getAppLocale } from "../lib/locale";
import { plausibleBrowserConfig, plausibleRequestHost, plausibleScriptAttributes } from "../lib/plausible";
import "./globals.css";

// The on-screen keyboard shrinks the page (not only the visual viewport) where the browser supports it,
// so the editor stays above the keyboard. Safari ignores this; `useVisualViewport` covers it.
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export async function generateMetadata(): Promise<Metadata> {
  const locale = getAppLocale((await headers()).get("x-bloommd-locale"));
  const copy = locale === "en"
    ? {
        description: "Private BloomMD app for workspaces, Markdown mind maps, OKF, llm-wiki, sync and collaboration.",
      }
    : {
        description: "Private BloomMD App für Workspaces, Markdown-Mindmaps, OKF, llm-wiki, Sync und Zusammenarbeit.",
      };
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://bloommd.app"),
    title: "BloomMD App",
    description: copy.description,
    robots: { index: false, follow: false },
    alternates: { canonical: "/" },
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "BloomMD App",
      description: copy.description,
      url: "https://bloommd.app",
      siteName: "BloomMD",
      images: [{ url: "/og/bloommd-og-banner.png", width: 1200, height: 630, alt: "BloomMD — Markdown, visualized." }],
      type: "website",
    },
    twitter: { card: "summary_large_image", title: "BloomMD App", description: copy.description, images: ["/og/bloommd-og-banner.png"] },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const lang = requestHeaders.get("x-bloommd-locale") === "en" ? "en" : "de";
  // Read per request on the server (not NEXT_PUBLIC_*), so the environment of the running server decides.
  // `null` for foreign hosts, the test system and when switched off: then no tag at all.
  const plausible = plausibleBrowserConfig(plausibleRequestHost(requestHeaders));
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/*
          Sets the theme before the first paint.

          `useTheme` applies the class in an effect, which by definition runs after hydration — so a
          user who prefers dark saw the light theme flash first, on every single load. That is the
          first thing they see of the product, and it looks broken rather than merely light.

          Deliberately a blocking inline script: it has to run before the browser paints, and
          anything deferred or bundled is too late.

          The branching mirrors `getInitialTheme` exactly — a stored value only counts when it is
          "light" or "dark", anything else falls through to the system preference. Getting that
          wrong reintroduces the flash it exists to prevent: the script would pick one theme and
          the effect the other.

          A stored custom theme (`bloommd-theme-custom`) is applied on top, with the same checks and
          colour derivation as `useTheme`; an invalid value is ignored. The script text lives in
          `@bloommd/ui/theme-boot`, where a test runs it against the hook's code.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_BOOT_SCRIPT,
          }}
        />
        {plausible && <script {...plausibleScriptAttributes(plausible)} />}
      </head>
      {/* Colours come from the tokens so the body follows the theme the script just picked. */}
      <body className="bg-[var(--color-surface)] text-[var(--color-ink)]">
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
