import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import type { CustomNoteTemplate } from "@bloommd/core/browser";
import type { Locale } from "../i18n/translations";
import type { CreateEntryKind } from "./CreateEntryDialog";

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

// React DOM decides at import time whether the browser supports `input` events, so the DOM has to
// exist before react-dom is loaded when this file runs alone; hence the dynamic imports below.
const win = new Window({ url: "https://bloommd.test/app" });
globalThis.window = win as unknown as Window & typeof globalThis.window;
globalThis.document = win.document as unknown as Document;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.HTMLInputElement = win.HTMLInputElement as unknown as typeof HTMLInputElement;
globalThis.HTMLSelectElement = win.HTMLSelectElement as unknown as typeof HTMLSelectElement;
globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../i18n/LocaleContext");
const { CreateEntryDialog } = await import("./CreateEntryDialog");

describe("CreateEntryDialog templates", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  const created: Array<{ path: string; content: string | undefined }> = [];

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    created.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function open(options: {
    locale?: Locale;
    kind?: CreateEntryKind;
    load?: () => Promise<CustomNoteTemplate[]>;
  } = {}) {
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale={options.locale ?? "de"}>
          <CreateEntryDialog
            kind={options.kind ?? "file"}
            folders={[]}
            loadCustomTemplates={options.load}
            onClose={() => undefined}
            onCreate={async (path, content) => {
              created.push({ path, content });
              return path;
            }}
          />
        </LocaleProvider>,
      );
    });
  }

  const query = <T extends HTMLElement>(testId: string) => container.querySelector<T>(`[data-testid='${testId}']`);

  // React DOM decides at import time whether `input` events exist. When another test file loaded it
  // before any DOM did, it ignores them but still notices a changed value on `keyup`, so both are sent.
  async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string, event: "input" | "change") {
    await act(async () => {
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      for (const type of event === "input" ? ["input", "keyup"] : ["change"]) {
        element.dispatchEvent(new window.Event(type, { bubbles: true }) as unknown as Event);
      }
    });
  }

  async function submit() {
    await act(async () => {
      query<HTMLButtonElement>("create-entry-submit")!.click();
    });
  }

  function optionLabels(select: HTMLSelectElement) {
    return Array.from(select.options).map((option) => option.textContent);
  }

  test("offers Blank first, then the built-in templates in the UI language", async () => {
    await open({ locale: "de" });
    const select = query<HTMLSelectElement>("create-entry-template")!;
    expect(select.value).toBe("");
    expect(optionLabels(select)).toEqual([
      "Leer",
      "Vorlesung",
      "Cornell",
      "Literaturnotiz",
      "Prüfungsvorbereitung",
      "Projekt",
    ]);
  });

  test("shows the English template names when the UI is English", async () => {
    await open({ locale: "en" });
    expect(optionLabels(query<HTMLSelectElement>("create-entry-template")!)).toEqual([
      "Blank",
      "Lecture",
      "Cornell",
      "Literature note",
      "Exam prep",
      "Project",
    ]);
  });

  test("the default stays blank: no content is passed on", async () => {
    await open();
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Notiz", "input");
    await submit();
    expect(created).toEqual([{ path: "Notiz.md", content: undefined }]);
  });

  test("a chosen template is filled in with the file name and today's date", async () => {
    await open({ locale: "en" });
    await setValue(query<HTMLSelectElement>("create-entry-template")!, "lecture", "change");
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Uni/Physics 1", "input");
    await submit();
    expect(created).toHaveLength(1);
    expect(created[0]!.path).toBe("Uni/Physics 1.md");
    const content = created[0]!.content!;
    expect(content.startsWith("# Physics 1\n")).toBe(true);
    expect(content).toContain("## Date");
    expect(content).toMatch(/## Date\n\n\d{4}-\d{2}-\d{2}\n/);
    expect(content).not.toContain("{{title}}");
    expect(content).not.toContain("{{date}}");
  });

  test("own templates are listed after the built-in ones and processed the same way", async () => {
    await open({
      load: async () => [{ path: "Vorlagen/Brief.md", content: "# {{title}}\n\n{{date}} {{name}}\n" }],
    });
    const select = query<HTMLSelectElement>("create-entry-template")!;
    expect(optionLabels(select)).toEqual([
      "Leer",
      "Vorlesung",
      "Cornell",
      "Literaturnotiz",
      "Prüfungsvorbereitung",
      "Projekt",
      "Brief",
    ]);
    await setValue(select, "custom:Vorlagen/Brief.md", "change");
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Hallo", "input");
    await submit();
    expect(created[0]!.content).toMatch(/^# Hallo\n\n\d{4}-\d{2}-\d{2} \{\{name\}\}\n$/);
  });

  test("an empty template folder leaves just the built-in templates, without an error", async () => {
    await open({ load: async () => [] });
    expect(query<HTMLSelectElement>("create-entry-template")!.options).toHaveLength(6);
    expect(query("create-entry-template-error")).toBeNull();
  });

  test("a failing loader is reported and the built-in templates still work", async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await open({ load: async () => { throw new Error("kaputt"); } });
    } finally {
      console.error = originalError;
    }
    expect(query("create-entry-template-error")?.textContent).toContain("kaputt");
    expect(query<HTMLSelectElement>("create-entry-template")!.options).toHaveLength(6);
  });

  test("folders have no template choice", async () => {
    await open({ kind: "folder" });
    expect(query("create-entry-template")).toBeNull();
  });
});
