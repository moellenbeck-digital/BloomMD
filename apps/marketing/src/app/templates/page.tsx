import type { Metadata } from "next";
import { TemplateGallery } from "./template-gallery";
import { listTemplates } from "../../lib/templates";
import { getMarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: locale === "en" ? "BloomMD Templates" : "BloomMD Vorlagen",
    description: locale === "en"
      ? "Browse Markdown mind map templates for architecture, startups, Obsidian, research, writing and content strategy."
      : "Markdown-Mindmap-Vorlagen für Architektur, Startups, Obsidian, Forschung, Schreiben und Content-Strategie entdecken.",
    path: locale === "en" ? "/templates?lang=en" : "/templates",
    locale,
  });
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = getMarketingLocale((await searchParams).lang);
  const templates = await listTemplates(locale);
  return <TemplateGallery templates={templates} locale={locale} />;
}
