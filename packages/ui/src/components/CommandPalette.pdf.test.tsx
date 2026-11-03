import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { extractPdfCitations, parseFile } from "@bloommd/core/browser";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

// React DOM decides at import time whether the browser supports `input` events, so the DOM has to
// exist before react-dom is loaded; hence the dynamic imports below.
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.HTMLInputElement = win.HTMLInputElement as unknown as typeof HTMLInputElement;
globalThis.HTMLTextAreaElement = win.HTMLTextAreaElement as unknown as typeof HTMLTextAreaElement;
globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
globalThis.localStorage = win.localStorage as unknown as Storage;
globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { useMindMapStore } = await import("../hooks/useMindMapStore");
const { CommandPalette } = await import("./CommandPalette");

const MAP = [
  "---",
  "title: Review 2024",
  "id: rev1",
  'created: "2026-01-01T00:00:00Z"',
  'updated: "2026-01-01T00:00:00Z"',
  "citekey: review2024",
  "---",
  "# Review 2024",
  "",
  "## Sources",
  "",
  "[[smith2020]]",
  "",
].join("\n");

describe("command palette: PDF citation and bibliography", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let closed = 0;
  const originalFetch = globalThis.fetch;
  const downloads: Array<{ name: string; blob: Blob }> = [];

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    closed = 0;
    downloads.length = 0;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        files: [
          { filename: "review.md", frontmatter: { title: "Review 2024", id: "rev1", created: "", updated: "", citekey: "review2024" } },
          { filename: "smith2020.md", frontmatter: { title: "Deep Learning", id: "s", created: "", updated: "", citekey: "smith2020", author: "Smith, A.", year: 2020 } },
        ],
      }),
    })) as unknown as typeof fetch;
    (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = (blob) => {
      downloads.push({ name: "", blob });
      return "blob:test/1";
    };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      const last = downloads[downloads.length - 1];
      if (last) last.name = this.download;
    };
    useMindMapStore.getState().setDocument(parseFile("review.md", MAP));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    globalThis.fetch = originalFetch;
    useMindMapStore.getState().setDocument(null);
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function open() {
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="de">
          <CommandPalette
            open
            onClose={() => { closed += 1; }}
            onNew={() => undefined}
            onSave={() => undefined}
            onImport={() => undefined}
            onExport={() => undefined}
            onReload={() => undefined}
          />
        </LocaleProvider>,
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }

  const query = <T extends HTMLElement>(testId: string) => container.querySelector<T>(`[data-testid='${testId}']`);
  const action = (id: string) => container.querySelector<HTMLButtonElement>(`[data-command-id='${id}']`);

  async function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      for (const type of ["input", "keyup"]) element.dispatchEvent(new window.Event(type, { bubbles: true }) as unknown as Event);
    });
  }

  async function click(element: HTMLElement) {
    await act(async () => { element.click(); });
  }

  async function submitForm() {
    await act(async () => {
      query("pdf-citation-form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event);
    });
  }

  test("“PDF-Zitat einfügen” creates a source node with link and blockquote under the selected node (the root here)", async () => {
    await open();
    expect(action("action-pdf-citation")?.textContent).toContain("PDF-Zitat einfügen");
    await click(action("action-pdf-citation")!);
    expect(query("pdf-citation-form")).not.toBeNull();
    expect(closed).toBe(0);

    await setValue(query<HTMLInputElement>("pdf-citation-file")!, "papers/smith.pdf");
    await setValue(query<HTMLInputElement>("pdf-citation-page")!, "12");
    await setValue(query<HTMLTextAreaElement>("pdf-citation-quote")!, "Erster Satz.\n\nZweiter *Absatz*.");
    await submitForm();

    const state = useMindMapStore.getState();
    const created = [...state.document!.nodes.values()].find((node) => node.title === "smith.pdf · 12");
    expect(created).toBeDefined();
    expect(created!.content).toBe("[[papers/smith.pdf#page=12]]\n\n> Erster Satz.\n>\n> Zweiter *Absatz*.");
    expect(extractPdfCitations(created!.content)[0]).toMatchObject({ link: { file: "papers/smith.pdf", page: 12 }, quote: "Erster Satz.\n\nZweiter *Absatz*." });
    expect(created!.parentId).toBe(state.document!.rootId);
    expect(state.selectedNodeId).toBe(created!.id);
    expect(closed).toBe(1);
  });

  test("an invalid page keeps the form open, says why and adds nothing", async () => {
    await open();
    const before = useMindMapStore.getState().document!.nodes.size;
    await click(action("action-pdf-citation")!);
    await setValue(query<HTMLInputElement>("pdf-citation-file")!, "a.pdf");
    await setValue(query<HTMLInputElement>("pdf-citation-page")!, "0");
    await submitForm();
    expect(query("pdf-citation-error")?.textContent).toContain("ganze Zahl ab 1");
    expect(useMindMapStore.getState().document!.nodes.size).toBe(before);
    expect(closed).toBe(0);
  });

  test("a file that is not a PDF is refused", async () => {
    await open();
    await click(action("action-pdf-citation")!);
    await setValue(query<HTMLInputElement>("pdf-citation-file")!, "notes.txt");
    await submitForm();
    expect(query("pdf-citation-error")?.textContent).toContain(".pdf");
  });

  test("the bibliography export downloads BibTeX with the map's and the linked map's keys", async () => {
    await open();
    await click(action("action-bibliography-bibtex")!);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toBe("Review-2024-literatur.bib");
    const text = await downloads[0]!.blob.text();
    expect(text).toContain("@misc{review2024");
    expect(text).toContain("@misc{smith2020,\n  author = {Smith, A.},\n  year = {2020},\n  title = {Deep Learning}\n}");
    expect(closed).toBe(1);
  });

  test("the Markdown export lists the keys sorted", async () => {
    await open();
    await click(action("action-bibliography-markdown")!);
    expect(downloads[0]!.name).toBe("Review-2024-literatur.md");
    expect(await downloads[0]!.blob.text()).toBe("- review2024: Review 2024\n- smith2020: Smith, A. (2020). Deep Learning\n");
  });

  test("without any citekey nothing is downloaded and the palette says so", async () => {
    useMindMapStore.getState().setDocument(parseFile("plain.md", "# Plain\n"));
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ files: [] }) })) as unknown as typeof fetch;
    await open();
    await click(action("action-bibliography-bibtex")!);
    expect(downloads).toHaveLength(0);
    expect(query("command-palette-notice")?.textContent).toContain("Keine Zitierschlüssel");
    expect(closed).toBe(0);
  });
});
