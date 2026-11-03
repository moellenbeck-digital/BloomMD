import type { Metadata } from "next";
import { getMarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

/** The canonical URL never carries the link parameters, so a vault path cannot end up in metadata. */
export function openMetadata(lang: string | undefined): Metadata {
  const locale = getMarketingLocale(lang);
  return marketingMetadata({
    title: locale === "en" ? "Open in BloomMD" : "In BloomMD öffnen",
    description: locale === "en" ? "Open a mind map in the BloomMD app." : "Eine Mindmap in der BloomMD-App öffnen.",
    path: locale === "en" ? "/open?lang=en" : "/open",
    locale,
    robots: { index: false, follow: false },
  });
}
