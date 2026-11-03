"use client";

import { Fragment, useMemo, type MouseEvent, type ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Definition, Nodes, Root, RootContent, TableRow } from "mdast";
import { useLocale } from "../i18n/LocaleContext";
import type { Translations } from "../i18n/translations";
import { toSafeImageSrc, toSafeLink } from "../utils/safe-url";

// GitHub-flavoured Markdown, the same dialect the NodeEditor (MDXEditor) writes: tables, task lists,
// strikethrough and autolinks. The tree is rendered as React elements; raw HTML is shown as text.
const processor = unified().use(remarkParse).use(remarkGfm);

export function parseReadingMarkdown(markdown: string): Root {
  return processor.parse(markdown);
}

type Definitions = Map<string, Definition>;

function collectDefinitions(node: Nodes, into: Definitions): Definitions {
  if (node.type === "definition") into.set(node.identifier, node);
  if ("children" in node) for (const child of node.children as Nodes[]) collectDefinitions(child, into);
  return into;
}

function isHtmlComment(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("<!--") && trimmed.endsWith("-->");
}

function openExternally(event: MouseEvent<HTMLAnchorElement>, url: string) {
  // Desktop hosts open external links in the system browser; they cancel this event to take over.
  const request = new CustomEvent("bloommd:open-url", { cancelable: true, detail: { url, respond: () => {} } });
  window.dispatchEvent(request);
  if (request.defaultPrevented) event.preventDefault();
}

const LINK_CLASS = "text-[var(--color-bloom)] underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-bloom)]";
const CELL_ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

interface RenderContext {
  t: Translations;
  definitions: Definitions;
}

function renderChildren(nodes: ReadonlyArray<RootContent | Nodes>, ctx: RenderContext): ReactNode {
  return nodes.map((child, index) => <Fragment key={index}>{renderNode(child as Nodes, ctx)}</Fragment>);
}

function renderLink(url: string, title: string | null | undefined, children: ReactNode): ReactNode {
  const link = toSafeLink(url);
  // An unsafe or relative target stays readable text; it never becomes an anchor.
  if (!link) return <span>{children}</span>;
  if (!link.external) return <a href={link.href} title={title ?? undefined} className={LINK_CLASS}>{children}</a>;
  return (
    <a href={link.href} title={title ?? undefined} target="_blank" rel="noreferrer noopener" className={LINK_CLASS} onClick={(event) => openExternally(event, link.href)}>
      {children}
    </a>
  );
}

function renderImage(src: string, alt: string | null | undefined, title: string | null | undefined, t: Translations): ReactNode {
  const safeSrc = toSafeImageSrc(src);
  if (!safeSrc) return <span className="italic text-[var(--color-ink-muted)]">{alt || t.readingImageUnavailable}</span>;
  return <img src={safeSrc} alt={alt ?? ""} title={title ?? undefined} loading="lazy" referrerPolicy="no-referrer" className="my-4 block h-auto max-w-full rounded-md" />;
}

function renderRow(row: TableRow, header: boolean, align: Array<"left" | "right" | "center" | null | undefined>, ctx: RenderContext): ReactNode {
  return (
    <tr className="border-b border-[var(--color-border)] last:border-b-0">
      {row.children.map((cell, index) => {
        const className = `px-3 py-2 align-top ${CELL_ALIGN[align[index] ?? "left"]}`;
        return header
          ? <th key={index} scope="col" className={`${className} font-semibold`}>{renderChildren(cell.children, ctx)}</th>
          : <td key={index} className={className}>{renderChildren(cell.children, ctx)}</td>;
      })}
    </tr>
  );
}

function renderNode(node: Nodes, ctx: RenderContext): ReactNode {
  const { t, definitions } = ctx;
  switch (node.type) {
    case "root":
      return renderChildren(node.children, ctx);
    case "paragraph":
      return <p className="my-4">{renderChildren(node.children, ctx)}</p>;
    case "heading":
      // Headings inside node content are body text; the node titles are the document structure.
      return <p className="my-4 font-semibold">{renderChildren(node.children, ctx)}</p>;
    case "text":
      return node.value;
    case "emphasis":
      return <em>{renderChildren(node.children, ctx)}</em>;
    case "strong":
      return <strong className="font-semibold">{renderChildren(node.children, ctx)}</strong>;
    case "delete":
      return <del>{renderChildren(node.children, ctx)}</del>;
    case "inlineCode":
      return <code className="rounded bg-[var(--color-surface-sunken)] px-1 py-0.5 font-mono text-[0.9em]">{node.value}</code>;
    case "break":
      return <br />;
    case "link":
      return renderLink(node.url, node.title, renderChildren(node.children, ctx));
    case "linkReference": {
      const definition = definitions.get(node.identifier);
      const children = renderChildren(node.children, ctx);
      return definition ? renderLink(definition.url, definition.title, children) : <span>{children}</span>;
    }
    case "image":
      return renderImage(node.url, node.alt, node.title, t);
    case "imageReference": {
      const definition = definitions.get(node.identifier);
      return definition ? renderImage(definition.url, node.alt, definition.title, t) : <span>{node.alt}</span>;
    }
    case "blockquote":
      return <blockquote className="my-4 border-l-4 border-[var(--color-border-strong)] pl-4 text-[var(--color-ink-muted)]">{renderChildren(node.children, ctx)}</blockquote>;
    case "list": {
      const className = "my-4 space-y-1 pl-6";
      return node.ordered
        ? <ol start={node.start ?? undefined} className={`${className} list-decimal`}>{renderChildren(node.children, ctx)}</ol>
        : <ul className={`${className} list-disc`}>{renderChildren(node.children, ctx)}</ul>;
    }
    case "listItem": {
      const task = typeof node.checked === "boolean";
      return (
        <li className={task ? "list-none" : undefined}>
          {task && (
            <input
              type="checkbox"
              checked={node.checked === true}
              disabled
              readOnly
              aria-label={node.checked ? t.readingTaskDone : t.readingTaskOpen}
              className="-ml-6 mr-2 align-middle"
            />
          )}
          {/* A list item's paragraphs sit tight to the bullet; nested lists keep their own spacing. */}
          <div className={task ? "inline [&>p:first-child]:inline" : "[&>p:first-child]:mt-0 [&>p:last-child]:mb-0"}>{renderChildren(node.children, ctx)}</div>
        </li>
      );
    }
    case "code": {
      const language = (node.lang ?? "").trim();
      const label = language || t.codeBlockPlainText;
      return (
        <figure className="my-4 min-w-0 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)]" data-testid="reading-code-block" data-language={language}>
          <figcaption className="border-b border-[var(--color-border)] px-3 py-1 font-mono text-xs text-[var(--color-ink-muted)]" data-testid="reading-code-language">{label}</figcaption>
          <pre
            tabIndex={0}
            role="region"
            aria-label={label}
            className="overflow-x-auto p-3 font-mono text-sm leading-6 text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-bloom)]"
          ><code>{node.value}</code></pre>
        </figure>
      );
    }
    case "thematicBreak":
      return <hr className="my-6 border-[var(--color-border)]" />;
    case "table": {
      const [head, ...body] = node.children;
      const align = node.align ?? [];
      return (
        <div
          tabIndex={0}
          role="region"
          aria-label={t.readingTable}
          className="my-4 max-w-full overflow-x-auto rounded-md border border-[var(--color-border)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-bloom)]"
          data-testid="reading-table"
        >
          <table className="min-w-full border-collapse text-sm">
            {head && <thead className="bg-[var(--color-surface-sunken)]">{renderRow(head, true, align, ctx)}</thead>}
            <tbody>{body.map((row, index) => <Fragment key={index}>{renderRow(row, false, align, ctx)}</Fragment>)}</tbody>
          </table>
        </div>
      );
    }
    case "html":
      // Raw HTML is never injected: it is shown as plain text (comments stay hidden).
      return isHtmlComment(node.value) ? null : <span className="whitespace-pre-wrap">{node.value}</span>;
    case "footnoteReference":
      return <sup className="text-xs">[{node.label ?? node.identifier}]</sup>;
    case "footnoteDefinition":
      return <div className="my-2 text-sm text-[var(--color-ink-muted)]"><span className="mr-1 font-mono">[{node.label ?? node.identifier}]</span>{renderChildren(node.children, ctx)}</div>;
    case "definition":
      return null;
    default:
      return "children" in node ? renderChildren(node.children as Nodes[], ctx) : "value" in node ? String(node.value) : null;
  }
}

export interface MarkdownReaderProps {
  markdown: string;
}

/** Renders Markdown as read-only content. Nothing in the output is editable and no HTML string is injected. */
export function MarkdownReader({ markdown }: MarkdownReaderProps) {
  const { t } = useLocale();
  const tree = useMemo(() => parseReadingMarkdown(markdown), [markdown]);
  const definitions = useMemo(() => collectDefinitions(tree, new Map()), [tree]);
  return <div className="min-w-0 [overflow-wrap:anywhere]" data-testid="reading-markdown">{renderNode(tree, { t, definitions })}</div>;
}
