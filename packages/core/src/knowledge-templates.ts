/**
 * Map templates for filing raw material (transcripts, chats, class notes) as clear, explainable
 * maps. A template is a skeleton of nodes plus guidance for the agent that fills it; the agent
 * extracts only what the source says and adds nodes below the skeleton.
 */
import type { KnowledgeNodeInput } from "./knowledge";

export interface KnowledgeTemplate {
  id: string;
  name: string;
  /** Suggested area (top-level folder) for maps made from this template. */
  area: string;
  description: string;
  /** How to fill the skeleton; written for the agent. */
  guidance: string[];
  skeleton: KnowledgeNodeInput[];
  /**
   * Extra frontmatter for maps made from this template (absent: none). `staleAfterDays` becomes a
   * concrete `stale_after` date (creation day + n days). `scope` comes from the call.
   */
  frontmatter?: { type: string; status?: string; staleAfterDays?: number };
}

/** Default review period of a learning, in days (see docs/LEARNINGS.md). */
export const LEARNING_STALE_AFTER_DAYS = 90;

const COMMON_GUIDANCE = [
  "Use only facts from the source. Mark open points as questions instead of guessing.",
  "One idea per node; titles are short (max. 8 words), details go into the node content.",
  "Tasks get status, and due/assignee only when the source names them (due as YYYY-MM-DD).",
  "Link related notes with `note` and connect related nodes with `relations` and a short label.",
  "Add the source (file, recording, date) as a node of kind `source` or as `citation`.",
];

export const KNOWLEDGE_TEMPLATES: KnowledgeTemplate[] = [
  {
    id: "meeting",
    name: "Besprechung",
    area: "Arbeit",
    description: "Meeting or call with colleagues: who, topics, decisions, tasks, open questions.",
    guidance: [
      "Put each agenda topic under Themen with its key points as children.",
      "Every agreed action becomes a task under Aufgaben with assignee and due date if mentioned.",
      "Decisions go under Entscheidungen (decision: accepted/proposed/rejected) and are connected to the topic they belong to.",
      ...COMMON_GUIDANCE,
    ],
    skeleton: [
      { ref: "teilnehmende", title: "Teilnehmende" },
      { ref: "themen", title: "Themen" },
      { ref: "entscheidungen", title: "Entscheidungen" },
      { ref: "aufgaben", title: "Aufgaben" },
      { ref: "fragen", title: "Offene Fragen" },
      { ref: "quellen", title: "Quellen", kind: "source" },
    ],
  },
  {
    id: "conversation",
    name: "Gespräch",
    area: "Gespräche",
    description: "Personal or one-on-one conversation: what was said, what matters, what follows.",
    guidance: [
      "Summarise each subject of the conversation as a node under Inhalte, with quotes only when they matter.",
      "Agreements and promises become tasks under Nächste Schritte.",
      ...COMMON_GUIDANCE,
    ],
    skeleton: [
      { ref: "anlass", title: "Anlass" },
      { ref: "inhalte", title: "Inhalte" },
      { ref: "erkenntnisse", title: "Erkenntnisse" },
      { ref: "schritte", title: "Nächste Schritte" },
      { ref: "quellen", title: "Quellen", kind: "source" },
    ],
  },
  {
    id: "discussion",
    name: "Diskussion",
    area: "Arbeit",
    description: "Debate of a question: positions, arguments for and against, result.",
    guidance: [
      "Each position is a node under Positionen; its arguments are children, connected with relations labelled 'spricht für' or 'spricht gegen'.",
      "The result is a decision node (accepted/proposed) under Ergebnis.",
      ...COMMON_GUIDANCE,
    ],
    skeleton: [
      { ref: "frage", title: "Fragestellung" },
      { ref: "positionen", title: "Positionen" },
      { ref: "ergebnis", title: "Ergebnis" },
      { ref: "fragen", title: "Offene Fragen" },
      { ref: "quellen", title: "Quellen", kind: "source" },
    ],
  },
  {
    id: "lesson",
    name: "Lerneinheit",
    area: "Schule",
    description: "School or study topic: concepts with definitions, formulas, examples and review questions.",
    guidance: [
      "Each concept is a node under Begriffe: definition first, then a simple explanation in the content.",
      "Formulas go under Formeln with every symbol explained; connect a formula to the concepts it uses ('verwendet').",
      "Under Lernfragen write questions as node titles and the answer as content; study mode shows the title and hides the answer.",
      "Explain for a student: short sentences, one example per concept.",
      ...COMMON_GUIDANCE,
    ],
    skeleton: [
      { ref: "ueberblick", title: "Überblick" },
      { ref: "begriffe", title: "Begriffe" },
      { ref: "formeln", title: "Formeln" },
      { ref: "beispiele", title: "Beispiele" },
      { ref: "lernfragen", title: "Lernfragen" },
      { ref: "quellen", title: "Quellen", kind: "source" },
    ],
  },
  {
    id: "project",
    name: "Projekt",
    area: "Projekte",
    description: "Project: goal, work packages, risks, decisions, people.",
    guidance: [
      "Work packages are children of Arbeitspakete; their tasks are children with status, assignee and due date.",
      "Risks name a countermeasure in their content; connect a risk to the package it threatens ('gefährdet').",
      ...COMMON_GUIDANCE,
    ],
    skeleton: [
      { ref: "ziel", title: "Ziel" },
      { ref: "pakete", title: "Arbeitspakete" },
      { ref: "risiken", title: "Risiken" },
      { ref: "entscheidungen", title: "Entscheidungen" },
      { ref: "beteiligte", title: "Beteiligte" },
      { ref: "quellen", title: "Quellen", kind: "source" },
    ],
  },
  {
    id: "weekly",
    name: "Wochenrückblick",
    area: "Gespräche",
    description: "Weekly review across areas: done, open, next week.",
    guidance: [
      "Pull open tasks from other maps with their `note` link instead of copying them.",
      ...COMMON_GUIDANCE,
    ],
    skeleton: [
      { ref: "erledigt", title: "Erledigt" },
      { ref: "offen", title: "Offen" },
      { ref: "naechste", title: "Nächste Woche" },
    ],
  },
  {
    id: "learning",
    name: "Learning",
    area: "Learnings",
    description: "A lesson learned by an agent or a person: symptom, cause, rule, evidence and where it applies. Knowledge, not a rule.",
    guidance: [
      "Suchen vor anlegen: bloommd_search im Bereich Learnings (Filter tag für die Rolle, scope für die Komponente, status; ohne includeStale kommen abgelaufene, veraltete und verworfene nicht); gibt es das Learning schon, ergänze Beleg oder Gilt für per bloommd_update_map, statt ein Duplikat anzulegen.",
      "Ein Learning pro Map; der Titel nennt das Symptom oder die Regel in einem kurzen Satz.",
      "Symptom: was beobachtet wurde (Fehlermeldung als Auszug, nicht als Rohlog). Ursache: warum es passierte. Regel: was künftig zu tun ist, als konkrete Handlung.",
      "Beleg: Ticket, PR oder CI-Lauf als Link; nur Auszug und Link, keine Rohlogs. Ein zweiter Beleg oder eine Bestätigung durch einen Menschen hebt den Status auf bestätigt.",
      "Gilt für: Brand, Rolle und Komponente, für die das Learning gilt. Rolle zusätzlich als Tag (architect, coder, tester, chief).",
      "Aufgaben ist optional: nur füllen, wenn aus dem Learning Folgearbeit entsteht; sonst leer lassen.",
      "Übergib scope (z. B. 'BloomMD, coder') und source (Ticket oder Lauf) beim Anlegen; Status, Typ und stale_after setzt die Vorlage, status und stale_after lassen sich beim Anlegen überschreiben.",
      "Später per bloommd_update_map nur die Felder ändern, die sich ändern: status (bestätigt, veraltet, ersetzt, verworfen; unbestätigt für eine abgeleitete Aussage ohne Beleg), stale_after verlängern, verified (by, at) anhängen, replaced_by nur mit status ersetzt. Abgelaufene Learnings listet bloommd_stale.",
      "Keine Secrets, keine Personendaten, keine Rohlogs.",
      "Learnings sind Wissen, keine Regeln: Änderungen am Verhalten der Agenten (Regeln, Rollen, Hooks) laufen als Pull Request mit Review, nie nur als Learning.",
    ],
    skeleton: [
      { ref: "symptom", title: "Symptom" },
      { ref: "ursache", title: "Ursache" },
      { ref: "regel", title: "Regel" },
      { ref: "beleg", title: "Beleg" },
      { ref: "gilt-fuer", title: "Gilt für" },
      { ref: "aufgaben", title: "Aufgaben" },
    ],
    frontmatter: { type: "learning", status: "neu", staleAfterDays: LEARNING_STALE_AFTER_DAYS },
  },
];

export function knowledgeTemplate(id: string): KnowledgeTemplate | null {
  return KNOWLEDGE_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** Day `days` after `date` (both `YYYY-MM-DD`, UTC). */
export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** The frontmatter fields a template adds to a new map; empty for templates without `frontmatter`. */
export function templateFrontmatter(template: KnowledgeTemplate | null, options: { date: string; scope?: string }): Record<string, string> {
  const spec = template?.frontmatter;
  if (!spec) return {};
  const scope = options.scope?.replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  return {
    type: spec.type,
    ...(spec.status ? { status: spec.status } : {}),
    ...(scope ? { scope } : {}),
    ...(spec.staleAfterDays !== undefined ? { stale_after: addDays(options.date, spec.staleAfterDays) } : {}),
  };
}
