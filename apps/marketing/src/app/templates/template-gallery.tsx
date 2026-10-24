"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Download, Filter } from "lucide-react";
import type { TemplateMetadata } from "../../lib/templates";
import type { MarketingLocale } from "../../lib/locale";
import { otherMarketingLocale, withMarketingLocale } from "../../lib/locale";

interface TemplateGalleryProps {
  templates: TemplateMetadata[];
  locale: MarketingLocale;
}

export function TemplateGallery({ templates, locale }: TemplateGalleryProps) {
  const copy = locale === "de"
    ? { all: "Alle", demo: "Demo öffnen", download: "Desktop laden", blog: "Blog", news: "News", eyebrow: "Vorlagenbibliothek", title: "Starte BloomMD mit einer echten Markdown-Map.", intro: "Templates sind normale Markdown-Dateien. Öffne eine Vorlage in der Demo ohne Login, lade die Quelle herunter oder nutze sie als Startpunkt in deinem Workspace.", category: "Kategorie", open: "In BloomMD öffnen", preview: "Vorschau", markdown: "Markdown", language: "EN" }
    : { all: "All", demo: "Open demo", download: "Download desktop", blog: "Blog", news: "News", eyebrow: "Template library", title: "Start BloomMD with a real Markdown map.", intro: "Templates are normal Markdown files. Open one in the no-login demo, download the source, or use it as a starting point in your workspace.", category: "Category", open: "Open in BloomMD", preview: "Preview", markdown: "Markdown", language: "DE" };
  const [category, setCategory] = useState(copy.all);
  const categories = useMemo(() => [copy.all, ...Array.from(new Set(templates.map((template) => template.category))).sort()], [copy.all, templates]);
  const filteredTemplates = category === copy.all
    ? templates
    : templates.filter((template) => template.category === category);

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-5 py-3">
          <Link href={locale === "de" ? "/" : "/en"} className="text-sm font-semibold text-[var(--color-ink)]">BloomMD</Link>
          <nav className="hidden items-center gap-1 text-sm font-semibold text-[var(--color-ink-muted)] lg:flex" aria-label={locale === "de" ? "Inhaltsnavigation" : "Content navigation"}>
            <Link href={locale === "de" ? "/blog" : "/en/blog"} className="rounded-md px-3 py-2 hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]">{copy.blog}</Link>
            <Link href={locale === "de" ? "/news" : "/en/news"} className="rounded-md px-3 py-2 hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]">{copy.news}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href={withMarketingLocale("/demo", locale)} className="rounded-md bg-[#1A1A1A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#333]">
              {copy.demo}
            </Link>
            <Link href={withMarketingLocale("/download", locale)} className="hidden rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] sm:inline-flex">
              {copy.download}
            </Link>
            <Link href={withMarketingLocale("/templates", otherMarketingLocale(locale))} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-muted)]">
              {copy.language}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <section className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#FF6B35]">{copy.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--color-ink)]">
            {copy.title}
          </h1>
          <p className="mt-4 text-lg leading-8 text-[var(--color-ink-muted)]">
            {copy.intro}
          </p>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <div className="mr-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-muted)]">
            <Filter size={16} />
            {copy.category}
          </div>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                category === item
                  ? "border-[#FF6B35] bg-[var(--color-bloom-light)] text-[#FF6B35]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <section className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <article key={template.slug} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
              <div className="relative h-36 border-b border-[var(--color-border)] bg-[#FFF4EE]">
                <Image src={template.previewImage} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-contain p-5" />
              </div>
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="rounded-md bg-[var(--color-bloom-light)] px-2 py-1 text-xs font-semibold text-[#FF6B35]">
                    {template.category}
                  </span>
                  <span className="text-xs text-[var(--color-ink-faint)]">v{template.version}</span>
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-[var(--color-ink)]">{template.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-ink-muted)]">{template.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {template.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-ink-faint)]">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-5 grid gap-2">
                  <Link href={`/demo?template=${template.slug}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-3 text-sm font-semibold text-white hover:bg-[#E95F2F]">
                    {copy.open}
                    <ArrowRight size={16} />
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={withMarketingLocale(`/templates/${template.slug}`, locale)} className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
                      {copy.preview}
                    </Link>
                    <a href={`/api/templates/${template.slug}/markdown`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
                      <Download size={15} />
                      {copy.markdown}
                    </a>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
