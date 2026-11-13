import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

const DOM_GLOBALS = ["window", "document", "navigator", "HTMLElement", "localStorage", "Event", "CustomEvent"];
const globalsBefore = Object.fromEntries(DOM_GLOBALS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]));
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.localStorage = win.localStorage as unknown as Storage;
globalThis.Event = win.Event as unknown as typeof Event;
globalThis.CustomEvent = win.CustomEvent as unknown as typeof CustomEvent;

const React = await import("react");
const { act, forwardRef, useImperativeHandle, useLayoutEffect, useRef } = React;
const { createRoot } = await import("react-dom/client");
const { useMindMapStore } = await import("./useMindMapStore");
const { useEditorContentGuard } = await import("./useEditorContentGuard");

/**
 * Stand-in for the rich-text editor. It keeps its own text like Lexical does and reports changes through
 * onChange only when the test says so, which lets the tests play out the cases of #394: an editor that
 * reports an empty state on mount or unmount, and one whose last change was not reported before it
 * was hidden.
 */
interface FakeEditorHandle {
  getMarkdown: () => string;
}
interface FakeBehaviour {
  reportEmptyOnMount: boolean;
  reportEmptyOnUnmount: boolean;
}
const behaviour: FakeBehaviour = { reportEmptyOnMount: false, reportEmptyOnUnmount: false };
let current: { type: (text: string, report: boolean) => void; clearByUser: () => void; text: () => string } | null = null;
let regionElement: HTMLElement | null = null;

const FakeEditor = forwardRef<FakeEditorHandle, { markdown: string; onChange: (markdown: string, initialMarkdownNormalize?: boolean) => void }>(
  function FakeEditor({ markdown, onChange }, ref) {
    const text = useRef(markdown);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    useImperativeHandle(ref, () => ({ getMarkdown: () => text.current }), []);
    useLayoutEffect(() => {
      const userInput = () => regionElement?.dispatchEvent(new win.Event("beforeinput", { bubbles: true }) as unknown as Event);
      current = {
        type: (value, report) => {
          userInput();
          text.current = value;
          if (report) onChangeRef.current(value, false);
        },
        clearByUser: () => {
          userInput();
          text.current = "";
          onChangeRef.current("", false);
        },
        text: () => text.current,
      };
      if (behaviour.reportEmptyOnMount) onChangeRef.current("", true);
      return () => {
        if (behaviour.reportEmptyOnUnmount) onChangeRef.current("", false);
        current = null;
      };
    }, []);
    return <div data-testid="fake-editor">{markdown}</div>;
  },
);

function Panel() {
  const nodeId = useMindMapStore((s) => s.selectedNodeId);
  const content = useMindMapStore((s) => (s.selectedNodeId ? s.document?.nodes.get(s.selectedNodeId)?.content : "") ?? "");
  const editorRef = useRef<FakeEditorHandle>(null);
  const { handleEditorChange, attachEditorRegion } = useEditorContentGuard(editorRef, nodeId);
  const region = (element: HTMLDivElement | null) => {
    regionElement = element;
    attachEditorRegion(element);
  };
  return (
    <div ref={region} data-testid="region">
      <FakeEditor ref={editorRef} markdown={content} onChange={handleEditorChange} />
    </div>
  );
}

// Mirrors the desktop shell: the node editor exists only while editorVisible is set.
function Shell() {
  const editorVisible = useMindMapStore((s) => s.editorVisible);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  return selectedNodeId && editorVisible ? <Panel /> : null;
}

const NEW_MAP = ["# Neue Mindmap <!-- bloommd:id=root -->", ""].join("\n");

describe("node editor content survives hiding and showing the editor (#394)", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  const store = () => useMindMapStore.getState();
  const rootId = () => store().document!.rootId;
  const stored = () => store().document!.nodes.get(rootId())!.content;
  const saved = () => serializeToMarkdown(store().document!);

  beforeEach(async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    behaviour.reportEmptyOnMount = false;
    behaviour.reportEmptyOnUnmount = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    store().setDocument(parseFile("neue-mindmap.md", NEW_MAP));
    store().setSelectedNodeId(rootId());
    root = createRoot(container);
    await act(async () => {
      root!.render(<Shell />);
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    store().setDocument(null);
    store().setEditorVisible(false);
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  afterAll(() => {
    for (const key of DOM_GLOBALS) (globalThis as Record<string, unknown>)[key] = globalsBefore[key];
  });

  const show = () => act(async () => store().setEditorVisible(true));
  // Cmd/Ctrl/Alt+Enter calls setEditorVisible(false) while the editor is open.
  const hide = () => act(async () => store().setEditorVisible(false));

  test("@t394 typed text is still there after hiding and showing the editor, in the store and in the saved file", async () => {
    await show();
    await act(async () => current!.type("Mein erster Gedanke", true));
    await hide();
    expect(current).toBeNull();
    expect(stored()).toBe("Mein erster Gedanke");

    await show();
    expect(current!.text()).toBe("Mein erster Gedanke");
    expect(saved()).toContain("Mein erster Gedanke");
  });

  test("@t394 saving and reloading the file brings the text back into the editor", async () => {
    await show();
    await act(async () => current!.type("Text für die Datei", true));
    await hide();

    const file = saved();
    expect(file).toContain("Text für die Datei");
    store().setDocument(parseFile("neue-mindmap.md", file));
    store().setSelectedNodeId(rootId());
    await show();
    expect(stored()).toBe("Text für die Datei");
    expect(current!.text()).toBe("Text für die Datei");
  });

  test("@t394 text the editor has not reported yet is written to the node when the editor is hidden", async () => {
    await show();
    // The user types and hits Cmd+Return at once: onChange has not delivered the text.
    await act(async () => current!.type("Schnell getippt", false));
    expect(stored()).toBe("");
    await hide();

    expect(stored()).toBe("Schnell getippt");
    expect(saved()).toContain("Schnell getippt");
    expect(store().canUndo()).toBe(true);
    await show();
    expect(current!.text()).toBe("Schnell getippt");
  });

  test("@t394 hiding the editor does not write an empty state over existing content", async () => {
    store().updateNodeContent(rootId(), "Bestand");
    behaviour.reportEmptyOnMount = true;
    behaviour.reportEmptyOnUnmount = true;

    await show();
    expect(stored()).toBe("Bestand");
    await hide();
    expect(stored()).toBe("Bestand");
    await show();
    await hide();

    expect(stored()).toBe("Bestand");
    expect(saved()).toContain("Bestand");
  });

  test("@t394 an empty report after typing is ignored once the editor is gone, a deliberate clear is kept", async () => {
    store().updateNodeContent(rootId(), "Bestand");
    await show();
    await act(async () => current!.clearByUser());
    expect(stored()).toBe("");
    await hide();
    expect(stored()).toBe("");
  });

  test("@t394 showing and hiding without typing writes nothing and leaves the undo history alone", async () => {
    store().updateNodeContent(rootId(), "Bestand");
    const undoBefore = store().canUndo();
    await show();
    await hide();
    await show();
    await hide();
    expect(stored()).toBe("Bestand");
    expect(store().canUndo()).toBe(undoBefore);
  });
});
