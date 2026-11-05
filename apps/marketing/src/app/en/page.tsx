import type { Metadata } from "next";
import { marketingMetadata } from "../../lib/metadata";
import { EnglishLandingPage } from "./english-landing-page";

export const metadata: Metadata = marketingMetadata({
  title: "BloomMD - Visual Markdown maps",
  description: "Explore open Markdown files as visual maps. Local agents propose changes; you review and approve them.",
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
