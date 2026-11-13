import { describe, expect, test } from "bun:test";
import { isUnintendedClear, pendingEditorContent } from "./node-content-guard";

describe("isUnintendedClear", () => {
  test("@t394 an empty report without a user edit does not empty stored content", () => {
    expect(isUnintendedClear({ next: "", stored: "Hallo", fromInitialImport: false, userEdited: false })).toBe(true);
    expect(isUnintendedClear({ next: "  \n", stored: "Hallo", fromInitialImport: false, userEdited: false })).toBe(true);
  });

  test("@t394 an empty report from the editor's own initial import never empties content", () => {
    expect(isUnintendedClear({ next: "", stored: "Hallo", fromInitialImport: true, userEdited: true })).toBe(true);
  });

  test("@t394 the user may clear a node on purpose", () => {
    expect(isUnintendedClear({ next: "", stored: "Hallo", fromInitialImport: false, userEdited: true })).toBe(false);
  });

  test("@t394 non-empty reports and already empty nodes are always written", () => {
    expect(isUnintendedClear({ next: "Neu", stored: "Hallo", fromInitialImport: false, userEdited: false })).toBe(false);
    expect(isUnintendedClear({ next: "", stored: "", fromInitialImport: false, userEdited: false })).toBe(false);
  });
});

describe("pendingEditorContent", () => {
  test("@t394 returns typed text that the store does not have yet", () => {
    expect(pendingEditorContent({ editorMarkdown: "Hallo Welt", stored: "", userEdited: true })).toBe("Hallo Welt");
    expect(pendingEditorContent({ editorMarkdown: "Hallo Welt", stored: "Hallo", userEdited: true })).toBe("Hallo Welt");
  });

  test("@t394 restores wiki links like onChange does", () => {
    expect(pendingEditorContent({ editorMarkdown: "Siehe \\[\\[Arbeit]]", stored: "", userEdited: true })).toBe("Siehe [[Arbeit]]");
  });

  test("@t394 writes nothing without a user edit, for empty editor text or when the store is current", () => {
    expect(pendingEditorContent({ editorMarkdown: "Alt", stored: "", userEdited: false })).toBeNull();
    expect(pendingEditorContent({ editorMarkdown: "", stored: "Hallo", userEdited: true })).toBeNull();
    expect(pendingEditorContent({ editorMarkdown: "Hallo\n", stored: "Hallo", userEdited: true })).toBeNull();
    expect(pendingEditorContent({ editorMarkdown: undefined, stored: "", userEdited: true })).toBeNull();
  });
});
