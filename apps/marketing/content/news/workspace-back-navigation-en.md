---
title: "Back from a file to the workspace overview"
description: "BloomMD preserves the folder, remote context and focus when you navigate back."
date: 2026-08-30
commitDate: 2026-08-30
tags:
  - Workspace
  - Focus
  - UX
version: "0.4.0"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.4.0"
---

# Back from a file to the workspace overview

A file is rarely the end of a workflow. You may open a folder first, then a Markdown file, and later want to return to the overview without losing your context.

BloomMD now treats these views as one connected but clearly separated navigation flow. A visible button takes you back to the workspace overview while keeping the local folder or active remote workspace selected.

Focus remains predictable too: after navigating back, the canvas is focused again and the file list stays in the correct workspace context. In remote mode, the individual file session is cleanly disconnected before the overview loads.

For keyboard-first workflows, `Cmd/Ctrl + ←` returns to the workspace overview.
Use `Cmd/Ctrl + →` to reopen the most recently opened file.

**Commit date:** August 30, 2026 · [View the release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.4.0)
