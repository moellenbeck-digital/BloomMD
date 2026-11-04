import type { Metadata } from "next";
import { appOpenUrl, parseOpenRequest } from "../../../lib/app-links";
import { getMarketingLocale } from "../../../lib/locale";
import { OpenFallback } from "../open-fallback";
import { openMetadata } from "../open-metadata";

type SearchParams = Promise<{ lang?: string; node?: string | string[] }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return openMetadata((await searchParams).lang);
}

export default async function OpenDocumentPage({ params, searchParams }: { params: Promise<{ doc: string }>; searchParams: SearchParams }) {
  const [{ doc }, { lang, node }] = await Promise.all([params, searchParams]);
  return <OpenFallback locale={getMarketingLocale(lang)} appUrl={appOpenUrl(parseOpenRequest({ doc, node }))} />;
}
