/**
 * Demo vault for the store screenshots: an Obsidian-style folder with a study map (with
 * handwriting), a project map with tasks and a few ordinary notes, in German or English.
 *
 *   bun packages/mobile/store/screenshots/harness/demo-vault.ts <out-dir> <de|en>
 *
 * Writes the vault to `<out-dir>/<vault name>/` and `<out-dir>/scenes.json` with the paths and node
 * ids the capture script opens. Maps are built with the same Core functions the agents use, so the
 * Markdown is exactly what BloomMD writes itself.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyKnowledgeNodes, newKnowledgeMap, type KnowledgeNodeInput } from "../../../../core/src/knowledge";
import { createInkDocument, serializeInkSvg, type InkDocument } from "../../../../ink/src/ink-document";
import type { InkPoint, InkStroke } from "../../../../ink/src/ink-geometry";

export type DemoLocale = "de" | "en";

/** Single-stroke capitals on a 0..1 cap height; each glyph is a list of polylines. */
type Glyph = { width: number; lines: Array<Array<[number, number]>> };

function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 18): Array<[number, number]> {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / steps;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)] as [number, number];
  });
}

const GLYPHS: Record<string, Glyph> = {
  "Δ": { width: 0.62, lines: [[[0.31, 0], [0, 1], [0.62, 1], [0.31, 0]]] },
  U: { width: 0.56, lines: [[[0, 0], [0, 0.68], ...arc(0.28, 0.68, 0.28, 0.32, Math.PI, 0), [0.56, 0]]] },
  "=": { width: 0.5, lines: [[[0, 0.38], [0.5, 0.38]], [[0, 0.66], [0.5, 0.66]]] },
  "+": { width: 0.5, lines: [[[0.25, 0.24], [0.25, 0.84]], [[0, 0.54], [0.5, 0.54]]] },
  Q: { width: 0.66, lines: [arc(0.33, 0.5, 0.33, 0.5, -Math.PI / 2, Math.PI * 1.5, 28), [[0.38, 0.7], [0.7, 1.05]]] },
  W: { width: 0.84, lines: [[[0, 0], [0.2, 1], [0.42, 0.36], [0.64, 1], [0.84, 0]]] },
  A: { width: 0.6, lines: [[[0, 1], [0.3, 0], [0.6, 1]], [[0.13, 0.62], [0.47, 0.62]]] },
  "Ä": { width: 0.6, lines: [[[0, 1], [0.3, 0.12], [0.6, 1]], [[0.13, 0.66], [0.47, 0.66]], [[0.16, -0.12], [0.18, -0.08]], [[0.42, -0.12], [0.44, -0.08]]] },
  R: { width: 0.52, lines: [[[0, 1], [0, 0], ...arc(0.22, 0.25, 0.3, 0.25, -Math.PI / 2, Math.PI / 2, 12), [0, 0.5], [0.52, 1]]] },
  B: { width: 0.52, lines: [[[0, 1], [0, 0], ...arc(0.2, 0.24, 0.28, 0.24, -Math.PI / 2, Math.PI / 2, 10), [0, 0.48], ...arc(0.22, 0.74, 0.3, 0.26, -Math.PI / 2, Math.PI / 2, 10), [0, 1]]] },
  E: { width: 0.48, lines: [[[0.48, 0], [0, 0], [0, 1], [0.48, 1]], [[0, 0.5], [0.4, 0.5]]] },
  I: { width: 0.12, lines: [[[0.06, 0], [0.06, 1]]] },
  T: { width: 0.56, lines: [[[0, 0], [0.56, 0]], [[0.28, 0], [0.28, 1]]] },
  M: { width: 0.74, lines: [[[0, 1], [0.04, 0], [0.37, 0.62], [0.7, 0], [0.74, 1]]] },
  H: { width: 0.54, lines: [[[0, 0], [0, 1]], [[0.54, 0], [0.54, 1]], [[0, 0.5], [0.54, 0.5]]] },
  O: { width: 0.66, lines: [arc(0.33, 0.5, 0.33, 0.5, -Math.PI / 2, Math.PI * 1.5, 28)] },
  K: { width: 0.52, lines: [[[0, 0], [0, 1]], [[0.52, 0], [0.02, 0.56]], [[0.18, 0.4], [0.54, 1]]] },
  " ": { width: 0.32, lines: [] },
};

/** Deterministic jitter, so every run draws the same "handwriting". */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function sample(line: Array<[number, number]>, spacing: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let index = 0; index < line.length - 1; index += 1) {
    const [x1, y1] = line[index]!;
    const [x2, y2] = line[index + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / spacing));
    for (let step = 0; step < steps; step += 1) out.push([x1 + ((x2 - x1) * step) / steps, y1 + ((y2 - y1) * step) / steps]);
  }
  out.push(line[line.length - 1]!);
  return out;
}

interface WriteOptions {
  x: number;
  y: number;
  height: number;
  color: string;
  size: number;
  slant?: number;
  seed: number;
  prefix: string;
}

/** Strokes for `text` written by hand: slight slant, wobble and varying pressure. */
function handwrite(text: string, options: WriteOptions): InkStroke[] {
  const rand = random(options.seed);
  const strokes: InkStroke[] = [];
  let cursor = options.x;
  const slant = options.slant ?? 0.12;
  for (const char of text) {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error(`No glyph for "${char}"`);
    const scale = options.height * (0.94 + rand() * 0.12);
    const baseline = options.y + (rand() - 0.5) * options.height * 0.06;
    for (const line of glyph.lines) {
      const points = sample(line, 0.04).map(([gx, gy], index, all): InkPoint => {
        const wobble = (rand() - 0.5) * options.height * 0.018;
        const t = all.length > 1 ? index / (all.length - 1) : 0;
        const pressure = 0.42 + Math.sin(t * Math.PI) * 0.3 + rand() * 0.06;
        return [cursor + gx * scale + (1 - gy) * scale * slant + wobble, baseline + gy * scale + wobble, pressure];
      });
      strokes.push({ id: `${options.prefix}-${strokes.length}`, tool: "pen", color: options.color, size: options.size, points });
    }
    cursor += (glyph.width + 0.22) * scale;
  }
  return strokes;
}

function line(id: string, from: [number, number], to: [number, number], color: string, size: number, head = true): InkStroke[] {
  const rand = random(from[0] * 31 + to[1]);
  const shaft = sample([from, to], 4).map(([x, y], index, all): InkPoint => [x + (rand() - 0.5) * 1.2, y + (rand() - 0.5) * 1.2, 0.5 + Math.sin((index / Math.max(1, all.length - 1)) * Math.PI) * 0.2]);
  const strokes: InkStroke[] = [{ id, tool: "pen", color, size, points: shaft }];
  if (head) {
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const wing = (offset: number): [number, number] => [to[0] - 16 * Math.cos(angle + offset), to[1] - 16 * Math.sin(angle + offset)];
    strokes.push({ id: `${id}-head`, tool: "pen", color, size, points: sample([wing(0.5), to, wing(-0.5)], 3).map(([x, y]): InkPoint => [x, y, 0.55]) });
  }
  return strokes;
}

/** "ΔU = Q + W" with arrows to the handwritten words for heat and work, "work" linked to its note. */
export function formulaInk(locale: DemoLocale): InkDocument {
  const ink = "#1A1A1A";
  const accent = "#FF6B35";
  const highlight = "#FFD84D";
  const formula = handwrite("ΔU = Q + W", { x: 40, y: 30, height: 58, color: ink, size: 5, seed: 7, prefix: "f" });
  const heatWord = locale === "de" ? "WÄRME" : "HEAT";
  const workWord = locale === "de" ? "ARBEIT" : "WORK";
  const heat = handwrite(heatWord, { x: 150, y: 190, height: 30, color: accent, size: 3.6, seed: 11, prefix: "h" });
  const work = handwrite(workWord, { x: 330, y: 190, height: 30, color: accent, size: 3.6, seed: 13, prefix: "w" });
  const underline: InkStroke = {
    id: "hl",
    tool: "highlighter",
    color: highlight,
    size: 22,
    points: sample([[30, 100], [420, 96]], 6).map(([x, y]): InkPoint => [x, y, 0.5]),
  };
  const document = createInkDocument("paper");
  document.strokes = [
    underline,
    ...formula,
    ...line("a1", [262, 104], [210, 176], accent, 3.2),
    ...line("a2", [392, 104], [384, 176], accent, 3.2),
    ...heat,
    ...work,
  ];
  document.links = [{ id: "link-work", target: locale === "de" ? "Arbeit" : "Work", strokeIds: work.map((stroke) => stroke.id) }];
  return document;
}

interface MapSpec {
  title: string;
  area: string;
  nodes: KnowledgeNodeInput[];
}

function buildMap(spec: MapSpec): { markdown: string; ids: Record<string, string> } {
  const change = applyKnowledgeNodes(newKnowledgeMap({ title: spec.title, area: spec.area, date: "2026-10-01" }), spec.nodes);
  return { markdown: change.markdown, ids: change.ids };
}

const TEXT = {
  de: {
    vault: "Obsidian Vault",
    attachments: "Anhänge",
    study: "Studium/Physik",
    studyTitle: "Thermodynamik",
    inkName: "Thermodynamik ink.svg",
    study_nodes: (ink: string): KnowledgeNodeInput[] => [
      { ref: "laws", title: "Hauptsätze" },
      { ref: "first", parent: "laws", title: "Erster Hauptsatz", content: `Energieerhaltung: Die innere Energie ändert sich nur durch Wärme und Arbeit.\n\n![[${ink}]]` },
      { ref: "second", parent: "laws", title: "Zweiter Hauptsatz", content: "Die Entropie eines abgeschlossenen Systems nimmt nie ab." },
      { ref: "third", parent: "laws", title: "Dritter Hauptsatz", content: "Der absolute Nullpunkt ist nicht erreichbar." },
      { ref: "state", title: "Zustandsgrößen" },
      { ref: "u", parent: "state", title: "Innere Energie U" },
      { ref: "t", parent: "state", title: "Temperatur T" },
      { ref: "s", parent: "state", title: "Entropie S", relations: [{ target: "second", label: "wächst nach" }] },
      { ref: "proc", title: "Prozesse" },
      { ref: "iso", parent: "proc", title: "Isotherm", content: "T = konstant, ΔU = 0" },
      { ref: "adi", parent: "proc", title: "Adiabatisch", content: "Q = 0" },
      { ref: "bar", parent: "proc", title: "Isobar", content: "p = konstant" },
      { ref: "cycle", title: "Kreisprozesse" },
      { ref: "carnot", parent: "cycle", title: "Carnot-Prozess", content: "Idealer Kreisprozess aus zwei Isothermen und zwei Adiabaten.\n\n- Kein realer Prozess ist effizienter\n- Wirkungsgrad hängt nur von den Temperaturen ab", relations: [{ target: "second", label: "begrenzt durch" }] },
      { ref: "eta", parent: "cycle", title: "Wirkungsgrad η", content: "η = 1 − T_kalt / T_warm" },
      { ref: "exam", title: "Klausur 12. November" },
      { ref: "sheet", parent: "exam", title: "Formelsammlung schreiben", status: "done" },
      { ref: "old", parent: "exam", title: "Altklausur 2025 rechnen", status: "in_progress", due: "2026-10-20" },
      { ref: "group", parent: "exam", title: "Lerngruppe: Carnot erklären", status: "open", due: "2026-10-28" },
    ],
    project: "Projekte",
    projectTitle: "Website-Relaunch",
    project_nodes: (): KnowledgeNodeInput[] => [
      { ref: "plan", title: "Planung" },
      { ref: "goals", parent: "plan", title: "Ziele festlegen", status: "done", assignee: "Lea" },
      { ref: "cms", parent: "plan", title: "Inhalte als Markdown im Git", decision: "accepted", content: "Kein CMS: Texte bleiben Markdown-Dateien, Review über Pull Requests." },
      { ref: "build", title: "Umsetzung" },
      { ref: "design", parent: "build", title: "Design-System übernehmen", status: "done", assignee: "Jonas" },
      { ref: "pages", parent: "build", title: "Startseite und Preise", status: "in_progress", assignee: "Lea", due: "2026-10-16" },
      { ref: "docs", parent: "build", title: "Hilfe-Seiten migrieren", status: "open", assignee: "Max", due: "2026-10-23", relations: [{ target: "cms", label: "folgt aus" }] },
      { ref: "launch", title: "Launch" },
      { ref: "seo", parent: "launch", title: "Weiterleitungen prüfen", status: "open", due: "2026-10-30" },
      { ref: "news", parent: "launch", title: "News-Beitrag schreiben", status: "open", assignee: "Lea", due: "2026-11-02" },
      { ref: "golive", parent: "launch", title: "Go-live am 3. November", decision: "proposed" },
    ],
    notes: {
      "Studium/Physik/Arbeit.md": "# Arbeit\n\nMechanische Arbeit W = F · s. In der Thermodynamik: Volumenarbeit W = −p · ΔV.\n",
      "Studium/Physik/Wärme.md": "# Wärme\n\nEnergie, die wegen eines Temperaturunterschieds übertragen wird.\n",
      "Studium/Mathe/Analysis.md": "# Analysis\n\n## Folgen\n\n## Reihen\n\n## Integrale\n",
      "Journal/2026-10-04.md": "# 4. Oktober\n\nKlausurplan fertig, Carnot morgen wiederholen.\n",
      "Lesen/Bücher 2026.md": "# Bücher 2026\n\n## Gelesen\n\n## Als Nächstes\n",
      "Ideen.md": "# Ideen\n\n## Blog\n\n## Projekte\n",
    } as Record<string, string>,
  },
  en: {
    vault: "Obsidian Vault",
    attachments: "Attachments",
    study: "Studies/Physics",
    studyTitle: "Thermodynamics",
    inkName: "Thermodynamics ink.svg",
    study_nodes: (ink: string): KnowledgeNodeInput[] => [
      { ref: "laws", title: "Laws" },
      { ref: "first", parent: "laws", title: "First law", content: `Conservation of energy: internal energy changes only through heat and work.\n\n![[${ink}]]` },
      { ref: "second", parent: "laws", title: "Second law", content: "The entropy of an isolated system never decreases." },
      { ref: "third", parent: "laws", title: "Third law", content: "Absolute zero cannot be reached." },
      { ref: "state", title: "State variables" },
      { ref: "u", parent: "state", title: "Internal energy U" },
      { ref: "t", parent: "state", title: "Temperature T" },
      { ref: "s", parent: "state", title: "Entropy S", relations: [{ target: "second", label: "grows by" }] },
      { ref: "proc", title: "Processes" },
      { ref: "iso", parent: "proc", title: "Isothermal", content: "T = constant, ΔU = 0" },
      { ref: "adi", parent: "proc", title: "Adiabatic", content: "Q = 0" },
      { ref: "bar", parent: "proc", title: "Isobaric", content: "p = constant" },
      { ref: "cycle", title: "Cycles" },
      { ref: "carnot", parent: "cycle", title: "Carnot cycle", content: "Ideal cycle of two isothermal and two adiabatic steps.\n\n- No real engine is more efficient\n- Efficiency depends only on the two temperatures", relations: [{ target: "second", label: "limited by" }] },
      { ref: "eta", parent: "cycle", title: "Efficiency η", content: "η = 1 − T_cold / T_hot" },
      { ref: "exam", title: "Exam on November 12" },
      { ref: "sheet", parent: "exam", title: "Write formula sheet", status: "done" },
      { ref: "old", parent: "exam", title: "Solve 2025 past paper", status: "in_progress", due: "2026-10-20" },
      { ref: "group", parent: "exam", title: "Study group: explain Carnot", status: "open", due: "2026-10-28" },
    ],
    project: "Projects",
    projectTitle: "Website relaunch",
    project_nodes: (): KnowledgeNodeInput[] => [
      { ref: "plan", title: "Planning" },
      { ref: "goals", parent: "plan", title: "Agree on goals", status: "done", assignee: "Lea" },
      { ref: "cms", parent: "plan", title: "Content as Markdown in Git", decision: "accepted", content: "No CMS: pages stay Markdown files, reviewed through pull requests." },
      { ref: "build", title: "Build" },
      { ref: "design", parent: "build", title: "Adopt the design system", status: "done", assignee: "Jonas" },
      { ref: "pages", parent: "build", title: "Home and pricing pages", status: "in_progress", assignee: "Lea", due: "2026-10-16" },
      { ref: "docs", parent: "build", title: "Migrate help pages", status: "open", assignee: "Max", due: "2026-10-23", relations: [{ target: "cms", label: "follows from" }] },
      { ref: "launch", title: "Launch" },
      { ref: "seo", parent: "launch", title: "Check redirects", status: "open", due: "2026-10-30" },
      { ref: "news", parent: "launch", title: "Write the news post", status: "open", assignee: "Lea", due: "2026-11-02" },
      { ref: "golive", parent: "launch", title: "Go live on November 3", decision: "proposed" },
    ],
    notes: {
      "Studies/Physics/Work.md": "# Work\n\nMechanical work W = F · s. In thermodynamics: volume work W = −p · ΔV.\n",
      "Studies/Physics/Heat.md": "# Heat\n\nEnergy transferred because of a temperature difference.\n",
      "Studies/Maths/Calculus.md": "# Calculus\n\n## Sequences\n\n## Series\n\n## Integrals\n",
      "Journal/2026-10-04.md": "# October 4\n\nExam plan done, revise Carnot tomorrow.\n",
      "Reading/Books 2026.md": "# Books 2026\n\n## Read\n\n## Up next\n",
      "Ideas.md": "# Ideas\n\n## Blog\n\n## Projects\n",
    } as Record<string, string>,
  },
} as const;

export interface DemoScenes {
  vault: string;
  study: { path: string; inkNode: string; examNode: string; presentNode: string };
  project: { path: string; taskNode: string };
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function writeDemoVault(outDir: string, locale: DemoLocale): DemoScenes {
  const text = TEXT[locale];
  const vaultDir = join(outDir, text.vault);
  write(join(vaultDir, ".obsidian/app.json"), `${JSON.stringify({ attachmentFolderPath: text.attachments }, null, 2)}\n`);
  write(join(vaultDir, text.attachments, text.inkName), serializeInkSvg(formulaInk(locale)));

  const study = buildMap({ title: text.studyTitle, area: locale === "de" ? "Studium" : "Studies", nodes: text.study_nodes(text.inkName) });
  const studyPath = `${text.study}/${text.studyTitle}.md`;
  write(join(vaultDir, studyPath), study.markdown);

  const project = buildMap({ title: text.projectTitle, area: locale === "de" ? "Arbeit" : "Work", nodes: text.project_nodes() });
  const projectPath = `${text.project}/${text.projectTitle}.md`;
  write(join(vaultDir, projectPath), project.markdown);

  for (const [path, markdown] of Object.entries(text.notes)) write(join(vaultDir, path), markdown);

  const scenes: DemoScenes = {
    vault: text.vault,
    study: { path: studyPath, inkNode: study.ids.first!, examNode: study.ids.exam!, presentNode: study.ids.carnot! },
    project: { path: projectPath, taskNode: project.ids.pages! },
  };
  write(join(outDir, "scenes.json"), `${JSON.stringify(scenes, null, 2)}\n`);
  return scenes;
}

if (import.meta.main) {
  const [outDir, locale] = process.argv.slice(2);
  if (!outDir || (locale !== "de" && locale !== "en")) {
    console.error("usage: bun demo-vault.ts <out-dir> <de|en>");
    process.exit(1);
  }
  console.log(JSON.stringify(writeDemoVault(outDir, locale), null, 2));
}
