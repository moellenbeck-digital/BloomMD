import type { Metadata } from "next";
import { headers } from "next/headers";
import { AnalyticsProvider } from "./analytics-provider";
import { getAppLocale } from "../lib/locale";
import "./globals.css";

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
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("bloommd-theme");var d=s==="dark"||s==="light"?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})();`,
          }}
        />
      </head>
      {/* Colours come from the tokens so the body follows the theme the script just picked. */}
      <body className="bg-[var(--color-surface)] text-[var(--color-ink)]">
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
