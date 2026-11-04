/**
 * Quality tests of `agent ingest` for every template with German example texts (all invented): the
 * map is made, lint has nothing to say, the original stands word for word as the source, and the
 * map holds nothing but skeleton, the sections that were handed over and the source.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintWorkspace } from "@bloommd/core";
import { outlineMarkdown, type KnowledgeNodeInput } from "@bloommd/core/knowledge";
import { KNOWLEDGE_TEMPLATES } from "@bloommd/core/knowledge-templates";
import { runAgentCli } from "./agent-cli";
import { EXIT } from "./agent-learnings";
import { writeAccessConfig } from "./knowledge-store";

const FIXTURES = join(import.meta.dir, "fixtures");

async function vault() {
  const root = await mkdtemp(join(tmpdir(), "bloommd-ingest-templates-"));
  await writeAccessConfig(join(root, ".bloommd"), { access: "write", areas: {} });
  return root;
}

async function agent(args: string[]): Promise<{ code: number; err: string; json: Record<string, any> }> {
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

async function sectionsFile(root: string, sections: unknown): Promise<string> {
  const path = join(root, "..", `abschnitte-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(path, JSON.stringify(sections), "utf8");
  return path;
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
  return after.slice(start, after.indexOf(`\n${open[1]}\n`, start));
}

interface Case {
  template: string;
  area: string;
  title: string;
  fixture: string;
  sections: KnowledgeNodeInput[];
}

/** Sections as an agent would structure each example: only what the text says, open points without an answer. */
const CASES: Case[] = [
  {
    template: "conversation",
    area: "Gespräche",
    title: "Gespräch Praktikumswahl",
    fixture: "gespraech-transkript.txt",
    sections: [
      { parent: "anlass", title: "Praktikum: Stadtbibliothek oder Softwarefirma", content: "Jonas überlegt, welches Praktikum er wählt." },
      { parent: "inhalte", title: "Zutrauen", content: "Das Zutrauen kommt oft erst mit der Aufgabe." },
      { parent: "inhalte", title: "Betreuung klären", content: "In der Firma soll es jemanden geben, den Jonas fragen kann." },
      { parent: "inhalte", title: "Fristen", content: "Firma: Bewerbung bis 15. November. Bibliothek: bis Dezember." },
      { parent: "erkenntnisse", title: "Es gibt kein falsch", content: "Auch eine Entscheidung gegen die Firma ist in Ordnung." },
      { parent: "schritte", title: "Mail an Herrn Kühn schreiben", kind: "task", status: "open", assignee: "Jonas", due: "2026-11-02" },
      { parent: "schritte", title: "Bis zum Wochenende entscheiden und Bescheid geben", kind: "task", status: "open", assignee: "Jonas" },
    ],
  },
  {
    template: "discussion",
    area: "Arbeit",
    title: "Diskussion Release-Rhythmus",
    fixture: "diskussion-transkript.txt",
    sections: [
      { parent: "frage", title: "Wöchentlich veröffentlichen oder alle vier Wochen?" },
      { ref: "woechentlich", parent: "positionen", title: "Wöchentliche Releases", content: "Vertreten von der Entwicklung." },
      { parent: "woechentlich", title: "Änderungen bleiben klein", relations: [{ target: "woechentlich", label: "spricht für" }] },
      { parent: "woechentlich", title: "Viermal so viel Testaufwand", relations: [{ target: "woechentlich", label: "spricht gegen" }] },
      { ref: "zug", parent: "positionen", title: "Release-Zug alle vier Wochen", content: "Vertreten vom Vertrieb." },
      { parent: "zug", title: "Fester Termin ist planbarer", relations: [{ target: "zug", label: "spricht für" }] },
      { parent: "ergebnis", title: "Release-Zug zwei Zyklen ausprobieren", kind: "decision", decision: "accepted", content: "Wöchentliche Releases sind nicht abgelehnt, sie hängen an der Testautomatisierung." },
      { parent: "fragen", title: "Wie kommen dringende Korrekturen zwischen die Termine?" },
    ],
  },
  {
    template: "lesson",
    area: "Schule",
    title: "Physik 8b Geschwindigkeit und Beschleunigung",
    fixture: "lerneinheit-transkript.txt",
    sections: [
      { parent: "ueberblick", title: "Hausaufgabe: Aufgaben 4 bis 6, Seite 52", kind: "task", status: "open" },
      { ref: "geschwindigkeit", parent: "begriffe", title: "Geschwindigkeit", content: "Sagt, wie schnell sich ein Körper bewegt: Weg geteilt durch Zeit." },
      { ref: "beschleunigung", parent: "begriffe", title: "Beschleunigung", content: "Sagt, wie schnell sich die Geschwindigkeit ändert. Ist sie null, bleibt die Geschwindigkeit gleich." },
      { parent: "formeln", title: "v = s / t", content: "v Geschwindigkeit in m/s, s Weg in m, t Zeit in s.", relations: [{ target: "geschwindigkeit", label: "verwendet" }] },
      { parent: "formeln", title: "a = Δv / t", content: "a Beschleunigung in m/s², Δv Änderung der Geschwindigkeit in m/s, t Zeit in s.", relations: [{ target: "beschleunigung", label: "verwendet" }] },
      { parent: "beispiele", title: "Radfahrer: 100 m in 20 s", content: "v = 100 m / 20 s = 5 m/s" },
      { parent: "beispiele", title: "Auto: von 0 auf 20 m/s in 4 s", content: "a = 20 m/s / 4 s = 5 m/s²" },
      { parent: "lernfragen", title: "Was ist der Unterschied zwischen Geschwindigkeit und Beschleunigung?" },
      { parent: "lernfragen", title: "Wie rechnet man 36 km/h in m/s um?", content: "Durch 3,6 teilen, also 10 m/s." },
    ],
  },
  {
    template: "project",
    area: "Projekte",
    title: "Kundenportal",
    fixture: "projekt-transkript.txt",
    sections: [
      { parent: "ziel", title: "Portal für Rechnungen bis Ende Januar", content: "Kunden sehen ihre Rechnungen ein und laden sie herunter." },
      { ref: "p1", parent: "pakete", title: "Anmeldung und Rechteverwaltung", kind: "task", status: "open", assignee: "Herr Aydin", due: "2026-11-20" },
      { ref: "p2", parent: "pakete", title: "Rechnungsliste mit Download", kind: "task", status: "open", assignee: "Herr Aydin", due: "2026-12-15" },
      { ref: "p3", parent: "pakete", title: "Anleitung für Kunden", kind: "task", status: "open", assignee: "Frau Lenz", due: "2027-01-10" },
      { parent: "risiken", title: "Schnittstelle zur Buchhaltung nicht dokumentiert", content: "Gegenmaßnahme: Termin mit der Buchhaltung bis 10.11.", relations: [{ target: "p2", label: "gefährdet" }] },
      { parent: "entscheidungen", title: "Start ohne Zahlungsfunktion", kind: "decision", decision: "accepted" },
      { parent: "beteiligte", title: "Frau Weber", content: "Projektleitung" },
      { parent: "beteiligte", title: "Herr Aydin", content: "Entwicklung" },
      { parent: "beteiligte", title: "Frau Lenz", content: "Kundenbetreuung" },
    ],
  },
  {
    template: "weekly",
    area: "Gespräche",
    title: "Wochenrückblick KW 44",
    fixture: "wochenrueckblick-transkript.txt",
    sections: [
      { parent: "erledigt", title: "Steuerunterlagen abgegeben" },
      { parent: "erledigt", title: "Referat für Geschichte gehalten" },
      { parent: "erledigt", title: "Fahrrad repariert" },
      { parent: "offen", title: "Mathe-Hausaufgabe Seite 52", kind: "task", status: "open" },
      { parent: "offen", title: "Mail an Herrn Kühn beantworten", kind: "task", status: "open" },
      { parent: "naechste", title: "Montag: Mathe abgeben" },
      { parent: "naechste", title: "Dienstag: Zahnarzt" },
      { parent: "naechste", title: "Mittwoch: Entscheidung zum Praktikum" },
    ],
  },
];

async function ingest(root: string, test: Case, sections: KnowledgeNodeInput[] = test.sections) {
  return agent([
    "ingest", "--vault", root, "--name", "coder", "--vorlage", test.template, "--titel", test.title,
    "--text", join(FIXTURES, test.fixture), "--quelle", `fixtures/${test.fixture}`, "--quelle-datum", "2026-11-03",
    "--abschnitte", await sectionsFile(root, sections),
  ]);
}

describe("agent ingest: every template with a German example text", () => {
  test("the cases cover every ingestable template (meeting has its own tests with besprechung-transkript.txt)", () => {
    expect(CASES.map((entry) => entry.template).sort()).toEqual(KNOWLEDGE_TEMPLATES.filter((template) => template.id !== "learning" && template.id !== "meeting").map((template) => template.id).sort());
  });

  for (const entry of CASES) {
    describe(`${entry.template} (${entry.fixture})`, () => {
      test("the map is made in the area of the template, with the sections below the skeleton", async () => {
        const root = await vault();
        const run = await ingest(root, entry);
        expect(run.err).toBe("");
        expect(run.code).toBe(EXIT.ok);
        expect(run.json).toMatchObject({ ok: true, pfad: `${entry.area}/${entry.title}.md`, bereich: entry.area, vorlage: entry.template, modus: "geschrieben", abschnitte: entry.sections.length });
        const outline = outlineMarkdown(await readFile(join(root, run.json.pfad), "utf8"));
        const parentTitle = (title: string) => outline.nodes.find((node) => node.id === outline.nodes.find((candidate) => candidate.title === title)!.parentId)?.title;
        const template = KNOWLEDGE_TEMPLATES.find((candidate) => candidate.id === entry.template)!;
        const skeleton = new Map(template.skeleton.map((node) => [node.ref, node.title]));
        for (const section of entry.sections) {
          const parent = skeleton.get(section.parent!) ?? entry.sections.find((candidate) => candidate.ref === section.parent)?.title;
          expect(parentTitle(section.title!)).toBe(parent);
        }
      });

      test("the result has no lint findings", async () => {
        const root = await vault();
        const run = await ingest(root, entry);
        const markdown = await readFile(join(root, run.json.pfad), "utf8");
        expect(lintWorkspace([{ path: run.json.pfad, markdown }]).findings).toEqual([]);
      });

      test("the original stands word for word as the source", async () => {
        const root = await vault();
        const run = await ingest(root, entry);
        const original = await readFile(join(FIXTURES, entry.fixture), "utf8");
        const markdown = await readFile(join(root, run.json.pfad), "utf8");
        expect(fencedText(markdown)).toBe(original.replace(/\r\n/g, "\n"));
        expect(run.json.zeichen).toBe([...original].length);
        const outline = outlineMarkdown(markdown);
        const source = outline.nodes.find((node) => node.title === "Originaltext")!;
        expect(source.metadata).toMatchObject({ kind: "source", citation: `fixtures/${entry.fixture}, 2026-11-03` });
        expect(outline.nodes.find((node) => node.id === source.parentId)?.title).toBe("Quellen");
      });

      test("nothing invented: only skeleton, the sections handed over and the source", async () => {
        const root = await vault();
        const run = await ingest(root, entry);
        const outline = outlineMarkdown(await readFile(join(root, run.json.pfad), "utf8"));
        const template = KNOWLEDGE_TEMPLATES.find((candidate) => candidate.id === entry.template)!;
        const expected = [entry.title, ...template.skeleton.map((node) => node.title!), ...(template.skeleton.some((node) => node.ref === "quellen") ? [] : ["Quellen"]), ...entry.sections.map((node) => node.title!), "Originaltext"];
        expect(outline.nodes.map((node) => node.title).sort()).toEqual(expected.sort());
        // content: what the agent gave, nothing else; empty for the skeleton
        const given = new Map(entry.sections.map((node) => [node.title!, node.content ?? ""]));
        for (const node of outline.nodes) {
          if (node.title === "Originaltext") continue;
          expect(node.content.replace(/\s+/g, " ").trim()).toBe((given.get(node.title) ?? "").replace(/\s+/g, " ").trim());
        }
        // metadata only where the agent set it: tasks, decisions, relations, the source
        const kinds = outline.nodes.filter((node) => node.metadata?.kind && node.metadata.kind !== "topic").map((node) => node.title).sort();
        const wanted = [...entry.sections.filter((node) => node.kind).map((node) => node.title!), "Originaltext", ...template.skeleton.filter((node) => node.kind).map((node) => node.title!), ...(template.skeleton.some((node) => node.ref === "quellen") ? [] : ["Quellen"])];
        expect(kinds).toEqual(wanted.sort());
        for (const section of entry.sections.filter((node) => node.relations)) {
          const node = outline.nodes.find((candidate) => candidate.title === section.title)!;
          expect(node.metadata?.relations?.map((relation) => relation.label)).toEqual(section.relations!.map((relation) => relation.label));
        }
        for (const node of outline.nodes.filter((candidate) => !entry.sections.some((section) => section.relations && section.title === candidate.title))) {
          expect(node.metadata?.relations ?? []).toEqual([]);
        }
      });

      test("without sections the map is only the skeleton and the source", async () => {
        const root = await vault();
        const run = await ingest(root, entry, []);
        expect(run.code).toBe(EXIT.ok);
        expect(run.json.abschnitte).toBe(0);
        const outline = outlineMarkdown(await readFile(join(root, run.json.pfad), "utf8"));
        const template = KNOWLEDGE_TEMPLATES.find((candidate) => candidate.id === entry.template)!;
        expect(outline.nodes).toHaveLength(1 + template.skeleton.length + (template.skeleton.some((node) => node.ref === "quellen") ? 0 : 1) + 1);
        expect(outline.nodes.filter((node) => node.title !== "Originaltext" && node.content.trim() !== "")).toEqual([]);
      });
    });
  }

  test("the weekly template has no Quellen node of its own: ingest creates it", async () => {
    const root = await vault();
    const weekly = CASES.find((entry) => entry.template === "weekly")!;
    const run = await ingest(root, weekly);
    const outline = outlineMarkdown(await readFile(join(root, run.json.pfad), "utf8"));
    const quellen = outline.nodes.filter((node) => node.title === "Quellen");
    expect(quellen).toHaveLength(1);
    expect(quellen[0]!.metadata?.kind).toBe("source");
    expect(await markdownFiles(root)).toContain(run.json.pfad);
  });
});
