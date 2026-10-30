/**
 * `bloommd-wiki agent-mcp`: the MCP tools an agent (OpenClaw, Claude) uses to file notes into
 * BloomMD maps and act on them. There is deliberately no tool to approve proposals.
 */
import { KNOWLEDGE_NODE_PATCH_FIELDS, KNOWLEDGE_STATUSES, parseKnowledgeFrontmatterInput, parseKnowledgeNodeInputs, type KnowledgeNodeInput } from "@bloommd/core/knowledge";
import { McpTextResult, type McpServerOptions, type McpTool } from "./mcp";
import { INGEST_MAX_NODES, INGEST_MAX_TEXT_CHARS, INGEST_TEMPLATE_IDS, parseIngestNodes, type KnowledgeService } from "./knowledge-service";

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
    owner: { type: "string", description: "Alias of assignee (stored as assignee); not both with different values." },
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

/** Trust and lifecycle fields of a map (frontmatter); see docs/LEARNINGS.md. */
const trustProperties = {
  status: { type: "string", enum: [...KNOWLEDGE_STATUSES], description: "Lifecycle of the map: neu, bestätigt, veraltet, ersetzt or unbestätigt (derived statement without evidence; still found by the default search)." },
  stale_after: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date YYYY-MM-DD from which the map is to be checked again." },
  verified: {
    type: "object",
    additionalProperties: false,
    description: "Who confirmed the map; appended to the existing verified list, never replacing it.",
    properties: { by: { type: "string", description: "Short one-line name of who confirmed it." }, at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date YYYY-MM-DD." } },
    required: ["by", "at"],
  },
  scope: { type: "string", description: "Where the map applies (brand, role, component), one line, e.g. 'BloomMD, coder'." },
  replaced_by: { type: "string", description: "Path of the successor map; only together with status ersetzt." },
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
    description: "Full-text search over node titles and content and over the frontmatter (tags, scope, source, status, title), to find where new information belongs or which learning applies to a role or component. Filters: status (exact), tag (exact, any case), scope (substring); query may be empty when a filter is set. Every hit shows status, stale_after, expired and ageDays when the map has them. Expired maps and maps with status veraltet/ersetzt are left out unless includeStale is true (a status filter always applies as given).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Text to find; may be empty when status, tag or scope is given." },
        area: { type: "string" },
        status: { type: "string", enum: [...KNOWLEDGE_STATUSES], description: "Only maps with this status (also finds veraltet/ersetzt)." },
        tag: { type: "string", description: "Only maps with this tag (exact, case-insensitive), e.g. a role like coder." },
        scope: { type: "string", description: "Only maps whose scope contains this text (case-insensitive), e.g. a component." },
        includeStale: { type: "boolean", description: "Also return expired maps and maps with status veraltet or ersetzt." },
        ...targetProperty,
      },
    },
  },
  {
    name: "bloommd_stale",
    title: "Abgelaufene Maps",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Maps whose stale_after is today or earlier (to re-check, renew or retire), most overdue first: path, title, status, stale_after, daysOverdue (negative = expires in n days) and scope. days adds maps that expire within the next n days. Filter by area, tag or scope. Nothing to check: the text is exactly NO_REPLY. Renew with bloommd_update_map (stale_after, verified) or retire with status veraltet/ersetzt.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { area: { type: "string" }, tag: { type: "string" }, scope: { type: "string", description: "Only maps whose scope contains this text." }, days: { type: "integer", minimum: 0, maximum: 3650, description: "Also list maps that expire within the next n days." }, ...targetProperty },
    },
  },
  {
    name: "bloommd_get_map",
    title: "Map lesen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "A map as outline: every node with id, parent, title, content and metadata, plus the version for safe updates.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, ...targetProperty }, required: ["path"] },
  },
  {
    name: "bloommd_get_node",
    title: "Knoten lesen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "ONE node of a map: title, content, metadata, parent, child ids and relations, plus the map's version for safe updates (bloommd_update_node). An unknown nodeId is refused. Use bloommd_get_map for the whole outline.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, nodeId: { type: "string", description: "Node id from bloommd_get_map or bloommd_search." }, ...targetProperty }, required: ["path", "nodeId"] },
  },
  {
    name: "bloommd_backlinks",
    title: "Rückverweise",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Which maps and nodes link to a map or note ([[Note]] or Markdown link): per hit path, area, title, nodeId and nodeTitle (empty above the first heading), line and the link as written. Only maps the agent can read are searched.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string", description: "The map or note that is linked to." }, ...targetProperty }, required: ["path"] },
  },
  {
    name: "bloommd_workspace_index",
    title: "Workspace-Index",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Link health over all maps the agent can read. Without path: summary and findings — broken and ambiguous links, links to a heading that does not exist (stale-anchor), links to a map that is veraltet/ersetzt or past stale_after with its replaced_by (stale-document), and a bloommd:id that occurs more than once (duplicate-node-id) with every place. With path: that map's document node, its headings (level, line, anchor, id) with their backlinks (a link with an anchor counts for the heading, one without for the map; per backlink source map, source heading, line, link as written) and the findings that belong to it (links written in it, a duplicate id first found in it).",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string", description: "Only this map: nodes with backlinks and its findings." }, ...targetProperty } },
  },
  {
    name: "bloommd_templates",
    title: "Vorlagen",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Templates for filing material: meeting, conversation, discussion, lesson (school), project, weekly, learning. Without id: the list; with id: skeleton and filling guidance. Learnings carry status, scope, stale_after and verified in the frontmatter: set them with bloommd_create_map/bloommd_update_map, find them with the status, tag and scope filters of bloommd_search, and list expired ones with bloommd_stale.",
    inputSchema: { type: "object", additionalProperties: false, properties: { id: { type: "string" } } },
  },
  {
    name: "bloommd_create_map",
    title: "Map anlegen",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: "Create a new map in an area, optionally from a template whose skeleton refs (e.g. 'aufgaben', 'begriffe') can be used as parents of your nodes. status, stale_after, verified, scope and replaced_by go into the frontmatter; for the learning template they override the template's defaults (neu, today + 90 days).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        area: { type: "string", description: "Area/folder, e.g. 'Schule/Physik', 'Arbeit', 'Projekte'." },
        title: { type: "string" },
        template: { type: "string" },
        nodes: { type: "array", items: nodeSchema },
        tags: { type: "array", items: { type: "string" } },
        ...trustProperties,
        ...changeMeta,
        ...targetProperty,
      },
      required: ["area", "title"],
    },
  },
  {
    name: "bloommd_ingest",
    title: "Text ablegen",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: `File raw text (transcript, chat, note) as a new map from a template. You hand over the original text AND the sections you already structured; the tool invents nothing and calls no model. The original is stored word for word (no shortening, no normalising) as a node of kind source titled "Originaltext" below "Quellen" (added when the template has none, e.g. weekly), with the source reference (citation, and url for http(s)) and date. nodes use the format of bloommd_create_map; parents are skeleton refs of the template (bloommd_templates). Limits: text at most ${INGEST_MAX_TEXT_CHARS} characters, nodes at most ${INGEST_MAX_NODES} (template skeleton and source node not counted); above that, with no text or no source, or with an unknown template, nothing is written and the error names the limit. A map with the same title (ignoring case and punctuation) in the same area is a duplicate: nothing is written, the error names the existing map. Rights like bloommd_create_map: read is refused, propose becomes a proposal for the owner (never approve it yourself), write is written; logged, undo with bloommd_undo. With inMap (path of an existing map) the same input adds to that map instead: a section node whose parent already has exactly one child with the same normalized title is not created again (its new children hang below it, its content stays); otherwise it is created (several matches: created, with a hint "mehrdeutig" in hinweise). parent is a ref of your list, a node id of that map, or a skeleton ref of a template whose node the map has; otherwise nothing is written. The original becomes one more source node "Originaltext <date or source>" below "Quellen" (existing sources stay unchanged); a source node with the same citation is a duplicate and nothing is written. relations targets (ref, node id or title) and [[Note]] links in the content of new nodes are connected only when the target is unambiguous, otherwise hinweise says so. template, title and area are not allowed with inMap; a missing map refuses with nothing written. Use template learning's own flow (bloommd_create_map) for learnings, not this tool. Never file credentials (passwords, tokens, keys) or personal data: the tool does not filter them.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        template: { type: "string", enum: [...INGEST_TEMPLATE_IDS], description: "Template id; its skeleton refs are the parents of your nodes. Required for a new map, not allowed with inMap." },
        title: { type: "string", description: "Title of the new map. Required for a new map, not allowed with inMap." },
        inMap: { type: "string", description: "Path of an existing map to add to (as bloommd_get_map takes it) instead of creating a new one; then template, title and area are not allowed." },
        text: { type: "string", description: `The original text, unchanged (at most ${INGEST_MAX_TEXT_CHARS} characters).` },
        source: { type: "string", description: "Where the original comes from: file path, URL or ticket. Required." },
        sourceDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date of the source, YYYY-MM-DD." },
        area: { type: "string", description: "Area/folder; default: the area of the template (e.g. Arbeit)." },
        nodes: { type: "array", items: nodeSchema, description: `Your structured sections (at most ${INGEST_MAX_NODES}); the ref "originaltext" is reserved.` },
        reason: changeMeta.reason,
        ...targetProperty,
      },
      required: ["text", "source"],
    },
  },
  {
    name: "bloommd_update_map",
    title: "Map ergänzen",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: "Add nodes to or update nodes of an existing map by id, and/or set frontmatter fields (status, stale_after, verified, scope, replaced_by): only the fields you pass change, the rest of the map stays as it is; give nodes, frontmatter fields or both. verified appends one sign-off to the list. Pass the version from bloommd_get_map to avoid overwriting edits made meanwhile.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { path: { type: "string" }, version: { type: "string" }, nodes: { type: "array", items: nodeSchema, minItems: 1 }, ...trustProperties, ...changeMeta, ...targetProperty },
      required: ["path"],
    },
  },
  {
    name: "bloommd_update_node",
    title: "Knoten ändern",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: "Change ONE existing node partially: only the fields you pass change (title, content, kind, status, decision, due, assignee or its alias owner, note, citation, url, relations); everything else of the node and the map stays as it is. content is appended to the existing content unless contentMode is replace. children adds new nodes below this node, after its existing children (same fields as nodes of bloommd_update_map; a child may use ref and parent to build a sub-tree). Works while people edit the map. Same rights as bloommd_update_map: written directly or kept as a proposal for the owner. An unknown nodeId is refused.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        nodeId: { type: "string", description: "Id of the node to change (from bloommd_get_map)." },
        version: { type: "string", description: "Map version from bloommd_get_map, to avoid changing a node of a map that moved on." },
        ...Object.fromEntries(Object.entries(nodeSchema.properties).filter(([key]) => KNOWLEDGE_NODE_PATCH_FIELDS.includes(key))),
        children: { type: "array", description: "New nodes below this node, appended at its end.", items: { ...nodeSchema, properties: Object.fromEntries(Object.entries(nodeSchema.properties).filter(([key]) => key !== "id")) } },
        ...changeMeta,
        ...targetProperty,
      },
      required: ["path", "nodeId"],
    },
  },
  {
    name: "bloommd_tasks",
    title: "Aufgaben",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Open tasks across maps, soonest due first (no due date last, then path and document order): nodes of kind task that are not done, plus open '- [ ]' checkbox lines in node content (a checkbox inherits neither due nor owner). Each task has path, mapTitle, nodeId, title, status, due, owner (also as assignee), overdue (due before today) and context. Filters: owner (alias assignee; exact, case-insensitive) and dueBefore (due on or before that day, overdue included, tasks without due left out); area narrows to one area, includeDone adds done task nodes. Use for reminders, planning and preparing meetings.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        area: { type: "string" },
        includeDone: { type: "boolean" },
        owner: { type: "string", description: "Only tasks of this person; alias of assignee." },
        assignee: { type: "string", description: "Same as owner." },
        dueBefore: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD; due on or before this day." },
        ...targetProperty,
      },
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
    description: "The agent's recent changes (change log, newest first) with change ids for undo. since (ISO date or date-time, e.g. 2026-10-27 or 2026-10-27T08:30:00Z; without an offset UTC) keeps only changes from then on; limit still caps the list.",
    inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 200 }, since: { type: "string", description: "Only changes at or after this ISO date or date-time." }, ...targetProperty } },
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
  "1. bloommd_overview to see areas and access; bloommd_search to find an existing map for the topic (filters status, tag, scope for learnings by role or component; expired and veraltet/ersetzt maps are left out unless includeStale is true).",
  "2. Existing topic: bloommd_get_map, then bloommd_update_map with new nodes under the right parent (several nodes at once) or bloommd_update_node to change one node (status, content, relations) and/or add children below it. New topic: bloommd_templates, then bloommd_create_map with the fitting template.",
  "3. Only use facts from the source; questions instead of guesses; short titles, details in content; tasks with status/due/assignee; decisions with decision state; connect related nodes with relations.",
  "4. Private material (school, own conversations) goes to target vault; work and team material to target cloud when it is configured.",
  "5. Raw text (transcript, chat, note): structure it yourself, then bloommd_ingest files it as a map from a template with the original word for word as the source node; never put credentials or personal data in it.",
  "If a change comes back as 'proposed', the owner reviews it; tell them. Never try to approve proposals yourself.",
  "Reading: bloommd_get_node returns one node (parent, child ids, relations, map version); bloommd_backlinks lists the maps and nodes that link to a map or note; bloommd_workspace_index reports link health over all readable maps (broken links, stale anchors or targets, duplicate node ids) and, with path, the backlinks of one map's headings; bloommd_changes with since lists your changes from a date or time on.",
  "Trust fields (status, stale_after, verified, scope, replaced_by) can be set with bloommd_create_map and bloommd_update_map; verified appends. bloommd_stale lists maps that are expired or about to expire, so they can be re-checked, renewed or retired.",
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
        case "bloommd_search": return service.search(string(args, "query") ?? "", {
          area: string(args, "area"),
          status: string(args, "status"),
          tag: string(args, "tag"),
          scope: string(args, "scope"),
          includeStale: args.includeStale === true,
        });
        case "bloommd_stale": {
          const result = await service.stale({
            area: string(args, "area"),
            tag: string(args, "tag"),
            scope: string(args, "scope"),
            days: typeof args.days === "number" && Number.isInteger(args.days) && args.days >= 0 ? args.days : undefined,
          });
          // Like `agent stale`: nothing to check reads as exactly NO_REPLY, so a routine stays silent.
          return result.stale.length === 0 ? new McpTextResult("NO_REPLY", result) : result;
        }
        case "bloommd_get_map": return service.getMap(string(args, "path", true)!);
        case "bloommd_get_node": return service.getNode(string(args, "path", true)!, string(args, "nodeId", true)!);
        case "bloommd_backlinks": return service.backlinks(string(args, "path", true)!);
        case "bloommd_workspace_index": return service.workspaceIndex(string(args, "path"));
        case "bloommd_templates": return service.templates(string(args, "id"));
        case "bloommd_create_map": return service.createMap({
          area: string(args, "area", true)!,
          title: string(args, "title", true)!,
          template: string(args, "template"),
          nodes: nodes(args, 0),
          tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
          frontmatter: parseKnowledgeFrontmatterInput(args),
          ...meta,
        });
        case "bloommd_ingest": {
          // template and title are checked at run time: a new map needs them, inMap must not get them.
          const inMap = string(args, "inMap");
          return service.ingest({
            template: string(args, "template", !inMap),
            title: string(args, "title", !inMap),
            inMap,
            text: string(args, "text", true)!,
            sourceRef: string(args, "source", true)!,
            sourceDate: string(args, "sourceDate"),
            area: string(args, "area"),
            nodes: parseIngestNodes(args.nodes),
            reason: meta.reason,
          });
        }
        case "bloommd_update_map": {
          const trust = parseKnowledgeFrontmatterInput(args);
          return service.updateMap({ path: string(args, "path", true)!, version: string(args, "version"), nodes: nodes(args, trust ? 0 : 1), frontmatter: trust, ...meta });
        }
        case "bloommd_update_node": return service.updateNode({
          path: string(args, "path", true)!,
          nodeId: string(args, "nodeId", true)!,
          version: string(args, "version"),
          patch: Object.fromEntries(KNOWLEDGE_NODE_PATCH_FIELDS.filter((field) => args[field] !== undefined).map((field) => [field, args[field]])),
          ...meta,
        });
        case "bloommd_tasks": return service.tasks({
          area: string(args, "area"),
          includeDone: args.includeDone === true,
          assignee: string(args, "assignee"),
          owner: string(args, "owner"),
          dueBefore: string(args, "dueBefore"),
        });
        case "bloommd_decisions": return service.decisions(string(args, "area"));
        case "bloommd_share_link": return service.shareLink(string(args, "path", true)!, typeof args.expiresInDays === "number" ? args.expiresInDays : 30);
        case "bloommd_changes": return service.changes(typeof args.limit === "number" ? args.limit : 20, string(args, "since"));
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
