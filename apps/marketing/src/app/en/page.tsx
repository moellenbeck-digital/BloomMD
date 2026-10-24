import type { Metadata } from "next";
import { marketingMetadata } from "../../lib/metadata";
import { EnglishLandingPage } from "./english-landing-page";

export const metadata: Metadata = marketingMetadata({
  title: "BloomMD - Visual Markdown maps",
  description: "Open a Markdown file and see its structure immediately as a visual map. Local-first, portable and built for the closed beta.",
  path: "/en",
  locale: "en",
  languages: {
    de: "/",
    en: "/en",
    "x-default": "/",
  },
});

export default function EnglishPage() {
  return <EnglishLandingPage />;
}
