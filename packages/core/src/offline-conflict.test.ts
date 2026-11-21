import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { parseFile, serializeToMarkdown } from "./parser";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";
import { yAddNode, yRenameNode } from "./yjs-operations";
import { yUpdateContentDiff } from "./yjs-content-sync";
import {
  conflictCopyTitle,
  formatConflictTime,
  listConflictCopies,
  parseConflictCopyTitle,
  planOfflineMerge,
  yResolveConflict,
  type ConflictAuthor,
} from "./offline-conflict";

const MARKDOWN = `---
title: Offline
id: offline-1
created: 2026-11-20
updated: 2026-11-20
---

# Wurzel <!-- bloommd:id=root -->

## Alpha <!-- bloommd:id=alpha -->

## Beta <!-- bloommd:id=beta -->

## Gamma <!-- bloommd:id=gamma -->
`;

function replica(server: Y.Doc): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(server));
  return doc;
}

function titles(doc: Y.Doc): string[] {
  return [...yDocToDocument(doc).nodes.values()].map((node) => node.title).sort();
}

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

const AT_A = Date.UTC(2026, 10, 20, 16, 25); // 17:25 Berlin
const AT_B = Date.UTC(2026, 10, 20, 16, 31);

function setup() {
  const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
  const base = Y.encodeStateAsUpdate(server);
  const a = replica(server);
  const b = replica(server);
  yRenameNode(a, "alpha", "Alpha-A");
  const delta = yAddNode(a, "root", "Delta");
  yRenameNode(b, "alpha", "Alpha-B");
  return { server, base, a, b, delta, authors: new Map<string, ConflictAuthor>() };
}

describe("offline conflict rule A", () => {
  test("first reconnect merges without a conflict, second one keeps its state and the other as a copy", () => {
    const { server, base, a, b, delta, authors } = setup();

    const first = planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_A, authors });
    expect(first.changed).toBe(true);
    expect(first.conflicts).toEqual([]);
    first.commit();
    expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha-A");
    expect(yDocToDocument(server).nodes.has(delta)).toBe(true);

    const second = planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_B, authors });
    expect(second.conflicts).toHaveLength(1);
    expect(second.conflicts[0]).toMatchObject({
      nodeId: "alpha",
      local: { title: "Alpha-B" },
      server: { title: "Alpha-A" },
    });
    // The snapshot sources: both starting versions are available before the merge.
    expect(second.serverDocument.nodes.get("alpha")!.title).toBe("Alpha-A");
    expect(second.localDocument.nodes.get("alpha")!.title).toBe("Alpha-B");
    const { conflictCopyIds } = second.commit();
    expect(conflictCopyIds).toHaveLength(1);

    const merged = yDocToDocument(server);
    expect(merged.nodes.get("alpha")!.title).toBe("Alpha-B");
    const copies = listConflictCopies(merged);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ originalId: "alpha", title: "Alpha-A", device: "Gerät A", time: formatConflictTime(AT_A) });
    expect(merged.nodes.get(copies[0]!.id)!.title).toBe(`Konflikt: Alpha-A (Gerät A, ${formatConflictTime(AT_A)})`);
    // Copy is the next sibling of the original.
    const rootChildren = merged.nodes.get("root")!.children;
    expect(rootChildren.indexOf(copies[0]!.id)).toBe(rootChildren.indexOf("alpha") + 1);
    expect(titles(server).filter((title) => title === "Delta")).toHaveLength(1);

    // Both clients converge on the same state.
    sync(server, a);
    sync(server, b);
    expect(titles(a)).toEqual(titles(server));
    expect(titles(b)).toEqual(titles(server));
  });

  test("the other order swaps winner and copy", () => {
    const { server, base, a, b, authors } = setup();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_A, authors }).commit();
    const plan = planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_B, authors });
    plan.commit();
    const doc = yDocToDocument(server);
    expect(doc.nodes.get("alpha")!.title).toBe("Alpha-A");
    expect(listConflictCopies(doc)[0]).toMatchObject({ title: "Alpha-B", device: "Gerät B" });
  });

  test("repeated delivery is idempotent: no second copy, no duplicate nodes", () => {
    const { server, base, a, b, authors } = setup();
    const aState = Y.encodeStateAsUpdate(a);
    const bState = Y.encodeStateAsUpdate(b);
    planOfflineMerge(server, { base, local: aState, device: "Gerät A", at: AT_A, authors }).commit();
    planOfflineMerge(server, { base, local: bState, device: "Gerät B", at: AT_B, authors }).commit();
    const after = titles(server);
    for (const local of [aState, bState, aState]) {
      const plan = planOfflineMerge(server, { base, local, device: "Gerät B", at: AT_B + 1000, authors });
      expect(plan.changed).toBe(false);
      expect(plan.commit()).toEqual({ conflictCopyIds: [] });
    }
    expect(titles(server)).toEqual(after);
    expect(listConflictCopies(yDocToDocument(server))).toHaveLength(1);
  });

  test("non-overlapping edits in different nodes merge silently", () => {
    const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
    const base = Y.encodeStateAsUpdate(server);
    const a = replica(server);
    const b = replica(server);
    yRenameNode(a, "alpha", "Alpha-A");
    yUpdateContentDiff(b, "beta", "", "Text von B");
    const authors = new Map<string, ConflictAuthor>();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_A, authors }).commit();
    const plan = planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_B, authors });
    expect(plan.conflicts).toEqual([]);
    plan.commit();
    const doc = yDocToDocument(server);
    expect(doc.nodes.get("alpha")!.title).toBe("Alpha-A");
    expect(doc.nodes.get("beta")!.content).toBe("Text von B");
    expect(listConflictCopies(doc)).toEqual([]);
  });

  test("a content conflict keeps both texts", () => {
    const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
    const base = Y.encodeStateAsUpdate(server);
    const a = replica(server);
    const b = replica(server);
    yUpdateContentDiff(a, "gamma", "", "Fassung A");
    yUpdateContentDiff(b, "gamma", "", "Fassung B");
    const authors = new Map<string, ConflictAuthor>();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_A, authors }).commit();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_B, authors }).commit();
    const doc = yDocToDocument(server);
    expect(doc.nodes.get("gamma")!.content).toBe("Fassung B");
    expect(listConflictCopies(doc)[0]).toMatchObject({ originalId: "gamma", content: "Fassung A", device: "Gerät A" });
  });

  test("a client without a base merges plainly and never reports a conflict", () => {
    const { server, a, authors } = setup();
    const plan = planOfflineMerge(server, { base: null, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_A, authors });
    expect(plan.conflicts).toEqual([]);
    plan.commit();
    expect(titles(server)).toContain("Delta");
  });

  test("an unknown author of the server version is named as such", () => {
    const { server, base, a, b } = setup();
    // Only the second client reaches a server that was changed by someone not tracked.
    yRenameNode(server, "alpha", "Alpha-S");
    const plan = planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_B });
    plan.commit();
    expect(listConflictCopies(yDocToDocument(server))[0]).toMatchObject({ title: "Alpha-S", device: "unbekanntes Gerät" });
    void a;
  });

  test("adopting the copy puts its version into the node and removes the copy on every replica", () => {
    const { server, base, a, b, authors } = setup();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_A, authors }).commit();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_B, authors }).commit();
    sync(server, a);
    sync(server, b);
    const copy = listConflictCopies(yDocToDocument(a))[0]!;
    expect(yResolveConflict(a, copy.id, "adopt")).toBe(true);
    sync(a, b);
    sync(a, server);
    for (const doc of [a, b, server]) {
      const document = yDocToDocument(doc);
      expect(document.nodes.get("alpha")!.title).toBe("Alpha-A");
      expect(listConflictCopies(document)).toEqual([]);
      expect(titles(doc).some((title) => title.startsWith("Konflikt"))).toBe(false);
    }
    expect(yResolveConflict(a, copy.id, "adopt")).toBe(false);
  });

  test("discarding the copy keeps the node", () => {
    const { server, base, a, b, authors } = setup();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_A, authors }).commit();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_B, authors }).commit();
    const copy = listConflictCopies(yDocToDocument(server))[0]!;
    yResolveConflict(server, copy.id, "discard");
    const document = yDocToDocument(server);
    expect(document.nodes.get("alpha")!.title).toBe("Alpha-B");
    expect(listConflictCopies(document)).toEqual([]);
  });

  test("the conflict copy survives a Markdown round trip and is still recognised", () => {
    const { server, base, a, b, authors } = setup();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(a), device: "Gerät A", at: AT_A, authors }).commit();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(b), device: "Gerät B", at: AT_B, authors }).commit();
    const markdown = serializeToMarkdown(yDocToDocument(server));
    expect(markdown).toContain("## Alpha-B");
    expect(markdown).toContain(`## Konflikt: Alpha-A (Gerät A, ${formatConflictTime(AT_A)})`);
    const reparsed = parseFile("offline.md", markdown);
    expect(listConflictCopies(reparsed)).toHaveLength(1);
    const withoutStamp = (value: string) => value.replace(/^updated: .*$/m, "");
    expect(withoutStamp(serializeToMarkdown(reparsed))).toBe(withoutStamp(markdown));
  });

  test("copy titles parse back", () => {
    expect(parseConflictCopyTitle(conflictCopyTitle("Alpha (neu)", "Gerät A", "2026-11-20 17:25"))).toEqual({
      title: "Alpha (neu)",
      device: "Gerät A",
      time: "2026-11-20 17:25",
    });
    expect(parseConflictCopyTitle("Konflikt: ohne Rahmen")).toBeNull();
    expect(formatConflictTime(AT_A)).toBe("2026-11-20 17:25");
  });
});

describe("a client's edit is never hidden by the merge (#261)", () => {
  test("room and client built the node entries independently: the room shows the client's text", () => {
    // The outcome of the plain CRDT merge depends on random client ids; repeat it.
    for (let run = 0; run < 40; run++) {
      const clientSeed = documentToYDoc(parseFile("offline.md", MARKDOWN.replace("updated: 2026-11-20", "updated: 2026-11-21")));
      const base = Y.encodeStateAsUpdate(clientSeed);
      const client = replica(clientSeed);
      yRenameNode(client, "beta", "Beta-A");
      yUpdateContentDiff(client, "beta", "", "Text von A");
      const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
      const plan = planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(client), device: "Gerät A", at: AT_A });
      plan.commit();
      const beta = yDocToDocument(server).nodes.get("beta")!;
      expect(beta.title).toBe("Beta-A");
      expect(beta.content).toBe("Text von A");
      expect(listConflictCopies(yDocToDocument(server))).toHaveLength(0);
    }
  });
});
