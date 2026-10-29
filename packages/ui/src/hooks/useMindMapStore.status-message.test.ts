import { afterEach, describe, expect, test } from "bun:test";
import { buildWorkspaceMindMap, parseFile } from "@bloommd/core/browser";
import { useMindMapStore } from "./useMindMapStore";

const MESSAGE = "Workspace-Ansichten sind abgeleitet.";

function workspace() {
  return buildWorkspaceMindMap([{ path: "a.md", markdown: "# A\n" }], { source: "/temporary-vault" });
}

afterEach(() => {
  useMindMapStore.getState().setDocument(null);
});

describe("@t19 status message follows the document", () => {
  test("@t19 workspace → file drops the workspace hint", () => {
    const store = useMindMapStore.getState();
    store.setDocument(workspace());
    store.setStatusMessage(MESSAGE);
    expect(useMindMapStore.getState().statusMessage).toBe(MESSAGE);

    store.setDocument(parseFile("a.md", "# A\n"));
    expect(useMindMapStore.getState().statusMessage).toBeNull();
  });

  test("@t19 file → file drops the previous message", () => {
    const store = useMindMapStore.getState();
    store.setDocument(parseFile("a.md", "# A\n"));
    store.setStatusMessage("Dateikonflikt");
    store.setDocument(parseFile("b.md", "# B\n"));
    expect(useMindMapStore.getState().statusMessage).toBeNull();
  });

  test("@t19 file → workspace and reset to null drop the previous message", () => {
    const store = useMindMapStore.getState();
    store.setDocument(parseFile("a.md", "# A\n"));
    store.setStatusMessage("Dateikonflikt");
    store.setDocument(workspace());
    expect(useMindMapStore.getState().statusMessage).toBeNull();

    store.setStatusMessage(MESSAGE);
    store.setDocument(null);
    expect(useMindMapStore.getState().statusMessage).toBeNull();
  });

  test("@t19 a message set after loading the document is kept", () => {
    const store = useMindMapStore.getState();
    store.setDocument(parseFile("a.md", "# A\n"));
    store.setStatusMessage("Der Zugriff auf diesen Workspace wurde entzogen.");
    expect(useMindMapStore.getState().statusMessage).toBe("Der Zugriff auf diesen Workspace wurde entzogen.");
  });

  test("@t19 a stale access-revoked message does not survive loading the next document", () => {
    const store = useMindMapStore.getState();
    store.setDocument(parseFile("a.md", "# A\n"));
    useMindMapStore.setState({ statusMessage: "Der Zugriff auf diesen Workspace wurde entzogen.", readOnly: true });
    store.setDocument(parseFile("b.md", "# B\n"));
    expect(useMindMapStore.getState().statusMessage).toBeNull();
    expect(useMindMapStore.getState().readOnly).toBe(false);
  });
});
