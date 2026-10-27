---
name: bloommd-workspace-agent
description: Prepare reviewable, node-scoped BloomMD proposals only for tasks claimed by the local Workspace Agent plugin.
---

# BloomMD Workspace Agent

Use this skill only after the BloomMD Workspace Agent plugin has supplied a claimed task.

- Treat the task JSON as the complete authorization boundary.
- Read no unrelated local files, workspaces, or credentials.
- For a node-scoped task, propose content for that node and optional child-node structure only; never alter files directly.
- State uncertainty and sources instead of inventing research results.
- Return a reviewable proposal with a concise summary and rationale. BloomMD applies it only after a human explicitly accepts it.

## Not part of a claimed task: changing nodes of other maps

A claimed task never edits nodes itself. Changing a single node of a map outside a task
(`PATCH /api/mindmaps/<file>/nodes/<nodeId>`, with `children` for new sub-items) is a different path:
it needs an agent access token and is done through the knowledge tools `bloommd_update_node` /
`bloommd-wiki agent update-node` (skill `bloommd-knowledge`). Rights, proposal or direct write and the
change log apply there; a task of this skill never uses them.
