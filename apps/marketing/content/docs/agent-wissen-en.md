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

## Use

- "File the team meeting in BloomMD" plus the notes.
- "Here are my physics notes, make a study map."
- "What is due this week?" – the agent reads all open tasks with due dates.
- "Prepare me for the talk with Lea." – it finds the relevant maps and summarises them.
- "Quiz me on thermodynamics."

Templates: **meeting**, **conversation**, **discussion**, **lesson**, **project**, **weekly**. The
maps can be presented in BloomMD, quizzed in study mode and exported as PNG/PDF – easy to explain
and share.

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
  `bloommd-wiki agent setup`. For your own agent, `write` is the usual choice.

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

## Control

```bash
bloommd-wiki agent log "/path/to/vault"             # what did the agent change?
bloommd-wiki agent undo "/path/to/vault" <change-id> # undo a change
bloommd-wiki agent proposals "/path/to/vault"        # open proposals
bloommd-wiki agent approve "/path/to/vault" <id> --reviewer Max
bloommd-wiki agent reject "/path/to/vault" <id> --reviewer Max --reason "Belongs in Projects"
```

For the cloud workspace use `--cloud <url> --workspace <id>` instead of the folder – the same values
as for the MCP server. The workspace's rights, log and proposals live on your machine under
`~/.bloommd/agent-cloud/`; `approve`, `undo`, `log` and `due` also need the token in
`BLOOMMD_TOKEN`:

```bash
bloommd-wiki agent setup --cloud https://… --workspace <id> --access write --area Arbeit=propose
bloommd-wiki agent proposals --cloud https://… --workspace <id>
bloommd-wiki agent approve --cloud https://… --workspace <id> <proposal-id> --reviewer Max
```

- The agent never rewrites whole files; it adds or extends nodes. If someone changed the map
  meanwhile, it stops and reads again.
- Only a person can apply proposals; the agent has no tool for it.
- The agent can only undo its own direct changes, and only within its rights: in a `propose` area
  the undo becomes a proposal. Approved proposals can only be undone by you (`agent undo`).
- Areas match regardless of spelling: a rule for `Arbeit` also covers `arbeit`.
- In the cloud, whole maps can only be replaced (undo, approved proposal) while nobody has them open;
  otherwise you get a message and try again after closing the map.
- Log, history and proposals live in the vault under `.bloommd/` and sync with it.
- Files that iCloud keeps only in the cloud are skipped and reported in the overview.
