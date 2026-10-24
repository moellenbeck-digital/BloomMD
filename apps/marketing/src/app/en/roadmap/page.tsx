import type { Metadata } from "next";
import { marketingMetadata } from "../../../lib/metadata";
import { getPublicRoadmap } from "../../../lib/roadmap";
import { RoadmapPage } from "../../roadmap/roadmap-page";

export const revalidate = 30;

export const metadata: Metadata = marketingMetadata({
  title: "BloomMD Roadmap - Public beta feedback",
  description: "Curated public BloomMD roadmap with feedback, ready, in progress and in review.",
  path: "/en/roadmap",
  locale: "en",
  languages: {
    de: "/roadmap",
    en: "/en/roadmap",
    "x-default": "/roadmap",
  },
});

export default async function EnglishRoadmapRoute() {
  const data = await getPublicRoadmap();
  return <RoadmapPage data={data} locale="en" />;
}
