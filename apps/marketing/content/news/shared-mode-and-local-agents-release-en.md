---
title: "Shared Mode and local agents: collaboration with clear boundaries"
description: "Deliberately share one local Markdown file, assign workspace roles, and review OpenClaw proposals at the relevant node."
date: 2026-09-22
commitDate: 2026-09-22
tags:
  - Shared Mode
  - Collaboration
  - OpenClaw
  - Desktop
  - Obsidian
version: "0.5.6"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.6"
draft: false
---

# Shared Mode and local agents: collaboration with clear boundaries

This release brings together two connected workflows: deliberately share one existing local
Markdown file with one workspace, then let a local OpenClaw agent investigate a selected node and
return a proposal within that workspace.

The file remains Markdown throughout. BloomMD never uploads the rest of the folder or additional
notes automatically. After sharing, the Desktop app shows the state on the file itself:
**connected**, **offline**, **conflict**, or **access revoked**. **Disconnect share** ends only the
binding; the local file and cloud document remain available.

Teams continue to use explicit workspace roles: owners invite and manage access, editors write, and
viewers read. The same cloud document can be opened from the browser, Desktop app, and a deliberately
bound Obsidian note.

OpenClaw adds assistance without creating unattended write access. A request starts at the selected
node, the agent receives only that context, and its change returns as a reviewable proposal. Review
structure as a tree and text as Markdown; only **Accept** writes the result to the workspace.

Read more: [share a local file and collaborate](/docs/collaboration) and
[set up OpenClaw agents](/docs/openclaw-agent).

**Release status:** This post will publish with Desktop `0.5.6` and Hosted `0.4.18`.
