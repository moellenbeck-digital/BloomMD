import type { Metadata } from "next";
import type { MarketingLocale } from "./locale";

export const SOCIAL_IMAGE_PATH = "/og/bloommd-og-banner.png";
export const SOCIAL_IMAGE_ALT = "BloomMD — Markdown, visualized.";

interface MarketingMetadataOptions {
  title: string;
  description: string;
  path: string;
  locale?: MarketingLocale;
  robots?: Metadata["robots"];
  languages?: Record<string, string>;
  type?: "website" | "article";
  publishedTime?: string;
}

/**
 * Shared metadata for public marketing pages.
 *
 * Keeping the image, card type and page URL together prevents a route from
 * publishing a valid-looking but misleading preview inherited from the root
 * layout. Relative URLs are intentional: Next resolves them against the
 * production metadataBase and emits absolute URLs in the HTML head.
 */
export function marketingMetadata({
  title,
  description,
  path,
  locale = "de",
  robots,
  languages,
  type = "website",
  publishedTime,
}: MarketingMetadataOptions): Metadata {
  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    alternates: {
      canonical: path,
      ...(languages ? { languages } : {}),
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "BloomMD",
      locale: locale === "en" ? "en_US" : "de_DE",
      alternateLocale: locale === "en" ? ["de_DE"] : ["en_US"],
      images: [{
        url: SOCIAL_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      }],
      type,
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SOCIAL_IMAGE_PATH],
    },
  };
}
