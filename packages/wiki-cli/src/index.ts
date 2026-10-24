/**
 * `bloommd-wiki` — local Markdown and Wiki workflow.
 *
 * Everything BloomMD knows about a workspace was previously reachable only by opening the app and
 * clicking. That means it could not run in CI, could not be scripted, and could not help anyone who
 * had not already adopted the product. These commands read a plain folder, report, and change
 * nothing — which is only possible because BloomMD writes ordinary files in the first place.
 *
 *   bloommd-wiki workspace lint ./docs
 *   bloommd-wiki workspace check ./vault
 *   bloommd-wiki status ./wiki
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { backlinksFor, lintWorkspace, searchWorkspace, type LintResult } from "@bloommd/core";
import {
  appendWikiLog,
  applyWikiProposal,
  approveWikiProposal,
  createWikiProposal,
  getWikiStatus,
  initWikiBundle,
  lintWikiBundle,
  regenerateWikiIndex,
  renderWikiDiff,
  type WikiChange,
  type WikiProposal,
  type WikiSourceHashes,
} from "@bloommd/core/wiki";
import { WIKI_AGENT_TOOLS, callWikiAgentTool } from "@bloommd/core/wiki-agent";
import { readWorkspace } from "./workspace";
import { formatFindings, formatGithub, formatJson, plural } from "./report";
import { forwardToRunningDesktop } from "./desktop-handoff";
import { AGENT_USAGE, AgentUsageError, runAgentCli } from "./agent-cli";
import { runMcpServer } from "./mcp";
export const WIKI_VERSION = "0.4.4";

export const WIKI_USAGE = `bloommd-wiki ${WIKI_VERSION} — lokaler Markdown- und Wiki-Workflow

Befehle:
  init <pfad> [titel]                         Wiki-Bundle anlegen
  index <pfad>                                Wiki-Index aktualisieren
  status <pfad> [source-hashes.json]          Wiki-Status und Vertrauensstufen prüfen
  lint <pfad> [source-hashes.json]            Wiki-Bundle prüfen
  log <pfad> <nachricht> [autor]              Wiki-Log ergänzen
  propose <pfad> <changes.json> <proposal.json>
  approve <proposal.json> <reviewer>
  apply <pfad> <proposal.json>
  mcp <pfad> [--allow-agent-approval]         MCP-Transport für lokale Agent-Clients
  workspace open <pfad>                       Datei oder Ordner in BloomMD Desktop öffnen
  workspace lint <pfad>                       Markdown-Verweise prüfen
  workspace check <pfad>                      Roundtrip prüfen
  workspace search <text> <pfad>              Markdown-Dateien durchsuchen
  workspace backlinks <datei> <pfad>          Rückverweise anzeigen

${AGENT_USAGE}

Optionen:
  --format <text|json|github>   Ausgabeform (Standard: text)
  --orphans                     Seiten ohne jede Verbindung mitmelden (nur lint)
  --strict                      Auch Warnungen führen zu Exit-Code 1
  --quiet                       Nur die Zusammenfassung
  --in <ordner>                 Suche auf einen Unterordner begrenzen (nur search)
  -h, --help                    Diese Hilfe
  -v, --version                 Version

Exit-Codes:
  0  nichts gefunden
  1  Fehler gefunden (mit --strict auch Warnungen)
  2  Aufruf oder Pfad ungültig

Beispiele:
  bloommd-wiki lint ./wiki --format github --strict
  bloommd-wiki workspace lint ./docs --format github --strict
  bloommd-wiki mcp ./wiki`;

interface Options {
  format: "text" | "json" | "github";
  orphans: boolean;
  strict: boolean;
  quiet: boolean;
  folder?: string;
}

interface Parsed {
  command: string[];
  path: string | null;
  options: Options;
}

export class WikiUsageError extends Error {}

function parseArguments(argv: string[]): Parsed {
  const command: string[] = [];
  let path: string | null = null;
  const options: Options = { format: "text", orphans: false, strict: false, quiet: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;

    if (argument === "--format") {
      const value = argv[++index];
      if (value !== "text" && value !== "json" && value !== "github") {
        throw new WikiUsageError(`Unbekanntes Format: ${value ?? "(fehlt)"}`);
      }
      options.format = value;
      continue;
    }
    if (argument === "--in") {
      const value = argv[++index];
      if (!value) throw new WikiUsageError("--in braucht einen Ordner.");
      options.folder = value;
      continue;
    }
    if (argument === "--orphans") { options.orphans = true; continue; }
    if (argument === "--strict") { options.strict = true; continue; }
    if (argument === "--quiet") { options.quiet = true; continue; }
    if (argument.startsWith("-")) throw new WikiUsageError(`Unbekannte Option: ${argument}`);

    // The first non-flag words are the command; the last one is the path. `search` and `backlinks`
    // take one argument of their own before it.
    const takesArgument = command[0] === "search" || command[0] === "backlinks";
    if (
      command.length === 0
      || (command[0] === "wiki" && command.length === 1)
      || (takesArgument && command.length === 1)
    ) {
      command.push(argument);
    } else if (path === null) path = argument;
    else throw new WikiUsageError(`Zu viele Pfade: ${argument}`);
  }

  return { command, path, options };
}

function exitCodeFor(result: LintResult, strict: boolean): number {
  if (result.summary.errors > 0) return 1;
  if (strict && result.summary.warnings > 0) return 1;
  return 0;
}

function print(result: LintResult, options: Options): void {
  if (options.format === "json") {
    console.log(formatJson(result));
    return;
  }
  if (options.format === "github") {
    const annotations = formatGithub(result);
    if (annotations) console.log(annotations);
    const { errors, warnings, filesChecked } = result.summary;
    console.log(
      [plural(filesChecked, "Datei", "Dateien"), plural(errors, "Fehler", "Fehler"), plural(warnings, "Warnung", "Warnungen")].join(" · "),
    );
    return;
  }
  if (options.quiet) {
    const { errors, warnings, infos, filesChecked } = result.summary;
    console.log(
      [
        plural(filesChecked, "Datei", "Dateien"),
        plural(errors, "Fehler", "Fehler"),
        plural(warnings, "Warnung", "Warnungen"),
        plural(infos, "Hinweis", "Hinweise"),
      ].join(" · "),
    );
    return;
  }
  console.log(formatFindings(result));
}

function desktopOpenUrl(targetPath: string): string {
  return `bloommd://open?path=${encodeURIComponent(targetPath)}`;
}

async function runOpen(path: string): Promise<number> {
  const targetPath = resolve(path);
  const info = await stat(targetPath).catch(() => {
    throw new WikiUsageError(`Pfad existiert nicht: ${path}`);
  });
  if (!info.isDirectory() && ![".md", ".markdown"].includes(extname(targetPath).toLowerCase())) {
    throw new WikiUsageError("BloomMD kann nur Markdown-Dateien oder Ordner öffnen.");
  }

  const url = desktopOpenUrl(targetPath);
  if (process.env.BLOOMMD_OPEN_DRY_RUN === "1") {
    const app = process.platform === "darwin" ? process.env.BLOOMMD_OPEN_APP : undefined;
    console.log(JSON.stringify({ ok: true, command: "open", target: targetPath, url, app }, null, 2));
    return 0;
  }

  if (await forwardToRunningDesktop(targetPath)) {
    console.log(`BloomMD Desktop öffnet ${targetPath}`);
    return 0;
  }

  const command = process.platform === "darwin"
    ? process.env.BLOOMMD_OPEN_APP
      ? ["open", "-a", process.env.BLOOMMD_OPEN_APP, url]
      : ["open", url]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url];

  const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const detail = stderr.trim() || stdout.trim() || `Exit-Code ${code}`;
    throw new Error(`BloomMD Desktop konnte nicht geöffnet werden: ${detail}`);
  }
  console.log(`BloomMD Desktop öffnet ${targetPath}`);
  return 0;
}

async function runLint(path: string, options: Options, withRoundtrip: boolean): Promise<number> {
  const workspace = await readWorkspace(path);
  const result = lintWorkspace(workspace.files, {
    reportOrphans: options.orphans,
    checkRoundtrip: withRoundtrip,
  });

  for (const failure of workspace.unreadable) {
    // An unreadable file is a real problem, not something to skip quietly.
    result.findings.push({
      code: "roundtrip-unsafe",
      severity: "error",
      path: failure.path,
      line: null,
      message: "Datei konnte nicht gelesen werden.",
      detail: failure.reason,
    });
    result.summary.errors += 1;
  }

  print(result, options);
  return exitCodeFor(result, options.strict);
}

async function runSearch(text: string, path: string, options: Options): Promise<number> {
  const workspace = await readWorkspace(path);
  const hits = searchWorkspace(workspace.files, { text, folder: options.folder });

  if (options.format === "json") {
    console.log(JSON.stringify(hits, null, 2));
  } else {
    for (const hit of hits) {
      const where = hit.line === null ? hit.path : `${hit.path}:${hit.line}`;
      console.log(`${where}  ${hit.title}`);
      if (hit.excerpt && !options.quiet) console.log(`    ${hit.excerpt}`);
    }
    console.log("");
    console.log(plural(hits.length, "Treffer", "Treffer"));
  }
  // Finding nothing is a valid answer to a question, not a failure.
  return 0;
}

async function runBacklinks(file: string, path: string, options: Options): Promise<number> {
  const workspace = await readWorkspace(path);
  const entries = backlinksFor(workspace.files, file);

  if (options.format === "json") {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    for (const entry of entries) console.log(`${entry.path}:${entry.line}  ${entry.raw}  (${entry.title})`);
    console.log("");
    console.log(plural(entries.length, "Verweis", "Verweise"));
  }
  return 0;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function sourceHashes(path?: string): Promise<WikiSourceHashes> {
  return path ? readJson<WikiSourceHashes>(path) : {};
}

function requiredArgument(args: string[], index: number, label: string): string {
  const value = args[index];
  if (!value) throw new WikiUsageError(`Fehlt: ${label}.`);
  return value;
}

function wikiOptions(args: string[]): { positional: string[]; options: Options } {
  const positional: string[] = [];
  const options: Options = { format: "text", orphans: false, strict: false, quiet: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--format") {
      const value = args[++index];
      if (value !== "text" && value !== "json" && value !== "github") {
        throw new WikiUsageError(`Unbekanntes Format: ${value ?? "(fehlt)"}`);
      }
      options.format = value;
      continue;
    }
    if (argument === "--strict") { options.strict = true; continue; }
    if (argument === "--quiet") { options.quiet = true; continue; }
    if (argument.startsWith("-")) throw new WikiUsageError(`Unbekannte Option: ${argument}`);
    positional.push(argument);
  }
  return { positional, options };
}

export async function runWikiCommand(args: string[]): Promise<number> {
  const { positional, options } = wikiOptions(args);
  const command = positional[0];

  if (!command) throw new WikiUsageError("Fehlender Unterbefehl. Gemeint war vermutlich: bloommd-wiki status <pfad>");

  if (command === "init") {
    const root = requiredArgument(positional, 1, "Bundle-Ordner");
    await initWikiBundle(root, positional.slice(2).join(" ") || "BloomMD Wiki");
    console.log(JSON.stringify({ ok: true, command: "wiki init", root }, null, 2));
    return 0;
  }

  if (command === "index") {
    const root = requiredArgument(positional, 1, "Bundle-Ordner");
    await regenerateWikiIndex(root);
    console.log(JSON.stringify({ ok: true, command: "wiki index", root }, null, 2));
    return 0;
  }

  if (command === "status") {
    const root = requiredArgument(positional, 1, "Bundle-Ordner");
    const hashes = await sourceHashes(positional[2]);
    const [status, issues] = await Promise.all([getWikiStatus(root, hashes), lintWikiBundle(root, hashes)]);
    if (options.format === "json") {
      console.log(JSON.stringify({ status, issues }, null, 2));
    } else {
      console.log(`OKF ${status.okfVersion ?? "unbekannt"} · ${status.pageCount} Seiten · ${status.sourceCount} Quellen`);
      console.log(
        `Vertrauen: ${status.trustCounts.verified} geprüft · ${status.trustCounts.generated} ungeprüft · ${status.trustCounts.unattributed} ohne Quelle`,
      );
      console.log(`Veraltete Quellen: ${status.staleSourceCount} · Abgelaufene Seiten: ${status.expiredPageCount}`);
      if (issues.length > 0 && !options.quiet) {
        console.log("");
        for (const issue of issues) console.log(`  ${issue.code.padEnd(24)} ${issue.path} — ${issue.message}`);
      }
      console.log("");
      console.log(plural(issues.length, "Befund", "Befunde"));
    }
    const problems = issues.length + status.expiredPageCount;
    if (problems > 0) return 1;
    if (options.strict && status.staleSourceCount > 0) return 1;
    return 0;
  }

  if (command === "lint") {
    const root = requiredArgument(positional, 1, "Bundle-Ordner");
    const issues = await lintWikiBundle(root, await sourceHashes(positional[2]));
    if (options.format === "json") {
      console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    } else {
      for (const issue of issues) console.log(`${issue.code.padEnd(24)} ${issue.path} — ${issue.message}`);
      console.log("");
      console.log(plural(issues.length, "Befund", "Befunde"));
    }
    return issues.length > 0 ? 1 : 0;
  }

  if (command === "log") {
    const root = requiredArgument(positional, 1, "Bundle-Ordner");
    const message = requiredArgument(positional, 2, "Nachricht");
    await appendWikiLog(root, { message, ...(positional[3] ? { actor: positional[3] } : {}) });
    console.log(JSON.stringify({ ok: true, command: "wiki log", root }, null, 2));
    return 0;
  }

  if (command === "propose") {
    const root = requiredArgument(positional, 1, "Bundle-Ordner");
    const changesPath = requiredArgument(positional, 2, "Changes JSON");
    const outputPath = requiredArgument(positional, 3, "Proposal JSON");
    const proposal = await createWikiProposal(root, await readJson<WikiChange[]>(changesPath));
    await writeFile(outputPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, command: "wiki propose", proposalId: proposal.id, outputPath }, null, 2));
    return 0;
  }

  if (command === "approve") {
    const proposalPath = requiredArgument(positional, 1, "Proposal JSON");
    const reviewer = requiredArgument(positional, 2, "Reviewer");
    const approved = approveWikiProposal(await readJson<WikiProposal>(proposalPath), reviewer);
    await writeFile(proposalPath, `${JSON.stringify(approved, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, command: "wiki approve", proposalId: approved.id, approvedBy: approved.approvedBy }, null, 2));
    return 0;
  }

  if (command === "apply") {
    const root = requiredArgument(positional, 1, "Bundle-Ordner");
    const proposalPath = requiredArgument(positional, 2, "Proposal JSON");
    console.log(`${renderWikiDiff(await applyWikiProposal(root, await readJson<WikiProposal>(proposalPath)))}\n`);
    return 0;
  }

  if (command === "mcp") {
    const rootDir = requiredArgument(positional, 1, "Bundle-Ordner");
    // An agent must not approve and apply its own proposals; a person does that with the CLI.
    const allowApproval = args.includes("--allow-agent-approval");
    const tools = WIKI_AGENT_TOOLS.filter((tool) => allowApproval || (tool.name !== "knowledge_wiki_approve" && tool.name !== "knowledge_wiki_apply"));
    await runMcpServer({
      name: "bloommd-wiki",
      version: WIKI_VERSION,
      tools: tools as never,
      call: async (name, toolArgs) => {
        const result = await callWikiAgentTool(rootDir, name, toolArgs);
        if (result.isError) throw new Error(typeof result.value === "string" ? result.value : JSON.stringify(result.value));
        return result.value;
      },
    });
    return 0;
  }

  throw new WikiUsageError(`Unbekannter Wiki-Befehl: bloommd-wiki ${command}`);
}

export async function runWikiCli(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
    console.log(WIKI_USAGE);
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    console.log(WIKI_VERSION);
    return 0;
  }

  // `wiki <command>` remains a temporary source-checkout compatibility form. The standalone
  // binary owns the Wiki namespace, so its public syntax is simply `bloommd-wiki <command>`.
  if (argv[0] === "wiki" && argv.length === 1) {
    throw new WikiUsageError("Fehlender Unterbefehl. Gemeint war vermutlich: bloommd-wiki status <pfad>");
  }
  const commandArgs = argv[0] === "wiki" ? argv.slice(1) : argv;
  if (commandArgs[0] === "agent") {
    try {
      return await runAgentCli(commandArgs.slice(1), WIKI_VERSION);
    } catch (error) {
      if (error instanceof AgentUsageError) throw new WikiUsageError(error.message);
      throw error;
    }
  }
  const wikiCommands = new Set(["init", "index", "status", "lint", "log", "propose", "approve", "apply", "mcp"]);
  if (wikiCommands.has(commandArgs[0] ?? "")) return runWikiCommand(commandArgs);
  if (commandArgs[0] !== "workspace") {
    throw new WikiUsageError(`Unbekannter Befehl: ${commandArgs[0] ?? "(keiner)"}. Nutze Wiki-Befehle direkt oder \`bloommd-wiki workspace <befehl> <pfad>\`.`);
  }

  const { command, path, options } = parseArguments(commandArgs.slice(1));
  const target = path ?? ".";

  if (command[0] === "search") {
    const text = command[1];
    if (!text) throw new WikiUsageError("Suchtext fehlt: bloommd search <text> <pfad>");
    return runSearch(text, target, options);
  }
  if (command[0] === "backlinks") {
    const file = command[1];
    if (!file) throw new WikiUsageError("Datei fehlt: bloommd backlinks <datei> <pfad>");
    return runBacklinks(file, target, options);
  }

  switch (command.join(" ")) {
    case "open":
      return runOpen(target);
    case "lint":
      return runLint(target, options, false);
    case "check":
      return runLint(target, options, true);
    default:
      throw new WikiUsageError(`Unbekannter Befehl: ${command.join(" ") || "(keiner)"}`);
  }
}

export { formatFindings, formatGithub, formatJson, plural } from "./report";
export { readWorkspace } from "./workspace";
