---
title: "Find your node again: navigation fixes for large maps"
description: "Search by title or file path, reveal folded branches and understand loading notices."
date: 2026-11-27
commitDate: 2026-11-27
tags:
  - Release
  - Desktop
  - Mobile
version: "0.6.1"
draft: false
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.1"
---

# Find your node again: navigation fixes for large maps

Large folder overviews now start compact. **Find node** searches titles and file paths; selecting a result expands its ancestors and brings it into view. **Show selected node** returns to the selection after panning away.

Desktop 0.6.1 and Mobile 1.1.0 also explain loading problems. **Details** shows the reason and, for invalid YAML headers, the line and column within the YAML block. Dismiss the notice with × and reopen it when needed. After correcting the source file in a text editor, choose **Retry**. A skipped file has no node until it loads successfully.

![Real Mobile touch-test view: the found Transfer node is selected and centered, with search and locate controls above](/releases/mobile-1.1.0-node-search.png)

The image shows the built Mobile app in an iPhone-size browser touch test, not a physical iPhone. Mobile distribution is through testing channels; it is not an announcement of App Store or Google Play production availability. Obsidian 0.8.0 is being verified separately and is not included in the Desktop release.

See [Desktop help](/docs/desktop), [iPad help](/docs/ipad) and the [Desktop release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.1).
