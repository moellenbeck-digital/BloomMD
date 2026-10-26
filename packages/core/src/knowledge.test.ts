import { describe, expect, test } from "bun:test";
import { applyKnowledgeNodes, isKnowledgeInputError, knowledgeDecisions, knowledgeTasks, knowledgeVersion, newKnowledgeMap, outlineMarkdown, parseKnowledgeNodeInputs, searchKnowledge } from "./knowledge";
import { KNOWLEDGE_TEMPLATES, knowledgeTemplate, templateFrontmatter } from "./knowledge-templates";
import { parseFile } from "./parser";

const meeting = () => newKnowledgeMap({ title: "Teammeeting 30.09.", area: "Arbeit", source: "Transkript Teams", date: "2026-09-30" });

describe("newKnowledgeMap", () => {
  test("writes frontmatter with area tag and a root heading with an id", () => {
    const markdown = meeting();
    expect(markdown).toContain('title: "Teammeeting 30.09."');
    expect(markdown).toContain('tags: ["bereich/arbeit"]');
    expect(markdown).toContain("created: 2026-09-30");
    expect(markdown).toMatch(/^# Teammeeting 30\.09\. <!-- bloommd:id=[A-Za-z0-9_-]+ -->$/m);
  });

  test("adds template frontmatter after the standard fields and refuses to override them", () => {
    const markdown = newKnowledgeMap({ title: "X", area: "Learnings", source: "Ticket #1", date: "2026-10-26", frontmatter: { type: "learning", status: "neu" } });
    expect(markdown.split("\n").slice(0, 8)).toEqual(["---", 'title: "X"', "created: 2026-10-26", 'area: "Learnings"', 'tags: ["bereich/learnings"]', 'source: "Ticket #1"', 'type: "learning"', 'status: "neu"']);
    expect(() => newKnowledgeMap({ title: "X", frontmatter: { title: "Y" } })).toThrow(/not allowed/);
    expect(() => newKnowledgeMap({ title: "X", frontmatter: { "a: b\nc": "Y" } })).toThrow(/not allowed/);
  });
});

describe("templates", () => {
  test("only the learning template adds frontmatter; the others stay as they were", () => {
    expect(KNOWLEDGE_TEMPLATES.filter((template) => template.frontmatter).map((template) => template.id)).toEqual(["learning"]);
    for (const id of ["meeting", "conversation", "discussion", "lesson", "project", "weekly"]) {
      expect(templateFrontmatter(knowledgeTemplate(id), { date: "2026-10-26", scope: "BloomMD" })).toEqual({});
    }
    expect(templateFrontmatter(null, { date: "2026-10-26" })).toEqual({});
  });

  test("learning: area, skeleton, guidance and a concrete stale_after 90 days ahead", () => {
    const learning = knowledgeTemplate("learning")!;
    expect(learning.area).toBe("Learnings");
    expect(learning.skeleton.map((node) => node.title)).toEqual(["Symptom", "Ursache", "Regel", "Beleg", "Gilt für", "Aufgaben"]);
    expect(learning.guidance.join("\n")).toMatch(/Aufgaben ist optional/);
    expect(learning.guidance.join("\n")).toMatch(/Suchen vor anlegen/);
    expect(templateFrontmatter(learning, { date: "2026-10-26", scope: " BloomMD, coder\n" })).toEqual({ type: "learning", status: "neu", scope: "BloomMD, coder", stale_after: "2027-01-24" });
    expect(templateFrontmatter(learning, { date: "2026-12-31" }).stale_after).toBe("2027-03-31");
    expect(templateFrontmatter(learning, { date: "2026-10-26" })).not.toHaveProperty("scope");
  });
});

describe("applyKnowledgeNodes", () => {
  test("creates a structured map from refs, with tasks, decisions and relations", () => {
    const change = applyKnowledgeNodes(meeting(), [
      { ref: "themen", title: "Themen" },
      { ref: "release", parent: "themen", title: "Release 0.6", content: "Handschrift auf dem iPad fertig." },
      { ref: "test", parent: "release", title: "iPad-Test durchführen", status: "open", due: "2026-10-03", assignee: "Max" },
      { ref: "go", parent: "themen", title: "Release nach Test", decision: "accepted", relations: [{ target: "test", label: "hängt ab von" }] },
    ]);
    expect(change.created).toHaveLength(4);
    const outline = outlineMarkdown(change.markdown);
    const byTitle = (title: string) => outline.nodes.find((node) => node.title === title)!;
    expect(byTitle("Release 0.6").parentId).toBe(change.ids.themen!);
    expect(byTitle("Release 0.6").content).toBe("Handschrift auf dem iPad fertig.");
    expect(byTitle("iPad-Test durchführen").metadata).toEqual({ kind: "task", status: "open", due: "2026-10-03", assignee: "Max" });
    expect(byTitle("Release nach Test").metadata).toEqual({ kind: "decision", decision: "accepted", relations: [{ target: change.ids.test!, label: "hängt ab von" }] });
    // The full BloomMD parser (desktop, web) reads the same structure and metadata.
    const doc = parseFile("meeting.md", change.markdown);
    const task = [...doc.nodes.values()].find((node) => node.title === "iPad-Test durchführen");
    expect(task?.metadata).toEqual({ kind: "task", status: "open", due: "2026-10-03", assignee: "Max" });
  });

  test("updates existing nodes by id: appends content, keeps metadata, renames", () => {
    const first = applyKnowledgeNodes(meeting(), [{ ref: "t", title: "Aufgabe", content: "Erster Stand.", status: "open", assignee: "Lea" }]);
    const id = first.ids.t!;
    const second = applyKnowledgeNodes(first.markdown, [{ id, content: "Nachtrag.", status: "done" }, { id, title: "Aufgabe (erledigt)" }]);
    const node = outlineMarkdown(second.markdown).nodes.find((entry) => entry.id === id)!;
    expect(node.title).toBe("Aufgabe (erledigt)");
    expect(node.content).toBe("Erster Stand.\n\nNachtrag.");
    expect(node.metadata).toEqual({ kind: "task", status: "done", assignee: "Lea" });
    expect(second.updated).toEqual([id, id]);
  });

  test("accepts the outline ids of a note that has no stored ids yet", () => {
    const plain = "# Physik\n\n## Thermodynamik\n\nWärme.\n";
    const thermo = outlineMarkdown(plain).nodes.find((node) => node.title === "Thermodynamik")!;
    expect(thermo.id).toMatch(/^heading-/);
    const change = applyKnowledgeNodes(plain, [{ parent: thermo.id, title: "1. Hauptsatz" }, { id: thermo.id, content: "Und Arbeit." }]);
    const outline = outlineMarkdown(change.markdown);
    const stored = outline.nodes.find((node) => node.title === "Thermodynamik")!;
    expect(stored.id).not.toMatch(/^heading-/);
    expect(stored.content).toBe("Wärme.\n\nUnd Arbeit.");
    expect(outline.nodes.find((node) => node.title === "1. Hauptsatz")?.parentId).toBe(stored.id);
  });

  test("replaces content on request", () => {
    const first = applyKnowledgeNodes(meeting(), [{ ref: "n", title: "Notiz", content: "alt" }]);
    const second = applyKnowledgeNodes(first.markdown, [{ id: first.ids.n!, content: "neu", contentMode: "replace" }]);
    expect(outlineMarkdown(second.markdown).nodes.find((node) => node.id === first.ids.n)?.content).toBe("neu");
  });

  test("rejects invalid input without partial writes", () => {
    const markdown = meeting();
    expect(() => applyKnowledgeNodes(markdown, [{ id: "missing", content: "x" }])).toThrow(/does not exist/);
    expect(() => applyKnowledgeNodes(markdown, [{ ref: "a", title: "A", parent: "nope" }])).toThrow(/Unknown node/);
    expect(() => applyKnowledgeNodes(markdown, [{ ref: "a", title: "" }])).toThrow(/needs a title/);
    expect(() => applyKnowledgeNodes(markdown, [{ ref: "a", title: "A", due: "morgen" }])).toThrow(/YYYY-MM-DD/);
    expect(() => applyKnowledgeNodes(markdown, [{ ref: "a", title: "A" }, { ref: "a", title: "B" }])).toThrow(/used twice/);
  });

  test("stops at six heading levels", () => {
    const deep = applyKnowledgeNodes(meeting(), [
      { ref: "2", title: "2" }, { ref: "3", parent: "2", title: "3" }, { ref: "4", parent: "3", title: "4" },
      { ref: "5", parent: "4", title: "5" }, { ref: "6", parent: "5", title: "6" },
    ]);
    expect(() => applyKnowledgeNodes(deep.markdown, [{ ref: "7", parent: deep.ids["6"]!, title: "7" }])).toThrow(/six heading levels/);
  });
});

describe("queries", () => {
  const filled = () => applyKnowledgeNodes(meeting(), [
    { ref: "a", title: "Folien bauen", status: "open", due: "2026-10-05" },
    { ref: "b", title: "Raum buchen", status: "in_progress", due: "2026-10-02", assignee: "Tom" },
    { ref: "c", title: "Protokoll", status: "done" },
    { ref: "d", title: "Budget freigeben", decision: "proposed", assignee: "Max" },
  ]).markdown;

  test("open tasks sorted by due date, done ones only on request", () => {
    expect(knowledgeTasks(filled()).map((task) => task.title)).toEqual(["Raum buchen", "Folien bauen"]);
    expect(knowledgeTasks(filled(), true)).toHaveLength(3);
  });

  test("decisions and search", () => {
    expect(knowledgeDecisions(filled())).toEqual([expect.objectContaining({ title: "Budget freigeben", decision: "proposed", assignee: "Max" })]);
    expect(searchKnowledge(filled(), "raum").map((hit) => hit.title)).toEqual(["Raum buchen"]);
  });

  test("version changes with the document", () => {
    const markdown = filled();
    expect(knowledgeVersion(markdown)).toBe(knowledgeVersion(markdown));
    expect(knowledgeVersion(markdown)).not.toBe(knowledgeVersion(`${markdown}\n`));
  });
});

describe("structure-safe agent input", () => {
  test("rejects content that would add nodes or swallow the following ones", () => {
    const map = meeting();
    const bad = [
      "Intro\n\n# Eingeschmuggelt",
      "Text\n---",
      "```js\nconst a = 1;",
      "~~~\nnie geschlossen",
      "<!-- offen",
      "x <!-- bloommd:id=abc -->",
    ];
    for (const content of bad) {
      expect(() => applyKnowledgeNodes(map, [{ title: "A", content }])).toThrow();
      expect(() => parseKnowledgeNodeInputs([{ title: "A", content }])).toThrow();
    }
    const fine = "Code:\n\n```md\n# im Code erlaubt\n```\n\n#hashtag und [[Notiz]]\n\n---\n\nNach der Linie.";
    const change = applyKnowledgeNodes(map, [{ ref: "a", title: "A", content: fine }]);
    expect(outlineMarkdown(change.markdown).nodes.map((node) => node.title)).toEqual(["Teammeeting 30.09.", "A"]);
  });

  test("rejects multi-line titles and BloomMD comments in titles", () => {
    expect(() => applyKnowledgeNodes(meeting(), [{ title: "Zwei\n# Zeilen" }])).toThrow(/single line/);
    expect(() => applyKnowledgeNodes(meeting(), [{ title: "X <!-- bloommd:id=root -->" }])).toThrow(/BloomMD comments/);
    expect(() => newKnowledgeMap({ title: "A\nB" })).toThrow(/single line/);
  });

  test("parseKnowledgeNodeInputs checks fields, types and values", () => {
    expect(parseKnowledgeNodeInputs([{ ref: "a", title: "A", kind: "task", status: "done", relations: [{ target: "b", label: "x" }] }])).toEqual([
      { ref: "a", title: "A", kind: "task", status: "done", relations: [{ target: "b", label: "x" }] },
    ]);
    for (const nodes of [null, [], [null], [{ title: 1 }], [{ kind: "evil" }], [{ status: "later" }], [{ decision: "maybe" }], [{ contentMode: "merge" }], [{ due: "morgen" }], [{ extra: "x" }], [{ relations: [{ label: "x" }] }], [{ relations: "b" }]]) {
      let error: unknown;
      try { parseKnowledgeNodeInputs(nodes); } catch (caught) { error = caught; }
      expect(isKnowledgeInputError(error)).toBe(true);
    }
    expect(parseKnowledgeNodeInputs([], { minItems: 0 })).toEqual([]);
  });
});
