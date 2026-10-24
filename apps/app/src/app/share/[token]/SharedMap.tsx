"use client";

import { useMemo, useState } from "react";
import type { MindMapDocument, MindMapNode } from "@bloommd/core/browser";
import { MindMapPreview } from "@bloommd/ui";
import type { SharedMapView } from "../../../lib/shared-map";

const STATUS = { open: "offen", in_progress: "in Arbeit", done: "erledigt" } as const;
const DECISION = { proposed: "vorgeschlagen", accepted: "angenommen", rejected: "abgelehnt" } as const;

/** Read-only view of a shared map: the map itself plus its content as a readable outline. */
export function SharedMap({ map, updatedAt }: { map: SharedMapView; updatedAt: string }) {
  // The server sends only what the link may reveal (see lib/shared-map.ts); rebuild a document for the preview.
  const document = useMemo<MindMapDocument>(() => ({
    filePath: "shared.md",
    frontmatter: { title: map.title, id: "", created: "", updated: updatedAt },
    nodes: new Map(map.nodes.map((node) => [node.id, node as MindMapNode])),
    rootId: map.rootId,
    rawMarkdown: "",
  }), [map, updatedAt]);
  const [view, setView] = useState<"map" | "outline">("map");
  const title = map.title;
  const ordered: MindMapNode[] = [];
  const walk = (id: string) => {
    const node = document.nodes.get(id);
    if (!node) return;
    ordered.push(node);
    node.children.forEach(walk);
  };
  walk(document.rootId);

  return (
    <main className="flex h-dvh flex-col bg-[#FAFAFA]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#E8E4DF] bg-white px-4 py-3">
        <span className="text-base font-bold text-[#1A1A1A]">Bloom<span className="font-normal text-[#666]">MD</span></span>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1A1A1A]">{title}</h1>
        <span className="text-xs text-[#999]">Nur lesen · Stand {new Date(updatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
        <div className="flex rounded-md border border-[#E8E4DF] p-0.5" role="tablist" aria-label="Ansicht">
          {(["map", "outline"] as const).map((entry) => (
            <button key={entry} type="button" role="tab" aria-selected={view === entry} onClick={() => setView(entry)} className={`min-h-9 rounded px-3 text-xs font-semibold ${view === entry ? "bg-[#1A1A1A] text-white" : "text-[#666]"}`}>
              {entry === "map" ? "Map" : "Gliederung"}
            </button>
          ))}
        </div>
      </header>
      {view === "map" ? (
        // The preview fills its box; an absolutely placed box gives it a definite height on every screen size.
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <MindMapPreview document={document} className="rounded-none border-0" ariaLabel={`Map ${title}`} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-3xl px-5 py-6">
          {ordered.map((node) => {
            const Heading = `h${Math.min(node.level + 1, 6)}` as "h2";
            return (
              <section key={node.id} className="mb-4" style={{ marginLeft: `${(node.level - 1) * 16}px` }}>
                <Heading className="font-semibold text-[#1A1A1A]">{node.title}</Heading>
                {node.metadata?.kind === "task" && <p className="text-xs text-[#666]">Aufgabe · {STATUS[node.metadata.status ?? "open"]}{node.metadata.due ? ` · fällig ${node.metadata.due}` : ""}{node.metadata.assignee ? ` · ${node.metadata.assignee}` : ""}</p>}
                {node.metadata?.kind === "decision" && <p className="text-xs text-[#666]">Entscheidung · {DECISION[node.metadata.decision ?? "proposed"]}</p>}
                {node.content.trim() && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#333]">{node.content.trim()}</p>}
              </section>
            );
          })}
        </article>
        </div>
      )}
    </main>
  );
}
