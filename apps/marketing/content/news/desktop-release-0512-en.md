---
title: "BloomMD Desktop 0.5.12: smoother navigation in large folders"
description: "A compact overview, background layout and reliable updates for local Markdown files."
date: 2026-10-08
commitDate: 2026-10-08
tags:
  - Release
  - Desktop
version: "0.5.12"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.12"
---

# BloomMD Desktop 0.5.12: smoother navigation in large folders

Local workspaces with at least 100 files now open as a compact folder/file overview.
Expand a file to see its headings. Markdown content remains fully available, and cross-links
remain visible in the compact view.

Layout runs in the background with a visible status. Changing folders discards outdated
calculations. When you pan or zoom, the canvas renders visible nodes only. Unchanged parse
results and workspace contributions are reused when files change.

![BloomMD Desktop 0.5.12 showing a synthetic test workspace with file nodes and expandable headings](/releases/desktop-0.5.12-workspace.png)

External edits, additions and deletions, including `.markdown` files, are detected. Arrow
navigation expands collapsed parents before selecting the next child.

The macOS arm64 release is Developer ID signed and Apple notarized. Update through
**Help and settings → About BloomMD → Check for updates**, or use the download page.
The release includes a delta patch from 0.5.11.

[Download](/download?lang=en) · [Desktop help](/docs/desktop?lang=en)
