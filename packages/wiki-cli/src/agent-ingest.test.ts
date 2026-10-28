import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintWorkspace } from "@bloommd/core";
import { parseFile } from "@bloommd/core/parser";
import { AGENT_USAGE, learningDeps, runAgentCli } from "./agent-cli";
import { EXIT, runLearningCommand, type LearningDeps } from "./agent-learnings";
import { knowledgeServerOptions, KNOWLEDGE_TOOLS } from "./knowledge-mcp";
import { INGEST_MAX_NODES, INGEST_MAX_TEXT_CHARS, KnowledgeService } from "./knowledge-service";
import { VaultKnowledgeStore, writeAccessConfig } from "./knowledge-store";

type Access = "read" | "propose" | "write";

const TRANSCRIPT = join(import.meta.dir, "fixtures", "besprechung-transkript.txt");

async function vault(access: Access = "write") {
  const root = await mkdtemp(join(tmpdir(), "bloommd-ingest-"));
  await writeAccessConfig(join(root, ".bloommd"), { access, areas: {} });
  return root;
}

interface Run {
  code: number;
  err: string;
  json: Record<string, any>;
}

async function agent(args: string[], deps?: LearningDeps): Promise<Run> {
  const original = { log: console.log, write: process.stderr.write };
  const out: string[] = [];
  let err = "";
  console.log = (...values: unknown[]) => void out.push(values.join(" "));
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = deps ? await runLearningCommand(args[0]!, args.slice(1), deps) : await runAgentCli(args, "test");
    let json: Record<string, any> = {};
    try {
      if (out.length === 1) json = JSON.parse(out[0]!) as Record<string, any>;
    } catch {
      // help text: not JSON
    }
    return Object.assign({ code, err, json }, { out });
  } finally {
    console.log = original.log;
    process.stderr.write = original.write;
  }
}

const SECTIONS = [
  { ref: "t1", parent: "themen", title: "Release-Termin", content: "Migration fertig, offen ist der Feinschliff an der Suche." },
  { parent: "t1", title: "Release am 5. November", kind: "decision", decision: "accepted" },
  { parent: "aufgaben", title: "Ankündigung vorbereiten", kind: "task", status: "open", assignee: "Entwicklung" },
  { parent: "fragen", title: "Englische Fassung nötig?" },
];

async function files(root: string, name: string, content: string): Promise<string> {
  const path = join(root, "..", `${name}-${Math.random().toString(36).slice(2)}`);
  await writeFile(path, content, "utf8");
  return path;
}

/** `ingest` with the example transcript; `extra` overrides or adds flags. */
async function ingest(root: string, flags: Record<string, string> = {}, options: { title?: string; sections?: unknown } = {}) {
  const all: Record<string, string> = {
    "--vorlage": "meeting",
    "--titel": options.title ?? "Wochenbesprechung Produktteam",
    "--text": TRANSCRIPT,
    "--quelle": "fixtures/besprechung-transkript.txt",
    "--quelle-datum": "2026-10-20",
    "--abschnitte": await files(root, "abschnitte.json", JSON.stringify(options.sections ?? SECTIONS)),
    ...flags,
  };
  return agent(["ingest", "--vault", root, "--name", "coder", ...Object.entries(all).flat()]);
}

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

/** The text between the fences of the source node, as written in the file. */
function fencedText(markdown: string): string {
  const after = markdown.slice(markdown.indexOf("### Originaltext"));
  const open = /\n(`{3,})\n/.exec(after)!;
  const start = open.index + open[0].length;
  const end = after.indexOf(`\n${open[1]}\n`, start);
  return after.slice(start, end);
}

describe("agent ingest: file a transcript as a map", () => {
  test("a German transcript becomes a meeting map; the source stands word for word as kind: source", async () => {
    const root = await vault();
    const run = await ingest(root);
    expect(run.err).toBe("");
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ ok: true, pfad: "Arbeit/Wochenbesprechung Produktteam.md", bereich: "Arbeit", vorlage: "meeting", modus: "geschrieben", abschnitte: 4 });
    const original = await readFile(TRANSCRIPT, "utf8");
    expect(run.json.zeichen).toBe([...original].length);

    const markdown = await readFile(join(root, run.json.pfad), "utf8");
    expect(fencedText(markdown)).toBe(original);
    const doc = parseFile(run.json.pfad, markdown);
    const nodes = [...doc.nodes.values()];
    const source = nodes.find((node) => node.title === "Originaltext")!;
    expect(source.metadata).toMatchObject({ kind: "source", citation: "fixtures/besprechung-transkript.txt, 2026-10-20" });
    expect(source.id).toBe(run.json.quellknoten);
    expect(nodes.find((node) => node.id === source.parentId)?.title).toBe("Quellen");
    // the skeleton and the agent's sections hang where the template says
    const parent = (title: string) => nodes.find((node) => node.id === nodes.find((entry) => entry.title === title)!.parentId)?.title;
    expect(parent("Release-Termin")).toBe("Themen");
    expect(parent("Release am 5. November")).toBe("Release-Termin");
    expect(parent("Ankündigung vorbereiten")).toBe("Aufgaben");
    expect(markdown).toContain('source: "fixtures/besprechung-transkript.txt, 2026-10-20"');
  });

  test("the result has no lint findings", async () => {
    const root = await vault();
    const run = await ingest(root);
    const content = await readFile(join(root, run.json.pfad), "utf8");
    const result = lintWorkspace([{ path: run.json.pfad, markdown: content }]);
    expect(result.findings).toEqual([]);
  });

  test("an http(s) source also becomes the url of the source node", async () => {
    const root = await vault();
    const other = await ingest(root, { "--vorlage": "conversation", "--titel": "Gespräch mit Link", "--quelle": "https://example.org/protokoll", "--quelle-datum": "2026-10-20" }, { sections: [] });
    expect(other.code).toBe(EXIT.ok);
    const markdown = await readFile(join(root, other.json.pfad), "utf8");
    expect(other.json.bereich).toBe("Gespräche");
    expect(markdown).toContain('"url":"https://example.org/protokoll"');
    expect(markdown).toContain('"citation":"https://example.org/protokoll, 2026-10-20"');
  });

  test("a template without a Quellen node (weekly) gets one", async () => {
    const root = await vault();
    const run = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "weekly", "--titel", "Woche 43", "--text", TRANSCRIPT, "--quelle", "Ticket #144", "--abschnitte", await files(root, "a.json", JSON.stringify([{ parent: "erledigt", title: "Release vorbereitet" }]))]);
    expect(run.code).toBe(EXIT.ok);
    const markdown = await readFile(join(root, run.json.pfad), "utf8");
    const nodes = [...parseFile(run.json.pfad, markdown).nodes.values()];
    const sources = nodes.filter((node) => node.metadata?.kind === "source");
    expect(sources.map((node) => node.title)).toEqual(["Quellen", "Originaltext"]);
    expect(fencedText(markdown)).toBe(await readFile(TRANSCRIPT, "utf8"));
  });

  test("the text is kept as written: headings, rules, fences, comments, blanks and spaces stay", async () => {
    const root = await vault();
    const text = "  führende Leerzeichen\tund Tab  \n# Überschrift im Text\nSetext\n======\n````\n<!-- ein normaler Kommentar -->\n- [ ] Liste\n\n\n   \n";
    const run = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "discussion", "--titel", "Randfälle", "--text", await files(root, "edge.txt", text), "--quelle", "edge.txt"]);
    expect(run.code).toBe(EXIT.ok);
    const markdown = await readFile(join(root, run.json.pfad), "utf8");
    expect(fencedText(markdown)).toBe(text);
    // no stray nodes from the headings inside the text
    const titles = [...parseFile(run.json.pfad, markdown).nodes.values()].map((node) => node.title);
    expect(titles).not.toContain("Überschrift im Text");
    expect(titles).not.toContain("Setext");
  });

  test("line breaks are stored as \\n (the one change BloomMD files make); everything else is untouched", async () => {
    const root = await vault();
    const run = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "conversation", "--titel", "Windows-Text", "--text", await files(root, "crlf.txt", "Zeile eins\r\nZeile zwei\r\n"), "--quelle", "crlf.txt"]);
    expect(run.code).toBe(EXIT.ok);
    expect(fencedText(await readFile(join(root, run.json.pfad), "utf8"))).toBe("Zeile eins\nZeile zwei\n");
  });

  test("the original text can come from stdin; only one input may be stdin", async () => {
    const root = await vault();
    const deps: LearningDeps = { ...learningDeps, stdin: () => "Notiz aus stdin" };
    const run = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "lesson", "--titel", "Aus stdin", "--text", "-", "--quelle", "stdin"], deps);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.bereich).toBe("Schule");
    expect(fencedText(await readFile(join(root, run.json.pfad), "utf8"))).toBe("Notiz aus stdin");

    const both = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "lesson", "--titel", "Zwei", "--text", "-", "--quelle", "stdin", "--abschnitte", "-"], { ...deps, stdin: () => { throw new Error("stdin must not be read"); } });
    expect(both.code).toBe(EXIT.usage);
    expect(both.json.fehler).toMatch(/Nur ein Eingang darf stdin/);
    expect(await markdownFiles(root)).toEqual(["Schule/Aus stdin.md"]);
  });

  test("the area can be chosen; the same title in another area is no duplicate", async () => {
    const root = await vault();
    expect((await ingest(root)).code).toBe(EXIT.ok);
    const other = await ingest(root, { "--bereich": "Projekte/BloomMD" });
    expect(other.code).toBe(EXIT.ok);
    expect(other.json.pfad).toBe("Projekte/BloomMD/Wochenbesprechung Produktteam.md");
  });
});

describe("agent ingest: rights, proposals, log and undo", () => {
  test("write: written, logged and undoable", async () => {
    const root = await vault("write");
    const run = await ingest(root);
    expect(run.json.modus).toBe("geschrieben");
    const log = await agent(["log", root]);
    expect(log.json.changes).toEqual([expect.objectContaining({ event: "written", tool: "bloommd_ingest", path: run.json.pfad, changeId: run.json.aenderung, source: "fixtures/besprechung-transkript.txt, 2026-10-20" })]);
    const undo = await agent(["undo", root, run.json.aenderung]);
    expect(undo.code).toBe(0);
    expect(await markdownFiles(root)).toEqual([]);
  });

  test("propose: only a proposal; a person approves it with agent approve", async () => {
    const root = await vault("propose");
    const run = await ingest(root);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ modus: "vorgeschlagen" });
    expect(run.json.vorschlag).toBeString();
    expect(run.json.hinweis).toMatch(/agent approve/);
    expect(await markdownFiles(root)).toEqual([]);
    const proposals = await agent(["proposals", root]);
    expect(proposals.json).toEqual([expect.objectContaining({ id: run.json.vorschlag, tool: "bloommd_ingest", path: run.json.pfad })]);
    const approved = await agent(["approve", root, run.json.vorschlag, "--reviewer", "Max"]);
    expect(approved.code).toBe(0);
    expect(fencedText(await readFile(join(root, run.json.pfad), "utf8"))).toBe(await readFile(TRANSCRIPT, "utf8"));
  });

  test("read: refused, nothing written, no proposal", async () => {
    const root = await vault("read");
    const run = await ingest(root);
    expect(run.code).toBe(EXIT.error);
    expect(run.json.fehler).toMatch(/may only read in "Arbeit"/);
    expect(await markdownFiles(root)).toEqual([]);
    expect((await agent(["proposals", root])).json).toEqual([]);
  });

  test("the rights of an area apply to the area given with --bereich", async () => {
    const root = await vault("read");
    await writeAccessConfig(join(root, ".bloommd"), { access: "read", areas: { "Projekte/BloomMD": "write" } });
    expect((await ingest(root)).code).toBe(EXIT.error);
    expect((await ingest(root, { "--bereich": "Projekte/BloomMD" })).json.modus).toBe("geschrieben");
  });
});

describe("agent ingest: duplicate", () => {
  test("the same title in the same area is refused with exit 3 and the path; nothing new is written", async () => {
    const root = await vault();
    const first = await ingest(root);
    const again = await ingest(root, {}, { title: "wochenbesprechung  PRODUKTTEAM!" });
    expect(again.code).toBe(EXIT.duplicate);
    expect(again.json).toMatchObject({ duplicate: true, pfad: first.json.pfad, bereich: "Arbeit" });
    expect(again.json.fehler).toContain(first.json.pfad);
    expect(await markdownFiles(root)).toEqual([first.json.pfad]);
  });

  test("a vault title with characters a file name drops still counts as the same title", async () => {
    const root = await vault();
    expect((await ingest(root, {}, { title: "Planung: Q4 / Budget?" })).code).toBe(EXIT.ok);
    expect((await ingest(root, {}, { title: "Planung: Q4 / Budget?" })).code).toBe(EXIT.duplicate);
  });

  test("a duplicate is no write: --force does not exist", async () => {
    const root = await vault();
    await ingest(root);
    const run = await ingest(root, { "--force": "1" });
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toMatch(/Unbekannte Option --force/);
  });
});

describe("agent ingest: limits and missing input", () => {
  test("original text over the limit: clear message with actual and limit, nothing written", async () => {
    const root = await vault();
    const long = await files(root, "lang.txt", "x".repeat(INGEST_MAX_TEXT_CHARS + 1));
    const run = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "meeting", "--titel", "Zu lang", "--text", long, "--quelle", "lang.txt"]);
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toContain(`${INGEST_MAX_TEXT_CHARS + 1} characters`);
    expect(run.json.fehler).toContain(`at most ${INGEST_MAX_TEXT_CHARS}`);
    expect(await markdownFiles(root)).toEqual([]);
  });

  test("exactly the limit is accepted; characters count as code points", async () => {
    const root = await vault();
    const atLimit = await files(root, "grenze.txt", "ä".repeat(INGEST_MAX_TEXT_CHARS));
    const run = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "meeting", "--titel", "Grenze", "--text", atLimit, "--quelle", "grenze.txt"]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.zeichen).toBe(INGEST_MAX_TEXT_CHARS);
    expect(fencedText(await readFile(join(root, run.json.pfad), "utf8"))).toHaveLength(INGEST_MAX_TEXT_CHARS);
  });

  test("more sections than the limit: clear message with actual and limit, nothing written", async () => {
    const root = await vault();
    const nodes = Array.from({ length: INGEST_MAX_NODES + 1 }, (_, index) => ({ parent: "themen", title: `Thema ${index + 1}` }));
    const run = await ingest(root, {}, { sections: nodes });
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toContain(`${INGEST_MAX_NODES + 1} nodes`);
    expect(run.json.fehler).toContain(`at most ${INGEST_MAX_NODES}`);
    expect(await markdownFiles(root)).toEqual([]);
    const ok = await ingest(root, {}, { sections: nodes.slice(0, INGEST_MAX_NODES) });
    expect(ok.code).toBe(EXIT.ok);
    expect(ok.json.abschnitte).toBe(INGEST_MAX_NODES);
  });

  test("missing source: no reference, no text or an empty text is refused as 'Fehlende Quelle'", async () => {
    const root = await vault();
    const base = ["ingest", "--vault", root, "--name", "coder", "--vorlage", "meeting", "--titel", "Ohne Quelle"];
    const noRef = await agent([...base, "--text", TRANSCRIPT]);
    expect(noRef.code).toBe(EXIT.usage);
    expect(noRef.json.fehler).toMatch(/Fehlende Quelle.*--quelle/);
    const noText = await agent([...base, "--quelle", "x.txt"]);
    expect(noText.code).toBe(EXIT.usage);
    expect(noText.json.fehler).toMatch(/Fehlende Quelle.*--text/);
    const empty = await agent([...base, "--quelle", "x.txt", "--text", await files(root, "leer.txt", " \n\t\n")]);
    expect(empty.code).toBe(EXIT.usage);
    expect(empty.json.fehler).toMatch(/Missing source: the original text is missing or empty/);
    const blankRef = await agent([...base, "--quelle", "   ", "--text", TRANSCRIPT]);
    expect(blankRef.code).toBe(EXIT.usage);
    expect(await markdownFiles(root)).toEqual([]);
  });

  test("templates: learning is refused, an unknown one fails like create, a missing file is a usage error", async () => {
    const root = await vault();
    const learning = await ingest(root, { "--vorlage": "learning" });
    expect(learning.code).toBe(EXIT.usage);
    expect(learning.json.fehler).toMatch(/agent create/);
    const unknown = await ingest(root, { "--vorlage": "gibtsnicht" });
    expect(unknown.code).toBe(EXIT.error);
    expect(unknown.json.fehler).toMatch(/Unknown template "gibtsnicht"/);
    const missingFile = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "meeting", "--titel", "X", "--text", join(root, "gibt-es-nicht.txt"), "--quelle", "x"]);
    expect(missingFile.code).toBe(EXIT.usage);
    expect(await markdownFiles(root)).toEqual([]);
  });

  test("bad input is refused before anything is written: invalid JSON, broken nodes, a date that is no date, reserved ref, BloomMD comment", async () => {
    const root = await vault();
    const base = ["ingest", "--vault", root, "--name", "coder", "--vorlage", "meeting", "--titel", "Fehler", "--text", TRANSCRIPT, "--quelle", "x"];
    expect((await agent([...base, "--abschnitte", await files(root, "kaputt.json", "{nicht json")])).code).toBe(EXIT.usage);
    expect((await agent([...base, "--abschnitte", await files(root, "obj.json", "{}")])).code).toBe(EXIT.usage);
    expect((await agent([...base, "--abschnitte", await files(root, "kind.json", JSON.stringify([{ title: "X", kind: "evil" }]))])).code).toBe(EXIT.usage);
    expect((await agent([...base, "--abschnitte", await files(root, "kopf.json", JSON.stringify([{ title: "X", content: "# Kopf" }]))])).code).toBe(EXIT.usage);
    expect((await agent([...base, "--abschnitte", await files(root, "ref.json", JSON.stringify([{ ref: "originaltext", title: "X" }]))])).json.fehler).toMatch(/reserved/);
    expect((await agent([...base, "--quelle-datum", "2026-02-30"])).json.fehler).toMatch(/YYYY-MM-DD/);
    const comment = await agent(["ingest", "--vault", root, "--name", "coder", "--vorlage", "meeting", "--titel", "Fehler", "--text", await files(root, "c.txt", "a <!-- bloommd:id=abc --> b"), "--quelle", "x"]);
    expect(comment.code).toBe(EXIT.usage);
    expect(comment.json.fehler).toMatch(/BloomMD comment/);
    expect(await markdownFiles(root)).toEqual([]);
  });
});

describe("agent ingest: help and usage", () => {
  test("--help and the agent usage name the command and both limits", async () => {
    const help = (await agent(["ingest", "--help"], learningDeps)) as Run & { out: string[] };
    expect(help.code).toBe(EXIT.ok);
    expect(help.out.join("\n")).toContain(String(INGEST_MAX_TEXT_CHARS));
    expect(help.out.join("\n")).toContain(String(INGEST_MAX_NODES));
    expect(help.out.join("\n")).toMatch(/Personendaten/);
    expect(AGENT_USAGE).toContain("agent ingest --vorlage");
  });
});

describe("bloommd_ingest (MCP)", () => {
  async function service(access: Access = "write") {
    const root = await vault(access);
    return { root, service: new KnowledgeService(new VaultKnowledgeStore(root), "OpenClaw") };
  }

  test("the tool is listed with the limits, the privacy note and the ingestable templates", () => {
    const tool = KNOWLEDGE_TOOLS.find((entry) => entry.name === "bloommd_ingest")!;
    expect(tool.description).toContain(String(INGEST_MAX_TEXT_CHARS));
    expect(tool.description).toContain(String(INGEST_MAX_NODES));
    expect(tool.description).toMatch(/personal data/);
    const schema = tool.inputSchema as { required: string[]; properties: { template: { enum: string[] } } };
    expect(schema.required).toEqual(["template", "title", "text", "source"]);
    expect(schema.properties.template.enum).toEqual(["meeting", "conversation", "discussion", "lesson", "project", "weekly"]);
  });

  test("files the transcript like the CLI: same map, source word for word", async () => {
    const { root, service: knowledge } = await service();
    const call = knowledgeServerOptions({ vault: knowledge }, "test").call;
    const text = await readFile(TRANSCRIPT, "utf8");
    const result = (await call("bloommd_ingest", { template: "meeting", title: "Wochenbesprechung Produktteam", text, source: "fixtures/besprechung-transkript.txt", sourceDate: "2026-10-20", nodes: SECTIONS })) as { path: string; mode: string; sourceNode: string; sections: number };
    expect(result).toMatchObject({ path: "Arbeit/Wochenbesprechung Produktteam.md", mode: "written", sections: 4 });
    const markdown = await readFile(join(root, result.path), "utf8");
    expect(fencedText(markdown)).toBe(text);
    const cli = await vault();
    const same = await ingest(cli);
    expect(markdown.replace(/bloommd:id=\w+/g, "").replace(/created: .*/, "")).toBe((await readFile(join(cli, same.json.pfad), "utf8")).replace(/bloommd:id=\w+/g, "").replace(/created: .*/, ""));
  });

  test("rights, duplicate, limits and missing source", async () => {
    const proposing = await service("propose");
    const input = { template: "meeting", title: "Plan", text: "Text", source: "x" };
    expect(await knowledgeServerOptions({ vault: proposing.service }, "test").call("bloommd_ingest", input)).toMatchObject({ mode: "proposed" });
    const reading = await service("read");
    await expect(knowledgeServerOptions({ vault: reading.service }, "test").call("bloommd_ingest", input)).rejects.toThrow(/may only read/);
    expect(await markdownFiles(reading.root)).toEqual([]);

    const { root, service: knowledge } = await service();
    const call = knowledgeServerOptions({ vault: knowledge }, "test").call;
    await call("bloommd_ingest", input);
    await expect(call("bloommd_ingest", input)).rejects.toThrow(/already exists in "Arbeit": Arbeit\/Plan\.md/);
    await expect(call("bloommd_ingest", { ...input, title: "Lang", text: "x".repeat(INGEST_MAX_TEXT_CHARS + 1) })).rejects.toThrow(/200001 characters, at most 200000/);
    await expect(call("bloommd_ingest", { ...input, title: "Viele", nodes: Array.from({ length: 151 }, (_, index) => ({ title: `K${index}` })) })).rejects.toThrow(/151 nodes, at most 150/);
    await expect(call("bloommd_ingest", { ...input, title: "Ohne", source: " " })).rejects.toThrow(/"source" must be a non-empty string/);
    await expect(call("bloommd_ingest", { template: "meeting", title: "Ohne", source: "x" })).rejects.toThrow(/"text" must be a non-empty string/);
    await expect(call("bloommd_ingest", { ...input, title: "Lernen", template: "learning" })).rejects.toThrow(/agent create/);
    expect(await markdownFiles(root)).toEqual(["Arbeit/Plan.md"]);
  });
});
