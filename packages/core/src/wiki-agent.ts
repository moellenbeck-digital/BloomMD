import {
  applyWikiProposal,
  approveWikiProposal,
  createWikiProposal,
  getWikiStatus,
  isWikiPageExpired,
  readWikiBundle,
  type WikiChange,
  type WikiProposal,
  type WikiSourceHashes,
} from "./wiki";

export const WIKI_AGENT_TOOLS = [
  {
    name: "knowledge_wiki_status",
    description: "Return deterministic page, source, drift, and lint status for the configured Wiki bundle.",
    inputSchema: { type: "object", properties: { sourceHashes: { type: "object", additionalProperties: { type: "string" } } } },
  },
  {
    name: "knowledge_wiki_get_page",
    description: "Read one Wiki page as Markdown with frontmatter and source provenance.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  },
  {
    name: "knowledge_wiki_propose",
    description: "Create a reviewable Wiki proposal. This does not modify the bundle.",
    inputSchema: { type: "object", required: ["changes"], properties: { changes: { type: "array" } } },
  },
  {
    name: "knowledge_wiki_approve",
    description: "Approve a previously created proposal for a named reviewer. This does not modify pages.",
    inputSchema: { type: "object", required: ["proposal", "reviewer"], properties: { proposal: { type: "object" }, reviewer: { type: "string" } } },
  },
  {
    name: "knowledge_wiki_apply",
    description: "Apply an already approved proposal after deterministic hash validation.",
    inputSchema: { type: "object", required: ["proposal"], properties: { proposal: { type: "object" } } },
  },
] as const;

export interface WikiAgentCallResult {
  value: unknown;
  isError?: boolean;
}

function objectArgument(args: Record<string, unknown> | undefined, key: string): Record<string, unknown> {
  const value = args?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Argument ${key} must be an object.`);
  return value as Record<string, unknown>;
}

export async function callWikiAgentTool(rootDir: string, name: string, args: Record<string, unknown> = {}): Promise<WikiAgentCallResult> {
  if (name === "knowledge_wiki_status") {
    return { value: await getWikiStatus(rootDir, (args.sourceHashes ?? {}) as WikiSourceHashes) };
  }

  if (name === "knowledge_wiki_get_page") {
    const path = typeof args.path === "string" ? args.path : "";
    const page = (await readWikiBundle(rootDir)).pages.find((entry) => entry.path === path);
    if (!page) throw new Error(`Wiki page not found: ${path}`);
    return {
      value: {
        path: page.path,
        title: page.title,
        frontmatter: page.frontmatter,
        content: page.content,
        sources: page.sources,
        // OKF v0.2 trust signals, so an agent can decide how far to rely on this page.
        type: page.type,
        description: page.description,
        status: page.status,
        generated: page.generated,
        verified: page.verified,
        staleAfter: page.staleAfter,
        expired: isWikiPageExpired(page),
        trustTier: page.trustTier,
      },
    };
  }

  if (name === "knowledge_wiki_propose") {
    const changes = args.changes;
    if (!Array.isArray(changes)) throw new Error("Argument changes must be an array.");
    return { value: await createWikiProposal(rootDir, changes as WikiChange[]) };
  }

  if (name === "knowledge_wiki_approve") {
    const reviewer = typeof args.reviewer === "string" ? args.reviewer : "";
    return { value: approveWikiProposal(objectArgument(args, "proposal") as unknown as WikiProposal, reviewer) };
  }

  if (name === "knowledge_wiki_apply") {
    const diffs = await applyWikiProposal(rootDir, objectArgument(args, "proposal") as unknown as WikiProposal);
    return { value: { diffs } };
  }

  throw new Error(`Unknown Wiki agent tool: ${name}`);
}
