/**
 * Agent tools for an ordinary Markdown workspace.
 *
 * The Wiki tools already let an agent read and propose against a bundle. A plain folder had none,
 * so an agent working in a vault could only guess at structure it could have simply asked about —
 * "what links here", "where is this mentioned", "what is broken".
 *
 * Every tool here is **read-only**. That is not an oversight: writing already has a route through
 * the Wiki proposal protocol, where a change needs a citation, a human approval and a hash check.
 * Adding a second route that skips all three would make that protocol decorative.
 */

import { buildWorkspaceGraph, graphCounts, type WorkspaceFileInput } from "./workspace-graph";
import { lintWorkspace } from "./workspace-lint";
import { backlinksFor, searchWorkspace } from "./workspace-search";
import { parseFile } from "./parser";
import { hashSharedDocumentMarkdown } from "./shared-document-binding";

export const WORKSPACE_AGENT_TOOLS = [
  {
    name: "workspace_overview",
    description: "Folder and file counts, link counts and how many links are broken or ambiguous. Read-only.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workspace_search",
    description:
      "Find files by text, folder, or link relationship. Returns paths with the matching line. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        folder: { type: "string" },
        linksTo: { type: "string", description: "Only files linking to this workspace-relative path." },
        linkedFrom: { type: "string", description: "Only files linked from this workspace-relative path." },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "workspace_backlinks",
    description: "Which files link to a given path, with the line and the link as written. Read-only.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  },
  {
    name: "workspace_outline",
    description: "The heading structure and outgoing links of one file, without returning its full text. Read-only.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  },
  {
    name: "workspace_lint",
    description:
      "Broken links, ambiguous names, duplicate filenames and optionally orphan pages. Same checks as `bloommd lint`. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        reportOrphans: { type: "boolean" },
        checkRoundtrip: { type: "boolean", description: "Also report files that saving would rewrite." },
      },
    },
  },
  {
    name: "workspace_open_tasks",
    description: "List typed task nodes that are not marked done, with their Markdown path and context. Read-only.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workspace_decisions",
    description: "List typed decision nodes and their recorded rationale so decisions can be reviewed before proposing more work. Read-only.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workspace_changes",
    description: "Compare browser-safe content fingerprints from a known workspace state and return only added, changed, or removed Markdown files. Read-only.",
    inputSchema: {
      type: "object",
      required: ["knownHashes"],
      properties: {
        knownHashes: {
          type: "object",
          description: "Workspace-relative Markdown path to its earlier BloomMD fingerprint.",
        },
      },
    },
  },
] as const;

export type WorkspaceAgentToolName = (typeof WORKSPACE_AGENT_TOOLS)[number]["name"];

export interface WorkspaceAgentResult {
  value: unknown;
  isError?: boolean;
}

function argumentString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function typedWorkspaceNodes(files: WorkspaceFileInput[]) {
  return files.flatMap((file) => {
    const document = parseFile(file.path, file.markdown);
    return [...document.nodes.values()].map((node) => ({
      path: file.path,
      id: node.id,
      title: node.title,
      content: node.content,
      level: node.level,
      metadata: node.metadata,
    }));
  });
}

function knownWorkspaceHashes(args: Record<string, unknown>): Record<string, string> | null {
  const value = args.knownHashes;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 1_000 || entries.some(([path, hash]) => !path || typeof hash !== "string")) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * Runs one tool against a set of files.
 *
 * Takes the files rather than a directory so the same implementation serves the desktop app, the
 * browser workspace and a server — and so a tool cannot reach a path the caller did not supply.
 */
export function callWorkspaceAgentTool(
  files: WorkspaceFileInput[],
  name: string,
  args: Record<string, unknown> = {},
): WorkspaceAgentResult {
  switch (name) {
    case "workspace_overview": {
      const graph = buildWorkspaceGraph(files);
      return { value: graphCounts(graph) };
    }

    case "workspace_search": {
      const limit = typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 200) : 50;
      return {
        value: searchWorkspace(files, {
          text: argumentString(args, "text"),
          folder: argumentString(args, "folder"),
          linksTo: argumentString(args, "linksTo"),
          linkedFrom: argumentString(args, "linkedFrom"),
          limit,
        }),
      };
    }

    case "workspace_backlinks": {
      const path = argumentString(args, "path");
      if (!path) return { value: "path is required.", isError: true };
      return { value: backlinksFor(files, path) };
    }

    case "workspace_outline": {
      const path = argumentString(args, "path");
      if (!path) return { value: "path is required.", isError: true };
      const file = files.find((entry) => entry.path === path);
      if (!file) return { value: `No such file in this workspace: ${path}`, isError: true };

      const graph = buildWorkspaceGraph(files);
      const headings: Array<{ level: number; title: string; line: number }> = [];
      let inFence = false;
      file.markdown.replace(/\r\n/g, "\n").split("\n").forEach((line, index) => {
        // Headings inside a code fence are examples, not structure.
        if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) inFence = !inFence;
        if (inFence) return;
        const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (match) headings.push({ level: match[1]!.length, title: match[2]!.trim(), line: index + 1 });
      });

      const links = graph.edges
        .filter((edge) => edge.kind === "reference" && edge.source === `file:${path}`)
        .map((edge) => ({
          raw: edge.kind === "reference" ? edge.raw : "",
          resolution: edge.kind === "reference" ? edge.resolution : "resolved",
          line: edge.kind === "reference" ? edge.line : 0,
        }));

      return { value: { path, headings, links } };
    }

    case "workspace_lint": {
      return {
        value: lintWorkspace(files, {
          reportOrphans: args.reportOrphans === true,
          checkRoundtrip: args.checkRoundtrip === true,
        }),
      };
    }

    case "workspace_open_tasks": {
      return {
        value: typedWorkspaceNodes(files)
          .filter((node) => node.metadata?.kind === "task" && node.metadata.status !== "done")
          .map((node) => ({
            path: node.path,
            nodeId: node.id,
            title: node.title,
            content: node.content,
            status: node.metadata?.status ?? "open",
          })),
      };
    }

    case "workspace_decisions": {
      return {
        value: typedWorkspaceNodes(files)
          .filter((node) => node.metadata?.kind === "decision")
          .map((node) => ({
            path: node.path,
            nodeId: node.id,
            title: node.title,
            rationale: node.content,
            status: node.metadata?.decision ?? "proposed",
          })),
      };
    }

    case "workspace_changes": {
      const knownHashes = knownWorkspaceHashes(args);
      if (!knownHashes) return { value: "knownHashes must be a path-to-fingerprint object with at most 1000 entries.", isError: true };
      const currentHashes = Object.fromEntries(
        files.map((file) => [file.path, hashSharedDocumentMarkdown(file.markdown)]),
      ) as Record<string, string>;
      const added = Object.keys(currentHashes).filter((path) => !(path in knownHashes));
      const changed = Object.keys(currentHashes).filter(
        (path) => path in knownHashes && knownHashes[path] !== currentHashes[path],
      );
      const removed = Object.keys(knownHashes).filter((path) => !(path in currentHashes));
      return { value: { added, changed, removed, currentHashes } };
    }

    default:
      return { value: `Unknown tool: ${name}`, isError: true };
  }
}
