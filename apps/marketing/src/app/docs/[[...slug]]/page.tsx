import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Markdown } from "fumadocs-core/content/md";
import { getDoc, listDocs } from "@/lib/docs";
import { getMarketingLocale } from "@/lib/locale";
import { marketingMetadata } from "@/lib/metadata";

export async function generateStaticParams() {
  const pages = await listDocs("de");
  const englishPages = await listDocs("en");
  return [...pages, ...englishPages].map((page) => ({ slug: page.slug ? [page.slug] : [] }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const requestHeaders = await headers();
  const locale = getMarketingLocale(requestHeaders.get("x-bloommd-locale"));
  const page = await getDoc(slug?.[0] ?? "", locale);
  if (!page) return {};
  const pagePath = slug?.[0] ? `/docs/${slug[0]}` : "/docs";
  return marketingMetadata({
    title: `${page.title} · BloomMD`,
    description: page.description,
    path: locale === "en" ? `${pagePath}?lang=en` : pagePath,
    locale,
  });
}

export default async function DocPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const locale = getMarketingLocale(requestHeaders.get("x-bloommd-locale"));
  const page = await getDoc(slug?.[0] ?? "", locale);
  if (!page) notFound();
  const isOpenClawGuide = page.slug === "openclaw-agent";

  return (
    <article data-testid="docs-article" className="prose-bloommd max-w-none">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#9A3412]">{locale === "de" ? "Dokumentation" : "Documentation"}</p>
      <h1 className="mt-2 text-3xl font-semibold">{page.title}</h1>
      {page.description && <p className="mt-2 text-[var(--color-ink-muted)]">{page.description}</p>}
      {isOpenClawGuide && (
        <picture className="mt-8 block">
          <source media="(max-width: 639px)" srcSet={locale === "de" ? "/docs/openclaw-workspace-agent-flow-mobile.svg" : "/docs/openclaw-workspace-agent-flow-mobile-en.svg"} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={locale === "de" ? "/docs/openclaw-workspace-agent-flow.svg" : "/docs/openclaw-workspace-agent-flow-en.svg"} alt={locale === "de" ? "Ablauf: Knoten auswählen, lokalen Agenten beauftragen, Vorschlag prüfen und anschließend selbst übernehmen oder verwerfen" : "Flow: select a node, assign a local agent, review a proposal, then choose to apply or discard it"} className="block h-auto w-full" />
        </picture>
      )}
      <div className="mt-8 space-y-4 leading-7">
        {/* Rendered on the server: the docs are static content, not a client-side bundle. */}
        <Markdown>{page.content}</Markdown>
      </div>
    </article>
  );
}
