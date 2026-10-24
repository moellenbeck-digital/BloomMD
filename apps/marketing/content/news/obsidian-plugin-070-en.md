---
title: "BloomMD for Obsidian 0.7: now on iPad, iPhone and Android"
description: "Apple Pencil handwriting inside nodes, learning progress on the map and an agent panel – on desktop and mobile. The plugin stays MIT-licensed."
date: 2026-10-24
commitDate: 2026-10-24
tags:
  - Release
  - Obsidian
version: "0.7.0"
---

# BloomMD for Obsidian 0.7: now on iPad, iPhone and Android

Until now the BloomMD plugin only ran in Obsidian on the desktop. Version 0.7 also runs in Obsidian on iPad, iPhone and Android – the same vault, the same maps, the same Markdown files.

## Handwriting inside a node

The node inspector has a **Handwriting** tab. Write and sketch right inside the node with Apple Pencil, finger or mouse: pressure, highlighter, eraser, lasso and undo. A resting hand does not draw, fingers pan the canvas. Every drawing is an ordinary SVG file in the vault, embedded in the node as `![[… ink.svg]]` – Obsidian shows it everywhere, even without the plugin.

You can draw on the map itself, too: a stroke from node to node connects them, a line into free space adds a child node, scratching out erases.

## Learning on the map

In study mode you reveal nodes and rate how well you know them. The map shows your progress in colour, optionally with review intervals and a plan up to your exam date. Progress lives in the vault under `.bloommd/learning/`, never in the note itself, and can be adjusted or switched off in the settings.

## Agent panel

Agents such as OpenClaw that maintain notes through `bloommd-wiki agent mcp` now file their proposals in the new **BloomMD agent** panel. You see each change as an outline diff, approve or reject it, and can undo approved changes. You set the rights per folder yourself.

## Still MIT-licensed

The Obsidian plugin stays under the MIT license. The other parts of BloomMD use the Elastic License 2.0, see [License](/lizenz).

Get the update via **Settings → Community plugins → Check for updates**. The full list of changes is in the [plugin changelog](https://github.com/moellenbeck-digital/bloommd-obsidian/blob/main/CHANGELOG.md).
