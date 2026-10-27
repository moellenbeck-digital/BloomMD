import { describe, expect, test } from "bun:test";
import {
  applyKnowledgeFrontmatter,
  applyKnowledgeNodes,
  isKnowledgeInputError,
  isKnowledgeRetired,
  knowledgeDecisions,
  knowledgeLifecycle,
  knowledgeTasks,
  knowledgeVersion,
  matchesKnowledgeFilter,
  newKnowledgeMap,
  outlineMarkdown,
  parseKnowledgeFrontmatterInput,
  parseKnowledgeNodeInputs,
  readKnowledgeFrontmatter,
  searchKnowledge,
  searchKnowledgeFrontmatter,
} from "./knowledge";
import { parseFrontmatter } from "./frontmatter";
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

describe("trust fields in the frontmatter", () => {
  const rejected = (args: Record<string, unknown>) => {
    let error: unknown;
    try { parseKnowledgeFrontmatterInput(args); } catch (caught) { error = caught; }
    expect(isKnowledgeInputError(error)).toBe(true);
    return (error as Error).message;
  };

  test("parseKnowledgeFrontmatterInput accepts the lifecycle fields and returns nothing without them", () => {
    expect(parseKnowledgeFrontmatterInput({ title: "x" })).toBeUndefined();
    expect(parseKnowledgeFrontmatterInput({
      status: "ersetzt", stale_after: "2026-12-31", scope: "BloomMD,\ncoder", replaced_by: "Learnings/Neu.md", verified: { by: "Max", at: "2026-10-27" },
    })).toEqual({ status: "ersetzt", stale_after: "2026-12-31", scope: "BloomMD, coder", replaced_by: "Learnings/Neu.md", verified: { by: "Max", at: "2026-10-27" } });
  });

  test("parseKnowledgeFrontmatterInput refuses invalid values with KnowledgeInputError", () => {
    expect(rejected({ status: "stable" })).toMatch(/neu, bestätigt, veraltet, ersetzt/);
    rejected({ status: 1 });
    for (const date of ["morgen", "2026-02-30", "2026-13-01", "26-01-01", "2026-10-27T10:00", 20261027]) rejected({ stale_after: date });
    for (const verified of ["Max", null, [], { by: "Max" }, { at: "2026-10-27" }, { by: "", at: "2026-10-27" }, { by: "Max", at: "gestern" }, { by: "Max", at: "2026-10-27", role: "x" }, { by: "x".repeat(121), at: "2026-10-27" }]) rejected({ verified });
    rejected({ scope: "" });
    rejected({ scope: "x".repeat(301) });
    rejected({ scope: 5 });
    expect(rejected({ replaced_by: "Neu.md" })).toMatch(/only allowed together with status ersetzt/);
    rejected({ status: "bestätigt", replaced_by: "Neu.md" });
    rejected({ status: "ersetzt", replaced_by: "x".repeat(301) });
  });

  test("line breaks never reach the YAML: a value stays on its line and cannot add fields", () => {
    const input = parseKnowledgeFrontmatterInput({ scope: "a\nstatus: ersetzt\r\n---\n# Boom", verified: { by: "Max\nat: 1999-01-01", at: "2026-10-27" } })!;
    const { markdown } = applyKnowledgeFrontmatter(meeting(), input);
    const { data } = parseFrontmatter(markdown);
    expect(data.scope).toBe("a status: ersetzt --- # Boom");
    expect(data.status).toBeUndefined();
    expect(data.verified).toEqual([{ by: "Max at: 1999-01-01", at: "2026-10-27" }]);
    expect(outlineMarkdown(markdown).nodes.map((node) => node.title)).toEqual(["Teammeeting 30.09."]);
  });

  test("applyKnowledgeFrontmatter replaces fields in place and leaves every other line alone", () => {
    const original = ["---", "title: \"Learning\"", "type: \"learning\"", "status: \"neu\"", "# Kommentar bleibt", "tags: [\"a\", \"b\"]", "stale_after: \"2026-10-01\"", "custom: [1,", "  2]", "---", "", "# Learning", "", "Text.", ""].join("\n");
    const result = applyKnowledgeFrontmatter(original, { status: "bestätigt", stale_after: "2027-01-01", scope: "BloomMD" });
    expect(result.fields).toEqual(["status", "stale_after", "scope"]);
    expect(result.markdown).toBe(["---", "title: \"Learning\"", "type: \"learning\"", "status: \"bestätigt\"", "# Kommentar bleibt", "tags: [\"a\", \"b\"]", "stale_after: \"2027-01-01\"", "custom: [1,", "  2]", "scope: \"BloomMD\"", "---", "", "# Learning", "", "Text.", ""].join("\n"));
  });

  test("a field with a block value is replaced including its continuation lines", () => {
    const original = "---\ntitle: T\nverified:\n  - by: Max\n    at: 2026-01-01\nscope: x\n---\n# T\n";
    const result = applyKnowledgeFrontmatter(original, { replaced_by: "N.md", status: "ersetzt" });
    expect(result.markdown).toBe("---\ntitle: T\nverified:\n  - by: Max\n    at: 2026-01-01\nscope: x\nstatus: \"ersetzt\"\nreplaced_by: \"N.md\"\n---\n# T\n");
    const swapped = applyKnowledgeFrontmatter(original, { scope: "neu" });
    expect(parseFrontmatter(swapped.markdown).data).toEqual({ title: "T", verified: [{ by: "Max", at: "2026-01-01" }], scope: "neu" });
  });

  test("verified appends to a list, a single entry or nothing, and keeps the rest", () => {
    const first = applyKnowledgeFrontmatter(meeting(), { verified: { by: "Max", at: "2026-10-01" } }).markdown;
    expect(parseFrontmatter(first).data.verified).toEqual([{ by: "Max", at: "2026-10-01" }]);
    const second = applyKnowledgeFrontmatter(first, { verified: { by: "Anna", at: "2026-10-27" } }).markdown;
    expect(parseFrontmatter(second).data.verified).toEqual([{ by: "Max", at: "2026-10-01" }, { by: "Anna", at: "2026-10-27" }]);
    expect(parseFrontmatter(second).data.title).toBe("Teammeeting 30.09.");
    const single = "---\ntitle: T\nverified: { by: Max, at: 2026-01-01 }\n---\n# T\n";
    expect(parseFrontmatter(applyKnowledgeFrontmatter(single, { verified: { by: "Anna", at: "2026-02-02" } }).markdown).data.verified).toEqual([{ by: "Max", at: "2026-01-01" }, { by: "Anna", at: "2026-02-02" }]);
    const empty = "---\ntitle: T\nverified: []\n---\n# T\n";
    expect(parseFrontmatter(applyKnowledgeFrontmatter(empty, { verified: { by: "Anna", at: "2026-02-02" } }).markdown).data.verified).toEqual([{ by: "Anna", at: "2026-02-02" }]);
    expect(readKnowledgeFrontmatter(second).verified).toEqual([{ by: "Max", at: "2026-10-01" }, { by: "Anna", at: "2026-10-27" }]);
    // The Wiki lint reads the same shape: by and at as strings.
    expect(() => applyKnowledgeFrontmatter("---\ntitle: T\nverified: Max\n---\n# T\n", { verified: { by: "Anna", at: "2026-02-02" } })).toThrow(/not a list/);
  });

  test("a map without frontmatter gets a block; CRLF files keep their line endings", () => {
    const bare = applyKnowledgeFrontmatter("# Physik\n\nText\n", { status: "neu" });
    expect(bare.markdown).toBe("---\nstatus: \"neu\"\n---\n# Physik\n\nText\n");
    const crlf = applyKnowledgeFrontmatter("---\r\ntitle: T\r\nstatus: x\r\n---\r\n# T\r\n", { status: "veraltet", scope: "s" });
    expect(crlf.markdown).toBe("---\r\ntitle: T\r\nstatus: \"veraltet\"\r\nscope: \"s\"\r\n---\r\n# T\r\n");
    expect(applyKnowledgeFrontmatter("# T\n", {}).markdown).toBe("# T\n");
  });

  test("readKnowledgeFrontmatter and the lifecycle", () => {
    const markdown = "---\ntitle: \"Bun\"\nstatus: bestätigt\nscope: \"BloomMD, coder\"\ncreated: 2026-09-01\nstale_after: 2026-10-20\ntags: [\"#Coder\", \"bereich/learnings\"]\nverified:\n  - by: Max\n    at: 2026-10-10\n---\n# Bun\n";
    const frontmatter = readKnowledgeFrontmatter(markdown);
    expect(frontmatter).toEqual(expect.objectContaining({ title: "Bun", status: "bestätigt", scope: "BloomMD, coder", stale_after: "2026-10-20", tags: ["Coder", "bereich/learnings"] }));
    expect(knowledgeLifecycle(frontmatter, "2026-10-27")).toEqual({ status: "bestätigt", stale_after: "2026-10-20", expired: true, ageDays: 56 });
    expect(knowledgeLifecycle(frontmatter, "2026-10-20").expired).toBe(false);
    // Without `created` the latest verification dates the map.
    expect(knowledgeLifecycle({ ...frontmatter, created: undefined }, "2026-10-27").ageDays).toBe(17);
    // Maps without the fields give nothing: no status, no expiry, no age.
    expect(knowledgeLifecycle(readKnowledgeFrontmatter("# Plain\n"), "2026-10-27")).toEqual({});
    expect(readKnowledgeFrontmatter("---\n: [broken\n---\n# X\n")).toEqual({ tags: [], verified: [] });
  });

  test("filters, frontmatter search and the default exclusion", () => {
    const frontmatter = readKnowledgeFrontmatter("---\ntitle: Bun\nstatus: neu\nscope: BloomMD, Coder\nsource: Ticket 109\ntags: [coder, Bereich/Learnings]\n---\n# Bun\n");
    expect(matchesKnowledgeFilter(frontmatter, {})).toBe(true);
    expect(matchesKnowledgeFilter(frontmatter, { tag: "CODER" })).toBe(true);
    expect(matchesKnowledgeFilter(frontmatter, { tag: "cod" })).toBe(false);
    expect(matchesKnowledgeFilter(frontmatter, { scope: "bloom" })).toBe(true);
    expect(matchesKnowledgeFilter(frontmatter, { scope: "tester" })).toBe(false);
    expect(matchesKnowledgeFilter(frontmatter, { status: "neu", tag: "coder", scope: "coder" })).toBe(true);
    expect(matchesKnowledgeFilter(frontmatter, { status: "bestätigt" })).toBe(false);
    expect(searchKnowledgeFrontmatter(frontmatter, "learn")).toEqual({ field: "tags", snippet: "tags: Bereich/Learnings" });
    expect(searchKnowledgeFrontmatter(frontmatter, "ticket 109")?.field).toBe("source");
    expect(searchKnowledgeFrontmatter(frontmatter, "neu")?.field).toBe("status");
    expect(searchKnowledgeFrontmatter(frontmatter, "nirgends")).toBeNull();
    expect(searchKnowledgeFrontmatter(frontmatter, " ")).toBeNull();
    expect(isKnowledgeRetired({ status: "veraltet" })).toBe(true);
    expect(isKnowledgeRetired({ status: "ersetzt" })).toBe(true);
    expect(isKnowledgeRetired({ status: "bestätigt", stale_after: "2026-01-01", expired: true })).toBe(true);
    expect(isKnowledgeRetired({ status: "neu", stale_after: "2027-01-01", expired: false })).toBe(false);
    expect(isKnowledgeRetired({})).toBe(false);
  });
});
