---
title: "Find nodes and navigate large maps"
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

The image shows the built Mobile app in an iPhone-size browser touch test, not a physical iPhone. iOS 1.1.0 is distributed through TestFlight once Apple has processed the uploaded build. A signed Android 1.1.0 App Bundle (AAB) is available; the Google Play upload has been deferred. This does not announce App Store or Google Play production availability. The separate [Obsidian 0.8.0 plugin](https://github.com/moellenbeck-digital/bloommd-obsidian/releases/tag/0.8.0) brings search and centering to narrow panes. When a preview fails, its file node stays visible; a notice explains the cause and offers retry. Release verification includes automated checks and the confirmed checklist on an 11-inch iPad Pro running Obsidian 1.15.

See [navigation guide](/docs/navigation?lang=en), [Desktop help](/docs/desktop?lang=en) and the [Desktop release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.1).
