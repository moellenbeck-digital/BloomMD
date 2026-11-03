import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import { ReadingBackBar, ReadingView } from "./ReadingView";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { translations } from "../i18n/translations";
import { installDom, waitFor } from "./test-dom";

const MARKDOWN = `# Title

Intro with a [link](https://example.com/a) and **bold**.

## Section

- one
  - nested
- two

| Name | Value |
| ---- | ----- |
| a    | 1     |

### Subsection

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

![Chart](https://example.com/chart.png)

## Second

Last text
`;

let root: Root | null = null;
let container: HTMLElement;

function ReadingHarness() {
  const mode = useMindMapStore((state) => state.canvasMode);
  return (
    <div id="mindmap-canvas" className="relative">
      {mode === "reading" ? <><ReadingBackBar /><ReadingView /></> : <div data-testid="other-mode">{mode}</div>}
    </div>
  );
}

function open(path: string, markdown: string) {
  useMindMapStore.getState().setDocument(parseFile(path, markdown));
}

function nodeId(title: string): string {
  return [...useMindMapStore.getState().document!.nodes.values()].find((node) => node.title === title)!.id;
}

beforeEach(() => {
  installDom();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMindMapStore.setState({ canvasMode: "map", readingReturn: null, mapViewport: null, restoreViewport: null });
  open("a.md", MARKDOWN);
});

afterEach(() => {
  flushSync(() => root?.unmount());
  root = null;
  useMindMapStore.getState().setDocument(null);
  useMindMapStore.setState({ canvasMode: "map", readingReturn: null });
});

function mountReading() {
  useMindMapStore.getState().enterReadingMode();
  flushSync(() => root!.render(<ReadingHarness />));
}

describe("@t54 ReadingView", () => {
  test("@t54 shows the whole document: headings by level, each followed by its Markdown", () => {
    mountReading();
    const headings = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => `${h.tagName}:${h.textContent}`);
    expect(headings).toEqual(["H1:Title", "H2:Section", "H3:Subsection", "H2:Second"]);
    const sections = [...container.querySelectorAll("section")];
    expect(sections.map((section) => section.querySelector("h1,h2,h3")!.textContent)).toEqual(["Title", "Section", "Subsection", "Second"]);
    expect(sections[0]!.querySelector("a")?.getAttribute("rel")).toContain("noreferrer");
    expect(sections[1]!.querySelectorAll("li").length).toBe(3);
    expect(sections[1]!.querySelector("[data-testid=reading-table]")).not.toBeNull();
    expect(sections[2]!.querySelector("[data-testid=reading-code-language]")?.textContent).toBe("mermaid");
    expect(sections[2]!.querySelector("img")?.getAttribute("alt")).toBe("Chart");
    expect(sections[3]!.textContent).toContain("Last text");
  });

  test("@t54 a focused branch shows only that subtree, like outline and presentation", () => {
    useMindMapStore.getState().setFocusNodeId(nodeId("Section"));
    mountReading();
    const headings = [...container.querySelectorAll("h1, h2, h3")].map((h) => h.textContent);
    expect(headings).toEqual(["Section", "Subsection"]);
  });

  test("@t54 the text column is capped for readability and the view scrolls on its own", () => {
    mountReading();
    expect(container.querySelector("[data-testid=reading-article]")!.className).toContain("max-w-[70ch]");
    const view = container.querySelector<HTMLElement>("[data-testid=reading-view]")!;
    expect(view.className).toContain("overflow-y-auto");
    expect(view.className).toContain("overflow-x-hidden");
    expect(view.getAttribute("tabindex")).toBe("0");
    expect(view.getAttribute("aria-label")).toBe(translations.de.readingView);
  });

  test("@t54 the scroll area has the focus so arrows and Page Up/Down scroll the text", async () => {
    mountReading();
    const view = container.querySelector<HTMLElement>("[data-testid=reading-view]")!;
    await waitFor(() => document.activeElement === view, "reading view focus");
  });

  test("@t54 there is no editor, no node action and nothing editable in the view", () => {
    mountReading();
    const view = container.querySelector("[data-testid=reading-view]")!;
    expect(view.querySelector("[contenteditable], textarea, .mdxeditor, input:not([disabled]), button, [data-testid^=node-]")).toBeNull();
    // The back control is the only button on the whole surface.
    expect([...container.querySelectorAll("button")].map((button) => button.getAttribute("data-testid"))).toEqual(["reading-back"]);
  });

  test("@t54 back to map is always there, at least 44 px high, and restores the previous mode", () => {
    useMindMapStore.getState().setCanvasMode("outline");
    useMindMapStore.getState().setSelectedNodeId(nodeId("Second"));
    mountReading();
    const back = container.querySelector<HTMLButtonElement>("[data-testid=reading-back]")!;
    expect(back.textContent).toBe(translations.de.backToMap);
    expect(back.className).toContain("min-h-11");

    flushSync(() => back.click());
    expect(useMindMapStore.getState().canvasMode).toBe("outline");
    expect(useMindMapStore.getState().selectedNodeId).toBe(nodeId("Second"));
    expect(container.querySelector("[data-testid=reading-view]")).toBeNull();
  });

  test("@t54 switching the document while reading stays in the reading mode and shows the new text", () => {
    mountReading();
    flushSync(() => open("b.md", "# Other doc\n\nOther text\n"));
    expect(useMindMapStore.getState().canvasMode).toBe("reading");
    expect(container.querySelector("h1")?.textContent).toBe("Other doc");
    expect(container.textContent).toContain("Other text");
    expect(container.textContent).not.toContain("Last text");
  });

  test("@t54 a document with only a title shows just that heading", () => {
    flushSync(() => open("c.md", "# Only title\n"));
    mountReading();
    expect(container.querySelectorAll("section").length).toBe(1);
    expect(container.querySelector("h1")?.textContent).toBe("Only title");
  });

  test("@t54 the text before the first heading is part of the document", () => {
    flushSync(() => open("p.md", "Preface text\n\n# Title\n\nBody\n"));
    mountReading();
    expect(container.querySelector("article")!.textContent!.startsWith("Preface text")).toBe(true);
  });

  test("@t54 enter and exit send no request and leave the Markdown identical", () => {
    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${String(input)}`);
      return Promise.reject(new Error("no network in this test"));
    }) as typeof fetch;
    try {
      const doc = useMindMapStore.getState().document!;
      const strip = (markdown: string) => markdown.replace(/^updated: .*\n/m, "");
      const before = strip(serializeToMarkdown(doc));
      const { editRevision, savedRevision } = useMindMapStore.getState();

      mountReading();
      flushSync(() => container.querySelector<HTMLButtonElement>("[data-testid=reading-back]")!.click());
      mountReading();
      flushSync(() => useMindMapStore.getState().exitReadingMode());

      const after = useMindMapStore.getState();
      expect(strip(serializeToMarkdown(after.document!))).toBe(before);
      expect(after.editRevision).toBe(editRevision);
      expect(after.savedRevision).toBe(savedRevision);
      expect(requests).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
