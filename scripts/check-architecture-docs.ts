#!/usr/bin/env bun
/**
 * Verifies docs/ARCHITECTURE.md against the repository: packages, commands, paths, storage and sync
 * identifiers, Node version and the "Verified against" stamp. Deterministic, no network, no database.
 *
 * Usage: bun scripts/check-architecture-docs.ts [--doc <path>] [--root <path>]
 * Exit 1 when a statement deviates, 0 otherwise.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Finding {
  section: string;
  statement: string;
  problem: string;
}

export interface CheckOptions {
  root: string;
  docPath?: string;
}

/**
 * Workspace paths that are deliberately absent from the package table. Key: repo-relative path.
 * Every entry needs a reason (e.g. "explicitly versioned").
 */
export const PACKAGE_TABLE_EXCEPTIONS: Record<string, string> = {};

/**
 * Known, accepted deviations. `key` is `<section>: <statement>` of the finding it silences.
 * Every entry needs a reason (e.g. "explicitly versioned: <what and until when>").
 */
export const KNOWN_DEVIATIONS: { key: string; reason: string }[] = [];

const PATH_ROOTS = ["packages", "apps", "plugins"];
const BUN_BUILTINS = new Set([
  "add", "audit", "build", "create", "init", "install", "link", "outdated", "patch", "pm", "publish",
  "remove", "test", "unlink", "update", "upgrade", "why", "x",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".sql", ".sh", ".yml", ".yaml", ".json", ".example"]);
const SKIPPED_DIRS = new Set(["node_modules", ".next", ".git", ".turbo", "dist", "build", "coverage", "artifacts", "release"]);
const SOURCE_DIRS = ["apps", "packages", "plugins", "deploy", "scripts"];
const STAMP_PATTERN = /^Verified against: (\d{4}-\d{2}-\d{2}) · BloomMD (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) · ([0-9a-f]{7,40})$/;
const STAMP_MAX_LINE = 8;

interface DocLine {
  text: string;
  fenced: boolean;
}

interface Section {
  name: string;
  lines: DocLine[];
}

interface SourceClaim {
  section: string;
  statement: string;
  /** Text the doc section must still contain; otherwise this rule no longer tests a doc statement. */
  docTerm: string;
  needle: RegExp;
  /** Repo-relative directories or files searched. */
  where: string[];
}

/** One load-bearing identifier per doc statement, found by text search in the source. */
const SOURCE_CLAIMS: SourceClaim[] = [
  { section: "Local Storage", statement: "FileStore", docTerm: "FileStore", needle: /export class FileStore\b/, where: ["packages/core/src"] },
  { section: "Local Storage", statement: "path traversal protection", docTerm: "traversal protection", needle: /assertPathInDirectory/, where: ["packages/core/src/fileStore.ts"] },
  { section: "Local Storage", statement: "backups", docTerm: "backups", needle: /"backups"/, where: ["packages/core/src/fileStore.ts"] },
  { section: "Local Storage", statement: "File System Access API", docTerm: "File System Access API", needle: /showDirectoryPicker/, where: ["apps/app/src"] },
  { section: "Postgres Cloud Storage", statement: "roles owner, editor, viewer", docTerm: "`viewer`", needle: /role in \('owner', 'editor', 'viewer'\)/, where: ["apps/app/db"] },
  { section: "Postgres Cloud Storage", statement: "soft deletion of documents", docTerm: "soft deletion", needle: /deleted_at/, where: ["apps/app/db"] },
  { section: "Postgres Cloud Storage", statement: "composite foreign key (document_id, workspace_id)", docTerm: "composite database foreign key", needle: /foreign key \(document_id, workspace_id\)/i, where: ["apps/app/db"] },
  { section: "Realtime Sync", statement: "signed HMAC sync ticket", docTerm: "HMAC ticket", needle: /createHmac\("sha256"/, where: ["packages/core/src/sync-ticket.ts"] },
  { section: "Realtime Sync", statement: "five-minute ticket lifetime", docTerm: "five-minute", needle: /5 \* 60/, where: ["apps/app/src/app/api/sync-ticket"] },
  { section: "Realtime Sync", statement: "VERSION_CONFLICT", docTerm: "VERSION_CONFLICT", needle: /VERSION_CONFLICT/, where: ["packages/sync/src"] },
  { section: "Realtime Sync", statement: "internal sync command API", docTerm: "internal sync command API", needle: /"\/internal\/documents/, where: ["packages/sync/src/server.ts"] },
];

const IDENTIFIER_SECTIONS = ["Local Storage", "Postgres Cloud Storage", "Realtime Sync"];

function parseSections(markdown: string): Section[] {
  const sections: Section[] = [{ name: "Header", lines: [] }];
  let fence: string | null = null;
  for (const text of markdown.split(/\r?\n/)) {
    const marker = /^\s*(`{3,})(.*)$/.exec(text);
    if (marker) {
      if (fence === null) fence = marker[1];
      else if (marker[1].length >= fence.length && marker[2].trim() === "") fence = null;
      continue;
    }
    const heading = fence === null ? /^##\s+(.+?)\s*$/.exec(text) : null;
    if (heading) {
      sections.push({ name: heading[1], lines: [] });
      continue;
    }
    sections[sections.length - 1].lines.push({ text, fenced: fence !== null });
  }
  return sections;
}

function inlineSpans(section: Section): string[] {
  const spans: string[] = [];
  for (const line of section.lines) {
    if (line.fenced) continue;
    for (const match of line.text.matchAll(/`([^`\n]+)`/g)) spans.push(match[1]);
  }
  return spans;
}

/** Fenced lines and inline spans of a section: everything that can hold a shell command. */
function commandSnippets(section: Section): string[] {
  const fenced = section.lines.filter((line) => line.fenced).map((line) => line.text);
  return [...fenced, ...inlineSpans(section)];
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

interface WorkspacePackage {
  path: string;
  name: string;
}

function listWorkspaces(root: string): WorkspacePackage[] {
  const patterns = (readJson(join(root, "package.json")).workspaces ?? []) as string[];
  const found: WorkspacePackage[] = [];
  const add = (path: string) => {
    const manifest = join(root, path, "package.json");
    if (existsSync(manifest)) found.push({ path, name: String(readJson(manifest).name ?? path) });
  };
  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      add(pattern);
      continue;
    }
    const parent = pattern.slice(0, -2);
    for (const entry of readdirSync(join(root, parent)).sort()) {
      if (statSync(join(root, parent, entry)).isDirectory()) add(`${parent}/${entry}`);
    }
  }
  return found;
}

class SourceIndex {
  private files: string[] | null = null;
  private cache = new Map<string, string>();

  constructor(private root: string) {}

  private list(): string[] {
    if (this.files) return this.files;
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(join(this.root, dir))) return;
      for (const entry of readdirSync(join(this.root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRS.has(entry.name)) walk(rel);
        } else if (this.isSource(entry.name)) {
          files.push(rel);
        }
      }
    };
    SOURCE_DIRS.forEach(walk);
    this.files = files;
    return files;
  }

  private isSource(name: string): boolean {
    if (/\.(test|spec)\.[tj]sx?$/.test(name)) return false;
    const dot = name.lastIndexOf(".");
    return dot >= 0 && SOURCE_EXTENSIONS.has(name.slice(dot));
  }

  read(path: string): string {
    let content = this.cache.get(path);
    if (content === undefined) {
      content = readFileSync(join(this.root, path), "utf8");
      this.cache.set(path, content);
    }
    return content;
  }

  /** True when `needle` occurs in a non-test source file below one of `where` (directory or file). */
  contains(needle: RegExp | string, where: string[]): boolean {
    const matches = (text: string) => (typeof needle === "string" ? text.includes(needle) : needle.test(text));
    return this.list()
      .filter((file) => where.some((prefix) => file === prefix || file.startsWith(`${prefix}/`)))
      .some((file) => matches(this.read(file)));
  }
}

function checkPackages(sections: Section[], root: string, findings: Finding[]) {
  const section = sections.find((s) => s.name === "Packages");
  if (!section) {
    findings.push({ section: "Packages", statement: "section", problem: "Abschnitt „Packages“ fehlt" });
    return;
  }
  const tablePaths: string[] = [];
  for (const line of section.lines) {
    const row = /^\|\s*`([^`]+)`\s*\|/.exec(line.text);
    if (row) tablePaths.push(row[1]);
  }
  for (const path of tablePaths) {
    if (!existsSync(join(root, path))) findings.push({ section: "Packages", statement: path, problem: "Pfad aus der Paket-Tabelle existiert nicht" });
  }
  for (const workspace of listWorkspaces(root)) {
    if (tablePaths.includes(workspace.path) || workspace.path in PACKAGE_TABLE_EXCEPTIONS) continue;
    findings.push({ section: "Packages", statement: workspace.path, problem: `Workspace ${workspace.name} fehlt in der Paket-Tabelle` });
  }
}

function checkPaths(sections: Section[], root: string, findings: Finding[]) {
  for (const section of sections) {
    for (const span of inlineSpans(section)) {
      const match = /^((?:packages|apps|plugins)\/[A-Za-z0-9_.\-/]+?)\/?(?::\d+)?$/.exec(span);
      if (!match || !PATH_ROOTS.includes(match[1].split("/")[0])) continue;
      if (!existsSync(join(root, match[1]))) findings.push({ section: section.name, statement: span, problem: "genannter Pfad existiert nicht" });
    }
  }
}

function stripQuotes(token: string): string {
  return token.replace(/^['"]|['"]$/g, "");
}

function checkCommands(sections: Section[], root: string, findings: Finding[]) {
  const workspaces = listWorkspaces(root);
  for (const section of sections) {
    for (const snippet of commandSnippets(section)) {
      const code = snippet.replace(/\s#.*$/, "");
      for (const segment of code.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
        const tokens = segment.trim().split(/\s+/).map(stripQuotes);
        if (tokens[0] !== "bun" || tokens.length < 2) continue;
        const problem = bunCommandProblem(tokens.slice(1), root, workspaces);
        if (problem) findings.push({ section: section.name, statement: segment.trim(), problem });
      }
    }
  }
}

/** Returns a problem text, or null when the `bun …` command (without the leading `bun`) is valid. */
function bunCommandProblem(args: string[], root: string, workspaces: WorkspacePackage[]): string | null {
  let rest = args;
  if (rest[0] === "run") rest = rest.slice(1);
  else if (BUN_BUILTINS.has(rest[0])) return null;
  let dir = ".";
  let skipped = false;
  let target: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const flag = /^--(cwd|filter)(?:=(.*))?$/.exec(arg);
    if (flag) {
      const value = flag[2] ?? rest[++i] ?? "";
      if (flag[1] === "cwd") dir = value;
      else if (value.includes("*")) skipped = true;
      else {
        const workspace = workspaces.find((w) => w.name === value || w.path === value);
        if (!workspace) return `--filter ${value}: kein Workspace dieses Namens`;
        dir = workspace.path;
      }
    } else if (!arg.startsWith("-")) {
      target = arg;
      break;
    }
  }
  if (!target || skipped || /^(<.*>|\.{3}|…)$/.test(target)) return null; // placeholders like `bun run …`
  if (!existsSync(join(root, dir, "package.json"))) return `Verzeichnis ${dir} hat keine package.json`;
  if (/[/.]/.test(target)) return existsSync(join(root, dir, target)) ? null : `Datei ${target} existiert nicht in ${dir}`;
  const scripts = (readJson(join(root, dir, "package.json")).scripts ?? {}) as Record<string, string>;
  return target in scripts ? null : `Skript „${target}“ fehlt in ${dir}/package.json`;
}

function checkNodeVersion(sections: Section[], root: string, findings: Finding[]) {
  const range = String((readJson(join(root, "package.json")).engines as { node?: string } | undefined)?.node ?? "");
  const nvmrcPath = join(root, ".nvmrc");
  const nvmrcMajor = existsSync(nvmrcPath) ? /^v?(\d+)/.exec(readFileSync(nvmrcPath, "utf8").trim())?.[1] : undefined;
  let mentioned = false;
  for (const section of sections) {
    for (const line of section.lines) {
      const match = /\bnode\s+--version\b.*?\bv(\d+)(?:\.[\dx]+)*/i.exec(line.text) ?? /\bNode(?:\.js)?\s+v?(\d+)(?:\.[\dx]+)*\b/i.exec(line.text);
      if (!match) continue;
      mentioned = true;
      const statement = match[0];
      if (!range || !Bun.semver.satisfies(`${match[1]}.0.0`, range)) {
        findings.push({ section: section.name, statement, problem: `Node-Major ${match[1]} passt nicht zu engines.node „${range}“` });
      }
      if (nvmrcMajor !== match[1]) {
        findings.push({ section: section.name, statement, problem: `Node-Major ${match[1]} passt nicht zu .nvmrc (${nvmrcMajor ?? "fehlt"})` });
      }
    }
  }
  if (!mentioned) findings.push({ section: "Verification", statement: "Node-Version", problem: "Doku nennt keine Node-Version" });
}

function gitCommitExists(root: string, sha: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isShallowClone(root: string): boolean {
  try {
    return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, encoding: "utf8" }).trim() === "true";
  } catch {
    return false;
  }
}

function checkStamp(markdown: string, root: string, findings: Finding[], notes: string[]) {
  const head = markdown.split(/\r?\n/).slice(0, STAMP_MAX_LINE);
  const line = head.find((text) => text.startsWith("Verified against:"));
  const statement = "Verified against: <YYYY-MM-DD> · BloomMD <version> · <git-sha>";
  if (!line) {
    findings.push({ section: "Header", statement, problem: `Stand-Vermerk fehlt in den ersten ${STAMP_MAX_LINE} Zeilen` });
    return;
  }
  const match = STAMP_PATTERN.exec(line);
  if (!match) {
    findings.push({ section: "Header", statement: line, problem: `Stand-Vermerk hat nicht das Format „${statement}“` });
    return;
  }
  const [, date, , sha] = match;
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    findings.push({ section: "Header", statement: line, problem: `Datum ${date} ist kein gültiges ISO-Datum` });
  }
  if (gitCommitExists(root, sha)) return;
  if (isShallowClone(root)) notes.push(`Hinweis: SHA ${sha} nicht prüfbar (Shallow Clone); Existenz wird dort nicht erzwungen.`);
  else findings.push({ section: "Header", statement: line, problem: `Commit ${sha} existiert nicht im Repository` });
}

function checkSourceClaims(sections: Section[], index: SourceIndex, findings: Finding[]) {
  for (const claim of SOURCE_CLAIMS) {
    const section = sections.find((s) => s.name === claim.section);
    if (!section) {
      findings.push({ section: claim.section, statement: claim.statement, problem: `Abschnitt „${claim.section}“ fehlt` });
      continue;
    }
    const text = section.lines.map((line) => line.text).join("\n").toLowerCase();
    if (!text.includes(claim.docTerm.toLowerCase())) {
      findings.push({ section: claim.section, statement: claim.statement, problem: `Doku nennt „${claim.docTerm}“ nicht mehr; Prüfregel in scripts/check-architecture-docs.ts anpassen` });
      continue;
    }
    if (!index.contains(claim.needle, claim.where)) {
      findings.push({ section: claim.section, statement: claim.statement, problem: `nicht im Quellstand gefunden (${claim.where.join(", ")})` });
    }
  }
}

/** Tables, environment variables and ticket claims the doc names in backticks or code blocks. */
function checkNamedIdentifiers(sections: Section[], index: SourceIndex, findings: Finding[]) {
  for (const section of sections.filter((s) => IDENTIFIER_SECTIONS.includes(s.name))) {
    const names = new Set([
      ...inlineSpans(section),
      ...section.lines.filter((l) => l.fenced).flatMap((l) => /^([A-Z][A-Z0-9_]+)=/.exec(l.text)?.[1] ?? []),
    ]);
    for (const name of names) {
      if (/^bloom_[a-z_]+$/.test(name) && !index.contains(new RegExp(`create table (?:if not exists )?${name}\\b`, "i"), ["apps/app/db"])) {
        findings.push({ section: section.name, statement: name, problem: "Tabelle wird in apps/app/db nicht angelegt" });
      } else if (/^[A-Z][A-Z0-9_]{3,}$/.test(name) && !index.contains(name, ["apps", "packages", "deploy"])) {
        findings.push({ section: section.name, statement: name, problem: "Umgebungsvariable kommt im Quellstand nicht vor" });
      }
    }
  }
  const sync = sections.find((s) => s.name === "Realtime Sync");
  const ticketPath = "packages/core/src/sync-ticket.ts";
  const fields = sync?.lines.find((l) => l.fenced && /\buserId\b/.test(l.text))?.text.split(/[,\s]+/).filter(Boolean) ?? [];
  const body = /interface SyncTicketClaims\s*\{([\s\S]*?)\n\}/.exec(index.read(ticketPath))?.[1] ?? "";
  const properties = new Set([...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]));
  if (fields.length === 0) findings.push({ section: "Realtime Sync", statement: "ticket claims", problem: "Feldliste des Sync-Tickets nicht gefunden" });
  for (const field of fields) {
    if (!properties.has(field)) findings.push({ section: "Realtime Sync", statement: `ticket claim ${field}`, problem: `kein Feld in SyncTicketClaims (${ticketPath})` });
  }
}

export interface CheckResult {
  findings: Finding[];
  accepted: string[];
  notes: string[];
}

export function checkArchitectureDocs(options: CheckOptions): CheckResult {
  const root = resolve(options.root);
  const markdown = readFileSync(options.docPath ?? join(root, "docs/ARCHITECTURE.md"), "utf8");
  const sections = parseSections(markdown);
  const index = new SourceIndex(root);
  const all: Finding[] = [];
  const notes: string[] = [];

  checkStamp(markdown, root, all, notes);
  checkPackages(sections, root, all);
  checkCommands(sections, root, all);
  checkPaths(sections, root, all);
  checkNodeVersion(sections, root, all);
  checkSourceClaims(sections, index, all);
  checkNamedIdentifiers(sections, index, all);

  for (const deviation of KNOWN_DEVIATIONS) {
    if (!deviation.reason.trim()) throw new Error(`KNOWN_DEVIATIONS: Eintrag „${deviation.key}“ braucht eine Begründung.`);
  }
  const accepted: string[] = [];
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const finding of all) {
    const key = `${finding.section}: ${finding.statement}`;
    const known = KNOWN_DEVIATIONS.find((d) => d.key === key);
    if (known) accepted.push(`${key} (${known.reason})`);
    else if (!seen.has(`${key}|${finding.problem}`)) {
      seen.add(`${key}|${finding.problem}`);
      findings.push(finding);
    }
  }
  return { findings, accepted, notes };
}

function argValue(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const root = argValue(args, "--root") ?? resolve(import.meta.dir, "..");
  const docPath = argValue(args, "--doc");
  const { findings, accepted, notes } = checkArchitectureDocs({ root, docPath });
  for (const note of notes) console.log(note);
  for (const item of accepted) console.log(`Bekannte Abweichung: ${item}`);
  for (const finding of findings) console.log(`[${finding.section}] ${finding.statement} — ${finding.problem}`);
  if (findings.length > 0) {
    console.log(`\n${findings.length} Abweichung(en) in docs/ARCHITECTURE.md. Doku korrigieren oder mit Stand versehen und „Verified against“ erneuern.`);
    process.exit(1);
  }
  console.log("docs/ARCHITECTURE.md stimmt mit dem Quellstand überein.");
}
