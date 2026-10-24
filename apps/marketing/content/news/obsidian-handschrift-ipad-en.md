---
title: "Obsidian plugin 0.6.0: handwriting in nodes and an iPad beta"
description: "Write with Apple Pencil, mouse or finger right inside a node, link handwriting to notes – and use the plugin as a beta on iPad."
date: 2026-09-28
commitDate: 2026-09-28
tags:
  - Obsidian
  - Handwriting
  - iPad
version: "0.6.0"
sourceUrl: "https://github.com/moellenbeck-digital/bloommd-obsidian/releases/tag/0.6.0"
draft: true
---

# Obsidian plugin 0.6.0: handwriting in nodes and an iPad beta

A node's inspector has a new **Handwriting** area. Write or sketch there with Apple Pencil, mouse or
finger: formulas, arrows, sketches. The pen draws with pressure, fingers pan and zoom the canvas, and
a resting palm does not draw.

Every drawing is an ordinary SVG file in the vault, embedded into the node. Obsidian shows it
everywhere, and BloomMD reopens it losslessly for more drawing. The lasso moves, scales and deletes
parts of it.

Handwriting can link to notes. The word stays on the map, the explanation lives in the note – and
appears as a page preview when a mouse or Apple Pencil hovers over it.

On the map itself the pen does everything: a tap selects a node, hold and drag moves it, a line into
free space adds a new node, a zigzag scratches ink out. A resting hand moves nothing.

From this version the plugin runs as a **beta in Obsidian for iPad**. Shared mode stays on the desktop
for now. Details and limits are in the [Obsidian plugin help](/docs/obsidian?lang=en).

![Obsidian shows the page preview of the note "Graphentheorie" while the pointer rests on a word that is linked from handwriting in a BloomMD drawing](/blog/obsidian-ink-hover-preview.png)
