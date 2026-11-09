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

![BloomMD Desktop (German interface) showing the sharing status "Konflikt" (conflict) for "Kapitel 2.md" with the choices "Cloud-Version verwenden" (use cloud version) and "Lokale Version beibehalten" (keep local version)](/blog/shared-mode-conflict-desktop.png)

*In a conflict, BloomMD does not overwrite anything automatically. You deliberately choose whether
to use the cloud version or keep the local version.*

Teams continue to use explicit workspace roles: owners invite and manage access, editors write, and
viewers read. The same cloud document can be opened from the browser, Desktop app, and a deliberately
bound Obsidian note.

OpenClaw adds assistance without creating unattended write access. A request starts at the selected
node, the agent receives only that context, and its change returns as a reviewable proposal. Review
structure as a tree and text as Markdown; only **Accept** writes the result to the workspace.

![Real BloomMD capture: the preview shows the source node "Welcome" marked as changed, and below it the proposed extension with the new nodes "Prüffragen" and "Nächste Schritte" as a tree.](/docs/openclaw-agent-proposal.png)

*Real product capture: the proposed structure can be reviewed as a tree before you decide.*

Read more: [share a local file and collaborate](/docs/collaboration) and
[set up OpenClaw agents](/docs/openclaw-agent).

**Release status:** Published on 22 September 2026 with Desktop `0.5.6` and Hosted `0.4.18`.
