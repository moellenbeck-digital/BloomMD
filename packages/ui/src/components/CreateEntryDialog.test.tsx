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
    folders?: string[];
    defaultParent?: string;
    parentForFolders?: boolean;
    failWith?: string;
  } = {}) {
    await act(async () => {
      root!.render(
        <LocaleProvider initialLocale={options.locale ?? "de"}>
          <CreateEntryDialog
            kind={options.kind ?? "file"}
            folders={options.folders ?? []}
            defaultParent={options.defaultParent}
            parentForFolders={options.parentForFolders}
            loadCustomTemplates={options.load}
            onClose={() => undefined}
            onCreate={async (path, content) => {
              if (options.failWith) throw new Error(options.failWith);
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

  test("a new file goes to the preselected folder, which the user can change", async () => {
    await open({ folders: ["Uni", "Uni/Physik"], defaultParent: "Uni/Physik" });
    const parent = query<HTMLSelectElement>("create-entry-parent")!;
    expect(parent.value).toBe("Uni/Physik");
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Optik", "input");
    await submit();
    expect(created).toEqual([{ path: "Uni/Physik/Optik.md", content: undefined }]);
  });

  test("another folder can be chosen instead of the preselected one", async () => {
    await open({ folders: ["Uni", "Uni/Physik"], defaultParent: "Uni/Physik" });
    await setValue(query<HTMLSelectElement>("create-entry-parent")!, "Uni", "change");
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Optik", "input");
    await submit();
    expect(created[0]!.path).toBe("Uni/Optik.md");
  });

  test("nothing is preselected by default: a new file goes to the top", async () => {
    await open({ folders: ["Uni"] });
    expect(query<HTMLSelectElement>("create-entry-parent")!.value).toBe("");
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Notiz", "input");
    await submit();
    expect(created[0]!.path).toBe("Notiz.md");
  });

  test("a new folder has no destination choice unless asked for", async () => {
    await open({ kind: "folder", folders: ["Uni"], defaultParent: "Uni" });
    expect(query("create-entry-parent")).toBeNull();
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Optik", "input");
    await submit();
    expect(created[0]!.path).toBe("Optik");
  });

  test("with the destination choice a new folder is created inside the chosen folder", async () => {
    await open({ kind: "folder", folders: ["Uni", "Uni/Physik"], defaultParent: "Uni", parentForFolders: true });
    expect(query<HTMLSelectElement>("create-entry-parent")!.value).toBe("Uni");
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Optik", "input");
    expect(container.textContent).toContain("Uni/Optik");
    await submit();
    expect(created).toEqual([{ path: "Uni/Optik", content: undefined }]);
  });

  test("traversal, control characters and a backslash are named in the dialog and nothing is created", async () => {
    await open({ locale: "de", folders: ["Uni"], defaultParent: "Uni" });
    const name = query<HTMLInputElement>("create-entry-name")!;
    for (const value of ["../Draussen", "Notiz\u0007", "Uni\\Notiz", "/absolut"]) {
      await setValue(name, value, "input");
      expect(query("create-entry-problem")?.textContent ?? "").not.toBe("");
      expect(query<HTMLButtonElement>("create-entry-submit")!.disabled).toBe(true);
    }
    expect(created).toEqual([]);
  });

  test("an error of the store is shown in the dialog and the dialog stays open", async () => {
    await open({ failWith: "Es gibt schon eine Notiz mit diesem Namen." });
    await setValue(query<HTMLInputElement>("create-entry-name")!, "Notiz", "input");
    await submit();
    expect(query("create-entry-error")?.textContent).toBe("Es gibt schon eine Notiz mit diesem Namen.");
    expect(query("create-entry-dialog")).not.toBeNull();
  });
});
