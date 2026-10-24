import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import { getTemplate, listTemplates, templateSlugs } from "../../../lib/templates";
import { getMarketingLocale, withMarketingLocale } from "../../../lib/locale";
import { marketingMetadata } from "../../../lib/metadata";

interface TemplatePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}

export async function generateStaticParams() {
  return templateSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params, searchParams }: TemplatePageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = getMarketingLocale((await searchParams).lang);
  const template = await getTemplate(slug, locale);
  if (!template) return {};
  return marketingMetadata({
    title: `${template.title} | BloomMD Template`,
    description: template.description,
    path: `${withMarketingLocale(`/templates/${template.slug}`, locale)}`,
    locale,
  });
}

export default async function TemplatePage({ params, searchParams }: TemplatePageProps) {
  const { slug } = await params;
  const locale = getMarketingLocale((await searchParams).lang);
  const template = await getTemplate(slug, locale);
  if (!template) notFound();
  const related = (await listTemplates(locale)).filter((item) => item.slug !== template.slug && item.category === template.category).slice(0, 3);
  const copy = locale === "de"
    ? { templates: "Templates", demo: "In BloomMD öffnen", download: "Markdown herunterladen", problem: "Problem", problemText: "Mit einer leeren Markdown-Datei zu beginnen, macht das Produkt schwerer verständlich. Diese Vorlage liefert sofort ein vollständiges, brauchbares Beispiel.", audience: "Zielgruppe", recommended: "Empfohlene Nutzung", included: "Enthaltene Struktur", preview: "Markdown-Vorschau", related: "Ähnliche Templates", language: "EN" }
    : { templates: "Templates", demo: "Open in BloomMD", download: "Download Markdown", problem: "Problem", problemText: "Starting from a blank Markdown file makes the product harder to understand. This template gives you a complete example that is useful immediately.", audience: "Audience", recommended: "Recommended use", included: "Included structure", preview: "Markdown preview", related: "Related templates", language: "DE" };

  return (
    <main className="min-h-screen bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex items-center justify-between">
          <Link href={withMarketingLocale("/templates", locale)} className="text-sm font-semibold text-[#FF6B35]">{copy.templates}</Link>
          <Link href={withMarketingLocale(`/templates/${template.slug}`, locale === "de" ? "en" : "de")} className="text-xs font-semibold text-[var(--color-ink-muted)]">{copy.language}</Link>
        </div>
        <section className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#FF6B35]">{template.category}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--color-ink)]">{template.title}</h1>
            <p className="mt-4 text-lg leading-8 text-[var(--color-ink-muted)]">{template.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={withMarketingLocale(`/demo?template=${template.slug}`, locale)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F]">
                {copy.demo}
                <ArrowRight size={16} />
              </Link>
              <a href={`/api/templates/${template.slug}/markdown`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
                <Download size={16} />
                {copy.download}
              </a>
            </div>
          </div>
          <div className="relative min-h-72 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            <Image src={template.previewImage} alt="" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-8" />
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{copy.problem}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-ink)]">
              {copy.problemText}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{copy.audience}</h2>
            <ul className="mt-3 grid gap-2 text-sm text-[var(--color-ink)]">
              {template.audience.map((audience) => <li key={audience}>{audience}</li>)}
            </ul>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{copy.recommended}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-ink)]">{template.recommendedUse}</p>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{copy.included}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {template.sections.map((section) => (
                <span key={section} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm text-[var(--color-ink-muted)]">
                  {section}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{copy.preview}</h2>
            <pre tabIndex={0} aria-label={`${template.title} Markdown preview`} className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-[var(--color-border)] bg-[#1A1A1A] p-4 text-xs leading-6 text-white">
              <code>{template.markdown}</code>
            </pre>
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{copy.related}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {related.map((item) => (
                <Link key={item.slug} href={withMarketingLocale(`/templates/${item.slug}`, locale)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 hover:bg-[var(--color-surface-sunken)]">
                  <div className="text-sm font-semibold text-[var(--color-ink)]">{item.title}</div>
                  <div className="mt-1 text-xs text-[var(--color-ink-faint)]">{item.description}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
