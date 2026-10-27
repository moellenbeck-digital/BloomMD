import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { applyKnowledgeNodes, KnowledgeNodeNotFoundError, parseKnowledgeNodePatch } from "./knowledge";
import { applyKnowledgeNodesToYDoc } from "./knowledge-yjs";
import { parseFile, serializeToMarkdown } from "./parser";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";
import { yUpdateContent } from "./yjs-operations";

const source = "# Projekt X <!-- bloommd:id=root01 -->\n\n## Ziel <!-- bloommd:id=ziel01 -->\n\nLaunch.\n\n## Aufgaben <!-- bloommd:id=aufg01 -->\n";

function ydoc() {
  const doc = new Y.Doc();
  documentToYDoc(parseFile("projekt.md", source), doc);
  return doc;
}

describe("applyKnowledgeNodesToYDoc", () => {
  test("adds, updates and connects nodes like the Markdown version", () => {
    const doc = ydoc();
    const change = applyKnowledgeNodesToYDoc(doc, [
      { ref: "t", parent: "aufg01", title: "Website bauen", status: "open", due: "2026-10-20", assignee: "Lea" },
      { id: "ziel01", content: "Im Oktober." },
      { ref: "d", title: "Domain kaufen", decision: "accepted", relations: [{ target: "t", label: "für" }] },
    ]);
    const result = yDocToDocument(doc);
    const task = result.nodes.get(change.ids.t!)!;
    expect(task.parentId).toBe("aufg01");
    expect(task.metadata).toEqual({ kind: "task", status: "open", due: "2026-10-20", assignee: "Lea" });
    expect(result.nodes.get("ziel01")?.content.trim()).toBe("Launch.\n\nIm Oktober.");
    expect(result.nodes.get(change.ids.d!)?.metadata).toEqual({ kind: "decision", decision: "accepted", relations: [{ target: change.ids.t!, label: "für" }] });
    // The live document serializes to Markdown every BloomMD app reads.
    const markdown = serializeToMarkdown(result);
    expect(parseFile("projekt.md", markdown).nodes.get(change.ids.t!)?.metadata?.due).toBe("2026-10-20");
  });

  test("validates everything before touching the live document", () => {
    const doc = ydoc();
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ ref: "a", title: "Gut" }, { ref: "b", parent: "fehlt", title: "Schlecht" }])).toThrow(/Unknown node/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ id: "nope", content: "x" }])).toThrow(/does not exist/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ ref: "a", title: "A", due: "bald" }])).toThrow(/YYYY-MM-DD/);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  test("merges with a person editing the same map at the same time", () => {
    const agent = ydoc();
    const person = new Y.Doc();
    Y.applyUpdate(person, Y.encodeStateAsUpdate(agent));
    yUpdateContent(person, "ziel01", "Launch im November.");
    const change = applyKnowledgeNodesToYDoc(agent, [{ parent: "aufg01", title: "Texte schreiben" }]);
    Y.applyUpdate(agent, Y.encodeStateAsUpdate(person));
    Y.applyUpdate(person, Y.encodeStateAsUpdate(agent));
    for (const doc of [agent, person]) {
      const result = yDocToDocument(doc);
      expect(result.nodes.get("ziel01")?.content.trim()).toBe("Launch im November.");
      expect(result.nodes.get(change.created[0]!)?.title).toBe("Texte schreiben");
    }
  });

  test("validates content before touching the live document", () => {
    const doc = ydoc();
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ ref: "a", title: "A" }, { id: "ziel01", content: "## Neu\nText" }])).toThrow(/heading lines/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ id: "ziel01", content: "```\noffen" }])).toThrow(/code fence/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ id: "ziel01", title: "Ziel\n# X" }])).toThrow(/single line/);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});

describe("a partial node change (parseKnowledgeNodePatch) on the live document", () => {
  const patch = { status: "done", children: [{ ref: "k", title: "Folgeaufgabe", status: "open" }, { parent: "k", title: "Unterpunkt" }] };

  test("changes only the named fields, appends the children last and matches the Markdown version", () => {
    const doc = ydoc();
    const inputs = parseKnowledgeNodePatch(patch, "aufg01");
    const change = applyKnowledgeNodesToYDoc(doc, inputs);
    expect(change.updated).toEqual(["aufg01"]);
    const live = yDocToDocument(doc);
    expect(live.nodes.get("aufg01")?.metadata).toEqual({ kind: "task", status: "done" });
    expect(live.nodes.get("aufg01")?.title).toBe("Aufgaben");
    const [child, grandchild] = change.created;
    expect(live.nodes.get("aufg01")?.children).toEqual([child!]);
    expect(live.nodes.get(child!)).toMatchObject({ title: "Folgeaufgabe", metadata: { kind: "task", status: "open" } });
    expect(live.nodes.get(grandchild!)?.parentId).toBe(child!);
    expect(live.nodes.get("ziel01")?.content.trim()).toBe("Launch.");
    // The Markdown path (files, proposals) produces the same map.
    const viaMarkdown = parseFile("projekt.md", applyKnowledgeNodes(source, inputs).markdown);
    expect(viaMarkdown.nodes.get("aufg01")?.metadata).toEqual(live.nodes.get("aufg01")?.metadata);
    expect([...viaMarkdown.nodes.values()].map((node) => node.title)).toEqual([...live.nodes.values()].map((node) => node.title));
  });

  test("merges with a person who edits the same node and the same map at the same time", () => {
    const agent = ydoc();
    const person = new Y.Doc();
    Y.applyUpdate(person, Y.encodeStateAsUpdate(agent));
    yUpdateContent(person, "ziel01", "Launch im November.");
    yUpdateContent(person, "aufg01", "Von Hand ergänzt.");
    applyKnowledgeNodesToYDoc(agent, parseKnowledgeNodePatch(patch, "aufg01"));
    Y.applyUpdate(agent, Y.encodeStateAsUpdate(person));
    Y.applyUpdate(person, Y.encodeStateAsUpdate(agent));
    for (const doc of [agent, person]) {
      const result = yDocToDocument(doc);
      expect(result.nodes.get("ziel01")?.content.trim()).toBe("Launch im November.");
      expect(result.nodes.get("aufg01")?.content.trim()).toBe("Von Hand ergänzt.");
      expect(result.nodes.get("aufg01")?.metadata).toMatchObject({ status: "done" });
      expect(result.nodes.get("aufg01")?.children.map((id) => result.nodes.get(id)?.title)).toEqual(["Folgeaufgabe"]);
    }
  });

  test("an unknown node is a KnowledgeNodeNotFoundError and the live document stays untouched", () => {
    const doc = ydoc();
    const before = Y.encodeStateAsUpdate(doc);
    const error = (() => {
      try {
        applyKnowledgeNodesToYDoc(doc, parseKnowledgeNodePatch(patch, "fehlt"));
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(KnowledgeNodeNotFoundError);
    expect((error as KnowledgeNodeNotFoundError).nodeId).toBe("fehlt");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});
