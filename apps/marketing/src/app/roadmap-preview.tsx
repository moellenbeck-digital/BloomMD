"use client";

import { parseFile } from "@bloommd/core/browser";
import { MindMapPreview } from "@bloommd/ui";

const roadmapPreviewDocument = parseFile("roadmap.md", ["# Roadmap", "## Produktkern", "## Zusammenarbeit", "## Sync", "## Dokumentation"].join("\n"));

export function RoadmapPreview() {
  return <MindMapPreview document={roadmapPreviewDocument} className="min-h-[250px]" ariaLabel="Roadmap Markdown mind map preview" />;
}
