import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { applyKnowledgeNodes, knowledgeTasks, parseKnowledgeNodeInputs, parseKnowledgeNodePatch, KnowledgeInputError, localIsoDay } from "./knowledge";
import { applyKnowledgeNodesToYDoc } from "./knowledge-yjs";
import { flattenHeadings, parseHeadingTree, updateHeadingMetadata } from "./obsidian-markdown";
import { parseFile, serializeToMarkdown } from "./parser";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";

const meta = (json: string) => `<!-- bloommd:meta=${json} -->`;
const NOW = new Date(2026, 9, 10, 8, 0);

describe("owner as an alias of assignee when reading", () => {
  const markdown = [
    `# Plan <!-- bloommd:id=root01 -->`,
    "",
    `## Folien <!-- bloommd:id=a01 --> ${meta('{"kind":"task","status":"open","owner":"Max","due":"2026-10-03"}')}`,
    "",
    `## Raum <!-- bloommd:id=a02 --> ${meta('{"kind":"task","owner":"Tom","assignee":"Lea"}')}`,
    "",
  ].join("\n");

  test("the web/desktop parser reads owner as assignee; an explicit assignee wins", () => {
    const doc = parseFile("plan.md", markdown);
    expect(doc.nodes.get("a01")?.metadata).toEqual({ kind: "task", status: "open", due: "2026-10-03", assignee: "Max" });
    expect(doc.nodes.get("a02")?.metadata?.assignee).toBe("Lea");
  });

  test("the Obsidian parser reads owner as assignee", () => {
    const nodes = flattenHeadings(parseHeadingTree(markdown));
    expect(nodes.find((node) => node.id === "a01")?.metadata?.assignee).toBe("Max");
    expect(nodes.find((node) => node.id === "a02")?.metadata?.assignee).toBe("Lea");
  });

  test("only assignee is stored when the map is saved again", () => {
    const saved = serializeToMarkdown(parseFile("plan.md", markdown));
    expect(saved).toContain('"assignee":"Max"');
    expect(saved).not.toContain('"owner"');
  });

  test("maps without due and owner stay byte-identical through load and save", () => {
    const plain = [
      `# Plan <!-- bloommd:id=root01 -->`,
      "",
      `## Folien <!-- bloommd:id=a01 --> ${meta('{"kind":"task","status":"open"}')}`,
      "",
      "- [ ] Entwurf prüfen",
      "",
    ].join("\n");
    // The desktop/web serializer adds its own frontmatter to a file without one; the body stays as written.
    expect(serializeToMarkdown(parseFile("plan.md", plain)).endsWith(`---\n${plain}`)).toBe(true);
    const node = flattenHeadings(parseHeadingTree(plain)).find((candidate) => candidate.id === "a01")!;
    expect(updateHeadingMetadata(plain, "a01", node.metadata)).toBe(plain);
  });
});

describe("owner as an alias of assignee when writing", () => {
  const base = "# Plan <!-- bloommd:id=root01 -->\n\n## Aufgaben <!-- bloommd:id=aufg01 -->\n";

  test("applyKnowledgeNodes stores owner as assignee and infers a task", () => {
    const { markdown, ids } = applyKnowledgeNodes(base, [{ ref: "t", parent: "aufg01", title: "Folien", owner: "Max", due: "2026-10-12" }]);
    const node = parseFile("plan.md", markdown).nodes.get(ids.t!);
    expect(node?.metadata).toEqual({ kind: "task", due: "2026-10-12", assignee: "Max" });
    expect(markdown).not.toContain('"owner"');
  });

  test("the same value in both fields is accepted, different values are an input error", () => {
    const { markdown, ids } = applyKnowledgeNodes(base, [{ ref: "t", parent: "aufg01", title: "Folien", owner: "Max", assignee: " Max " }]);
    expect(parseFile("plan.md", markdown).nodes.get(ids.t!)?.metadata?.assignee).toBe("Max");
    expect(() => applyKnowledgeNodes(base, [{ parent: "aufg01", title: "Folien", owner: "Max", assignee: "Lea" }])).toThrow(KnowledgeInputError);
    expect(() => parseKnowledgeNodeInputs([{ title: "Folien", owner: "Max", assignee: "Lea" }])).toThrow(/alias of assignee/);
  });

  test("an update changes the stored assignee through owner", () => {
    const first = applyKnowledgeNodes(base, [{ ref: "t", parent: "aufg01", title: "Folien", assignee: "Max" }]);
    const second = applyKnowledgeNodes(first.markdown, [{ id: first.ids.t!, owner: "Lea" }]);
    expect(parseFile("plan.md", second.markdown).nodes.get(first.ids.t!)?.metadata?.assignee).toBe("Lea");
  });

  test("the node patch accepts owner, validates due and refuses conflicting values", () => {
    expect(parseKnowledgeNodePatch({ owner: "Max" }, "aufg01")).toEqual([{ id: "aufg01", owner: "Max" }]);
    expect(() => parseKnowledgeNodePatch({ owner: "Max", assignee: "Lea" }, "aufg01")).toThrow(KnowledgeInputError);
    expect(() => parseKnowledgeNodePatch({ owner: "Max", due: "morgen" }, "aufg01")).toThrow(/YYYY-MM-DD/);
  });

  test("the live document (Yjs) stores owner as assignee and refuses conflicts untouched", () => {
    const doc = new Y.Doc();
    documentToYDoc(parseFile("plan.md", base), doc);
    const change = applyKnowledgeNodesToYDoc(doc, [{ ref: "t", parent: "aufg01", title: "Folien", owner: "Max" }]);
    expect(yDocToDocument(doc).nodes.get(change.ids.t!)?.metadata).toEqual({ kind: "task", assignee: "Max" });
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ id: change.ids.t!, owner: "Lea", assignee: "Tom" }])).toThrow(KnowledgeInputError);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});

describe("knowledgeTasks", () => {
  const map = [
    `# Projekt <!-- bloommd:id=root01 -->`,
    "",
    "- [ ] Wurzel-Aufgabe",
    "",
    `## Planung <!-- bloommd:id=plan01 --> ${meta('{"kind":"task","status":"in_progress","due":"2026-10-12","owner":"Max"}')}`,
    "",
    "- [ ] Entwurf prüfen",
    "- [x] Gliederung",
    "* [ ] Stern-Liste",
    "  - [ ] Eingerückt",
    "-[ ] kein Leerzeichen",
    "- [ ]",
    "",
    "```md",
    "- [ ] im Codeblock",
    "```",
    "",
    "~~~",
    "- [ ] auch hier nicht",
    "~~~",
    "",
    "- [ ] nach dem Codeblock",
    "",
    `### Fertig <!-- bloommd:id=done01 --> ${meta('{"kind":"task","status":"done","due":"2026-10-01"}')}`,
    "",
    `## Überfällig <!-- bloommd:id=late01 --> ${meta('{"kind":"task","status":"open","due":"2026-10-02"}')}`,
    "",
    `## Heute <!-- bloommd:id=today01 --> ${meta('{"kind":"task","due":"2026-10-10","assignee":"Lea"}')}`,
    "",
    `## Ohne Datum <!-- bloommd:id=none01 --> ${meta('{"kind":"task","status":"open"}')}`,
    "",
    "## Notiz",
    "",
    "Kein Task.",
    "",
  ].join("\n");

  test("nodes of kind task that are not done, plus open checkboxes, with overdue and sorted by due", () => {
    const tasks = knowledgeTasks(map, false, NOW);
    expect(tasks.map((task) => task.title)).toEqual([
      "Überfällig",
      "Heute",
      "Planung",
      "Wurzel-Aufgabe",
      "Entwurf prüfen",
      "Stern-Liste",
      "Eingerückt",
      "nach dem Codeblock",
      "Ohne Datum",
    ]);
    expect(tasks.map((task) => task.overdue)).toEqual([true, false, false, false, false, false, false, false, false]);
  });

  test("a checkbox belongs to its heading, inherits neither due nor owner and has no own date", () => {
    const tasks = knowledgeTasks(map, false, NOW);
    const checkbox = tasks.find((task) => task.title === "Entwurf prüfen")!;
    expect(checkbox).toEqual({ nodeId: "plan01", title: "Entwurf prüfen", status: "open", overdue: false, context: ["Projekt", "Planung"] });
    const node = tasks.find((task) => task.title === "Planung")!;
    expect(node).toMatchObject({ nodeId: "plan01", status: "in_progress", due: "2026-10-12", owner: "Max", assignee: "Max", context: ["Projekt"] });
    expect(tasks.find((task) => task.title === "Wurzel-Aufgabe")).toMatchObject({ nodeId: "root01", context: ["Projekt"] });
  });

  test("done nodes only on request, and a done node is never overdue; [x] never counts", () => {
    const all = knowledgeTasks(map, true, NOW);
    expect(all).toHaveLength(10);
    expect(all.find((task) => task.title === "Fertig")).toMatchObject({ status: "done", overdue: false });
    expect(all.map((task) => task.title)).not.toContain("Gliederung");
  });

  test("today is injectable: due today is not overdue, the next day it is", () => {
    const dayOf = (day: number) => knowledgeTasks(map, false, new Date(2026, 9, day, 23, 59)).find((task) => task.title === "Heute")!;
    expect(dayOf(10).overdue).toBe(false);
    expect(dayOf(11).overdue).toBe(true);
    expect(localIsoDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  test("the result is deterministic: equal due dates keep document order", () => {
    const same = [
      "# M <!-- bloommd:id=r -->",
      "",
      `## B <!-- bloommd:id=b --> ${meta('{"kind":"task","due":"2026-10-20"}')}`,
      "",
      `## A <!-- bloommd:id=a --> ${meta('{"kind":"task","due":"2026-10-20"}')}`,
      "",
    ].join("\n");
    expect(knowledgeTasks(same, false, NOW).map((task) => task.title)).toEqual(["B", "A"]);
    expect(knowledgeTasks(same, false, NOW)).toEqual(knowledgeTasks(same, false, NOW));
  });
});
