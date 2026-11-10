import type { Metadata } from "next";
import { appOpenUrl, parseOpenRequest } from "../../lib/app-links";
import { getMarketingLocale } from "../../lib/locale";
import { OpenFallback } from "./open-fallback";
import { openMetadata } from "./open-metadata";

type SearchParams = Promise<{ lang?: string; path?: string | string[]; node?: string | string[] }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return openMetadata((await searchParams).lang);
}

export default async function OpenPage({ searchParams }: { searchParams: SearchParams }) {
  const { lang, path, node } = await searchParams;
  return <OpenFallback locale={getMarketingLocale(lang)} appUrl={appOpenUrl(parseOpenRequest({ path, node }))} />;
}
