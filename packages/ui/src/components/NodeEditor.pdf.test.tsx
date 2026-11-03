import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { parseFile } from "@bloommd/core/browser";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

const DOM_GLOBALS = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "KeyboardEvent", "localStorage", "Event", "CustomEvent", "requestAnimationFrame"];
const globalsBefore = Object.fromEntries(DOM_GLOBALS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]));
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.localStorage = win.localStorage as unknown as Storage;
globalThis.Event = win.Event as unknown as typeof Event;
globalThis.CustomEvent = win.CustomEvent as unknown as typeof CustomEvent;

// The rich-text editor is not what is tested here, and its bundle does not load outside a browser.
mock.module("@mdxeditor/editor", () => {
  const plugin = () => ({});
  const nothing = () => null;
  return {
    MDXEditor: nothing,
    headingsPlugin: plugin,
    listsPlugin: plugin,
    quotePlugin: plugin,
    thematicBreakPlugin: plugin,
    markdownShortcutPlugin: plugin,
    tablePlugin: plugin,
    codeBlockPlugin: plugin,
    codeMirrorPlugin: plugin,
    imagePlugin: plugin,
    linkPlugin: plugin,
    linkDialogPlugin: plugin,
    toolbarPlugin: plugin,
    BoldItalicUnderlineToggles: nothing,
    ListsToggle: nothing,
    BlockTypeSelect: nothing,
    CreateLink: nothing,
    InsertTable: nothing,
    InsertCodeBlock: nothing,
    InsertImage: nothing,
  };
});

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { useMindMapStore } = await import("../hooks/useMindMapStore");
const { NodeEditor } = await import("./NodeEditor");

const MAP = [
  "# Review",
  "",
  "## Quelle",
  "",
  "[[papers/smith.pdf#page=12]]",
  "",
  "> Erster Satz.",
  "> Zweiter Satz.",
  "",
  "Ein [[Review#Quelle]] Verweis.",
  "",
].join("\n");

describe("node panel: PDF source link", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const doc = parseFile("review.md", MAP);
    useMindMapStore.getState().setDocument(doc);
    const source = [...doc.nodes.values()].find((node) => node.title === "Quelle")!;
    useMindMapStore.getState().setSelectedNodeId(source.id);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    useMindMapStore.getState().setDocument(null);
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function open() {
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="de">
          <NodeEditor />
        </LocaleProvider>,
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  const query = <T extends HTMLElement>(testId: string) => container.querySelector<T>(`[data-testid='${testId}']`);

  test("shows the link with its page and the quote, and keeps it out of the map links", async () => {
    await open();
    const link = query<HTMLButtonElement>("pdf-link-open")!;
    expect(link.dataset.pdfFile).toBe("papers/smith.pdf");
    expect(link.dataset.pdfPage).toBe("12");
    expect(query("pdf-link-page")?.textContent).toContain("Seite 12");
    expect(query("pdf-quote")?.textContent).toContain("Erster Satz.\nZweiter Satz.");
    expect(container.querySelectorAll("[data-testid='map-link-resource'], [data-testid='broken-map-link']")).toHaveLength(1);
  });

  test("a click asks the shell to open the file at that page", async () => {
    await open();
    const events: Array<Record<string, unknown>> = [];
    window.addEventListener("bloommd:open-resource", (event) => events.push((event as CustomEvent).detail));
    await act(async () => { query<HTMLButtonElement>("pdf-link-open")!.click(); });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "pdf", file: "papers/smith.pdf", page: 12 });
  });

  test("when the shell cannot open the file, the panel says so instead of staying silent", async () => {
    await open();
    window.addEventListener("bloommd:open-resource", (event) => {
      (event as CustomEvent<{ respond?: (result: { error: string }) => void }>).detail.respond?.({ error: "Das PDF „papers/smith.pdf“ konnte nicht geöffnet werden." });
    });
    await act(async () => { query<HTMLButtonElement>("pdf-link-open")!.click(); });
    expect(query("pdf-link-error")?.textContent).toContain("konnte nicht geöffnet werden");
  });
});

// The DOM globals above are this file's own; put the originals back so later test files in the same
// process do not see a happy-dom `Event` or `window` they did not ask for.
afterAll(() => {
  for (const key of DOM_GLOBALS) {
    if (globalsBefore[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = globalsBefore[key];
  }
});
