import type { Metadata } from "next";
import { headers } from "next/headers";
import { marketingMetadata } from "../lib/metadata";
import { MarketingProviders } from "./marketing-providers";
import "./globals.css";

const rootMetadata = marketingMetadata({
  title: "BloomMD – Markdown visuell strukturieren",
  description: "Offene Markdown-Dateien als interaktive visuelle Wissensräume. Local-first, portabel und ohne Lock-in.",
  path: "/",
  languages: {
    de: "/",
    en: "/en",
    "x-default": "/",
  },
});

export const metadata: Metadata = {
  ...rootMetadata,
  robots: { index: true, follow: true },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://bloommd.io"),
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-bloommd-pathname") ?? "/";
  const lang = requestHeaders.get("x-bloommd-locale") === "en" || pathname === "/en" || pathname.startsWith("/en/") ? "en" : "de";

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        {/*
          Set the Marketing theme before first paint, matching the product app.
          Marketing has no visible theme switch, but it must still respect the user's system
          preference so bloommd.io and bloommd.app do not disagree on first impression.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("bloommd-theme");var d=s==="dark"||s==="light"?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-[var(--color-surface)] text-[var(--color-ink)]">
        <MarketingProviders initialLocale={lang}>{children}</MarketingProviders>
      </body>
    </html>
  );
}
