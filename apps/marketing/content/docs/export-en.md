---
title: Export and import
description: Every export is free – Markdown, OPML, PDF, PNG and SVG. Your files belong to you.
order: 9
draft: true
---

# Export and import

**Your files belong to you.** Every export is available to every user, without a subscription and
without a lock. The export menu is the same on every platform.

## The export menu

The export button in the toolbar (on phones the share button at the top right) or **Cmd/Ctrl+E** opens the menu:

| Entry | Result |
| --- | --- |
| **Markdown (.md)** | `<title>.md` – the file as it is |
| **OPML (.opml)** | `<title>.opml` – headings as nested outlines, notes in the `_note` attribute |
| **PDF (.pdf)** | the current map as one PDF page |
| **PNG (.png)** | the current map as an image |
| **SVG (.svg)** | the current map as a vector file: connections as paths, nodes as text |

PNG, SVG and PDF show the map without handles, action bars and selection. The workspace view (overview of many files) is not exported as a single file; open a file
for that.

## Where the file goes

- **Web app:** a normal browser download.
- **Desktop:** the Downloads folder; the file is revealed there. An existing file is never
  overwritten, you get `Name (1).ext` instead.
- **Mobile:** the device's share sheet, e.g. "Save to Files", AirDrop or Mail.
- **Obsidian plugin:** the export icon on the map; the file lands in the note's attachment folder.

## Saving images and diagrams

Images and Mermaid diagrams in a node can be enlarged: click the diagram, click a preview under "Images in this node", double-click an image in the editor, or press Enter or Space on a focused image to open the enlarged view (zoom with +/−, the mouse wheel or the buttons, 0 resets, drag or the arrow keys pan, Esc closes). The save actions are there:

| Action | Result |
| --- | --- |
| **Save image** | the original image, unchanged: the same bytes, file name and format (PNG, JPG, GIF, WebP, AVIF, BMP or SVG) |
| **Save diagram as SVG** | `<node title>-diagram.svg` – a vector file with a fixed size and white background, labels as text |
| **Save diagram as PNG** | `<node title>-diagram.png` – twice the diagram's size, at most 4096 pixels on the long side, white background |

The files land like the exports above: a browser download in the web app, the Downloads folder on desktop (existing files are never overwritten). In the Obsidian plugin Obsidian shows images and Mermaid blocks itself; its own tools apply for saving there. On mobile, saving from the enlarged view is not connected to the share sheet yet. Opening, zooming and saving never change the note.

## Relative image paths

`![](images/beach.png)` and `![[beach.png]]` (Obsidian) are resolved relative to the note, in the web app (local folder), on desktop and in the Obsidian plugin by the same rule: `./` and `../` are allowed, and so are spaces and umlauts (`<images/Beach day.png>` or `%20`). Paths that would leave the workspace are never read; a hint with the path appears instead of a broken image icon.

## Import OPML

If you are switching from MindNode, Xmind or another outliner, import the OPML file: choose
**Import** in the toolbar (web, desktop) or the file menu (mobile) and open an `.opml` file. It becomes a new map named
after the file. `text` becomes the heading, `_note` the content below it. In the Obsidian plugin the
command **Import OPML** creates a new note.

When importing:

- Markdown has no more than six levels; deeper outlines are kept as a bullet list in the sixth level.
- Empty or broken files, files without outlines and outlines without `text` are rejected with a
  clear message; nothing is created.
- A document type declaration (DOCTYPE) and external entities are never resolved.
