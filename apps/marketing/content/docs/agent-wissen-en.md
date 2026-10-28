---
title: Let an agent file your notes
description: An AI agent such as OpenClaw files conversations, meetings, study material and projects as BloomMD maps by itself – with adjustable rights, a change log and undo.
order: 7
draft: true
---

# Let an agent file your notes

An agent (e.g. OpenClaw or Claude) receives raw material – a transcript, a chat log, class notes –
and turns it into a clear map: topics, decisions, tasks with due dates and owners, open questions,
concepts with explanations and review questions. If a map for the topic already exists, it extends
that map instead of creating a second one.

Everything is stored as plain Markdown:

- **Vault** (a local folder, e.g. an Obsidian vault in iCloud) for private things such as school
  and your own conversations. Areas are folders: `Schule/Physik`, `Gespräche`, `Projekte`.
- **BloomMD cloud workspace** for work and anything colleagues should see.

## Setup

1. Install `bloommd-wiki` (release binary or from source).
2. Set the agent's rights – without a setting it may only **propose**:

   ```bash
   bloommd-wiki agent setup "~/…/Obsidian Vault" --access write --area Arbeit=propose
   ```

   | Right | Meaning |
   |---|---|
   | `read` | read and search only |
   | `propose` | changes become proposals; you apply them |
   | `write` | the agent writes directly, with change log and undo |

   An area may be a sub-area: `--area Learnings/dev-team=write` applies to everything below
   `Learnings/dev-team`. The longest matching area always wins – sub-area before parent area before
   default. So `Learnings` can be `read` while `Learnings/dev-team` is `write`.

   In a cloud workspace the rights are kept **per agent token on the server** (see below): you set
   them in the browser under **Manage agents** or with `agent setup --cloud …`, and the server
   enforces them – even against a modified client.

3. Add the MCP server to the agent, for OpenClaw:

   ```bash
   openclaw mcp add bloommd --command bloommd-wiki \
     --arg agent --arg mcp --arg --vault --arg "/path/to/vault" --arg --name --arg OpenClaw
   openclaw mcp doctor bloommd --probe
   ```

   For a cloud workspace add `--arg --cloud --arg https://… --arg --workspace --arg <id>`; the access
   token goes into the `BLOOMMD_TOKEN` environment variable, never into the command.

4. For OpenClaw, install the `bloommd-knowledge` skill (part of BloomMD's OpenClaw plugin). It tells
   the agent how to file, which template fits and what belongs in the vault or the cloud.

### Setup in Claude Code

Claude Code starts the MCP server as a local process (stdio). The rights (step 2) apply unchanged;
`--name` appears in the change log.

For a **vault**, register the server for all your projects (`--scope user`) and check it:

```bash
claude mcp add --scope user bloommd -- \
  bloommd-wiki agent mcp --vault "/path/to/vault" --name "Claude Code"
claude mcp list
```

For a **cloud workspace** (or both together) add `--cloud` and `--workspace`. The access token never
goes into the command or the configuration: set `BLOOMMD_TOKEN` in the environment you start Claude
Code from and let Claude Code insert the variable at startup (the single quotes keep the shell from
replacing it earlier):

```bash
export BLOOMMD_TOKEN=…   # the agent's access token, e.g. from your password manager
claude mcp add-json --scope user bloommd '{
  "type": "stdio",
  "command": "bloommd-wiki",
  "args": ["agent", "mcp", "--vault", "/path/to/vault",
           "--cloud", "https://…", "--workspace", "<id>", "--name", "Claude Code"],
  "env": { "BLOOMMD_TOKEN": "${BLOOMMD_TOKEN}" }
}'
```

Without `--vault` the server works with the cloud only, without `--cloud` with the vault only; tools
choose between the two with `target`. Once it runs, the server is listed under `/mcp` in Claude Code.
Teams can put the same entry into the project's `.mcp.json` with `--scope project` – it contains only
`${BLOOMMD_TOKEN}` there as well, never the value.

## Tools

The server offers 18 tools `bloommd_*`. Reading (no changes):

| Tool | Purpose |
|---|---|
| `bloommd_overview` | areas, rights and maps |
| `bloommd_search` | search in nodes, tags and frontmatter (filters `status`, `tag`, `scope`) |
| `bloommd_get_map` | a map as an outline with its `version` |
| `bloommd_get_node` | **one** node: title, content, metadata, parent, child ids, relations and the map's `version` |
| `bloommd_backlinks` | **backlinks**: maps and nodes that link to a map or note |
| `bloommd_changes` | the agent's change log, with `since` from a point in time |
| `bloommd_tasks`, `bloommd_decisions`, `bloommd_stale`, `bloommd_templates`, `bloommd_requests` | tasks, decisions, expiring maps, templates, requests |

Writing, according to the agent's rights: `bloommd_create_map`, `bloommd_ingest`, `bloommd_update_map`,
`bloommd_update_node`, `bloommd_answer_request`, `bloommd_undo` and `bloommd_share_link`.

### Single node, backlinks, changes since

- `bloommd_get_node {path, nodeId}` reads one node together with the map's `version`, without loading
  the whole map. An unknown `nodeId` is refused.
- `bloommd_backlinks {path}` names, per hit, the map, the node (`nodeId`, `nodeTitle`), the line and the
  link as written (`[[Note]]` or Markdown link). Only maps the agent can read are searched; hits from
  maps the store does not let it read are left out.
- `bloommd_changes {since}` shows only changes from an ISO date (`2026-10-27`, start of the day in UTC)
  or point in time (`2026-10-27T08:30:00Z`; without a time zone UTC applies). Without `since` nothing
  changes; `limit` still caps the list. An invalid `since` is refused.

All three work for `target` `vault` and `cloud` and never change anything.

## Use

- "File the team meeting in BloomMD" plus the notes.
- "Here are my physics notes, make a study map."
- "What is due this week?" – the agent reads all open tasks with due dates.
- "Prepare me for the talk with Lea." – it finds the relevant maps and summarises them.
- "Quiz me on thermodynamics."

Templates: **meeting**, **conversation**, **discussion**, **lesson**, **project**, **weekly**. The
maps can be presented in BloomMD, quizzed in study mode and exported as PNG/PDF – easy to explain
and share.

## File text as a map (ingest)

When the agent has raw text (transcript, chat, note) and has already structured the sections,
`bloommd_ingest` creates the map from a template and keeps the original as the source. The tool
invents nothing and calls no model: the structure comes from the agent, it is only a create-and-check
layer over `bloommd_create_map` with the same rights (read: refused, propose: a proposal that only a
person approves, write: written), log and undo.

```bash
bloommd-wiki agent ingest --vault ~/Vault --name coder --vorlage meeting \
  --titel "Weekly product team" --text transcript.txt \
  --quelle "Teams recording 20 Oct" --quelle-datum 2026-10-20 \
  --abschnitte sections.json          # file, or - for stdin
```

- **Input:** original text (`--text <file|->`, MCP: `text`), template (`meeting`, `conversation`,
  `discussion`, `lesson`, `project`, `weekly`; not `learning`, which has `agent create|append`), title,
  optionally an area (default: the template's area), a source reference (`--quelle`, MCP: `source`; path,
  URL or ticket) and the date of the source (`--quelle-datum`, MCP: `sourceDate`, `YYYY-MM-DD`), plus the
  sections as a JSON array of nodes in the format of `bloommd_create_map` (`--abschnitte`, MCP: `nodes`);
  `parent` is a skeleton ref of the template (`themen`, `aufgaben`, …). Only one input may be stdin (`-`).
- **Source:** the original text stands word for word as the node "Originaltext" (`kind: source`) below
  "Quellen", with reference and date in `citation` (an http(s) URL also as `url`) and in the map's
  `source`. It sits in a code block so headings, lists and `---` inside the text stay text; nothing is
  shortened or reworded (the only change: line breaks are stored as `\n`). A template without a "Quellen"
  node (`weekly`) gets one. Without original text or source reference nothing is written ("Missing source").
- **Limits:** original text at most **200,000 characters**, sections at most **150 nodes** (template
  skeleton and source node not counted). Above that you get an error with the actual value and the limit,
  and nothing is written.
- **Duplicates:** if the target area already has a map with the same title (case and punctuation do not
  count), nothing is created; the error names the path. The same title in another area is not a
  duplicate. There is no `--force`.
- **Exit codes** (`agent ingest`): 0 ok, 1 error (e.g. unknown template, no permission), 2 wrong call or
  refused input (limits, missing source), 3 duplicate (`{"duplicate":true,"pfad":…}`).
- **No credentials and no personal data** (passwords, tokens, keys, private details) in the original text
  or the sections: the tool filters nothing. Remove what does not belong in the map first (as with
  learnings).

## Change a single node

To change one node partially – set a status, append text, draw a connection, add new sub-items – use
`bloommd_update_node`. Only the fields you name change; the rest of the node and the map stays, and
the map is never replaced. The change also works while someone is editing the map. Rights, proposal
or direct write and the log are the same as for `bloommd_update_map`, in a vault as in a cloud
workspace:

```bash
bloommd-wiki agent update-node --cloud https://… --workspace <id> "Arbeit – Plan.md" <node-id> \
  --patch '{"status":"done","children":[{"title":"Follow-up","status":"open"}]}' \
  --reason "Task done" --source "Teams transcript 27 Oct"
```

Use a vault folder instead of `--cloud`; `--patch -` reads the JSON from stdin. With an agent token the
token's rights apply; with your owner token the command writes as you.

Fields: `title`, `content` (appended; `contentMode: "replace"` replaces), `kind`, `status`,
`decision`, `due`, `assignee`, `note`, `citation`, `url`, `relations` and `children`. New
`children` go to the end of the node (same fields as the `nodes` of `bloommd_update_map`; with `ref`
and `parent` they can form sub-trees). Metadata can be set, not cleared.

Through the server API (agent token, session or personal token):

```http
PATCH /api/mindmaps/<file>/nodes/<node-id>
{ "status": "done", "children": [{ "title": "Follow-up" }], "agentMeta": { "source": "Teams transcript 27 Oct", "reason": "Task done" } }
```

| Response | Meaning |
| --- | --- |
| 200 `{ ids, created, updated, version, mode, changeId }` | written directly; `mode` and `changeId` (for undo) for agent tokens |
| 202 `{ mode: "proposed", proposalId }` | the agent may only propose in this area; the proposal carries the map's base version |
| 403 `AGENT_READ_ONLY` | the agent may only read in this area |
| 404 `NODE_NOT_FOUND` | the node id is not in the map |
| 400 `INVALID_NODES` | invalid or unknown fields, invalid date, `children` with an `id` |

`POST /api/mindmaps/<file>/nodes` stays for several nodes at once (create and update by id).

## Share with colleagues

For maps in a cloud workspace, **Read-only links** (chain icon in the toolbar) opens the overview:
create a link (valid for 1, 7, 30 or 90 days) that others can open without an account – as a map or
an outline, read-only. The same dialog lists all links of the map and revokes them; a revoked link
stops working immediately. A link shows only titles, visible text and task details – no frontmatter,
comments or drawings. Search engines do not index these pages.

The agent can create links too ("send Lea a link to the project map"), but only if you allow it for
its token: **Account → Desktop and agent access → May create read-only links**. Every link the agent
creates appears in the audit log with its name.

## In Obsidian: the agent panel

With the BloomMD plugin for Obsidian you keep an eye on the agent right in the vault – on the Mac and
on the iPad. Open the panel from the robot icon in the ribbon or with **BloomMD: Open agent panel**.
The icon counts open proposals, and a notice appears when a new one arrives.

- **Proposals:** agent, time, note, reason and source, an outline of the change (+ added,
  ~ changed, − removed) and the full text. **Approve** applies the proposal; if the note changed
  since, the panel shows the difference and you decide: **Apply anyway** or **Reject**. When
  rejecting you can give the agent a reason.
- **Requests:** see below.
- On the map, a small purple dot marks nodes the agent changed since you last opened the map on
  this device.
- **History:** who changed what and when. **Undo** restores the state before an agent change or an
  approved proposal – after a confirmation, and only if nobody edited the note since.
- **Rights:** the default and, per top-level folder, `read`, `propose` or `write`, exactly like
  `bloommd-wiki agent setup`. Sub-areas such as `Learnings/dev-team` are set with
  `agent setup --area …`. For your own agent, `write` is the usual choice.

The panel and `bloommd-wiki agent …` share the same files in `.bloommd/` and the same rules. Only a
person can approve; the agent has no tool for it.

## Ask the agent about a node

A node's menu on the map (right click, long press on the iPad) has **Ask agent…**: type a question
or instruction such as "Add the next steps here". The request is stored in `.bloommd/requests/` and
shows under **Requests** in the panel with its status. The agent picks up open requests with the
`bloommd_requests` tool and answers with `bloommd_answer_request`. Its answer appears in the panel;
nodes it adds on the way follow its rights – written directly or as a proposal for you to approve.
Without a map: **Ask agent about current note**.

To let OpenClaw work through requests on its own, add a routine, e.g. every 15 minutes:

```bash
openclaw cron add --name bloommd-requests --cron "*/15 * * * *" --tz Europe/Berlin \
  --message "Check open BloomMD requests with bloommd_requests. Read each map, answer every request with bloommd_answer_request and only add nodes when asked to. If there are none: NO_REPLY."
```

## Routines

`bloommd-wiki agent due <vault>` lists due and overdue tasks across all maps and prints `NO_REPLY`
when nothing is due. As an OpenClaw automation it therefore only speaks up when there is work:

```bash
openclaw cron add --name bloommd-due-tasks --cron "50 7 * * *" --tz Europe/Berlin \
  --command-argv '["bloommd-wiki","agent","due","/path/to/vault"]' \
  --announce --channel telegram --to <chat-id>
```

`--days 7` shows the whole coming week.

Likewise `bloommd-wiki agent stale <vault>` reports maps whose `stale_after` has been reached or passed
(with `--days 14` also those of the next two weeks) and prints `NO_REPLY` when nothing expires.

### Trust and expiry

The agent can set `status` (`neu`, `bestätigt`, `veraltet`, `ersetzt`), `stale_after`, `verified` (appended),
`scope` and `replaced_by` when creating a map and later on; `bloommd_update_map` then changes only those
fields. `bloommd_search` also finds tags and frontmatter values and filters by `status`, `tag` and `scope`.
Expired maps and maps marked `veraltet` or `ersetzt` are only returned with `includeStale: true` (or with a
`status` filter). `bloommd_stale` lists the expired maps.

## Control

```bash
bloommd-wiki agent log "/path/to/vault"             # what did the agent change?
bloommd-wiki agent undo "/path/to/vault" <change-id> # undo a change
bloommd-wiki agent proposals "/path/to/vault"        # open proposals
bloommd-wiki agent approve "/path/to/vault" <id> --reviewer Max
bloommd-wiki agent reject "/path/to/vault" <id> --reviewer Max --reason "Belongs in Projects"
```

For the cloud workspace use `--cloud <url> --workspace <id>` instead of the folder – the same values
as for the MCP server. Rights, proposals and log live there **per agent token on the server** and are
enforced there, no longer on the agent's machine; several pods or machines using the same token share
the same rights and the same log. All commands with `--cloud` need your owner token in
`BLOOMMD_TOKEN`; `--agent <name|id>` picks the agent token (not needed with only one):

```bash
bloommd-wiki agent setup --cloud https://… --workspace <id> --agent OpenClaw --access propose \
  --area Learnings=read --area Learnings/dev-team=write
bloommd-wiki agent rights --cloud https://… --workspace <id>
bloommd-wiki agent proposals --cloud https://… --workspace <id>
bloommd-wiki agent approve --cloud https://… --workspace <id> <proposal-id>
bloommd-wiki agent log --cloud https://… --workspace <id> --agent OpenClaw
```

### Approve and set rights in the browser

As workspace owner open **Manage agents** (workspace menu) in the cloud workspace and find
**Agent access**:

- **Open proposals** with agent, area, time, reason and an outline of the change (+ added,
  ~ changed, − removed). **Approve** applies the proposal, **Reject** discards it (with an optional
  reason). If the map changed since, you see that and decide whether to apply it anyway. The log
  records who approved or rejected – with your signed-in name. `agent approve|reject` with your
  token takes the same server path; `--reviewer` is not needed there.
- **Rights** per agent token: a default right and rights per area (sub-areas too). Without an entry
  the agent may only propose.
- The **change log** with **Undo**.

Rights apply immediately. An expired or revoked token is refused with 401 on every route on its next
call (only a live editing session that is already open keeps the right it was given when it opened,
until it is closed). A token with scope `read` writes nowhere, not even proposals. Rights, proposals, the
log and undo are tools of the workspace owner; an agent token cannot reach them and cannot approve itself.
For every change the log names the agent, the tool and – when the agent gives them – source and reason;
the interface shows them. What the server checks:
`read` refuses every change with a message naming the area; `propose` only stores a proposal;
`write` writes directly and logs. Renaming, deleting, read-only links and live editing need `write`
in the area as well.

### Old local rights

Rights of a cloud workspace used to live in `agent.json` under
`~/.bloommd/agent-cloud/<host>-<workspace>/`. The first start with a cloud target says so once.
**Local rights are never carried over silently:** until you decide, the server's right applies
(without an entry: `propose`).

```bash
bloommd-wiki agent migrate --cloud https://… --workspace <id> --agent OpenClaw           # only shows what applies
bloommd-wiki agent migrate --cloud https://… --workspace <id> --agent OpenClaw --apply   # set exactly the old rights
bloommd-wiki agent migrate --cloud https://… --workspace <id> --agent OpenClaw --discard # discard them
```

`--apply` sets at most the former local rights, and only if nothing has been set for the token on
the server yet. Old local logs and proposals stay untouched; they are neither carried over to the
server nor deleted.

- The agent never rewrites whole files; it adds or extends nodes. If someone changed the map
  meanwhile, it stops and reads again.
- Only a person can apply proposals; the agent has no tool for it.
- The agent can only undo its own direct changes, and only within its rights: in a `propose` area
  the undo becomes a proposal. Approved proposals can only be undone by you (`agent undo`).
- Areas match regardless of spelling: a rule for `Arbeit` also covers `arbeit`. In a cloud workspace
  the area is part of the file name (`Learnings › dev-team – Idee.md`).
- In the cloud, whole maps can only be replaced (undo, approved proposal) while nobody has them open;
  otherwise you get a message and try again after closing the map.
- In a vault, log, history and proposals live under `.bloommd/` and sync with it; in a cloud
  workspace they live on the server.
- Files that iCloud keeps only in the cloud are skipped and reported in the overview.
