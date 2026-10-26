/**
 * `bloommd-wiki agent-mcp`: the MCP tools an agent (OpenClaw, Claude) uses to file notes into
 * BloomMD maps and act on them. There is deliberately no tool to approve proposals.
 */
import { parseKnowledgeNodeInputs, type KnowledgeNodeInput } from "@bloommd/core/knowledge";
import type { McpServerOptions, McpTool } from "./mcp";
import type { KnowledgeService } from "./knowledge-service";

export type KnowledgeTargets = Partial<Record<"vault" | "cloud", KnowledgeService>>;

const targetProperty = {
  target: {
    type: "string",
    enum: ["vault", "cloud"],
    description: "vault = local Markdown folder (private: school, own conversations); cloud = BloomMD workspace (work, shared with colleagues). Defaults to vault when configured.",
  },
};

const nodeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Existing node to update (from bloommd_get_map)." },
    ref: { type: "string", description: "Your handle for a node created in this call; later nodes can use it as parent or relation target." },
    parent: { type: "string", description: "Parent of a new node: existing id or a ref from this call. Default: the root." },
    title: { type: "string", description: "Short node title (max. ~8 words). Required for new nodes; renames existing ones." },
    content: { type: "string", description: "Markdown details shown in the node. Use [[Note]] to link vault notes." },
    contentMode: { type: "string", enum: ["append", "replace"], description: "For updates: append (default) or replace existing content." },
    kind: { type: "string", enum: ["topic", "task", "decision", "source", "web", "file", "pdf", "portal"] },
    status: { type: "string", enum: ["open", "in_progress", "done"], description: "Task status." },
    decision: { type: "string", enum: ["proposed", "accepted", "rejected"] },
    due: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Due date YYYY-MM-DD, only if the source names it." },
    assignee: { type: "string", description: "Responsible person as named in the source." },
    note: { type: "string", description: "Link text of a vault note this node stands for (shows a badge that opens it)." },
    citation: { type: "string", description: "Where this comes from (e.g. 'Teams-Transkript 30.09., 12:40')." },
    url: { type: "string" },
    relations: {
      type: "array",
      description: "Concept-map connections to other nodes of the same map.",
      items: { type: "object", additionalProperties: false, properties: { target: { type: "string" }, label: { type: "string" } }, required: ["target"] },
    },
  },
};

const changeMeta = {
  reason: { type: "string", description: "Why this change, in one sentence (goes to the change log)." },
  source: { type: "string", description: "Where the information came from (file, meeting, recording)." },
};

export const KNOWLEDGE_TOOLS: McpTool[] = [
  {
    name: "bloommd_overview",
    title: "Übersicht",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Areas (top-level folders such as Schule, Arbeit, Projekte, Gespräche), the maps in them and what the agent may do per area. Call first.",
    inputSchema: { type: "object", additionalProperties: false, properties: { ...targetProperty } },
  },
  {
    name: "bloommd_search",
    title: "Suchen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Full-text search over node titles and content, to find where new information belongs before creating a map.",
    inputSchema: { type: "object", additionalProperties: false, properties: { query: { type: "string" }, area: { type: "string" }, ...targetProperty }, required: ["query"] },
  },
  {
    name: "bloommd_get_map",
    title: "Map lesen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "A map as outline: every node with id, parent, title, content and metadata, plus the version for safe updates.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, ...targetProperty }, required: ["path"] },
  },
  {
    name: "bloommd_templates",
    title: "Vorlagen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Templates for filing material: meeting, conversation, discussion, lesson (school), project, weekly, learning. Without id: the list; with id: skeleton and filling guidance.",
    inputSchema: { type: "object", additionalProperties: false, properties: { id: { type: "string" } } },
  },
  {
    name: "bloommd_create_map",
    title: "Map anlegen",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: "Create a new map in an area, optionally from a template whose skeleton refs (e.g. 'aufgaben', 'begriffe') can be used as parents of your nodes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        area: { type: "string", description: "Area/folder, e.g. 'Schule/Physik', 'Arbeit', 'Projekte'." },
        title: { type: "string" },
        template: { type: "string" },
        nodes: { type: "array", items: nodeSchema },
        tags: { type: "array", items: { type: "string" } },
        scope: { type: "string", description: "Where the map applies (brand, role, component); written to the frontmatter by templates that define frontmatter, e.g. learning." },
        ...changeMeta,
        ...targetProperty,
      },
      required: ["area", "title"],
    },
  },
  {
    name: "bloommd_update_map",
    title: "Map ergänzen",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: "Add nodes to or update nodes of an existing map by id. Never rewrites the rest of the map. Pass the version from bloommd_get_map to avoid overwriting edits made meanwhile.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { path: { type: "string" }, version: { type: "string" }, nodes: { type: "array", items: nodeSchema, minItems: 1 }, ...changeMeta, ...targetProperty },
      required: ["path", "nodes"],
    },
  },
  {
    name: "bloommd_tasks",
    title: "Aufgaben",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Open tasks across maps (status, due, assignee), soonest first. Use for reminders, planning and preparing meetings.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { area: { type: "string" }, includeDone: { type: "boolean" }, assignee: { type: "string" }, dueBefore: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, ...targetProperty },
    },
  },
  {
    name: "bloommd_decisions",
    title: "Entscheidungen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Decisions across maps with their state (proposed, accepted, rejected).",
    inputSchema: { type: "object", additionalProperties: false, properties: { area: { type: "string" }, ...targetProperty } },
  },
  {
    name: "bloommd_share_link",
    title: "Lese-Link",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: "A read-only link to a cloud map for colleagues without a BloomMD account (default 30 days). Only for target cloud; share it only when the user asks to.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, expiresInDays: { type: "integer", minimum: 1, maximum: 365 }, ...targetProperty }, required: ["path"] },
  },
  {
    name: "bloommd_changes",
    title: "Änderungsprotokoll",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "The agent's recent changes (change log) with change ids for undo.",
    inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 200 }, ...targetProperty } },
  },
  {
    name: "bloommd_undo",
    title: "Änderung zurücknehmen",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    description: "Undo one of your own direct changes by change id, unless the map was edited since. In areas where you may only propose, the undo becomes a proposal; changes the owner approved cannot be undone by you.",
    inputSchema: { type: "object", additionalProperties: false, properties: { changeId: { type: "string" }, ...targetProperty }, required: ["changeId"] },
  },
  {
    name: "bloommd_requests",
    title: "Anfragen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Questions and instructions the owner left on map nodes (\"Ask agent…\" in Obsidian): request id, map path, node id and title, question. Open ones by default. Answer each with bloommd_answer_request.",
    inputSchema: { type: "object", additionalProperties: false, properties: { includeDone: { type: "boolean" }, ...targetProperty } },
  },
  {
    name: "bloommd_answer_request",
    title: "Anfrage beantworten",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: "Answer a request: the answer text is shown to the owner next to the node. Optional nodes are added to or update the request's map like bloommd_update_map; your rights decide whether they are written directly or become a proposal. Use failed=true when you cannot answer (say why in answer).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "Request id from bloommd_requests." },
        answer: { type: "string", description: "Short answer or what you changed, for the owner." },
        failed: { type: "boolean" },
        nodes: { type: "array", items: nodeSchema },
        version: { type: "string", description: "Map version from bloommd_get_map, when nodes are given." },
        ...changeMeta,
        ...targetProperty,
      },
      required: ["id", "answer"],
    },
  },
];

export const KNOWLEDGE_INSTRUCTIONS = [
  "BloomMD shows Markdown notes as mind maps: every heading is a node, the document is the map.",
  "File information so that a person can understand and explain it from the map alone:",
  "1. bloommd_overview to see areas and access; bloommd_search to find an existing map for the topic.",
  "2. Existing topic: bloommd_get_map, then bloommd_update_map with new nodes under the right parent. New topic: bloommd_templates, then bloommd_create_map with the fitting template.",
  "3. Only use facts from the source; questions instead of guesses; short titles, details in content; tasks with status/due/assignee; decisions with decision state; connect related nodes with relations.",
  "4. Private material (school, own conversations) goes to target vault; work and team material to target cloud when it is configured.",
  "If a change comes back as 'proposed', the owner reviews it; tell them. Never try to approve proposals yourself.",
  "The owner can leave requests on map nodes: check bloommd_requests regularly, read the map, and answer each with bloommd_answer_request (optionally with nodes for that map).",
].join("\n");

function string(args: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = args[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim())) throw new Error(`"${key}" must be a non-empty string.`);
  return value;
}

function nodes(args: Record<string, unknown>, minItems: number): KnowledgeNodeInput[] | undefined {
  if (args.nodes === undefined && minItems === 0) return undefined;
  return parseKnowledgeNodeInputs(args.nodes, { minItems });
}

export function knowledgeServerOptions(targets: KnowledgeTargets, version: string): McpServerOptions {
  const pick = (args: Record<string, unknown>): KnowledgeService => {
    const requested = string(args, "target") as "vault" | "cloud" | undefined;
    const service = requested ? targets[requested] : targets.vault ?? targets.cloud;
    if (!service) throw new Error(requested ? `Target "${requested}" is not configured for this server.` : "No knowledge target configured.");
    return service;
  };
  return {
    name: "bloommd-knowledge",
    version,
    instructions: KNOWLEDGE_INSTRUCTIONS,
    tools: KNOWLEDGE_TOOLS,
    async call(name, args) {
      const service = pick(args);
      const meta = { reason: string(args, "reason"), source: string(args, "source") };
      switch (name) {
        case "bloommd_overview": return { ...(await service.overview()), targets: Object.keys(targets) };
        case "bloommd_search": return service.search(string(args, "query", true)!, string(args, "area"));
        case "bloommd_get_map": return service.getMap(string(args, "path", true)!);
        case "bloommd_templates": return service.templates(string(args, "id"));
        case "bloommd_create_map": return service.createMap({
          area: string(args, "area", true)!,
          title: string(args, "title", true)!,
          template: string(args, "template"),
          nodes: nodes(args, 0),
          tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
          scope: string(args, "scope"),
          ...meta,
        });
        case "bloommd_update_map": return service.updateMap({ path: string(args, "path", true)!, version: string(args, "version"), nodes: nodes(args, 1)!, ...meta });
        case "bloommd_tasks": return service.tasks({
          area: string(args, "area"),
          includeDone: args.includeDone === true,
          assignee: string(args, "assignee"),
          dueBefore: string(args, "dueBefore"),
        });
        case "bloommd_decisions": return service.decisions(string(args, "area"));
        case "bloommd_share_link": return service.shareLink(string(args, "path", true)!, typeof args.expiresInDays === "number" ? args.expiresInDays : 30);
        case "bloommd_changes": return service.changes(typeof args.limit === "number" ? args.limit : 20);
        case "bloommd_undo": return service.undo(string(args, "changeId", true)!, { asOwner: false });
        case "bloommd_requests": return service.requests(args.includeDone === true);
        case "bloommd_answer_request": return service.answerRequest({
          id: string(args, "id", true)!,
          answer: string(args, "answer", true)!,
          failed: args.failed === true,
          nodes: nodes(args, 0),
          version: string(args, "version"),
          ...meta,
        });
        default: throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}
