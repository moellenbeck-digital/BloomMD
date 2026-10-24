import type { Metadata } from "next";
import { marketingMetadata } from "../../lib/metadata";
import { getPublicRoadmap } from "../../lib/roadmap";
import { RoadmapPage } from "./roadmap-page";

export const revalidate = 30;

export const metadata: Metadata = marketingMetadata({
  title: "BloomMD Roadmap - Öffentliches Beta-Feedback",
  description: "Kuratierte öffentliche BloomMD-Roadmap mit Feedback, Ready, In progress und In review.",
  path: "/roadmap",
  languages: {
    de: "/roadmap",
    en: "/en/roadmap",
    "x-default": "/roadmap",
  },
});

export default async function RoadmapRoute() {
  const data = await getPublicRoadmap();
  return <RoadmapPage data={data} locale="de" />;
}
