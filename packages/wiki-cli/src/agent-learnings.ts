/**
 * `bloommd-wiki agent search|read|create|append|stale`: the learnings of a vault or cloud workspace as
 * single commands with JSON on stdout, for scripts and for the adapter `wissen/bloommd` in `md-agents`.
 *
 * Everything runs through `KnowledgeService`, so the rights of the agent (read, propose, write per area),
 * the change log, undo and the proposal review are exactly those of the MCP tools. There is no approve:
 * a proposal is applied by a person with `agent approve`.
 *
 * stdout carries one JSON document (`--help` aside); errors are `{"fehler": …}` on stdout and a message on
 * stderr. Exit codes: 0 ok, 1 error, 2 wrong call, 3 duplicate, 4 write limit of the ticket reached.
 */
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { areaCovers, cloudAreaOf, vaultAreaPath } from "@bloommd/core/agent-ledger";
import { parseFrontmatter } from "@bloommd/core/frontmatter";
import {
  isKnowledgeInputError,
  knowledgeLifecycle,
  outlineMarkdown,
  parseKnowledgeFrontmatterInput,
  readKnowledgeFrontmatter,
  type KnowledgeFrontmatter,
  type KnowledgeNodeInput,
} from "@bloommd/core/knowledge";
import { addDays, LEARNING_STALE_AFTER_DAYS } from "@bloommd/core/knowledge-templates";
import type { CommitResult, KnowledgeService } from "./knowledge-service";
import { safeVaultPath } from "./knowledge-store";

export const EXIT = { ok: 0, error: 1, usage: 2, duplicate: 3, limit: 4 } as const;

/** Learnings live in this area (folder `Learnings/<rolle>/`); the commands touch nothing else. */
export const LEARNINGS_AREA = "Learnings";
/** At most this many writes (`create` and `append` together) per ticket id. */
export const WRITE_LIMIT_PER_TICKET = 3;
/** A new learning at or above this similarity to an existing one (and sharing a tag) is a duplicate. */
export const DUPLICATE_THRESHOLD = 0.7;
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 50;
const ROLES = ["architect", "coder", "tester", "chief"];
const SECTIONS: Record<string, string> = { symptom: "Symptom", ursache: "Ursache", regel: "Regel", beleg: "Beleg", "gilt-fuer": "Gilt für", aufgaben: "Aufgaben" };
const RETIRED = new Set(["veraltet", "ersetzt"]);

/** A failure with its exit code and extra JSON fields; every other error is exit 1 (or 2 for invalid input). */
export class LearningCliError extends Error {
  constructor(readonly code: number, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const usageError = (message: string) => new LearningCliError(EXIT.usage, message);

export interface LearningTarget {
  vault?: string;
  cloud?: string;
  workspace?: string;
  name: string;
}

export interface LearningDeps {
  /** The knowledge service of the target (rights, log and proposals as for `agent mcp`). */
  open(target: LearningTarget): Promise<KnowledgeService>;
  /** Reads stdin for `--inhalt -`. */
  stdin?: () => string;
  now?: () => Date;
}

const TARGET_FLAGS = ["--vault", "--cloud", "--workspace", "--name"];

interface CommandSpec {
  usage: string;
  help: string;
  /** Flags with a value; `many` ones may repeat. */
  values: string[];
  many?: string[];
  bools?: string[];
  positional: { min: number; max: number };
}

const TARGET_HELP = `  --vault <ordner>   Vault (z. B. /data/learnings) — oder
  --cloud <url> [--workspace <id>]   Cloud-Workspace, Token aus BLOOMMD_TOKEN
  --name <agent>     Name des Agenten (Rolle) für Protokoll und verified`;

const COMMANDS: Record<string, CommandSpec> = {
  search: {
    usage: "agent search <text> [--rolle <r>] [--tag <t>] [--komponente <c>] [--include-stale] [--limit <n>] (--vault <ordner> | --cloud <url> [--workspace <id>])",
    help: `Sucht Learnings (Bereich Learnings) und gibt die Treffer als JSON aus.
  <text>             Suchtext; darf fehlen, wenn --rolle, --tag oder --komponente gesetzt ist
  --rolle <r>        nur Learnings mit diesem Rollen-Tag (architect, coder, tester, chief …)
  --tag <t>          nur Learnings mit diesem Tag (zusätzlich zu --rolle)
  --komponente <c>   nur Learnings, deren scope diesen Text enthält
  --include-stale    auch abgelaufene (stale_after) und veraltete/ersetzte Learnings
  --limit <n>        höchstens n Treffer (Standard ${DEFAULT_SEARCH_LIMIT}, höchstens ${MAX_SEARCH_LIMIT})
${TARGET_HELP}
Ausgabe: {"treffer":[{"pfad","titel","status","rolle","tags","auszug","stale_after","abgelaufen"}],"anzahl","gesamt","limit"}`,
    values: ["--rolle", "--limit", "--komponente", ...TARGET_FLAGS],
    many: ["--tag"],
    bools: ["--include-stale"],
    positional: { min: 0, max: 1 },
  },
  read: {
    usage: "agent read <pfad> (--vault <ordner> | --cloud <url> [--workspace <id>])",
    help: `Liest ein Learning (Pfad aus agent search) als JSON.
${TARGET_HELP}
Ausgabe: {"pfad","version","bereich","frontmatter":{…},"inhalt":"<Markdown ohne Frontmatter>"}`,
    values: TARGET_FLAGS,
    positional: { min: 1, max: 1 },
  },
  create: {
    usage: "agent create --titel <t> --rolle <r> --beleg <url> --inhalt <text|-> --ticket <id> --name <agent> [--tag <t>] [--komponente <c>] [--scope <s>] (--vault <ordner> | --cloud <url> [--workspace <id>])",
    help: `Legt ein Learning nach der Vorlage learning an (Status neu, stale_after in 90 Tagen).
  --titel <t>        Symptom oder Regel in einem kurzen Satz
  --rolle <r>        Rolle; das Learning liegt unter Learnings/<rolle>/ und trägt die Rolle als Tag
  --beleg <url>      Beleg-Link (Ticket, Pull Request, CI-Lauf), http(s)
  --inhalt <text|->  Inhalt als Markdown; "-" liest stdin. Ohne Überschriften kommt er unter „Regel“;
                     mit den Überschriften "## Symptom", "## Ursache", "## Regel" je Abschnitt
  --ticket <id>      Pflicht: Schleifenschutz, höchstens ${WRITE_LIMIT_PER_TICKET} Schreibvorgänge je Ticket
  --tag <t>          weiterer Tag (wiederholbar)
  --komponente <c>   Komponente, für die es gilt (kommt in scope und „Gilt für“)
  --scope <s>        scope selbst setzen (Standard: <komponente>, <rolle>)
${TARGET_HELP}
Gibt es ein sehr ähnliches Learning (gleicher Titel oder hohe Ähnlichkeit bei Titel und Tags), wird nichts
angelegt: Exitcode 3 und {"fehler","duplicate":true,"pfad"}; dann agent append nehmen. Es gibt kein --force.
Ausgabe: {"ok":true,"pfad","status":"neu","modus":"geschrieben"|"vorgeschlagen",…}`,
    values: ["--titel", "--rolle", "--beleg", "--inhalt", "--ticket", "--komponente", "--scope", ...TARGET_FLAGS],
    many: ["--tag"],
    positional: { min: 0, max: 0 },
  },
  append: {
    usage: "agent append <pfad> --ticket <id> --name <agent> (--inhalt <text|-> | --beleg <url>) [--abschnitt <a>] [--titel <t>] (--vault <ordner> | --cloud <url> [--workspace <id>])",
    help: `Ergänzt ein bestehendes Learning um einen neuen Knoten und/oder einen Beleg-Link und hängt einen
verified-Eintrag (by = --name, at = heute) an. Ist das Learning nicht veraltet/ersetzt, wird stale_after auf
heute + ${LEARNING_STALE_AFTER_DAYS} Tage verlängert, falls es früher abläuft. Der Status bleibt unverändert.
  --inhalt <text|->  neuer Knoten mit diesem Inhalt (Markdown ohne Überschriften); "-" liest stdin
  --abschnitt <a>    Abschnitt, in den er kommt: symptom, ursache, regel (Standard), beleg, gilt-fuer, aufgaben
  --titel <t>        Titel des neuen Knotens (Standard: erste Zeile des Inhalts)
  --beleg <url>      Beleg-Link, wird als Knoten unter „Beleg“ ergänzt
  --ticket <id>      Pflicht: Schleifenschutz, höchstens ${WRITE_LIMIT_PER_TICKET} Schreibvorgänge je Ticket
${TARGET_HELP}
Ausgabe: {"ok":true,"pfad","modus":"geschrieben"|"vorgeschlagen",…}`,
    values: ["--ticket", "--inhalt", "--abschnitt", "--titel", "--beleg", ...TARGET_FLAGS],
    positional: { min: 1, max: 1 },
  },
  stale: {
    usage: "agent stale [--days <n>] [--json] (--vault <ordner> | --cloud <url> [--workspace <id>])",
    help: `Zeigt Learnings mit abgelaufenem stale_after (mit --days auch die der nächsten n Tage) als JSON.
Gleiche Logik wie das MCP-Werkzeug bloommd_stale, begrenzt auf den Bereich Learnings.
${TARGET_HELP}
Ausgabe: {"stale":[{"pfad","titel","status","stale_after","tage_ueberfaellig","abgelaufen","scope"}],"anzahl","tage"}
Die Form "agent stale <ordner>" (Text, NO_REPLY ohne Treffer) bleibt für Routinen bestehen; JSON gibt es mit
--vault oder --json.`,
    values: ["--days", ...TARGET_FLAGS],
    bools: ["--json"],
    positional: { min: 0, max: 0 },
  },
};

/** The commands of this module, for the usage text. */
export const LEARNING_USAGE = `Learnings als Einzelbefehle (JSON auf stdout; Grundlage des Adapters wissen/bloommd in md-agents):
${Object.values(COMMANDS).map((spec) => `  ${spec.usage}`).join("\n")}
  Alle Befehle: --vault <ordner> oder --cloud <url> [--workspace <id>] (Token in BLOOMMD_TOKEN), dazu --name <agent>.
  create und append brauchen --ticket <id> (höchstens ${WRITE_LIMIT_PER_TICKET} Schreibvorgänge je Ticket). Exitcodes: 0 ok, 1 Fehler,
  2 Aufruf, 3 Duplikat, 4 Limit. Hilfe je Befehl: agent <befehl> --help. Rechte wie bei agent mcp; freigeben
  können nur Menschen (agent approve).`;

export function isLearningCommand(command: string | undefined): boolean {
  return command !== undefined && Object.hasOwn(COMMANDS, command);
}

interface Parsed {
  positional: string[];
  values: Map<string, string[]>;
  bools: Set<string>;
}

function parse(command: string, spec: CommandSpec, args: string[]): Parsed {
  const parsed: Parsed = { positional: [], values: new Map(), bools: new Set() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
    } else if (spec.bools?.includes(arg)) {
      parsed.bools.add(arg);
    } else if (spec.values.includes(arg) || spec.many?.includes(arg)) {
      const value = args[index + 1];
      if (value === undefined) throw usageError(`${arg} braucht einen Wert.`);
      index += 1;
      const list = parsed.values.get(arg) ?? [];
      if (list.length > 0 && !spec.many?.includes(arg)) throw usageError(`${arg} darf nur einmal vorkommen.`);
      parsed.values.set(arg, [...list, value]);
    } else {
      throw usageError(`Unbekannte Option ${arg} für agent ${command}.`);
    }
  }
  if (parsed.positional.length < spec.positional.min || parsed.positional.length > spec.positional.max) throw usageError(`Aufruf: ${spec.usage}`);
  return parsed;
}

const one = (parsed: Parsed, flag: string): string | undefined => parsed.values.get(flag)?.[0];

function required(parsed: Parsed, flag: string): string {
  const value = one(parsed, flag)?.trim();
  if (!value) throw usageError(`${flag} fehlt.`);
  return value;
}

function targetOf(parsed: Parsed, needsName: boolean): LearningTarget {
  const vault = one(parsed, "--vault");
  const cloud = one(parsed, "--cloud");
  if (vault && cloud) throw usageError("--vault und --cloud schließen sich aus.");
  if (!vault && !cloud) throw usageError("--vault <ordner> oder --cloud <url> fehlt.");
  const name = needsName ? required(parsed, "--name") : one(parsed, "--name")?.trim() || "Agent";
  return { ...(vault ? { vault } : { cloud: cloud! }), workspace: one(parsed, "--workspace"), name };
}

/** Text of `--inhalt`; `-` reads stdin. */
function contentOf(value: string, deps: LearningDeps): string {
  const text = value === "-" ? (deps.stdin ?? (() => { throw usageError("stdin ist nicht verfügbar."); }))() : value;
  return text.replace(/\r\n?/g, "\n").trim();
}

function ticketOf(parsed: Parsed): string {
  const ticket = required(parsed, "--ticket").replace(/^#/, "");
  // The id becomes a folder name: no separators, no leading dot.
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(ticket)) throw usageError(`--ticket "${ticket}" ist keine gültige Ticket-ID (Buchstaben, Ziffern, _ . -).`);
  return ticket;
}

function linkOf(value: string): string {
  const link = value.trim();
  if (link.length > 500 || !/^https?:\/\/[^\s<>]+$/i.test(link)) throw usageError("--beleg erwartet einen http(s)-Link ohne Leerzeichen.");
  return link;
}

const today = (deps: LearningDeps): string => (deps.now?.() ?? new Date()).toISOString().slice(0, 10);

function areaOf(service: KnowledgeService, path: string): string {
  return service.store.kind === "cloud" ? cloudAreaOf(path) : vaultAreaPath(path);
}

/** A learning path from the command line: inside the vault and inside the Learnings area. */
function learningPath(service: KnowledgeService, path: string): string {
  if (service.store.kind === "vault") {
    try {
      path = safeVaultPath(path);
    } catch (error) {
      throw usageError(error instanceof Error ? error.message : String(error));
    }
  }
  if (!areaCovers(LEARNINGS_AREA, areaOf(service, path))) throw usageError(`"${path}" liegt nicht im Bereich ${LEARNINGS_AREA}.`);
  return path;
}

function roleOf(path: string, tags: string[]): string | null {
  const tagged = tags.find((tag) => ROLES.includes(tag.toLowerCase()));
  if (tagged) return tagged.toLowerCase();
  const parts = path.split("/");
  return parts.length > 2 ? parts[1]!.toLowerCase() : null;
}

const excerpt = (text: string, length = 160): string => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/** The frontmatter of a learning as the commands show it. */
function frontmatterView(path: string, frontmatter: KnowledgeFrontmatter, now: string) {
  const lifecycle = knowledgeLifecycle(frontmatter, now);
  return {
    titel: frontmatter.title ?? null,
    status: frontmatter.status ?? null,
    rolle: roleOf(path, frontmatter.tags),
    tags: frontmatter.tags,
    scope: frontmatter.scope ?? null,
    source: frontmatter.source ?? null,
    created: frontmatter.created ?? null,
    stale_after: frontmatter.stale_after ?? null,
    abgelaufen: lifecycle.expired ?? false,
    verified: frontmatter.verified,
    ...(frontmatter.replaced_by ? { replaced_by: frontmatter.replaced_by } : {}),
  };
}

// --- write counter and lock ------------------------------------------------------------------

/**
 * One free slot of `WRITE_LIMIT_PER_TICKET` per write, claimed by creating its file exclusively
 * (`wx`): the operating system lets exactly one of several parallel callers win each slot, so the
 * count cannot be exceeded. The state lives next to the other agent state (`.bloommd/` of the vault).
 */
async function claimWrite(stateDir: string, ticket: string, info: Record<string, unknown>) {
  const dir = join(stateDir, "ticket-writes", ticket);
  await mkdir(dir, { recursive: true });
  for (let slot = 1; slot <= WRITE_LIMIT_PER_TICKET; slot += 1) {
    const file = join(dir, `${slot}.json`);
    let handle;
    try {
      handle = await open(file, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    try {
      await handle.writeFile(`${JSON.stringify({ ...info, at: new Date().toISOString() })}\n`);
    } finally {
      await handle.close();
    }
    return {
      slot,
      /** Nothing was written (duplicate, refused, failed): the slot is free again. */
      release: () => rm(file, { force: true }),
      /** Remembers what the slot was used for; the claim itself is what counts. */
      async record(extra: Record<string, unknown>) {
        await writeFile(file, `${JSON.stringify({ ...info, ...extra, at: new Date().toISOString() })}\n`, "utf8").catch((error: unknown) => {
          process.stderr.write(`Hinweis: Schreibzähler konnte nicht ergänzt werden: ${error instanceof Error ? error.message : String(error)}\n`);
        });
      },
    };
  }
  throw new LearningCliError(EXIT.limit, `Höchstens ${WRITE_LIMIT_PER_TICKET} Schreibvorgänge je Ticket (${ticket}) erreicht.`, { limit: WRITE_LIMIT_PER_TICKET, ticket, geschrieben: WRITE_LIMIT_PER_TICKET });
}

const LOCK_STALE_MS = 60_000;
const LOCK_WAIT_MS = 30_000;

/** Serializes `task` across processes with a lock folder (`mkdir` is atomic); a lock older than a minute is taken over. */
async function withLock<T>(stateDir: string, name: string, task: () => Promise<T>): Promise<T> {
  const dir = join(stateDir, "locks");
  const lock = join(dir, name);
  await mkdir(dir, { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(lock).then((info) => Date.now() - info.mtimeMs, () => 0);
      if (age > LOCK_STALE_MS) await rm(lock, { recursive: true, force: true });
      else if (Date.now() - started > LOCK_WAIT_MS) throw new LearningCliError(EXIT.error, `Sperre ${name} ist belegt; später erneut versuchen.`);
      else await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await task();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

// --- duplicates ------------------------------------------------------------------------------

const STOPWORDS = new Set(["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "und", "oder", "mit", "für", "von", "bei", "wenn", "the", "and", "for", "with"]);

const normalizeTitle = (title: string): string => title.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function tokens(text: string): Set<string> {
  return new Set(normalizeTitle(text).split(" ").filter((word) => word.length >= 3 && !STOPWORDS.has(word)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const shared = [...a].filter((entry) => b.has(entry)).length;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Tags that say something about the content (the area tag `bereich/…` is on every learning). */
const contentTags = (tags: string[]): Set<string> => new Set(tags.map((tag) => tag.toLowerCase()).filter((tag) => !tag.startsWith("bereich/")));

/**
 * How alike two learnings are, 0 to 1: 1 for the same title (ignoring case and punctuation), else
 * 70 % word overlap of the titles and 30 % overlap of the tags (the role is a tag). Learnings that
 * share no tag are never fuzzy duplicates.
 */
export function learningSimilarity(a: { title: string; tags: string[] }, b: { title: string; tags: string[] }): number {
  if (normalizeTitle(a.title) === normalizeTitle(b.title)) return 1;
  const tagsA = contentTags(a.tags);
  const tagsB = contentTags(b.tags);
  if (![...tagsA].some((tag) => tagsB.has(tag))) return 0;
  return Math.round((0.7 * jaccard(tokens(a.title), tokens(b.title)) + 0.3 * jaccard(tagsA, tagsB)) * 100) / 100;
}

/** The most similar existing learning at or above the threshold (retired ones are left out: they may be re-learned). */
async function findDuplicate(service: KnowledgeService, candidate: { title: string; tags: string[] }) {
  let best: { pfad: string; titel: string; aehnlichkeit: number } | null = null;
  for (const entry of (await service.store.list()).filter((map) => map.available !== false && areaCovers(LEARNINGS_AREA, map.area))) {
    const document = await service.store.read(entry.path).catch(() => null);
    if (!document) continue;
    const frontmatter = readKnowledgeFrontmatter(document.markdown);
    if (frontmatter.status && RETIRED.has(frontmatter.status.toLowerCase())) continue;
    const title = frontmatter.title ?? entry.title;
    const score = learningSimilarity(candidate, { title, tags: frontmatter.tags });
    if (score >= DUPLICATE_THRESHOLD && (!best || score > best.aehnlichkeit)) best = { pfad: entry.path, titel: title, aehnlichkeit: score };
  }
  return best;
}

// --- commands --------------------------------------------------------------------------------

async function search(service: KnowledgeService, parsed: Parsed, deps: LearningDeps) {
  const text = parsed.positional[0] ?? "";
  const rolle = one(parsed, "--rolle")?.trim();
  const komponente = one(parsed, "--komponente")?.trim();
  const tags = [...(rolle ? [rolle] : []), ...(parsed.values.get("--tag") ?? []).map((tag) => tag.trim()).filter(Boolean)];
  if (!text.trim() && tags.length === 0 && !komponente) throw usageError("Suchtext fehlt (oder --rolle, --tag, --komponente).");
  const limit = Number(one(parsed, "--limit") ?? DEFAULT_SEARCH_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) throw usageError(`--limit erwartet eine ganze Zahl von 1 bis ${MAX_SEARCH_LIMIT}.`);
  const now = deps.now?.();
  const { hits } = await service.search(text, { area: LEARNINGS_AREA, tags, scope: komponente, includeStale: parsed.bools.has("--include-stale"), limit: 500, now });
  // One entry per map: maps with a hit in title or frontmatter first, then the ones with more hits.
  const byMap = new Map<string, typeof hits>();
  for (const hit of hits) byMap.set(hit.path, [...(byMap.get(hit.path) ?? []), hit]);
  const ranked = [...byMap.entries()].sort(([pathA, a], [pathB, b]) => Number(b.some((hit) => hit.kind !== "node")) - Number(a.some((hit) => hit.kind !== "node")) || b.length - a.length || pathA.localeCompare(pathB));
  const day = (now ?? new Date()).toISOString().slice(0, 10);
  const treffer = [];
  for (const [path, mapHits] of ranked.slice(0, limit)) {
    const frontmatter = readKnowledgeFrontmatter((await service.store.read(path)).markdown);
    const best = mapHits.find((hit) => hit.kind === "node") ?? mapHits[0]!;
    const view = frontmatterView(path, frontmatter, day);
    treffer.push({ pfad: path, titel: view.titel ?? best.title, status: view.status, rolle: view.rolle, tags: view.tags, auszug: excerpt(best.snippet), stale_after: view.stale_after, abgelaufen: view.abgelaufen });
  }
  return { treffer, anzahl: treffer.length, gesamt: ranked.length, limit };
}

async function read(service: KnowledgeService, parsed: Parsed, deps: LearningDeps) {
  const document = await service.store.read(learningPath(service, parsed.positional[0]!));
  const bereich = areaOf(service, document.path);
  if (!areaCovers(LEARNINGS_AREA, bereich)) throw usageError(`"${document.path}" liegt nicht im Bereich ${LEARNINGS_AREA}.`);
  const frontmatter = readKnowledgeFrontmatter(document.markdown);
  return {
    pfad: document.path,
    version: document.version,
    bereich,
    frontmatter: frontmatterView(document.path, frontmatter, today(deps)),
    // BloomMD's own id and metadata comments are of no use to the reader.
    inhalt: parseFrontmatter(document.markdown).content.replace(/[ \t]*<!--\s*bloommd:.*?-->/g, "").trim(),
  };
}

async function stale(service: KnowledgeService, parsed: Parsed, deps: LearningDeps) {
  const days = Number(one(parsed, "--days") ?? 0);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw usageError("--days erwartet eine ganze Zahl von 0 bis 3650.");
  const result = await service.stale({ area: LEARNINGS_AREA, days, now: deps.now?.() });
  const list = result.stale.map((entry) => ({
    pfad: entry.path,
    titel: entry.title,
    status: entry.status ?? null,
    stale_after: entry.stale_after,
    tage_ueberfaellig: entry.daysOverdue,
    abgelaufen: entry.daysOverdue >= 0,
    scope: entry.scope ?? null,
  }));
  return { stale: list, anzahl: list.length, tage: days };
}

/** Splits `--inhalt` into the sections "## Symptom", "## Ursache", "## Regel"; text without these headings is the Regel. */
export function learningSections(text: string): Record<"symptom" | "ursache" | "regel", string> {
  const result = { symptom: "", ursache: "", regel: "" };
  const lines = text.split("\n");
  const heading = (line: string) => /^##\s+(Symptom|Ursache|Regel)\s*#*\s*$/i.exec(line)?.[1]?.toLowerCase() as keyof typeof result | undefined;
  if (!lines.some((line) => heading(line))) return { ...result, regel: text };
  let current: keyof typeof result | null = null;
  const parts: Record<string, string[]> = { symptom: [], ursache: [], regel: [] };
  for (const line of lines) {
    const next = heading(line);
    if (next) {
      current = next;
    } else if (current) {
      parts[current]!.push(line);
    } else if (line.trim()) {
      throw usageError("Text vor der ersten Überschrift: mit \"## Symptom\", \"## Ursache\", \"## Regel\" gliedern oder ganz ohne Überschriften.");
    }
  }
  for (const key of Object.keys(result) as Array<keyof typeof result>) result[key] = parts[key]!.join("\n").trim();
  return result;
}

function describeWrite(result: CommitResult) {
  return {
    pfad: result.path,
    modus: result.mode === "proposed" ? "vorgeschlagen" : "geschrieben",
    ...(result.changeId ? { aenderung: result.changeId } : {}),
    ...(result.proposalId ? { vorschlag: result.proposalId, hinweis: "Ein Mensch gibt den Vorschlag frei (agent approve); der Agent kann das nicht." } : {}),
    ...(result.version ? { version: result.version } : {}),
  };
}

async function create(service: KnowledgeService, parsed: Parsed, target: LearningTarget, deps: LearningDeps) {
  const titel = required(parsed, "--titel");
  const rolle = required(parsed, "--rolle").toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(rolle)) throw usageError("--rolle erwartet einen kurzen Namen aus Kleinbuchstaben, Ziffern und - (z. B. coder).");
  const beleg = linkOf(required(parsed, "--beleg"));
  const sections = learningSections(contentOf(required(parsed, "--inhalt"), deps));
  if (!sections.symptom && !sections.ursache && !sections.regel) throw usageError("--inhalt ist leer.");
  const ticket = ticketOf(parsed);
  const komponente = one(parsed, "--komponente")?.trim();
  const tags = [...new Set([rolle, ...(parsed.values.get("--tag") ?? []).map((tag) => tag.trim()).filter(Boolean)])];
  const scope = one(parsed, "--scope")?.trim() || [komponente, rolle].filter(Boolean).join(", ");
  const nodes: KnowledgeNodeInput[] = [
    // `id` of a skeleton ref of the template fills that section itself (as in the example learning).
    ...(["symptom", "ursache", "regel"] as const).flatMap((key) => (sections[key] ? [{ id: key, content: sections[key] }] : [])),
    { id: "beleg", content: `- ${beleg}` },
    { id: "gilt-fuer", content: [`- Rolle: ${rolle}`, ...(komponente ? [`- Komponente: ${komponente}`] : []), ...(one(parsed, "--scope") ? [`- Geltungsbereich: ${scope}`] : [])].join("\n") },
  ];
  const frontmatter = parseKnowledgeFrontmatterInput({ scope });
  const source = `Ticket ${ticket}, ${beleg}`;

  // Claim a slot first (atomic), then check for a duplicate under a lock so two parallel creates cannot both pass.
  const claim = await claimWrite(service.store.stateDir, ticket, { befehl: "create", agent: target.name, titel });
  let committed = false;
  try {
    const result = await withLock(service.store.stateDir, "create.lock", async () => {
      const duplicate = await findDuplicate(service, { title: titel, tags });
      if (duplicate) {
        throw new LearningCliError(EXIT.duplicate, `Ähnliches Learning vorhanden: ${duplicate.pfad}. Mit agent append ergänzen.`, { duplicate: true, ...duplicate, hinweis: "agent append <pfad> --ticket <id> …" });
      }
      return service.createMap({ area: `${LEARNINGS_AREA}/${rolle}`, title: titel, template: "learning", tags, nodes, frontmatter, source, reason: `Learning zu Ticket ${ticket}` });
    });
    committed = true;
    await claim.record({ pfad: result.path, modus: describeWrite(result).modus });
    return { ok: true, ...describeWrite(result), status: "neu", ticket, schreibvorgang: claim.slot, limit: WRITE_LIMIT_PER_TICKET };
  } finally {
    if (!committed) await claim.release();
  }
}

async function append(service: KnowledgeService, parsed: Parsed, target: LearningTarget, deps: LearningDeps) {
  const path = learningPath(service, parsed.positional[0]!);
  const ticket = ticketOf(parsed);
  const inhaltArg = one(parsed, "--inhalt");
  const belegArg = one(parsed, "--beleg");
  if (!inhaltArg && !belegArg) throw usageError("append braucht --inhalt und/oder --beleg.");
  const inhalt = inhaltArg ? contentOf(inhaltArg, deps) : "";
  if (inhaltArg && !inhalt) throw usageError("--inhalt ist leer.");
  const beleg = belegArg ? linkOf(belegArg) : undefined;
  const abschnitt = (one(parsed, "--abschnitt") ?? "regel").trim().toLowerCase();
  if (!Object.hasOwn(SECTIONS, abschnitt)) throw usageError(`--abschnitt erwartet ${Object.keys(SECTIONS).join(", ")}.`);

  const claim = await claimWrite(service.store.stateDir, ticket, { befehl: "append", agent: target.name, pfad: path });
  let committed = false;
  try {
    const document = await service.store.read(path);
    if (!areaCovers(LEARNINGS_AREA, areaOf(service, document.path))) throw usageError(`"${document.path}" liegt nicht im Bereich ${LEARNINGS_AREA}.`);
    const outline = outlineMarkdown(document.markdown);
    const section = (key: string) => {
      const node = outline.nodes.find((entry) => entry.parentId === outline.rootId && entry.title.trim().toLowerCase() === SECTIONS[key]!.toLowerCase());
      if (!node) throw new LearningCliError(EXIT.error, `Abschnitt „${SECTIONS[key]}“ fehlt in ${document.path}.`);
      return node.id;
    };
    const titel = one(parsed, "--titel")?.trim();
    const firstLine = inhalt.split("\n")[0]!.replace(/^[-*>\s]+/, "");
    // Without --titel a one-line text is the title of its node; longer text gets its first line as title.
    const short = !titel && !inhalt.includes("\n") && firstLine.length <= 80;
    const nodes: KnowledgeNodeInput[] = [
      ...(inhalt ? [{ parent: section(abschnitt), title: titel || (short ? firstLine : excerpt(firstLine, 60)), ...(short ? {} : { content: inhalt }) }] : []),
      ...(beleg ? [{ parent: section("beleg"), title: !inhalt && titel ? titel : `Beleg zu Ticket ${ticket}`, content: beleg, kind: "web" as const, url: beleg }] : []),
    ];
    const frontmatter = readKnowledgeFrontmatter(document.markdown);
    const renewed = addDays(today(deps), LEARNING_STALE_AFTER_DAYS);
    const retired = frontmatter.status !== undefined && RETIRED.has(frontmatter.status.toLowerCase());
    const renew = !retired && (!frontmatter.stale_after || frontmatter.stale_after.slice(0, 10) < renewed);
    const trust = parseKnowledgeFrontmatterInput({ verified: { by: target.name, at: today(deps) }, ...(renew ? { stale_after: renewed } : {}) });
    const result = await service.updateMap({ path: document.path, version: document.version, nodes, frontmatter: trust, source: `Ticket ${ticket}`, reason: `Ergänzung zu Ticket ${ticket}` });
    committed = true;
    await claim.record({ pfad: result.path, modus: describeWrite(result).modus });
    return { ok: true, ...describeWrite(result), verified: { by: target.name, at: today(deps) }, ...(renew ? { stale_after: renewed } : {}), ticket, schreibvorgang: claim.slot, limit: WRITE_LIMIT_PER_TICKET };
  } finally {
    if (!committed) await claim.release();
  }
}

/**
 * Runs one of the commands and prints its JSON; never throws. Returns the exit code.
 * `args` are the arguments after the command name.
 */
export async function runLearningCommand(command: string, args: string[], deps: LearningDeps): Promise<number> {
  const spec = COMMANDS[command];
  if (!spec) throw new Error(`Kein Learning-Befehl: ${command}`);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`bloommd-wiki ${spec.usage}\n\n${spec.help}`);
    return EXIT.ok;
  }
  try {
    const parsed = parse(command, spec, args);
    const writes = command === "create" || command === "append";
    const target = targetOf(parsed, writes);
    const service = await deps.open(target);
    let result: unknown;
    switch (command) {
      case "search": result = await search(service, parsed, deps); break;
      case "read": result = await read(service, parsed, deps); break;
      case "stale": result = await stale(service, parsed, deps); break;
      case "create": result = await create(service, parsed, target, deps); break;
      default: result = await append(service, parsed, target, deps);
    }
    console.log(JSON.stringify(result));
    return EXIT.ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof LearningCliError ? error.code : isKnowledgeInputError(error) ? EXIT.usage : EXIT.error;
    const extra = error instanceof LearningCliError ? error.extra : {};
    process.stderr.write(`${message}\n`);
    console.log(JSON.stringify({ fehler: message, ...(code === EXIT.usage ? { aufruf: `bloommd-wiki ${spec.usage}` } : {}), ...extra }));
    return code;
  }
}
