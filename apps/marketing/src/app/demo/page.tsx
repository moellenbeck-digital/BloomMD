import type { Metadata } from "next";
import { Providers } from "../providers";
import { DemoClient } from "./demo-client";
import { getTemplate, listTemplates } from "../../lib/templates";
import { getMarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

interface DemoPageProps {
  searchParams: Promise<{ template?: string; lang?: string }>;
}

export async function generateMetadata({ searchParams }: DemoPageProps): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: "BloomMD Demo",
    description: locale === "en"
      ? "Try BloomMD without an account. Visualize templates or your own Markdown locally in the browser."
      : "BloomMD ohne Account ausprobieren: Vorlagen oder eigenes Markdown lokal im Browser als Mindmap visualisieren.",
    path: locale === "en" ? "/demo?lang=en" : "/demo",
    locale,
  });
}

export default async function DemoPage({ searchParams }: DemoPageProps) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const templates = await listTemplates(locale);
  const slug = params.template && templates.some((template) => template.slug === params.template)
    ? params.template
    : "software-architecture";
  const template = await getTemplate(slug, locale);

  return (
    <Providers initialLocale={locale}>
      <DemoClient
        templates={templates}
        locale={locale}
        initialTemplate={{
          slug,
          markdown: template?.markdown ?? "# BloomMD Demo\n\n## Try Markdown\n",
        }}
      />
    </Providers>
  );
}
