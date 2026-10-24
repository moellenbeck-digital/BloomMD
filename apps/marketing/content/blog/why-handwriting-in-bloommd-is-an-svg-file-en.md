---
title: "Why handwriting in BloomMD is an SVG file"
description: "Handwriting without format lock-in: drawings are ordinary files in the vault, readable without the plugin and still editable without loss."
date: 2026-09-28
tags:
  - Obsidian
  - Handwriting
  - Markdown
  - Local-first
draft: true
---

# Why handwriting in BloomMD is an SVG file

BloomMD stores maps as Markdown so your notes stay yours. Handwriting keeps the same promise. Every
drawing is therefore its own **SVG file** in your vault's attachment folder, and the node embeds it
with an ordinary Obsidian line:

```markdown
![[Thermodynamics ink.svg]]
```

## Readable everywhere

SVG is an open image format. Obsidian shows the drawing in the note view, on your phone and in vaults
without BloomMD. Git, iCloud, Obsidian Sync or any other vault sync carry it like any other file.
Uninstalling the plugin does not cost you a single drawing.

## Still editable without loss

An image alone would be a dead end. BloomMD therefore also stores the raw data of every stroke –
points, pressure, tool, color – and the links to notes inside the SVG file. When you reopen the
drawing, everything is exactly as before: strokes can be erased, moved and scaled.

## Markdown stays lean

The note only contains the embed and, when you link handwriting, a `[[link]]`. No data block with
thousands of coordinates gets in the way when you read, search, or when an agent processes the note.

## Safe across devices

Moving between Mac and iPad means syncing at the same time sooner or later. BloomMD only overwrites a
drawing that is unchanged since it was opened. If another device saved a newer version in the
meantime, BloomMD says so instead of silently overwriting it.

More on how to use it is in the [Obsidian plugin help](/docs/obsidian?lang=en).
