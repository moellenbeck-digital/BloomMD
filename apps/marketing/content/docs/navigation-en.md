---
title: Find nodes and understand loading notices
description: Navigation in Desktop 0.6.1, Mobile 1.1.0 and Obsidian 0.8.0, with verified steps and clear limits.
order: 8
---

# Find nodes and understand loading notices

This guide covers **Desktop 0.6.1**, the **Mobile 1.1.0 test build** and the **Obsidian 0.8.0 plugin**.

## Find your node again

1. Open **Find node** using the map's search icon.
2. Enter part of a node title or file path.
3. Select a result. The map expands its ancestors, selects it and brings it into view.
4. After panning away, **Show selected node** returns to your selection.

Large folder overviews start compact. Expand the folder you need or use search to jump to a file. Search covers loaded nodes; it is not a full-text search of every unread file.

![Mobile app in a browser touch test: Transfer is selected and centered, with search and locate controls above the map](/releases/mobile-1.1.0-node-search.png)

The screenshot shows the built Mobile app in an iPhone-size browser viewport, not a physical iPhone.

## Understand a loading problem

Desktop and Mobile show a compact notice. **Details** lists affected paths and the reason, such as invalid YAML headers or unavailable file access. YAML line and column numbers refer to the YAML block.

- Dismiss the notice with **×**; you can reopen it later.
- Correct the source file or file access, then choose **Retry**.
- A file skipped during loading has no node until it loads successfully.

In Obsidian, a failed content preview retains the file node. The notice explains the cause; dismiss it or retry the preview. Contents that have not been loaded are not searchable.

![Obsidian with mobile emulation: search finds Projekt and the result is selected and centered in the map](/releases/obsidian-0.8.0-node-search.png)

This screenshot comes from real Obsidian with mobile emulation. The 0.8.0 checklist was also confirmed on an 11-inch iPad Pro running Obsidian 1.15, including search, navigation and Pencil interaction.

## Available versions

- **Desktop:** [Download version 0.6.1](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.1). See [Desktop help](/docs/desktop?lang=en) for setup.
- **Obsidian:** [Plugin 0.8.0](https://github.com/moellenbeck-digital/bloommd-obsidian/releases/tag/0.8.0), requiring Obsidian 1.13 or later. For BRAT, use `moellenbeck-digital/bloommd-obsidian`. For manual installation, place `manifest.json`, `main.js`, `shared-runtime.js` and `styles.css` together in your vault's `.obsidian/plugins/bloommd/` directory, then reload or enable the plugin.
- **iOS:** 1.1.0 has been uploaded to App Store Connect. TestFlight distribution follows Apple's processing; this does not announce public App Store availability.
- **Android:** The signed 1.1.0 App Bundle (AAB) has been built. The Google Play upload is deferred; an AAB cannot be installed directly as an app.
