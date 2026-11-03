import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

const DOM_GLOBALS = ["window", "document", "navigator", "HTMLElement", "KeyboardEvent", "localStorage", "Event", "CustomEvent", "requestAnimationFrame", "MutationObserver"];
const globalsBefore = Object.fromEntries(DOM_GLOBALS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]));
const win = new Window({ url: "https://bloommd.test/app" });

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
installDom();

const React = await import("react");
const { act, useState } = React;
const { createRoot } = await import("react-dom/client");
const { useEditorImageZoom, useInlineImagePreview } = await import("./useInlineImages");
const { PREVIEW_RESOURCE_EVENT } = await import("./image-preview");
type ResourcePreviewDetail = import("./image-preview").ResourcePreviewDetail;

let root: Root | null = null;
let container: HTMLDivElement;
const cleanups: Array<() => void> = [];

function on(type: string, listener: (event: Event) => void) {
  win.addEventListener(type, listener as EventListener);
  cleanups.push(() => win.removeEventListener(type, listener as EventListener));
}

beforeEach(() => {
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
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
});

const key = (name: string, target: Element) =>
  act(async () => {
    target.dispatchEvent(new win.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }) as unknown as Event);
  });

describe("zooming the images of the editor", () => {
  function Harness({ show, onOpen }: { show: boolean; onOpen: (image: { src: string; alt: string }) => void }) {
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    useEditorImageZoom(element, onOpen, "Vergrößern");
    return show ? (
      <div ref={setElement} data-testid="panel">
        <p data-testid="text">Text</p>
        <div data-editor-block-type="image">
          <img src="blob:strand" alt="Strand" />
        </div>
      </div>
    ) : null;
  }

  test("works although the panel mounts after the hook first ran (no node selected yet)", async () => {
    const opened: Array<{ src: string; alt: string }> = [];
    await act(async () => { root!.render(<Harness show={false} onOpen={(image) => opened.push(image)} />); });
    await act(async () => { root!.render(<Harness show onOpen={(image) => opened.push(image)} />); });
    const image = container.querySelector("img")!;

    await act(async () => { image.dispatchEvent(new win.Event("dblclick", { bubbles: true, cancelable: true }) as unknown as Event); });
    expect(opened).toEqual([{ src: "blob:strand", alt: "Strand" }]);
  });

  test("makes the image a focusable, labelled button and opens it with Enter or Space, nothing else", async () => {
    const opened: string[] = [];
    await act(async () => { root!.render(<Harness show onOpen={(image) => opened.push(image.src)} />); });
    const image = container.querySelector("img")!;
    expect(image.tabIndex).toBe(0);
    expect(image.getAttribute("role")).toBe("button");
    expect(image.getAttribute("aria-label")).toBe("Vergrößern: Strand");

    await key("Enter", image);
    await key(" ", image);
    expect(opened).toEqual(["blob:strand", "blob:strand"]);
    await key("a", image);
    await key("Enter", container.querySelector("[data-testid='text']")!);
    expect(opened).toHaveLength(2);
  });

  test("a single click leaves the image to the editor", async () => {
    const opened: string[] = [];
    await act(async () => { root!.render(<Harness show onOpen={(image) => opened.push(image.src)} />); });
    await act(async () => { container.querySelector("img")!.click(); });
    expect(opened).toEqual([]);
  });
});

describe("previews for the images of the editor", () => {
  interface Api {
    handler: (src: string) => Promise<string>;
    sourceFor: (url: string) => { path: string; source: { url: string; blob?: Blob } } | null;
  }

  function Probe({ notePath, api }: { notePath: string; api: { current: Api | null } }) {
    api.current = useInlineImagePreview(notePath, { notFound: "Bild nicht gefunden:", rejected: "Pfad nicht erlaubt:" });
    return null;
  }

  function shell(files: string[], asked: string[]) {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => void revoked.push(url);
    cleanups.push(() => { URL.revokeObjectURL = original; });
    on(PREVIEW_RESOURCE_EVENT, (event) => {
      const detail = (event as CustomEvent<ResourcePreviewDetail>).detail;
      asked.push(detail.file);
      if (files.includes(detail.file)) detail.respond({ url: `blob:${detail.file}`, revokeOnCleanup: true, blob: new Blob(["x"], { type: "image/png" }) });
      else detail.respond({ error: "nicht gefunden" });
    });
    return revoked;
  }

  test("resolves relative to the note, remembers where the file came from and loads each path once", async () => {
    const asked: string[] = [];
    shell(["notes/Bilder/Strand am Meer.png"], asked);
    const api: { current: Api | null } = { current: null };
    await act(async () => { root!.render(<Probe notePath="notes/reise.md" api={api} />); });

    const url = await api.current!.handler("Bilder/Strand%20am%20Meer.png");
    expect(url).toBe("blob:notes/Bilder/Strand am Meer.png");
    await api.current!.handler("Bilder/Strand%20am%20Meer.png");
    expect(asked).toEqual(["notes/Bilder/Strand am Meer.png"]);
    const original = api.current!.sourceFor(url)!;
    expect(original.path).toBe("notes/Bilder/Strand am Meer.png");
    expect(original.source.blob?.size).toBe(1);
    expect(api.current!.sourceFor("blob:unknown")).toBeNull();
  });

  test("a missing or forbidden path becomes an image that names the path, and is looked up again next time", async () => {
    const asked: string[] = [];
    shell([], asked);
    const api: { current: Api | null } = { current: null };
    await act(async () => { root!.render(<Probe notePath="notes/reise.md" api={api} />); });

    const missing = decodeURIComponent((await api.current!.handler("fehlt.png")).split(",")[1]!);
    expect(missing).toContain("Bild nicht gefunden: notes/fehlt.png");
    await api.current!.handler("fehlt.png");
    expect(asked).toEqual(["notes/fehlt.png", "notes/fehlt.png"]);

    asked.length = 0;
    const forbidden = decodeURIComponent((await api.current!.handler("../../geheim.png")).split(",")[1]!);
    expect(forbidden).toContain("Pfad nicht erlaubt: ../../geheim.png");
    expect(asked).toEqual([]);
  });

  test("the object URLs are freed when another note opens or the editor closes", async () => {
    const asked: string[] = [];
    const revoked = shell(["a.png"], asked);
    const api: { current: Api | null } = { current: null };
    await act(async () => { root!.render(<Probe notePath="x.md" api={api} />); });
    await api.current!.handler("a.png");

    await act(async () => { root!.render(<Probe notePath="y.md" api={api} />); });
    expect(revoked).toEqual(["blob:a.png"]);

    await api.current!.handler("a.png");
    await act(async () => { root!.render(<div />); });
    expect(revoked).toEqual(["blob:a.png", "blob:a.png"]);
  });
});

afterAll(() => {
  for (const name of DOM_GLOBALS) {
    if (globalsBefore[name] === undefined) delete (globalThis as Record<string, unknown>)[name];
    else (globalThis as Record<string, unknown>)[name] = globalsBefore[name];
  }
});
