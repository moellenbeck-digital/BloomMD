import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { parseFile } from "@bloommd/core/browser";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

const DOM_GLOBALS = ["window", "document", "navigator", "HTMLElement", "KeyboardEvent", "localStorage", "Event", "CustomEvent", "requestAnimationFrame", "MutationObserver"];
const globalsBefore = Object.fromEntries(DOM_GLOBALS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]));
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
globalThis.localStorage = win.localStorage as unknown as Storage;
globalThis.Event = win.Event as unknown as typeof Event;
globalThis.CustomEvent = win.CustomEvent as unknown as typeof CustomEvent;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { useMindMapStore } = await import("../hooks/useMindMapStore");
const { MermaidBlockView } = await import("./MermaidBlockView");
const { VisualViewer } = await import("./VisualViewer");
const { NodeImageGallery } = await import("./NodeImageGallery");
const { VisualsContext } = await import("./visuals-context");
const { setMermaidLoader } = await import("./mermaid-render");
const { PREVIEW_RESOURCE_EVENT } = await import("./image-preview");
const { DELIVER_EXPORT_EVENT } = await import("./visual-export");
type ViewerRequest = import("./visuals-context").ViewerRequest;
type ResourcePreviewDetail = import("./image-preview").ResourcePreviewDetail;
type DeliverExportDetail = import("./visual-export").DeliverExportDetail;

const VALID = "graph TD\n  A[Start] --> B[Ende]";
const BROKEN = "graph TD\n  A-->B\n  B-->";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="5" y="20">Start</text></svg>';

/** A stand-in for the Mermaid library: valid sources render, anything containing `B-->` and nothing after is a syntax error. */
function installFakeMermaid(renders: string[] = []) {
  setMermaidLoader(async () => ({
    initialize: () => undefined,
    render: async (_id: string, text: string) => {
      renders.push(text);
      if (/-->\s*$/.test(text.trim())) throw new Error("Parse error on line 4:\n...A-->B B-->\n---------^\nExpecting 'NODE_STRING', got 'EOF'");
      return { svg: SVG };
    },
  }));
}

let root: Root | null = null;
let container: HTMLDivElement;
const cleanups: Array<() => void> = [];

/** Listens on the window for the length of one test only. */
function on(type: string, listener: (event: Event) => void) {
  win.addEventListener(type, listener as EventListener);
  cleanups.push(() => win.removeEventListener(type, listener as EventListener));
}

function installDom() {
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.navigator = win.navigator as unknown as Navigator;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
  globalThis.localStorage = win.localStorage as unknown as Storage;
  globalThis.Event = win.Event as unknown as typeof Event;
  globalThis.CustomEvent = win.CustomEvent as unknown as typeof CustomEvent;
}

beforeEach(() => {
  // Other test files in the same run put their own DOM back or away; this file's tests need theirs.
  installDom();
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  setMermaidLoader(null);
  useMindMapStore.getState().setDocument(null);
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
});

const settle = async (ms = 400) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const query = <T extends HTMLElement>(testId: string, scope: ParentNode = document) => scope.querySelector<T>(`[data-testid='${testId}']`);

async function render(node: React.ReactNode, context: Partial<import("./visuals-context").VisualsContextValue> = {}) {
  await act(async () => {
    root!.render(
      <LocaleProvider initialLocale="de">
        <VisualsContext.Provider value={{ notePath: "notes/reise.md", title: "Reise", readOnly: false, openViewer: () => undefined, ...context }}>{node}</VisualsContext.Provider>
      </LocaleProvider>,
    );
  });
}

describe("Mermaid block", () => {
  test("K1: a valid diagram is shown as a diagram, the source stays out of the way", async () => {
    installFakeMermaid();
    await render(<MermaidBlockView code={VALID} onCodeChange={() => undefined} />);
    await settle();
    const block = query("mermaid-block")!;
    expect(block.dataset.mermaidState).toBe("ready");
    const image = query<HTMLImageElement>("mermaid-diagram")!.querySelector("img")!;
    expect(image.src.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(image.src)).toContain("Start");
    expect(query("mermaid-error")).toBeNull();
    expect(query("mermaid-source")).toBeNull();
  });

  test("K2: a broken diagram shows a readable error with its line; the source stays visible and editable; nothing crashes", async () => {
    installFakeMermaid();
    const changes: string[] = [];
    await render(<MermaidBlockView code={BROKEN} onCodeChange={(code) => changes.push(code)} />);
    await settle();
    expect(query("mermaid-block")!.dataset.mermaidState).toBe("error");
    const error = query("mermaid-error")!;
    expect(error.textContent).toContain("Das Diagramm konnte nicht dargestellt werden");
    expect(error.textContent).toContain("Zeile 3");
    expect(query("mermaid-error-message")!.textContent).toContain("Parse error on line 3");
    expect(query("mermaid-diagram")).toBeNull();
    const source = query<HTMLTextAreaElement>("mermaid-source")!;
    expect(source.value).toBe(BROKEN);
    expect(source.readOnly).toBe(false);
    expect(changes).toEqual([]);
  });

  test("the error card is bilingual", async () => {
    installFakeMermaid();
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale="en">
          <MermaidBlockView code={BROKEN} onCodeChange={() => undefined} />
        </LocaleProvider>,
      );
    });
    await settle();
    expect(query("mermaid-error")!.textContent).toContain("The diagram could not be rendered");
    expect(query("mermaid-error")!.textContent).toContain("Line 3");
  });

  test("an empty block says so and offers the source", async () => {
    installFakeMermaid();
    await render(<MermaidBlockView code="" onCodeChange={() => undefined} />);
    await settle();
    expect(query("mermaid-empty")).not.toBeNull();
    expect(query("mermaid-source")).not.toBeNull();
  });

  test("switches between preview and source; typing reports the new source, switching does not", async () => {
    installFakeMermaid();
    const changes: string[] = [];
    await render(<MermaidBlockView code={VALID} onCodeChange={(code) => changes.push(code)} />);
    await settle();
    await act(async () => { query<HTMLButtonElement>("mermaid-edit")!.click(); });
    expect(query("mermaid-block")!.dataset.mermaidMode).toBe("edit");
    expect(query<HTMLTextAreaElement>("mermaid-source")!.value).toBe(VALID);
    await act(async () => { query<HTMLButtonElement>("mermaid-preview")!.click(); });
    expect(query("mermaid-source")).toBeNull();
    expect(changes).toEqual([]);

    await act(async () => { query<HTMLButtonElement>("mermaid-edit")!.click(); });
    const source = query<HTMLTextAreaElement>("mermaid-source")!;
    await act(async () => {
      // React DOM decides at import time whether `input` events exist. When another test file loaded it
      // before any DOM did, it ignores them but still notices a changed value on `keyup`, so both are sent.
      // The value is written through the prototype setter, which is what a keystroke does and what React's
      // own value tracking cannot see.
      // Without `input` events React only watches the field that has just been focused.
      source.focus();
      source.dispatchEvent(new win.Event("focusin", { bubbles: true }) as unknown as Event);
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(source), "value")!.set!;
      setter.call(source, `${VALID}\n  B --> C`);
      for (const type of ["input", "keyup"]) source.dispatchEvent(new win.Event(type, { bubbles: true }) as unknown as Event);
    });
    expect(changes).toEqual([`${VALID}\n  B --> C`]);
  });

  test("a read-only note can show the source but not change it", async () => {
    installFakeMermaid();
    await render(<MermaidBlockView code={BROKEN} onCodeChange={() => undefined} />, { readOnly: true });
    await settle();
    expect(query<HTMLTextAreaElement>("mermaid-source")!.readOnly).toBe(true);
  });

  test("the diagram is only rendered when the source changes, not on unrelated re-renders", async () => {
    const renders: string[] = [];
    installFakeMermaid(renders);
    await render(<MermaidBlockView code={VALID} onCodeChange={() => undefined} />);
    await settle();
    await render(<MermaidBlockView code={VALID} onCodeChange={() => undefined} />);
    await settle();
    expect(renders).toEqual([VALID]);
  });
});

describe("enlarged view", () => {
  const renderViewer = async (props: Partial<React.ComponentProps<typeof VisualViewer>> = {}) => {
    const closed: string[] = [];
    await render(<VisualViewer kind="image" src="blob:img" alt="Strand" onClose={() => closed.push("closed")} {...props} />);
    return closed;
  };
  const press = async (key: string, target: Element = query("visual-viewer")!) => {
    await act(async () => { target.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }) as unknown as Event); });
  };
  const level = () => query("visual-viewer-content")!.dataset.scale;

  test("is a labelled modal dialog with labelled controls and takes the focus", async () => {
    await renderViewer();
    const dialog = query("visual-viewer")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Bildansicht");
    expect(document.activeElement).toBe(dialog);
    for (const id of ["visual-zoom-in", "visual-zoom-out", "visual-zoom-reset", "visual-close"]) {
      expect(query(id)!.getAttribute("aria-label"), id).toBeTruthy();
    }
    expect(query("visual-zoom-level")!.getAttribute("aria-label")).toBe("Zoomstufe");
  });

  test("zooms with the buttons and the keyboard, resets, and closes with Esc", async () => {
    const closed = await renderViewer();
    await act(async () => { query<HTMLButtonElement>("visual-zoom-in")!.click(); });
    expect(level()).toBe("1.25");
    expect(query("visual-zoom-level")!.textContent).toBe("125 %");
    await press("+");
    expect(level()).toBe("1.5625");
    await press("-");
    await press("-");
    expect(level()).toBe("1");
    await press("+");
    await press("ArrowLeft");
    expect(query("visual-viewer-content")!.style.transform).toContain("translate(60px, 0px)");
    await press("0");
    expect(level()).toBe("1");
    expect(query("visual-viewer-content")!.style.transform).toContain("translate(0px, 0px)");
    expect(closed).toEqual([]);
    await press("Escape");
    expect(closed).toEqual(["closed"]);
  });

  test("the mouse wheel zooms", async () => {
    await renderViewer();
    const stage = query("visual-viewer-stage")!;
    await act(async () => { stage.dispatchEvent(new win.WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }) as unknown as Event); });
    expect(Number(level())).toBeCloseTo(1.25);
  });

  test("keys typed in the viewer do not reach what is behind it", async () => {
    const reached: string[] = [];
    await render(<div onKeyDown={(event) => reached.push(event.key)}><VisualViewer kind="image" src="blob:img" alt="x" onClose={() => undefined} /></div>);
    await press("+");
    await press("Escape");
    expect(reached).toEqual([]);
  });

  test("Tab stays inside the dialog", async () => {
    await renderViewer({ actions: [{ id: "save", label: "Bild speichern", run: async () => undefined }] });
    const close = query<HTMLButtonElement>("visual-close")!;
    close.focus();
    await press("Tab", close);
    expect(document.activeElement).toBe(query("visual-zoom-out"));
  });

  test("closing returns the focus to what opened it", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    await renderViewer();
    expect(document.activeElement).toBe(query("visual-viewer"));
    await act(async () => { root!.render(<div />); });
    expect(document.activeElement).toBe(opener);
  });

  test("a click on the backdrop closes, a click in the dialog does not", async () => {
    const closed = await renderViewer();
    await act(async () => { query("visual-viewer")!.click(); });
    expect(closed).toEqual([]);
    await act(async () => { query("visual-viewer-backdrop")!.click(); });
    expect(closed).toEqual(["closed"]);
  });

  test("runs a save action and reports a failure instead of staying silent", async () => {
    const saved: string[] = [];
    let fail = false;
    await renderViewer({
      kind: "diagram",
      actions: [{ id: "diagram-svg", label: "Diagramm als SVG speichern", run: async () => { if (fail) throw new Error("disk full"); saved.push("svg"); } }],
    });
    expect(query("visual-viewer")!.getAttribute("aria-label")).toBe("Diagrammansicht");
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await act(async () => { query<HTMLButtonElement>("visual-action-diagram-svg")!.click(); });
      expect(saved).toEqual(["svg"]);
      expect(query("visual-viewer-error")).toBeNull();
      fail = true;
      await act(async () => { query<HTMLButtonElement>("visual-action-diagram-svg")!.click(); });
      expect(query("visual-viewer-error")!.textContent).toBe("Das Speichern ist fehlgeschlagen.");
    } finally {
      console.error = originalError;
    }
  });
});

describe("display only: preview and enlarged view never change the note", () => {
  test("opening, zooming, panning, saving and closing cause no onChange, no store update and no file change", async () => {
    installFakeMermaid();
    const markdown = ["# Reise", "", "## Ablauf", "", "```mermaid", VALID, "```", "", "![Strand](bilder/strand.png)", ""].join("\n");
    const doc = parseFile("notes/reise.md", markdown);
    const node = [...doc.nodes.values()].find((entry) => entry.title === "Ablauf")!;
    useMindMapStore.getState().setDocument(doc);
    useMindMapStore.getState().setSelectedNodeId(node.id);
    const contentBefore = useMindMapStore.getState().document!.nodes.get(node.id)!.content;
    const revisionBefore = useMindMapStore.getState().editRevision;

    const storeUpdates: unknown[] = [];
    const unsubscribe = useMindMapStore.subscribe((state) => storeUpdates.push(state.document?.nodes.get(node.id)?.content));
    const changes: string[] = [];
    const delivered: string[] = [];
    on(DELIVER_EXPORT_EVENT, (event) => {
      const detail = (event as CustomEvent<DeliverExportDetail>).detail;
      detail.handle(Promise.resolve().then(() => void delivered.push(detail.file.filename)));
    });
    // Like the web workspace: the answer carries the file itself, so saving never has to fetch a blob: URL.
    on(PREVIEW_RESOURCE_EVENT, (event) => (event as CustomEvent<ResourcePreviewDetail>).detail.respond({ url: "blob:strand", blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }) }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("blob: URLs must not be fetched"); }) as unknown as typeof fetch;
    cleanups.push(() => { globalThis.fetch = realFetch; });

    let request: ViewerRequest | null = null;
    function Harness() {
      const [viewer, setViewer] = React.useState<ViewerRequest | null>(null);
      request = viewer;
      return (
        <VisualsContext.Provider value={{ notePath: doc.filePath, title: node.title, readOnly: false, openViewer: setViewer }}>
          <MermaidBlockView code={VALID} onCodeChange={(code) => changes.push(code)} />
          <NodeImageGallery content={useMindMapStore.getState().document!.nodes.get(node.id)!.content} />
          {viewer && <VisualViewer kind={viewer.kind} src={viewer.src} alt={viewer.alt} actions={viewer.actions} onClose={() => setViewer(null)} />}
        </VisualsContext.Provider>
      );
    }
    await render(<Harness />);
    await settle();

    // Diagram: open, zoom, pan, save as SVG, close with Esc.
    await act(async () => { query<HTMLButtonElement>("mermaid-enlarge")!.click(); });
    expect(request).not.toBeNull();
    expect(query("visual-viewer")).not.toBeNull();
    await act(async () => { query<HTMLButtonElement>("visual-zoom-in")!.click(); });
    await act(async () => { query("visual-viewer")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }) as unknown as Event); });
    await act(async () => { query<HTMLButtonElement>("visual-action-diagram-svg")!.click(); });
    await act(async () => { query("visual-viewer")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event); });
    expect(query("visual-viewer")).toBeNull();

    // Image from the node: open, save the original, close.
    await act(async () => { query<HTMLButtonElement>("node-image-thumb")!.click(); });
    expect(query("visual-viewer")!.dataset.kind).toBe("image");
    await act(async () => { query<HTMLButtonElement>("visual-action-image-original")!.click(); });
    await act(async () => { query<HTMLButtonElement>("visual-close")!.click(); });
    expect(query("visual-viewer")).toBeNull();

    unsubscribe();
    expect(changes).toEqual([]);
    expect(storeUpdates).toEqual([]);
    expect(useMindMapStore.getState().document!.nodes.get(node.id)!.content).toBe(contentBefore);
    expect(useMindMapStore.getState().editRevision).toBe(revisionBefore);
    expect(useMindMapStore.getState().document!.rawMarkdown).toBe(markdown);
    // The saves went to the shell as files, not into the note.
    expect(delivered).toEqual(["Ablauf-diagram.svg", "strand.png"]);
  });
});

describe("images of a node", () => {
  /** Plays the shell: answers for the paths in `files`, errors for others. */
  function shell(files: string[], asked: string[] = []) {
    on(PREVIEW_RESOURCE_EVENT, (event) => {
      const detail = (event as CustomEvent<ResourcePreviewDetail>).detail;
      asked.push(detail.file);
      if (files.includes(detail.file)) detail.respond({ url: `blob:${detail.file}` });
      else detail.respond({ error: "nicht gefunden" });
    });
  }

  test("shows Markdown images and Obsidian embeds, resolved relative to the note, spaces and umlauts included", async () => {
    const asked: string[] = [];
    shell(["notes/Bilder/Strand am Meer.png", "notes/Übersicht.jpg"], asked);
    await render(<NodeImageGallery content={"![Strand](<Bilder/Strand am Meer.png>)\n\n![[Übersicht.jpg]]\n"} />);
    await settle(50);
    const thumbs = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='node-image-thumb']"));
    expect(thumbs.map((thumb) => thumb.dataset.imagePath)).toEqual(["notes/Bilder/Strand am Meer.png", "notes/Übersicht.jpg"]);
    expect(thumbs[0]!.getAttribute("aria-label")).toContain("Strand");
    expect(asked).toEqual(["notes/Bilder/Strand am Meer.png", "notes/Übersicht.jpg"]);
  });

  test("an image that cannot be found gets a hint with its path instead of a broken icon", async () => {
    shell([]);
    await render(<NodeImageGallery content={"![x](fehlt.png)"} />);
    await settle(50);
    const hint = query("node-image-problem")!;
    expect(hint.textContent).toContain("Bild nicht gefunden: notes/fehlt.png");
    expect(document.querySelector("img")).toBeNull();
  });

  test("a path outside the workspace is refused with a hint and never asked of the shell", async () => {
    const asked: string[] = [];
    shell(["geheim.png"], asked);
    await render(<NodeImageGallery content={"![x](../../geheim.png)"} />);
    await settle(50);
    expect(query("node-image-problem")!.textContent).toContain("Pfad nicht erlaubt: ../../geheim.png");
    expect(asked).toEqual([]);
  });

  test("renders nothing for a node without images", async () => {
    await render(<NodeImageGallery content={"Nur Text, `![x](a.png)` im Code.\n"} />);
    expect(query("node-image-gallery")).toBeNull();
  });
});

afterAll(() => {
  for (const key of DOM_GLOBALS) {
    if (globalsBefore[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = globalsBefore[key];
  }
});
