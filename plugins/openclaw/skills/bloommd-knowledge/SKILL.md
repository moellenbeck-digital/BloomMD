---
name: bloommd-knowledge
description: File notes from conversations, meetings, discussions, school and projects into BloomMD mind maps (Obsidian vault or BloomMD cloud) and act on them — tasks, decisions, study questions. Use when the user shares a transcript, chat, class notes or says "leg das in BloomMD ab", "trag das ein", "was steht noch an", "bereite mich auf … vor".
---

# BloomMD knowledge filing

BloomMD shows Markdown notes as mind maps: each heading is a node, each file is a map. The `bloommd`
MCP server gives you the tools `bloommd_*`. Maps you write appear in Obsidian (vault) or the BloomMD
apps (cloud) right away and are meant to be read, presented and explained by people.

## Filing raw material

1. `bloommd_overview` — see areas (Schule, Arbeit, Projekte, Gespräche, …) and what you may do there.
2. `bloommd_search` for the main subject. If a map for it exists, extend it; do not create duplicates.
3. Existing map: `bloommd_get_map`, then `bloommd_update_map` with the `version` you read. Put new
   nodes under the fitting parent id; update existing nodes by `id` (content is appended).
4. New map: `bloommd_templates` → pick `meeting`, `conversation`, `discussion`, `lesson`, `project`
   or `weekly`; read its guidance with `bloommd_templates {id}`; then `bloommd_create_map` with
   `template` and nodes whose `parent` is a skeleton ref (e.g. `aufgaben`, `begriffe`, `themen`).
5. Always pass `source` (what you filed from) and a one-sentence `reason`.

## Quality rules

- Only facts from the source. Unclear → node under "Offene Fragen", never invent.
- Short titles (≤ 8 words), details in `content`. One idea per node, at most ~4 levels deep.
- Tasks: `status: "open"`, `assignee` and `due` (YYYY-MM-DD) only when the source names them.
- Decisions: `decision: "accepted" | "proposed" | "rejected"`.
- Connect related nodes with `relations` and a short label ("hängt ab von", "spricht für", "verwendet").
- School: concepts with definition + example, formulas with every symbol explained, and
  "Lernfragen" (question as title, answer as content) so study mode can quiz the user.
- Names of colleagues and students: use only as written in the source; no extra personal data.

## Where things go

- Private (school, own conversations, personal projects): `target: "vault"`.
- Work and anything to share with colleagues: `target: "cloud"` when the cloud is configured,
  otherwise the vault area `Arbeit`.
- Area = folder path; subareas such as `Schule/Physik` or `Learnings/dev-team` can have their own right (the longest matching area wins). In a cloud workspace the server holds and enforces your rights.

## Acting on the maps

- "Was steht an?" → `bloommd_tasks` (optionally `dueBefore`, `assignee`), answer as a short list
  with map names.
- Before a meeting → `bloommd_search` + `bloommd_get_map` for the topic; summarise open tasks,
  decisions and questions.
- Learning → read the `Lernfragen` of a lesson map and quiz the user one question at a time.
- Explaining to colleagues → `bloommd_share_link {path}` (cloud maps only) gives a read-only link
  without an account; only when the user asks to share, and tell them how long it is valid.
- Change one node (set a status, append text, add relations) and/or add children below it →
  `bloommd_update_node {path, nodeId, …fields, children}` instead of rewriting the map; only the fields
  you pass change, `children` are appended after the node's existing children, an unknown `nodeId` is
  refused. Same rights as `bloommd_update_map`: written or proposed. Add `reason` and `source` so the
  log says why and where from.
- Read one node → `bloommd_get_node {path, nodeId}`: title, content, metadata, parent, child ids,
  relations and the map `version`; an unknown `nodeId` is refused.
- Who links here → `bloommd_backlinks {path}`: maps and nodes that link to a map or note (`path`, `nodeId`,
  `line`, `link`). Read-only; maps you cannot read are left out.
- Mistake → `bloommd_changes` (`since` = ISO date or date-time keeps only newer changes), then `bloommd_undo {changeId}`.
- Learnings and other maps with trust fields → `bloommd_search` with `tag`, `scope` or `status` (query may
  be empty); expired and veraltet/ersetzt maps only appear with `includeStale: true`. `bloommd_stale`
  lists maps whose `stale_after` has passed (`days` adds those expiring soon). Set `status`, `stale_after`,
  `verified {by, at}`, `scope` and `replaced_by` with `bloommd_update_map` (only those fields change).

## Requests from the owner

The owner can ask you about a map node ("Ask agent…" in Obsidian). On every run, and when the user
asks about BloomMD requests:

1. `bloommd_requests` lists open requests: `id`, map `path`, `nodeId`, `nodeTitle`, `question`.
2. `bloommd_get_map {path}` and read the node and its surroundings.
3. `bloommd_answer_request {id, answer}` with a short answer in the owner's language. Add `nodes`
   (and the map `version`) only when the request asks for changes, with `parent` = the request's
   node; your rights decide whether they are written or proposed. Cannot answer → `failed: true`
   and say why in `answer`.
4. With no open requests in a scheduled run, reply `NO_REPLY`.

## Afterwards

Tell the user in their language which map you created or changed (path), what you added
(counts of nodes, tasks, decisions) and any open questions. If a result says `"mode": "proposed"`,
say that the owner has to approve it (agent panel in Obsidian, `bloommd-wiki agent proposals
<vault>`, or in a cloud workspace “Manage agents → Agent access” in the browser); never try to approve it yourself.
