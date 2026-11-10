import { afterEach, describe, expect, test } from "bun:test";
import { parseFile } from "@bloommd/core/browser";
import * as Y from "yjs";
import { SYNC_ORIGIN } from "../sync/types";
import { useMindMapStore } from "./useMindMapStore";

afterEach(() => {
  useMindMapStore.getState().setDocument(null);
});

function load(markdown = "# Root\n\n## Child\n") {
  useMindMapStore.getState().setDocument(parseFile("a.md", markdown));
  return useMindMapStore.getState();
}

describe("@t52 unsaved-state revision", () => {
  test("a freshly loaded document is not unsaved", () => {
    const state = load();
    expect(state.editRevision).toBe(0);
    expect(state.savedRevision).toBe(0);
  });

  test("a local edit advances the revision and markSaved clears it", () => {
    const state = load();
    state.renameNode(state.document!.rootId, "Renamed");
    const edited = useMindMapStore.getState();
    expect(edited.editRevision).toBeGreaterThan(edited.savedRevision);

    edited.markSaved(edited.editRevision);
    const saved = useMindMapStore.getState();
    expect(saved.savedRevision).toBe(saved.editRevision);
  });

  test("an edit made while a save is running stays unsaved", () => {
    const state = load();
    state.renameNode(state.document!.rootId, "First");
    const revisionAtSaveStart = useMindMapStore.getState().editRevision;
    useMindMapStore.getState().renameNode(state.document!.rootId, "Second");
    useMindMapStore.getState().markSaved(revisionAtSaveStart);
    const after = useMindMapStore.getState();
    expect(after.savedRevision).toBe(revisionAtSaveStart);
    expect(after.editRevision).toBeGreaterThan(after.savedRevision);
  });

  test("markSaved never moves backwards or past the edits", () => {
    const state = load();
    state.renameNode(state.document!.rootId, "Edited");
    const { editRevision } = useMindMapStore.getState();
    useMindMapStore.getState().markSaved(editRevision + 50);
    expect(useMindMapStore.getState().savedRevision).toBe(editRevision);
    useMindMapStore.getState().markSaved(0);
    expect(useMindMapStore.getState().savedRevision).toBe(editRevision);
  });

  test("loading another document resets both counters", () => {
    const state = load();
    state.renameNode(state.document!.rootId, "Edited");
    useMindMapStore.getState().setDocument(parseFile("b.md", "# B\n"));
    const next = useMindMapStore.getState();
    expect(next.editRevision).toBe(0);
    expect(next.savedRevision).toBe(0);
  });

  test("a content edit counts as a local edit", () => {
    const state = load();
    state.updateNodeContent(state.document!.rootId, "Some text");
    const after = useMindMapStore.getState();
    expect(after.editRevision).toBeGreaterThan(0);
  });

  test("updates that arrive from the sync server are not local edits", () => {
    const state = load();
    const yDoc = state.yDoc!;
    const rootId = state.document!.rootId;
    yDoc.transact(() => {
      const node = yDoc.getMap<Y.Map<unknown>>("nodes").get(rootId);
      node?.set("title", "From a peer");
    }, SYNC_ORIGIN);
    const after = useMindMapStore.getState();
    expect(after.document!.nodes.get(rootId)?.title).toBe("From a peer");
    expect(after.editRevision).toBe(0);
  });
});
