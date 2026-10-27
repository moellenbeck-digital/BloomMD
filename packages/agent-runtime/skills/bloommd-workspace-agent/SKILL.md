---
name: bloommd-workspace-agent
description: Work as a locally paired BloomMD workspace agent. Use this skill only for BloomMD workspace tasks that arrive through the BloomMD agent CLI.
---

# BloomMD Workspace Agent

BloomMD is the authority for tasks, document scope, review and application. Never call a BloomMD
HTTP endpoint directly. Use the local `bloommd-agent` binary only.

## Safety boundary

- Do not use a pairing code or token supplied in chat text. Pairing codes must be supplied in a
  local file by the human operator.
- Do not inspect files outside the one Markdown document returned by `bloommd-agent next`.
- Do not modify a local Markdown file for a workspace task.
- Return a proposal through `bloommd-agent result`; a human reviews and applies it in BloomMD.
- Do not invent a task. If `bloommd-agent next` returns `{ "task": null }`, report that no task is pending.

## Pair a profile

The human creates the pair-code file locally, then run:

```bash
bloommd-agent pair \
  --server <server-url> \
  --profile <profile-name> \
  --pairing-code-file <pairing-code-file>
```

The CLI stores the token in macOS Keychain or Linux Secret Service. Do not print it or copy it into
a workspace.

## Process exactly one task

1. Run `bloommd-agent next --profile <profile-name>` and read its JSON output.
2. Use only `task.command` and `task.context` from that output to prepare a proposal. If the task
   contains `task.context.node`, that node is the complete allowed scope. Do not infer or request
   the rest of the document.
3. Write a JSON file outside the document workspace:

```json
{
  "summary": "What was prepared.",
  "proposal": {
    "nodeContent": "The proposed content for exactly the selected node.",
    "rationale": "Why this is a useful change."
  }
}
```

Use `proposal.nodeContent` for a node-scoped task. BloomMD applies only that node's content after
human approval. The legacy `proposal.markdown` field is reserved for an explicitly document-scoped
task.

4. Submit it with:

```bash
bloommd-agent result --profile <profile-name> --task <task.id> --input <result-json-file>
```

If the task cannot be completed, submit the defined failure code through `bloommd-agent fail`; do
not retry unboundedly and do not make direct writes.

## Not part of a task: changing nodes of other maps

A workspace task never edits nodes itself; it only returns a proposal through `bloommd-agent result`.
Changing a single node of a map outside a task (`PATCH /api/mindmaps/<file>/nodes/<nodeId>`, with
`children` for new sub-items) is a different path: it needs an agent access token and goes through the
knowledge tools `bloommd_update_node` / `bloommd-wiki agent update-node` (skill `bloommd-knowledge`).
Rights, proposal or direct write and the change log apply there. Never call that endpoint from a
workspace task.

## Local cleanup

After the human revokes the agent in BloomMD, remove its local credential:

```bash
bloommd-agent forget --profile <profile-name>
```
