"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { useLocale } from "../i18n/LocaleContext";
import { MarkdownReader } from "./MarkdownReader";

const HEADING_CLASS: Record<number, string> = {
  1: "mt-10 text-3xl font-semibold leading-tight sm:text-4xl",
  2: "mt-9 text-2xl font-semibold leading-tight",
  3: "mt-8 text-xl font-semibold leading-snug",
  4: "mt-7 text-lg font-semibold leading-snug",
  5: "mt-6 text-base font-semibold",
  6: "mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]",
};

/**
 * Calm, read-only view of the open document (or the focused branch): node titles as headings by
 * level, each followed by the Markdown of its content. It only reads the store; it has no editor,
 * no node actions and never writes, so opening it cannot change the source.
 */
export function ReadingView() {
  const { t } = useLocale();
  const doc = useMindMapStore((state) => state.document);
  const focusNodeId = useMindMapStore((state) => state.focusNodeId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const documentKey = doc ? `${doc.frontmatter.id}:${doc.filePath}` : "";

  const nodes = useMemo(() => {
    if (!doc) return [];
    const ordered: Array<NonNullable<ReturnType<typeof doc.nodes.get>>> = [];
    const walk = (id: string) => {
      const node = doc.nodes.get(id);
      if (!node) return;
      ordered.push(node);
      node.children.forEach(walk);
    };
    if (focusNodeId && doc.nodes.has(focusNodeId)) walk(focusNodeId);
    else for (const node of doc.nodes.values()) if (node.parentId === null) walk(node.id);
    return ordered;
  }, [doc, focusNodeId]);

  // Keyboard scrolling (arrows, Page Up/Down) needs the scroll container focused. A newly opened
  // document starts at its beginning, except the first time, where the selected node comes into view.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.focus({ preventScroll: true });
    const selectedNodeId = useMindMapStore.getState().selectedNodeId;
    const target = firstRenderRef.current && selectedNodeId && selectedNodeId !== doc?.rootId
      ? [...container.querySelectorAll<HTMLElement>("[data-node-id]")].find((section) => section.dataset.nodeId === selectedNodeId)
      : null;
    firstRenderRef.current = false;
    if (target) container.scrollTop = Math.max(0, target.offsetTop - 80);
    else container.scrollTop = 0;
    // Only a different document resets the scroll position, never an edit from a collaborator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey]);

  if (!doc) return null;
  const preamble = !focusNodeId && doc.preamble?.trim() ? doc.preamble : "";
  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label={t.readingView}
      className="h-full overflow-y-auto overflow-x-hidden bg-[var(--color-surface)] px-4 pb-24 pt-16 text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-bloom)] sm:px-8"
      data-testid="reading-view"
    >
      <article className="mx-auto w-full min-w-0 max-w-[70ch] text-base leading-8 sm:text-lg sm:leading-8" data-testid="reading-article">
        {preamble && <MarkdownReader markdown={preamble} />}
        {nodes.length === 0 && <p className="mt-10 text-[var(--color-ink-muted)]">{t.readingEmpty}</p>}
        {nodes.map((node) => {
          const level = Math.min(Math.max(node.level, 1), 6);
          const Heading = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          return (
            <section key={node.id} data-node-id={node.id} aria-labelledby={`reading-heading-${node.id}`}>
              <Heading id={`reading-heading-${node.id}`} className={`${HEADING_CLASS[level]} [overflow-wrap:anywhere]`}>{node.title}</Heading>
              {node.content.trim() && <MarkdownReader markdown={node.content} />}
            </section>
          );
        })}
      </article>
    </div>
  );
}
