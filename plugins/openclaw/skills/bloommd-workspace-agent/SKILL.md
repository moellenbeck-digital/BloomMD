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
