/**
 * `agent ingest` keeps one hub map per area (Schule, Arbeit, Projekte, Gespräche), and refuses
 * sections that are too deep. Both go through the rights, proposals, log and undo of the map.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintWorkspace } from "@bloommd/core";
import { outlineMarkdown } from "@bloommd/core/knowledge";
import { AGENT_USAGE, learningDeps, runAgentCli } from "./agent-cli";
import { EXIT, runLearningCommand, type LearningDeps } from "./agent-learnings";
import { knowledgeServerOptions, KNOWLEDGE_TOOLS } from "./knowledge-mcp";
import { INGEST_MAX_DEPTH, INGEST_MAX_NODES, KnowledgeService } from "./knowledge-service";
import { VaultKnowledgeStore, writeAccessConfig } from "./knowledge-store";

type Access = "read" | "propose" | "write";

const FIXTURES = join(import.meta.dir, "fixtures");
const MEETING = join(FIXTURES, "besprechung-transkript.txt");
const MEETING_2 = join(FIXTURES, "besprechung-transkript-2.txt");
const HUB = "Arbeit/Arbeit.md";
const MAP = "Arbeit/Wochenbesprechung Produktteam.md";

async function vault(access: Access = "write", areas: Record<string, Access> = {}) {
  const root = await mkdtemp(join(tmpdir(), "bloommd-ingest-hub-"));
  await writeAccessConfig(join(root, ".bloommd"), { access, areas });
  return root;
}

async function agent(args: string[], deps?: LearningDeps): Promise<{ code: number; err: string; json: Record<string, any>; out: string[] }> {
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

async function file(root: string, name: string, content: string): Promise<string> {
  const path = join(root, "..", `${name}-${Math.random().toString(36).slice(2)}`);
  await writeFile(path, content, "utf8");
  return path;
}

const SECTIONS = [
  { ref: "t1", parent: "themen", title: "Release-Termin", content: "Migration fertig, offen ist der Feinschliff an der Suche." },
  { parent: "t1", title: "Release am 5. November", kind: "decision", decision: "accepted" },
  { parent: "aufgaben", title: "Ankündigung vorbereiten", kind: "task", status: "open", assignee: "Entwicklung" },
  { parent: "fragen", title: "Englische Fassung nötig?" },
];

/** `ingest` of the meeting transcript; `flags` override or add flags, `sections` are the agent's nodes. */
async function ingest(root: string, flags: Record<string, string> = {}, options: { title?: string; sections?: unknown } = {}) {
  const all: Record<string, string> = {
    "--vorlage": "meeting",
    "--titel": options.title ?? "Wochenbesprechung Produktteam",
    "--text": MEETING,
    "--quelle": "fixtures/besprechung-transkript.txt",
    "--quelle-datum": "2026-10-20",
    "--abschnitte": await file(root, "abschnitte.json", JSON.stringify(options.sections ?? SECTIONS)),
    ...flags,
  };
  return agent(["ingest", "--vault", root, "--name", "coder", ...Object.entries(all).flat()]);
}

/** `ingest --in-map` with the second meeting. */
async function supplement(root: string, map: string, sections: unknown, flags: Record<string, string> = {}) {
  const all: Record<string, string> = {
    "--in-map": map,
    "--text": MEETING_2,
    "--quelle": "fixtures/besprechung-transkript-2.txt",
    "--quelle-datum": "2026-10-27",
    "--abschnitte": await file(root, "abschnitte.json", JSON.stringify(sections)),
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

const read = (root: string, path: string) => readFile(join(root, path), "utf8");

/** The links of a hub: titles of the children of "Maps", with their content. */
function hubLinks(markdown: string): Array<{ title: string; content: string }> {
  const outline = outlineMarkdown(markdown);
  const maps = outline.nodes.find((node) => node.title === "Maps" && node.parentId === outline.rootId);
  return outline.nodes.filter((node) => maps && node.parentId === maps.id).map((node) => ({ title: node.title, content: node.content.trim() }));
}

describe("area hub: created and kept up by ingest", () => {
  test("the first ingest of an area creates the hub in the area folder, titled like the area, with a link to the map", async () => {
    const root = await vault();
    const run = await ingest(root);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ ok: true, pfad: MAP, abschnitte: 4, modus: "geschrieben" });
    expect(run.json.hub).toMatchObject({ pfad: HUB, titel: "Arbeit", modus: "geschrieben", angelegt: true, verlinkt: true });
    expect(run.json.hub.aenderung).toBeString();
    expect(run.json.hinweise).toEqual([expect.stringContaining("Bereichs-Hub „Arbeit“ angelegt")]);
    expect(await markdownFiles(root)).toEqual([HUB, MAP]);

    const hub = await read(root, HUB);
    expect(hub).toMatch(/^type: "?hub"?$/m);
    expect(outlineMarkdown(hub).title).toBe("Arbeit");
    expect(hubLinks(hub)).toEqual([{ title: "Wochenbesprechung Produktteam", content: "[[Wochenbesprechung Produktteam]]" }]);
    expect(lintWorkspace([{ path: HUB, markdown: hub }, { path: MAP, markdown: await read(root, MAP) }]).findings).toEqual([]);
  });

  test("a second map of the area is linked in the existing hub; the hub is not created again", async () => {
    const root = await vault();
    await ingest(root);
    const run = await ingest(root, {}, { title: "Retro Produktteam" });
    expect(run.json.hub).toMatchObject({ pfad: HUB, angelegt: false, verlinkt: true, modus: "geschrieben" });
    expect(await markdownFiles(root)).toEqual([HUB, "Arbeit/Retro Produktteam.md", MAP]);
    expect(hubLinks(await read(root, HUB)).map((link) => link.title)).toEqual(["Wochenbesprechung Produktteam", "Retro Produktteam"]);
  });

  test("a map that is ingested again (--in-map) is not linked twice", async () => {
    const root = await vault();
    await ingest(root);
    const before = await read(root, HUB);
    const run = await supplement(root, MAP, [{ parent: "themen", title: "Fehler im Import" }]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.hub).toMatchObject({ pfad: HUB, angelegt: false, verlinkt: false });
    expect(run.json.hinweise).toEqual([]);
    expect(await read(root, HUB)).toBe(before);
    expect(hubLinks(before)).toHaveLength(1);
  });

  test("a duplicate is refused as before and leaves the hub alone", async () => {
    const root = await vault();
    await ingest(root);
    const before = await read(root, HUB);
    const again = await ingest(root, {}, { title: "wochenbesprechung  PRODUKTTEAM!" });
    expect(again.code).toBe(EXIT.duplicate);
    expect(again.json).toMatchObject({ duplicate: true, pfad: MAP });
    expect(await read(root, HUB)).toBe(before);
  });

  test("every area has its own hub: Arbeit, Schule, Projekte, Gespräche (conversation and weekly share one)", async () => {
    const root = await vault();
    const text = (name: string) => join(FIXTURES, name);
    const cases = [
      ["meeting", "Besprechung A", "besprechung-transkript.txt", "Arbeit"],
      ["lesson", "Physik", "lerneinheit-transkript.txt", "Schule"],
      ["project", "Kundenportal", "projekt-transkript.txt", "Projekte"],
      ["conversation", "Gespräch Praktikum", "gespraech-transkript.txt", "Gespräche"],
      ["weekly", "Wochenrückblick KW 44", "wochenrueckblick-transkript.txt", "Gespräche"],
    ] as const;
    for (const [vorlage, titel, fixture, area] of cases) {
      const run = await ingest(root, { "--vorlage": vorlage, "--titel": titel, "--text": text(fixture), "--quelle": fixture }, { sections: [] });
      expect(run.code).toBe(EXIT.ok);
      expect(run.json.hub).toMatchObject({ pfad: `${area}/${area}.md`, titel: area });
    }
    expect(await markdownFiles(root)).toEqual([
      "Arbeit/Arbeit.md", "Arbeit/Besprechung A.md",
      "Gespräche/Gespräch Praktikum.md", "Gespräche/Gespräche.md", "Gespräche/Wochenrückblick KW 44.md",
      "Projekte/Kundenportal.md", "Projekte/Projekte.md",
      "Schule/Physik.md", "Schule/Schule.md",
    ]);
    expect(hubLinks(await read(root, "Gespräche/Gespräche.md")).map((link) => link.title)).toEqual(["Gespräch Praktikum", "Wochenrückblick KW 44"]);
  });

  test("a custom area (--bereich) gets a hub named after its last segment", async () => {
    const root = await vault();
    const run = await ingest(root, { "--bereich": "Projekte/BloomMD" });
    expect(run.json.hub).toMatchObject({ pfad: "Projekte/BloomMD/BloomMD.md", titel: "BloomMD" });
    expect(hubLinks(await read(root, "Projekte/BloomMD/BloomMD.md"))).toHaveLength(1);
  });

  test("the hub does not count against the section limit", async () => {
    const root = await vault();
    const sections = Array.from({ length: INGEST_MAX_NODES }, (_, index) => ({ parent: "themen", title: `Thema ${index + 1}` }));
    const run = await ingest(root, {}, { sections });
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.abschnitte).toBe(INGEST_MAX_NODES);
    expect(run.json.hub.angelegt).toBe(true);
  });

  test("an existing hub without the node Maps gets it; what the person wrote stays", async () => {
    const root = await vault();
    await mkdir(join(root, "Arbeit"), { recursive: true });
    await writeFile(join(root, HUB), '---\ntitle: "Arbeit"\ntype: "hub"\n---\n\n# Arbeit\n\n## Meine Notiz\n\nBleibt stehen.\n', "utf8");
    const run = await ingest(root);
    expect(run.json.hub).toMatchObject({ pfad: HUB, angelegt: false, verlinkt: true });
    const hub = await read(root, HUB);
    expect(hub).toContain("Bleibt stehen.");
    expect(hubLinks(hub).map((link) => link.title)).toEqual(["Wochenbesprechung Produktteam"]);
  });
});

describe("area hub: the hub is no duplicate and cannot be blocked", () => {
  test("a map titled like the area is no duplicate of the hub", async () => {
    const root = await vault();
    await ingest(root);
    const run = await ingest(root, {}, { title: "Arbeit" });
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.pfad).not.toBe(HUB);
    expect(await markdownFiles(root)).toContain(HUB);
    expect(hubLinks(await read(root, HUB)).map((link) => link.title)).toEqual(["Wochenbesprechung Produktteam", "Arbeit"]);
  });

  test("a map titled like the area that exists first does not stop the hub from being made", async () => {
    const root = await vault();
    const first = await ingest(root, {}, { title: "Arbeit" });
    expect(first.code).toBe(EXIT.ok);
    expect(first.json.hub).toMatchObject({ angelegt: true });
    expect(first.json.hub.pfad).not.toBe(first.json.pfad);
    const second = await ingest(root);
    expect(second.json.hub).toMatchObject({ pfad: first.json.hub.pfad, angelegt: false, verlinkt: true });
  });

  test("ingest into the hub itself works and adds no link to the hub in itself", async () => {
    const root = await vault();
    await ingest(root);
    const maps = outlineMarkdown(await read(root, HUB)).nodes.find((node) => node.title === "Maps")!;
    const run = await supplement(root, HUB, [{ parent: maps.id, title: "Eigener Eintrag" }]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.hub).toBeUndefined();
    expect(run.json.pfad).toBe(HUB);
    expect(hubLinks(await read(root, HUB)).map((link) => link.title)).toEqual(["Wochenbesprechung Produktteam", "Eigener Eintrag"]);
  });
});

describe("area hub: rights, proposals, log and undo", () => {
  test("read: nothing happens, no map, no hub, no proposal", async () => {
    const root = await vault("read");
    const run = await ingest(root);
    expect(run.code).toBe(EXIT.error);
    expect(run.json.hub).toBeUndefined();
    expect(await markdownFiles(root)).toEqual([]);
    expect((await agent(["proposals", root])).json).toEqual([]);
  });

  test("propose: the hub is a second proposal; a person approves both", async () => {
    const root = await vault("propose");
    const run = await ingest(root);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json).toMatchObject({ modus: "vorgeschlagen" });
    expect(run.json.hub).toMatchObject({ pfad: HUB, modus: "vorgeschlagen", angelegt: true });
    expect(run.json.hub.vorschlag).toBeString();
    expect(run.json.hub.vorschlag).not.toBe(run.json.vorschlag);
    expect(run.json.hinweise).toEqual([expect.stringContaining("vorgeschlagen")]);
    expect(await markdownFiles(root)).toEqual([]);
    const proposals = await agent(["proposals", root]);
    expect(proposals.json.map((entry: { path: string }) => entry.path).sort()).toEqual([HUB, MAP]);

    expect((await agent(["approve", root, run.json.vorschlag, "--reviewer", "Max"])).code).toBe(0);
    expect((await agent(["approve", root, run.json.hub.vorschlag, "--reviewer", "Max"])).code).toBe(0);
    expect(await markdownFiles(root)).toEqual([HUB, MAP]);
    expect(hubLinks(await read(root, HUB)).map((link) => link.title)).toEqual(["Wochenbesprechung Produktteam"]);
  });

  test("propose: a link in an approved hub is a proposal as well, the hub stays as it is", async () => {
    const root = await vault("write");
    await ingest(root);
    const before = await read(root, HUB);
    await writeAccessConfig(join(root, ".bloommd"), { access: "propose", areas: {} });
    const run = await ingest(root, {}, { title: "Retro Produktteam" });
    expect(run.json.hub).toMatchObject({ pfad: HUB, modus: "vorgeschlagen", angelegt: false, verlinkt: true });
    expect(await read(root, HUB)).toBe(before);
    expect((await agent(["approve", root, run.json.hub.vorschlag, "--reviewer", "Max"])).code).toBe(0);
    expect(hubLinks(await read(root, HUB)).map((link) => link.title)).toEqual(["Wochenbesprechung Produktteam", "Retro Produktteam"]);
  });

  test("write: the hub change is logged with its own change id", async () => {
    const root = await vault("write");
    const run = await ingest(root);
    const log = await agent(["log", root]);
    expect(log.json.changes).toContainEqual(expect.objectContaining({ event: "written", tool: "bloommd_ingest", path: HUB, changeId: run.json.hub.aenderung, source: "fixtures/besprechung-transkript.txt, 2026-10-20" }));
    expect(log.json.changes).toContainEqual(expect.objectContaining({ path: MAP, changeId: run.json.aenderung }));
  });

  test("undo of a created hub removes it, the map stays; undo of a link restores the hub as it was", async () => {
    const root = await vault("write");
    const first = await ingest(root);
    expect((await agent(["undo", root, first.json.hub.aenderung])).code).toBe(0);
    expect(await markdownFiles(root)).toEqual([MAP]);

    const root2 = await vault("write");
    await ingest(root2);
    const before = await read(root2, HUB);
    const second = await ingest(root2, {}, { title: "Retro Produktteam" });
    expect(await read(root2, HUB)).not.toBe(before);
    expect((await agent(["undo", root2, second.json.hub.aenderung])).code).toBe(0);
    expect(await read(root2, HUB)).toBe(before);
    expect(await markdownFiles(root2)).toEqual([HUB, "Arbeit/Retro Produktteam.md", MAP]);
  });

  test("rights per area apply to the hub: with write in Arbeit only, the hub of Arbeit is written", async () => {
    const root = await vault("read", { Arbeit: "write" });
    const run = await ingest(root);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.hub).toMatchObject({ pfad: HUB, modus: "geschrieben" });
    expect((await ingest(root, { "--vorlage": "lesson", "--titel": "Physik" }, { sections: [] })).code).toBe(EXIT.error);
    expect(await markdownFiles(root)).toEqual([HUB, MAP]);
  });

  test("no right to write the hub: the ingest does not fail, the hub is a hint", async () => {
    const root = await vault("write");
    class HubLockedStore extends VaultKnowledgeStore {
      override async write(path: string, markdown: string, expectedVersion: string | null) {
        if (path === HUB) throw new Error("Kein Schreibrecht für den Hub.");
        return super.write(path, markdown, expectedVersion);
      }
    }
    const service = new KnowledgeService(new HubLockedStore(root), "OpenClaw");
    const result = await service.ingest({ template: "meeting", title: "Wochenbesprechung Produktteam", text: "Text", sourceRef: "x", nodes: [] });
    expect(result.mode).toBe("written");
    expect(result.path).toBe(MAP);
    expect(result.hub).toBeUndefined();
    expect(result.hinweise).toEqual([expect.stringMatching(/Bereichs-Hub „Arbeit“ nicht gepflegt \(Kein Schreibrecht für den Hub\.\)/)]);
    expect(await markdownFiles(root)).toEqual([MAP]);
  });
});

describe("area hub: output and documentation", () => {
  test("--help, the usage and the MCP tool name the hub", async () => {
    const help = await agent(["ingest", "--help"], learningDeps);
    expect(help.out.join("\n")).toMatch(/Bereichs-Hub/);
    expect(help.out.join("\n")).toContain(`${INGEST_MAX_DEPTH} Ebenen`);
    expect(AGENT_USAGE).toContain("agent ingest --vorlage");
    const tool = KNOWLEDGE_TOOLS.find((entry) => entry.name === "bloommd_ingest")!;
    expect(tool.description).toMatch(/area hub/i);
    expect(tool.description).toContain(`${INGEST_MAX_DEPTH} levels`);
  });

  test("MCP: the result carries the hub and a hint", async () => {
    const root = await vault();
    const knowledge = new KnowledgeService(new VaultKnowledgeStore(root), "OpenClaw");
    const call = knowledgeServerOptions({ vault: knowledge }, "test").call;
    const result = (await call("bloommd_ingest", { template: "lesson", title: "Physik", text: "Text", source: "x" })) as { hub: Record<string, unknown>; hinweise: string[] };
    expect(result.hub).toMatchObject({ path: "Schule/Schule.md", title: "Schule", mode: "written", created: true, linked: true });
    expect(result.hinweise).toEqual([expect.stringContaining("Bereichs-Hub „Schule“")]);
  });
});

/** A chain of sections below "Themen": "Ebene 1" is a child of the skeleton node. */
function chain(length: number, from = 1, parent = "themen") {
  return Array.from({ length }, (_, index) => ({ ref: `d${from + index}`, parent: index === 0 ? parent : `d${from + index - 1}`, title: `Ebene ${from + index}` }));
}

describe("ingest: maximum depth", () => {
  test("the limit is five levels below the map title (the skeleton is level one)", () => {
    expect(INGEST_MAX_DEPTH).toBe(5);
  });

  test("exactly at the limit: accepted", async () => {
    const root = await vault();
    const run = await ingest(root, {}, { sections: chain(INGEST_MAX_DEPTH - 1) });
    expect(run.code).toBe(EXIT.ok);
    const outline = outlineMarkdown(await read(root, MAP));
    expect(Math.max(...outline.nodes.map((node) => node.level)) - 1).toBe(INGEST_MAX_DEPTH);
  });

  test("one level too deep: refused with the actual depth and the limit, nothing written (no map, no hub)", async () => {
    const root = await vault();
    const run = await ingest(root, {}, { sections: chain(INGEST_MAX_DEPTH) });
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toContain(`Ebene ${INGEST_MAX_DEPTH}`);
    expect(run.json.fehler).toContain(`${INGEST_MAX_DEPTH + 1} levels below the map title`);
    expect(run.json.fehler).toContain(`at most ${INGEST_MAX_DEPTH}`);
    expect(run.json.fehler).toContain("Nothing was written");
    expect(await markdownFiles(root)).toEqual([]);
  });

  test("the deepest node is named when several are too deep; nodes in other branches do not matter", async () => {
    const root = await vault();
    const sections = [...chain(INGEST_MAX_DEPTH + 1), { parent: "aufgaben", title: "Flach" }];
    const run = await ingest(root, {}, { sections });
    expect(run.code).toBe(EXIT.usage);
    expect(run.json.fehler).toContain(`Ebene ${INGEST_MAX_DEPTH + 1}`);
    expect(run.json.fehler).toContain(`${INGEST_MAX_DEPTH + 2} levels`);
    expect(await markdownFiles(root)).toEqual([]);
  });

  test("every template counts the same, the weekly one via its created Quellen node too", async () => {
    const root = await vault();
    const weekly = { "--vorlage": "weekly", "--titel": "Rückblick" };
    expect((await ingest(root, weekly, { sections: chain(INGEST_MAX_DEPTH - 1, 1, "erledigt") })).code).toBe(EXIT.ok);
    expect((await ingest(root, { ...weekly, "--titel": "Rückblick 2" }, { sections: chain(INGEST_MAX_DEPTH, 1, "erledigt") })).code).toBe(EXIT.usage);
    expect((await ingest(root, { ...weekly, "--titel": "Rückblick 3" }, { sections: chain(INGEST_MAX_DEPTH, 1, "quellen") })).code).toBe(EXIT.usage);
  });

  test("--in-map: the depth counts from the node that was matched or given by id; the map stays as it was when refused", async () => {
    const root = await vault();
    await ingest(root, {}, { sections: chain(2) });
    const before = await read(root, MAP);

    // matched by title: Ebene 1 and 2 exist, so Ebene 3 and 4 are the new ones (depth 4 and 5)
    const tooDeep = await supplement(root, MAP, chain(INGEST_MAX_DEPTH));
    expect(tooDeep.code).toBe(EXIT.usage);
    expect(tooDeep.json.fehler).toContain(`${INGEST_MAX_DEPTH + 1} levels`);
    expect(tooDeep.json.fehler).toContain(`at most ${INGEST_MAX_DEPTH}`);
    expect(await read(root, MAP)).toBe(before);

    const fits = await supplement(root, MAP, chain(INGEST_MAX_DEPTH - 1));
    expect(fits.code).toBe(EXIT.ok);
    expect(Math.max(...outlineMarkdown(await read(root, MAP)).nodes.map((node) => node.level)) - 1).toBe(INGEST_MAX_DEPTH);
  });

  test("--in-map with a node id as parent counts from that node's level", async () => {
    const root = await vault();
    await ingest(root, {}, { sections: chain(2) });
    const outline = outlineMarkdown(await read(root, MAP));
    const id = outline.nodes.find((node) => node.title === "Ebene 2")!.id;
    // Ebene 2 is depth 3: two more levels fit, a third does not
    expect((await supplement(root, MAP, chain(2, 3, id), { "--quelle": "a", "--quelle-datum": "2026-10-28" })).code).toBe(EXIT.ok);
    const idDeep = outlineMarkdown(await read(root, MAP)).nodes.find((node) => node.title === "Ebene 4")!.id;
    const refused = await supplement(root, MAP, [{ parent: idDeep, title: "Zu tief" }], { "--quelle": "b", "--quelle-datum": "2026-10-29" });
    expect(refused.code).toBe(EXIT.usage);
    expect(refused.json.fehler).toMatch(/"Zu tief" would sit 6 levels/);
  });

  test("MCP: the same check, same message", async () => {
    const root = await vault();
    const call = knowledgeServerOptions({ vault: new KnowledgeService(new VaultKnowledgeStore(root), "OpenClaw") }, "test").call;
    const input = { template: "meeting", title: "Plan", text: "Text", source: "x" };
    await expect(call("bloommd_ingest", { ...input, nodes: chain(INGEST_MAX_DEPTH) })).rejects.toThrow(/6 levels below the map title, at most 5/);
    expect(await markdownFiles(root)).toEqual([]);
    expect(await call("bloommd_ingest", { ...input, nodes: chain(INGEST_MAX_DEPTH - 1) })).toMatchObject({ mode: "written" });
  });
});

describe("incremental: a second meeting of the same project", () => {
  const PROJECT = "Projekte/Kundenportal.md";
  const PROJECT_SECTIONS = [
    { ref: "p1", parent: "pakete", title: "Anmeldung und Rechteverwaltung", kind: "task", status: "open", assignee: "Herr Aydin", due: "2026-11-20" },
    { ref: "p2", parent: "pakete", title: "Rechnungsliste mit Download", kind: "task", status: "open", assignee: "Herr Aydin", due: "2026-12-15" },
    { ref: "p3", parent: "pakete", title: "Anleitung für Kunden", kind: "task", status: "open", assignee: "Frau Lenz", due: "2027-01-10" },
    { parent: "risiken", title: "Schnittstelle zur Buchhaltung nicht dokumentiert", content: "Gegenmaßnahme: Termin mit der Buchhaltung bis 10.11.", relations: [{ target: "p2", label: "gefährdet" }] },
  ];
  const STATUS_SECTIONS = [
    { ref: "p1", parent: "pakete", title: "Anmeldung und Rechteverwaltung" },
    { parent: "p1", title: "Abgenommen von Frau Weber" },
    { ref: "p2", parent: "pakete", title: "Rechnungsliste mit Download" },
    { parent: "p2", title: "In Arbeit", content: "Daran hängt der Pilotbetrieb.", relations: [{ target: "Pilotbetrieb mit drei Kunden" }] },
    { ref: "p3", parent: "pakete", title: "Anleitung für Kunden" },
    { parent: "p3", title: "Wer richtet die Testumgebung ein?" },
    { parent: "risiken", title: "Schnittstelle zur Buchhaltung nicht dokumentiert" },
    { parent: "risiken", title: "Schnittstelle seit 10.11. dokumentiert", content: "Das Risiko ist damit erledigt." },
    { ref: "p4", parent: "pakete", title: "Pilotbetrieb mit drei Kunden", content: "Im Januar.", relations: [{ target: "Rechnungsliste mit Download", label: "hängt ab von" }] },
    { parent: "p4", title: "Drei Kunden suchen", kind: "task", status: "open", assignee: "Frau Lenz", due: "2026-11-30" },
  ];

  async function projectMap(root: string) {
    const run = await agent([
      "ingest", "--vault", root, "--name", "coder", "--vorlage", "project", "--titel", "Kundenportal",
      "--text", join(FIXTURES, "projekt-transkript.txt"), "--quelle", "fixtures/projekt-transkript.txt", "--quelle-datum", "2026-11-01",
      "--abschnitte", await file(root, "abschnitte.json", JSON.stringify(PROJECT_SECTIONS)),
    ]);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.pfad).toBe(PROJECT);
  }

  const statusMeeting = (root: string, sections: unknown = STATUS_SECTIONS) =>
    supplement(root, PROJECT, sections, { "--text": join(FIXTURES, "projekt-besprechung-2.txt"), "--quelle": "fixtures/projekt-besprechung-2.txt", "--quelle-datum": "2026-11-15" });

  test("existing packages and risks are matched by title, new ones hang below, a new package is connected to an existing one", async () => {
    const root = await vault();
    await projectMap(root);
    const before = outlineMarkdown(await read(root, PROJECT));
    const run = await statusMeeting(root);
    expect(run.code).toBe(EXIT.ok);
    expect(run.json.zugeordnet.map((entry: { titel: string }) => entry.titel).sort()).toEqual(["Anleitung für Kunden", "Anmeldung und Rechteverwaltung", "Rechnungsliste mit Download", "Schnittstelle zur Buchhaltung nicht dokumentiert"]);
    expect(run.json.neu).toBe(7); // six sections and the source node

    const after = outlineMarkdown(await read(root, PROJECT));
    const byTitle = (title: string) => after.nodes.filter((node) => node.title === title);
    for (const title of ["Anmeldung und Rechteverwaltung", "Rechnungsliste mit Download", "Anleitung für Kunden", "Schnittstelle zur Buchhaltung nicht dokumentiert"]) expect(byTitle(title)).toHaveLength(1);
    // nodes that were there stay as they were: status, assignee, content, relation
    expect(byTitle("Rechnungsliste mit Download")[0]!.metadata).toMatchObject({ kind: "task", status: "open", assignee: "Herr Aydin", due: "2026-12-15" });
    expect(byTitle("Schnittstelle zur Buchhaltung nicht dokumentiert")[0]!.content.trim()).toBe("Gegenmaßnahme: Termin mit der Buchhaltung bis 10.11.");
    expect(byTitle("Schnittstelle zur Buchhaltung nicht dokumentiert")[0]!.metadata?.relations).toEqual(before.nodes.find((node) => node.title === "Schnittstelle zur Buchhaltung nicht dokumentiert")!.metadata?.relations);
    // new children below the matched node
    const parentOf = (title: string) => after.nodes.find((node) => node.id === byTitle(title)[0]!.parentId)?.title;
    expect(parentOf("Abgenommen von Frau Weber")).toBe("Anmeldung und Rechteverwaltung");
    expect(parentOf("Schnittstelle seit 10.11. dokumentiert")).toBe("Risiken");
    expect(parentOf("Drei Kunden suchen")).toBe("Pilotbetrieb mit drei Kunden");
    expect(parentOf("Pilotbetrieb mit drei Kunden")).toBe("Arbeitspakete");
    // cross-connection to the existing topic, by title; the relation to a node of the same ingest too
    const list = byTitle("Rechnungsliste mit Download")[0]!;
    const pilot = byTitle("Pilotbetrieb mit drei Kunden")[0]!;
    expect(pilot.metadata?.relations).toEqual([{ target: list.id, label: "hängt ab von" }]);
    expect(byTitle("In Arbeit")[0]!.metadata?.relations).toEqual([{ target: pilot.id }]);
    expect(run.json.hinweise.filter((hinweis: string) => !hinweis.startsWith("Bereichs-Hub"))).toEqual([]);
  });

  test("the second source is one more node, the first stays; the hub of Projekte is not touched again; no lint findings", async () => {
    const root = await vault();
    await projectMap(root);
    const hub = await read(root, "Projekte/Projekte.md");
    const run = await statusMeeting(root);
    expect(run.json.quellentitel).toBe("Originaltext 2026-11-15");
    expect(run.json.hub).toMatchObject({ pfad: "Projekte/Projekte.md", verlinkt: false });
    expect(await read(root, "Projekte/Projekte.md")).toBe(hub);
    const markdown = await read(root, PROJECT);
    const sources = outlineMarkdown(markdown).nodes.filter((node) => node.metadata?.kind === "source" && node.title.startsWith("Originaltext"));
    expect(sources.map((node) => node.title).sort()).toEqual(["Originaltext", "Originaltext 2026-11-15"]);
    expect(lintWorkspace([{ path: PROJECT, markdown }, { path: "Projekte/Projekte.md", markdown: hub }]).findings).toEqual([]);
    // the same recording again is a duplicate and changes nothing
    const again = await statusMeeting(root);
    expect(again.code).toBe(EXIT.duplicate);
    expect(await read(root, PROJECT)).toBe(markdown);
  });

  test("a meeting map in another area that links the project with [[Kundenportal]] shows up in the backlinks", async () => {
    const root = await vault();
    await projectMap(root);
    const run = await agent([
      "ingest", "--vault", root, "--name", "coder", "--vorlage", "meeting", "--titel", "Statusbesprechung Kundenportal",
      "--text", join(FIXTURES, "projekt-besprechung-2.txt"), "--quelle", "fixtures/projekt-besprechung-2.txt", "--quelle-datum", "2026-11-15",
      "--abschnitte", await file(root, "abschnitte.json", JSON.stringify([{ parent: "themen", title: "Stand der Arbeitspakete", content: "Siehe [[Kundenportal]]." }])),
    ]);
    expect(run.code).toBe(EXIT.ok);
    const service = new KnowledgeService(new VaultKnowledgeStore(root), "OpenClaw");
    const { backlinks } = await service.backlinks(PROJECT);
    expect(backlinks.map((entry) => entry.path)).toContain("Arbeit/Statusbesprechung Kundenportal.md");
    const files = await Promise.all((await markdownFiles(root)).map(async (path) => ({ path, markdown: await read(root, path) })));
    expect(lintWorkspace(files).findings).toEqual([]);
  });
});
