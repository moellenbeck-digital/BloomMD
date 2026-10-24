import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { listDocs } from "@/lib/docs";
import { getMarketingLocale, otherMarketingLocale, withMarketingLocale } from "@/lib/locale";
import { marketingMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = getMarketingLocale((await headers()).get("x-bloommd-locale"));
  return marketingMetadata({
    title: locale === "en" ? "BloomMD Documentation" : "BloomMD Dokumentation",
    description: locale === "en"
      ? "Web, desktop, collaboration, OKF and LLM wiki documentation for the closed beta."
      : "Dokumentation zu Web, Desktop, Zusammenarbeit, OKF und LLM-Wiki für die Closed Beta.",
    path: locale === "en" ? "/docs?lang=en" : "/docs",
    locale,
  });
}

/**
 * Documentation shell.
 *
 * The sidebar is derived from the files in `content/docs`, so adding a page is adding a Markdown
 * file — nothing to register, nothing to keep in sync.
 */
export default async function DocsLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const locale = getMarketingLocale(requestHeaders.get("x-bloommd-locale"));
  const pages = await listDocs(locale);
  const languageHref = withMarketingLocale("/docs", otherMarketingLocale(locale));
  const navigationLabel = locale === "de" ? "Dokumentation" : "Documentation";
  const homeHref = locale === "de" ? "/" : "/en";
  const mobileLanguageHref = `${languageHref}${languageHref.includes("?") ? "&" : "?"}navigation=1`;

  const navigationLinks = (
    <ul className="space-y-1">
      {pages.map((page) => (
        <li key={page.slug}>
          <Link
            href={withMarketingLocale(page.slug ? `/docs/${page.slug}` : "/docs", locale)}
            className="block rounded px-2 py-1.5 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316]"
          >
            {page.title}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-7 sm:px-6 sm:py-12 lg:flex-row lg:gap-10">
        <nav aria-label={navigationLabel} className="hidden lg:block lg:w-56 lg:shrink-0">
          <Link href={homeHref} className="font-mono text-xs uppercase tracking-[0.12em] text-[#9A3412] hover:text-[#7C2D12]">
            BloomMD
          </Link>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-lg font-semibold">{navigationLabel}</p>
            <Link href={languageHref} className="text-xs font-semibold text-[#9A3412] hover:underline">
              {locale === "de" ? "EN" : "DE"}
            </Link>
          </div>
          <div className="mt-5">{navigationLinks}</div>
        </nav>
        <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:content-none">
            <span>{navigationLabel}</span>
            <span className="text-xs font-semibold text-[#9A3412]">{locale === "de" ? "Übersicht öffnen" : "Open overview"}</span>
          </summary>
          <div className="border-t border-[var(--color-border)] px-3 py-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <Link href={homeHref} className="text-xs font-semibold text-[#9A3412] hover:underline">BloomMD</Link>
              <Link href={mobileLanguageHref} className="text-xs font-semibold text-[#9A3412] hover:underline">{locale === "de" ? "EN" : "DE"}</Link>
            </div>
            {navigationLinks}
          </div>
        </details>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
