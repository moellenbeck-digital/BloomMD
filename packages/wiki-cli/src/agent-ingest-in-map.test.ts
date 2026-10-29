import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintWorkspace } from "@bloommd/core";
import { parseFile } from "@bloommd/core/parser";
import { AGENT_USAGE, learningDeps, runAgentCli } from "./agent-cli";
import { EXIT, runLearningCommand } from "./agent-learnings";
import { knowledgeServerOptions, KNOWLEDGE_TOOLS } from "./knowledge-mcp";
import { INGEST_MAX_NODES, INGEST_MAX_TEXT_CHARS, KnowledgeService, normalizeKnowledgeTitle } from "./knowledge-service";
import { VaultKnowledgeStore, writeAccessConfig } from "./knowledge-store";

type Access = "read" | "propose" | "write";

const FIRST = join(import.meta.dir, "fixtures", "besprechung-transkript.txt");
const SECOND = join(import.meta.dir, "fixtures", "besprechung-transkript-2.txt");
const MAP = "Arbeit/Wochenbesprechung Produktteam.md";

async function vault(access: Access = "write") {
  const root = await mkdtemp(join(tmpdir(), "bloommd-ingest-in-map-"));
  await writeAccessConfig(join(root, ".bloommd"), { access, areas: {} });
  return root;
}

interface Run {
  code: number;
  err: string;
  json: Record<string, any>;
}

async function agent(args: string[]): Promise<Run> {
  const original = { log: console.log, write: process.stderr.write };
  const out: string[] = [];
  let err = "";
  console.log = (...values: unknown[]) => void out.push(values.join(" "));
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await runAgentCli(args, "test");
    let json: Record<string, any> = {};
    try {
      if (out.length === 1) json = JSON.parse(out[0]!) as Record<string, any>;
    } catch {
      // help text: not JSON
    }
    return { code, err, json };
  } finally {
    console.log = original.log;
    process.stderr.write = original.write;
  }
}

async function file(root: string, name: string, content: string): Promise<string> {
  const path = join(root, "..", `${name}-${Math.random().toString(36).slice(2)}`);
  await writeFile(path, content, "utf8");
  return path;
}

const FIRST_SECTIONS = [
  { ref: "t1", parent: "themen", title: "Release-Termin", content: "Migration fertig, offen ist der Feinschliff an der Suche." },
  { parent: "t1", title: "Release am 5. November", kind: "decision", decision: "accepted" },
  { parent: "aufgaben", title: "Ankündigung vorbereiten", kind: "task", status: "open", assignee: "Entwicklung" },
  { parent: "fragen", title: "Englische Fassung nötig?" },
];

/** The second meeting: some nodes exist already (by title), some are new. */
const SECOND_SECTIONS = [
  { ref: "t1", parent: "themen", title: "Release-Termin", content: "Dieser Inhalt darf den vorhandenen nicht überschreiben." },
  { parent: "t1", title: "Feinschliff Suche erledigt" },
  { ref: "t2", parent: "themen", title: "Fehler im Import" },
  { parent: "t2", title: "Umlaute behoben", relations: [{ target: "Release-Termin", label: "betrifft" }, { target: "Gibt es nicht", label: "x" }] },
  { parent: "t2", title: "Leere Zeilen offen" },
  { parent: "aufgaben", title: "Ankündigung vorbereiten", kind: "task", status: "open" },
  { parent: "aufgaben", title: "Release-Hinweis klären", kind: "task", status: "open", content: "Mit dem Test klären, siehe [[Release-Termin]] und [[Keine Notiz]]." },
  { parent: "fragen", title: "Englische Fassung nötig?" },
];

/** First meeting as a new map (CLI, like part 1). */
async function create(root: string, title = "Wochenbesprechung Produktteam", template = "meeting", sections: unknown = FIRST_SECTIONS) {
  const run = await agent([
    "ingest", "--vault", root, "--name", "coder", "--vorlage", template, "--titel", title, "--text", FIRST,
    "--quelle", "fixtures/besprechung-transkript.txt", "--quelle-datum", "2026-10-20",
    "--abschnitte", await file(root, "abschnitte.json", JSON.stringify(sections)),
  ]);
  expect(run.code).toBe(EXIT.ok);
  return run.json.pfad as string;
}

/** `agent ingest --in-map`; `flags` override or add flags, `sections` are the agent's nodes. */
async function supplement(root: string, flags: Record<string, string> = {}, sections: unknown = SECOND_SECTIONS, map = MAP) {
  const all: Record<string, string> = {
    "--in-map": map,
    "--text": SECOND,
    "--quelle": "fixtures/besprechung-transkript-2.txt",
    "--quelle-datum": "2026-10-27",
    "--abschnitte": await file(root, "abschnitte.json", JSON.stringify(sections)),
    ...flags,
  };
  return agent(["ingest", "--vault", root, "--name", "coder", ...Object.entries(all).flat()]);
}

const read = (root: string, path = MAP) => readFile(join(root, path), "utf8");

async function markdownFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, prefix: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) await walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".md")) found.push(`${prefix}${entry.name}`);
    }
  };
  await walk(root, "");
  return found.sort();
}

const nodesOf = (markdown: string, path = MAP) => [...parseFile(path, markdown).nodes.values()];

/** Sibling nodes with the same normalized title. */
function twins(markdown: string): string[] {
  const seen = new Map<string, number>();
  for (const node of nodesOf(markdown)) {
    const key = `${node.parentId}|${normalizeKnowledgeTitle(node.title)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([key]) => key);
}

/** The text between the fences of the source node with this heading. */
function headingStart(markdown: string, heading: string): number {
  const found = new RegExp(`^### ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: <!--.*)?$`, "m").exec(markdown);
  if (!found) throw new Error(`no heading ${heading}`);
  return found.index;
}

function fencedText(markdown: string, heading: string): string {
  const after = markdown.slice(headingStart(markdown, heading));
  const open = /\n(`{3,})\n/.exec(after)!;
  const start = open.index + open[0].length;
  return after.slice(start, after.indexOf(`\n${open[1]}\n`, start));
}

const titleOf = (markdown: string, id: string) => nodesOf(markdown).find((node) => node.id === id)?.title;

describe("agent ingest --in-map: a second meeting supplements the map", () => {
  test("nodes are assigned by title instead of duplicated; the test counts the nodes", async () => {
    const root = await vault();
    await create(root);
    const before = await read(root);
    const countBefore = nodesOf(before).length;
    expect(twins(before)).toEqual([]);

    const run = await supplement(root);
    expect(run.err).toBe("");
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ ok: true, pfad: MAP, modus: "geschrieben", bereich: "Arbeit", abschnitte: 8, neu: 6, quellentitel: "Originaltext 2026-10-27" });
    expect(run.json.vorlage).toBeUndefined();
    expect(run.json.zugeordnet.map((entry: { titel: string }) => entry.titel).sort()).toEqual(["Ankündigung vorbereiten", "Englische Fassung nötig?", "Release-Termin"]);

    const after = await read(root);
    const nodes = nodesOf(after);
    // 8 sections, 3 of them already there; plus the source node: no duplicates
    expect(nodes.length).toBe(countBefore + 5 + 1);
    expect(twins(after)).toEqual([]);
    expect(nodes.filter((node) => node.title === "Release-Termin")).toHaveLength(1);
    expect(nodes.filter((node) => node.title === "Ankündigung vorbereiten")).toHaveLength(1);

    // new children hang below the existing node; its content stays
    const release = nodes.find((node) => node.title === "Release-Termin")!;
    expect(release.content.trim()).toBe("Migration fertig, offen ist der Feinschliff an der Suche.");
    expect(nodes.find((node) => node.title === "Feinschliff Suche erledigt")!.parentId).toBe(release.id);
    expect(titleOf(after, nodes.find((node) => node.title === "Umlaute behoben")!.parentId!)).toBe("Fehler im Import");
    expect(titleOf(after, nodes.find((node) => node.title === "Fehler im Import")!.parentId!)).toBe("Themen");
    expect(titleOf(after, nodes.find((node) => node.title === "Release-Hinweis klären")!.parentId!)).toBe("Aufgaben");
    // the existing tasks and decisions are untouched
    expect(nodes.find((node) => node.title === "Ankündigung vorbereiten")!.metadata).toMatchObject({ kind: "task", status: "open", assignee: "Entwicklung" });
  });

  test("the result has no lint findings", async () => {
    const root = await vault();
    await create(root);
    // [[Notiz]] links to notes that are no files of this workspace are what lint reports, so the sections use relations only
    const plain = SECOND_SECTIONS.map((node) => ({ ...node, content: node.title === "Release-Hinweis klären" ? "Mit dem Test klären." : node.content, relations: node.relations?.filter((relation) => relation.target !== "Gibt es nicht") }));
    expect((await supplement(root, {}, plain)).code).toBe(EXIT.ok);
    expect(lintWorkspace([{ path: MAP, markdown: await read(root) }]).findings).toEqual([]);
  });

  test("undo restores the map as it was before the supplement", async () => {
    const root = await vault();
    await create(root);
    const before = await read(root);
    const run = await supplement(root);
    expect(run.json.aenderung).toBeString();
    expect(await read(root)).not.toBe(before);
    const log = await agent(["log", root]);
    expect(log.json.changes.find((change: { changeId: string }) => change.changeId === run.json.aenderung)).toMatchObject({ event: "written", tool: "bloommd_ingest", path: MAP, changeId: run.json.aenderung });
    expect((await agent(["undo", root, run.json.aenderung])).code).toBe(0);
    expect(await read(root)).toBe(before);
  });

  test("the source: one more node below Quellen with citation, the old source stays byte for byte", async () => {
    const root = await vault();
    await create(root);
    const before = await read(root);
    const run = await supplement(root);
    const after = await read(root);
    const nodes = nodesOf(after);
    const added = nodes.find((node) => node.title === "Originaltext 2026-10-27")!;
    expect(added.id).toBe(run.json.quellknoten);
    expect(added.metadata).toMatchObject({ kind: "source", citation: "fixtures/besprechung-transkript-2.txt, 2026-10-27" });
    expect(titleOf(after, added.parentId!)).toBe("Quellen");
    expect(fencedText(after, "Originaltext 2026-10-27")).toBe(await readFile(SECOND, "utf8"));
    // the first source: same text, same citation, and its lines are all still in the file
    expect(fencedText(after, "Originaltext")).toBe(await readFile(FIRST, "utf8"));
    expect(nodes.find((node) => node.title === "Originaltext")!.metadata).toMatchObject({ kind: "source", citation: "fixtures/besprechung-transkript.txt, 2026-10-20" });
    // the old source node is the last node of the map: its whole text is still there as it was
    expect(after).toContain(before.slice(headingStart(before, "Originaltext")).trimEnd());
  });

  test("an http(s) source also becomes the url; without a date the title carries the source", async () => {
    const root = await vault();
    await create(root);
    const noDate = await agent(["ingest", "--vault", root, "--name", "coder", "--in-map", MAP, "--text", SECOND, "--quelle", "https://example.org/protokoll-2"]);
    expect(noDate.code).toBe(EXIT.ok);
    expect(noDate.json.quellentitel).toBe("Originaltext https://example.org/protokoll-2");
    expect(await read(root)).toContain('"url":"https://example.org/protokoll-2"');
  });

  test("a title collision gets a suffix; a Quellen node is created when the map has none", async () => {
    const root = await vault();
    await create(root);
    expect((await supplement(root, { "--quelle": "a.txt" }, [])).json.quellentitel).toBe("Originaltext 2026-10-27");
    expect((await supplement(root, { "--quelle": "b.txt" }, [])).json.quellentitel).toBe("Originaltext 2026-10-27 (2)");
    expect((await supplement(root, { "--quelle": "c.txt" }, [])).json.quellentitel).toBe("Originaltext 2026-10-27 (3)");

    const weekly = await vault();
    const path = await create(weekly, "Wochenrückblick", "weekly", []);
    expect(nodesOf(await read(weekly, path), path).some((node) => node.title === "Quellen")).toBe(true);
    // a map without Quellen at all
    const bare = await vault();
    await writeFile(join(bare, "Notiz.md"), "---\ntitle: \"Notiz\"\n---\n\n# Notiz\n\n## Idee\n", "utf8");
    const run = await supplement(bare, {}, [{ title: "Neu", parent: "quellen" }], "Notiz.md");
    expect(run.code).toBe(EXIT.ok);
    const markdown = await read(bare, "Notiz.md");
    const nodes = nodesOf(markdown, "Notiz.md");
    expect(nodes.filter((node) => node.title === "Quellen")).toHaveLength(1);
    expect(titleOf(markdown, nodes.find((node) => node.title === "Originaltext 2026-10-27")!.parentId!)).toBe("Quellen");
    expect(titleOf(markdown, nodes.find((node) => node.title === "Neu")!.parentId!)).toBe("Quellen");
  });

  test("the same recording twice is a duplicate: exit 3, path, nothing written", async () => {
    const root = await vault();
    await create(root);
    expect((await supplement(root)).code).toBe(EXIT.ok);
    const before = await read(root);
    const again = await supplement(root);
    expect(again.code).toBe(EXIT.duplicate);
    expect(again.json).toMatchObject({ duplicate: true, pfad: MAP });
    expect(again.json.fehler).toContain(MAP);
    expect(await read(root)).toBe(before);
    // a source node with the citation of the first ingest counts, too
    const first = await supplement(root, { "--text": FIRST, "--quelle": "fixtures/besprechung-transkript.txt", "--quelle-datum": "2026-10-20" }, []);
    expect(first.code).toBe(EXIT.duplicate);
    expect(await read(root)).toBe(before);
    // another date or source is another recording
    expect((await supplement(root, { "--quelle-datum": "2026-10-28" }, [])).code).toBe(EXIT.ok);
  });

  test("a repeated section list does not create anything twice", async () => {
    const root = await vault();
    await create(root);
    await supplement(root);
    const count = nodesOf(await read(root)).length;
    const again = await supplement(root, { "--quelle": "fixtures/besprechung-transkript-2.txt", "--quelle-datum": "2026-10-28" });
    expect(again.code).toBe(EXIT.ok);
    expect(again.json.neu).toBe(1);
    expect(nodesOf(await read(root)).length).toBe(count + 1);
    expect(twins(await read(root))).toEqual([]);
  });
});

describe("agent ingest --in-map: relations and [[links]]", () => {
  test("unambiguous targets are connected (title and [[Notiz]]); unknown targets are a hint", async () => {
    const root = await vault();
    await create(root);
    const run = await supplement(root);
    const markdown = await read(root);
    const nodes = nodesOf(markdown);
    const release = nodes.find((node) => node.title === "Release-Termin")!;
    expect(nodes.find((node) => node.title === "Umlaute behoben")!.metadata?.relations).toEqual([{ target: release.id, label: "betrifft" }]);
    expect(nodes.find((node) => node.title === "Release-Hinweis klären")!.metadata?.relations).toEqual([{ target: release.id }]);
    expect(run.json.hinweise).toEqual([expect.stringContaining("„Gibt es nicht“: kein Knoten gefunden")]);
    // [[Keine Notiz]] is an ordinary note link: no hint, content unchanged
    expect(nodes.find((node) => node.title === "Release-Hinweis klären")!.content).toContain("[[Keine Notiz]]");
    expect(run.json.hinweise.join("\n")).not.toContain("Keine Notiz");
  });

  test("a ref of the list and a node id of the map also work as relation targets", async () => {
    const root = await vault();
    await create(root);
    const themen = nodesOf(await read(root)).find((node) => node.title === "Themen")!;
    const run = await supplement(root, {}, [
      { ref: "a", parent: "themen", title: "Alpha" },
      { parent: "themen", title: "Beta", relations: [{ target: "a", label: "folgt" }, { target: themen.id }] },
    ]);
    expect(run.code).toBe(EXIT.ok);
    const nodes = nodesOf(await read(root));
    const alpha = nodes.find((node) => node.title === "Alpha")!;
    expect(nodes.find((node) => node.title === "Beta")!.metadata?.relations).toEqual([{ target: alpha.id, label: "folgt" }, { target: themen.id }]);
    expect(run.json.hinweise).toEqual([]);
  });

  test("an ambiguous title: the node is created again with a hint, no relation, no [[link]]", async () => {
    const root = await vault();
    const knowledge = new KnowledgeService(new VaultKnowledgeStore(root), "coder");
    await knowledge.createMap({
      area: "Arbeit",
      title: "Planung",
      template: "meeting",
      nodes: [{ parent: "themen", title: "Budget" }, { parent: "themen", title: "budget!" }, { parent: "themen", title: "Zeitplan" }],
    });
    const before = await read(root, "Arbeit/Planung.md");
    const run = await supplement(root, {}, [
      { parent: "themen", title: "Budget", content: "Neu zu Budget." },
      { parent: "themen", title: "Termine", content: "Siehe [[Budget]] und [[Zeitplan]].", relations: [{ target: "BUDGET" }] },
    ], "Arbeit/Planung.md");
    expect(run.code).toBe(EXIT.ok);
    const markdown = await read(root, "Arbeit/Planung.md");
    const nodes = nodesOf(markdown, "Arbeit/Planung.md");
    // Budget exists twice: the new one is a third node, nothing is matched
    expect(nodes.filter((node) => normalizeKnowledgeTitle(node.title) === "budget")).toHaveLength(3);
    expect(run.json.zugeordnet).toEqual([]);
    expect(run.json.hinweise.filter((hint: string) => hint.includes("mehrdeutig"))).toHaveLength(3);
    const termine = nodes.find((node) => node.title === "Termine")!;
    expect(termine.metadata?.relations).toEqual([{ target: nodes.find((node) => node.title === "Zeitplan")!.id }]);
    expect(markdown.length).toBeGreaterThan(before.length);
  });
});

describe("agent ingest --in-map: parents", () => {
  test("a node id of the map is a parent; so is a skeleton ref by the title of the skeleton node", async () => {
    const root = await vault();
    await create(root);
    const decision = nodesOf(await read(root)).find((node) => node.title === "Release am 5. November")!;
    const run = await supplement(root, {}, [{ parent: decision.id, title: "Begründung" }, { parent: "entscheidungen", title: "Termin bestätigt" }]);
    expect(run.code).toBe(EXIT.ok);
    const markdown = await read(root);
    const nodes = nodesOf(markdown);
    expect(nodes.find((node) => node.title === "Begründung")!.parentId).toBe(decision.id);
    expect(titleOf(markdown, nodes.find((node) => node.title === "Termin bestätigt")!.parentId!)).toBe("Entscheidungen");
  });

  test("an unresolvable parent is exit 2 and nothing is written", async () => {
    const root = await vault();
    await create(root);
    const before = await read(root);
    for (const parent of ["pakete", "gibt-es-nicht", "n-gibtsnicht"]) {
      const run = await supplement(root, {}, [{ parent: "themen", title: "Gut" }, { parent, title: "Schlecht" }]);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toMatch(new RegExp(`parent "${parent}".*nicht auflösen.*Nichts wurde geschrieben`));
    }
    // a ref defined only later in the list is not known yet
    expect((await supplement(root, {}, [{ parent: "spaeter", title: "A" }, { ref: "spaeter", parent: "themen", title: "B" }])).code).toBe(EXIT.usage);
    expect(await read(root)).toBe(before);
  });

  test("an existing node cannot be changed through the list (id), refs must be unique", async () => {
    const root = await vault();
    await create(root);
    const before = await read(root);
    const themen = nodesOf(before).find((node) => node.title === "Themen")!;
    expect((await supplement(root, {}, [{ id: themen.id, content: "überschrieben" }])).code).toBe(EXIT.usage);
    expect((await supplement(root, {}, [{ ref: "x", parent: "themen", title: "A" }, { ref: "x", parent: "themen", title: "B" }])).code).toBe(EXIT.usage);
    expect(await read(root)).toBe(before);
  });
});

describe("agent ingest --in-map: target map and parameters", () => {
  test("a missing target map is exit 2 with a clear message; nothing is written", async () => {
    const root = await vault();
    const run = await supplement(root, {}, SECOND_SECTIONS, "Arbeit/Gibt es nicht.md");
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toMatch(/Die Ziel-Map "Arbeit\/Gibt es nicht\.md" gibt es nicht.*Nichts wurde geschrieben/);
    expect(await markdownFiles(root)).toEqual([]);
    expect((await supplement(root, {}, [], "../draussen.md")).code).toBe(EXIT.usage);
    expect((await supplement(root, { "--in-map": " " })).code).toBe(EXIT.usage);
  });

  test("--vorlage, --titel and --bereich are not allowed with --in-map", async () => {
    const root = await vault();
    await create(root);
    const before = await read(root);
    for (const flags of [{ "--vorlage": "meeting" }, { "--titel": "Anders" }, { "--bereich": "Arbeit" }] as Array<Record<string, string>>) {
      const run = await supplement(root, flags);
      expect(run.code).toBe(EXIT.usage);
      expect(run.json.fehler).toContain(Object.keys(flags)[0]!);
      expect(run.json.fehler).toContain("--in-map");
    }
    expect(await read(root)).toBe(before);
    // without --in-map the old rules stay: template and title are required
    const plain = await agent(["ingest", "--vault", root, "--name", "coder", "--text", SECOND, "--quelle", "x"]);
    expect(plain.code).toBe(EXIT.usage);
    expect(plain.json.fehler).toContain("--vorlage fehlt");
  });

  test("--quelle is required; limits, reserved ref and BloomMD comment are refused like in part 1", async () => {
    const root = await vault();
    await create(root);
    const before = await read(root);
    const flagsWithoutSource = { "--in-map": MAP, "--text": SECOND };
    const noSource = await agent(["ingest", "--vault", root, "--name", "coder", ...Object.entries(flagsWithoutSource).flat()]);
    expect(noSource.code).toBe(EXIT.usage);
    expect(noSource.json.fehler).toMatch(/Fehlende Quelle/);
    const long = await supplement(root, { "--text": await file(root, "lang.txt", "x".repeat(INGEST_MAX_TEXT_CHARS + 1)) });
    expect(long.code).toBe(EXIT.usage);
    expect(long.json.fehler).toMatch(/200001 characters, at most 200000/);
    const many = await supplement(root, {}, Array.from({ length: INGEST_MAX_NODES + 1 }, (_, index) => ({ parent: "themen", title: `K${index}` })));
    expect(many.code).toBe(EXIT.usage);
    expect(many.json.fehler).toMatch(/151 nodes, at most 150/);
    expect((await supplement(root, {}, [{ ref: "originaltext", parent: "themen", title: "X" }])).code).toBe(EXIT.usage);
    expect((await supplement(root, { "--text": await file(root, "kommentar.txt", "Text <!-- bloommd:id=x --> Ende") })).code).toBe(EXIT.usage);
    expect((await supplement(root, { "--quelle-datum": "2026-02-30" })).code).toBe(EXIT.usage);
    expect(await read(root)).toBe(before);
  });

  test("--help and the usage name --in-map", async () => {
    const help = await agent(["ingest", "--help"]);
    expect(help.code).toBe(EXIT.ok);
    expect(AGENT_USAGE).toContain("agent ingest --in-map <pfad>");
    const out: string[] = [];
    const log = console.log;
    console.log = (...values: unknown[]) => void out.push(values.join(" "));
    try {
      await runLearningCommand("ingest", ["--help"], learningDeps);
    } finally {
      console.log = log;
    }
    expect(out.join("\n")).toMatch(/--in-map <pfad>.*\n[\s\S]*mehrdeutig/);
  });
});

describe("agent ingest --in-map: rights", () => {
  test("write: written and logged (see undo above)", async () => {
    const root = await vault("write");
    await create(root);
    expect((await supplement(root)).json.modus).toBe("geschrieben");
  });

  test("propose: only a proposal, the map stays; a person approves it with agent approve", async () => {
    const root = await vault("write");
    await create(root);
    const before = await read(root);
    await writeAccessConfig(join(root, ".bloommd"), { access: "propose", areas: {} });
    const run = await supplement(root);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ modus: "vorgeschlagen" });
    expect(run.json.vorschlag).toBeString();
    expect(run.json.hinweis).toMatch(/agent approve/);
    expect(await read(root)).toBe(before);
    const proposals = await agent(["proposals", root]);
    expect(proposals.json).toEqual([expect.objectContaining({ id: run.json.vorschlag, tool: "bloommd_ingest", path: MAP })]);
    expect((await agent(["approve", root, run.json.vorschlag, "--reviewer", "Max"])).code).toBe(0);
    const after = await read(root);
    expect(fencedText(after, "Originaltext 2026-10-27")).toBe(await readFile(SECOND, "utf8"));
    expect(twins(after)).toEqual([]);
  });

  test("read: refused, nothing written, no proposal", async () => {
    const root = await vault("write");
    await create(root);
    const before = await read(root);
    await writeAccessConfig(join(root, ".bloommd"), { access: "read", areas: {} });
    const run = await supplement(root);
    expect(run.code).toBe(EXIT.error);
    expect(run.json.fehler).toMatch(/may only read in "Arbeit"/);
    expect(await read(root)).toBe(before);
    expect((await agent(["proposals", root])).json).toEqual([]);
  });
});

describe("bloommd_ingest with inMap (MCP)", () => {
  async function service() {
    const root = await vault();
    return { root, service: new KnowledgeService(new VaultKnowledgeStore(root), "OpenClaw") };
  }

  test("the schema lists inMap; template and title are checked at run time", () => {
    const tool = KNOWLEDGE_TOOLS.find((entry) => entry.name === "bloommd_ingest")!;
    const schema = tool.inputSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.properties.inMap).toBeDefined();
    expect(schema.required).toEqual(["text", "source"]);
    expect(tool.description).toMatch(/inMap/);
  });

  test("adds to the map like the CLI, without template and title", async () => {
    const { root, service: knowledge } = await service();
    const call = knowledgeServerOptions({ vault: knowledge }, "test").call;
    await call("bloommd_ingest", { template: "meeting", title: "Wochenbesprechung Produktteam", text: await readFile(FIRST, "utf8"), source: "fixtures/besprechung-transkript.txt", sourceDate: "2026-10-20", nodes: FIRST_SECTIONS });
    const result = (await call("bloommd_ingest", { inMap: MAP, text: await readFile(SECOND, "utf8"), source: "fixtures/besprechung-transkript-2.txt", sourceDate: "2026-10-27", nodes: SECOND_SECTIONS })) as { path: string; mode: string; matched: unknown[]; hinweise: string[]; sourceNode: string; created: string[] };
    expect(result).toMatchObject({ path: MAP, mode: "written" });
    expect(result.matched).toHaveLength(3);
    expect(result.hinweise).toHaveLength(1);
    expect(result.created).toHaveLength(6);
    const markdown = await read(root);
    expect(twins(markdown)).toEqual([]);
    expect(titleOf(markdown, result.sourceNode)).toBe("Originaltext 2026-10-27");
    await expect(call("bloommd_ingest", { inMap: MAP, text: await readFile(SECOND, "utf8"), source: "fixtures/besprechung-transkript-2.txt", sourceDate: "2026-10-27" })).rejects.toThrow(/schon als Knoten/);
  });

  test("rights, missing map, forbidden fields and required fields", async () => {
    const { root, service: knowledge } = await service();
    const call = knowledgeServerOptions({ vault: knowledge }, "test").call;
    await call("bloommd_ingest", { template: "meeting", title: "Plan", text: "Text", source: "x" });
    const input = { inMap: "Arbeit/Plan.md", text: "Zweiter Text", source: "y" };
    await expect(call("bloommd_ingest", { ...input, inMap: "Arbeit/Nope.md" })).rejects.toThrow(/gibt es nicht/);
    await expect(call("bloommd_ingest", { ...input, template: "meeting" })).rejects.toThrow(/template must not be given/);
    await expect(call("bloommd_ingest", { ...input, title: "T", area: "Arbeit" })).rejects.toThrow(/title, area must not be given/);
    await expect(call("bloommd_ingest", { text: "Text", source: "z", title: "T" })).rejects.toThrow(/"template" must be a non-empty string/);
    await expect(call("bloommd_ingest", { text: "Text", source: "z", template: "meeting" })).rejects.toThrow(/"title" must be a non-empty string/);
    await expect(call("bloommd_ingest", { ...input, source: " " })).rejects.toThrow(/"source" must be a non-empty string/);
    const before = await read(root, "Arbeit/Plan.md");

    await writeAccessConfig(join(root, ".bloommd"), { access: "read", areas: {} });
    await expect(call("bloommd_ingest", input)).rejects.toThrow(/may only read/);
    await writeAccessConfig(join(root, ".bloommd"), { access: "propose", areas: {} });
    expect(await call("bloommd_ingest", input)).toMatchObject({ mode: "proposed" });
    expect(await read(root, "Arbeit/Plan.md")).toBe(before);
  });
});
