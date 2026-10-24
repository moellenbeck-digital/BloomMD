---
title: Obsidian plugin
description: Edit Markdown notes in Obsidian as a map, with handwriting in the node inspector – on the Mac and as a beta on iPad.
order: 5
draft: true
---

# Obsidian plugin

The BloomMD plugin shows an Obsidian note as a map. Every heading is a node, and the file stays an
ordinary Markdown file in your vault.

## Installation

- **Obsidian on Mac, Windows or Linux:** via BRAT with the repository
  `moellenbeck-digital/bloommd-obsidian`, or by copying `manifest.json`, `main.js`,
  `shared-runtime.js` and `styles.css` to `.obsidian/plugins/bloommd/`.
- **Obsidian on iPad (beta):** from version 0.6.0, also via BRAT. Mobile support is a beta; known
  limits are listed below.

Commands: **Visualize current note** opens the current note as a map, **Visualize current folder**
opens the folder.

## Open in BloomMD Desktop

**Open app** (arrow icon in the toolbar) opens the note in BloomMD Desktop, right at the selected
node; folded branches above it unfold. A running app switches to the note and comes to the front.
On macOS and Linux (installed package) the plugin starts BloomMD with the note when it is not
running yet. On Windows, start BloomMD Desktop first, then choose **Open app**. Only the file path
and node id are handed over, never note content. If the app cannot be found, a notice says so and
links to the download. On iPad and iPhone the button appears once *BloomMD app on this iPad* is
turned on in the plugin settings – the BloomMD app must have the same vault opened as its folder
(beta).

## Handwriting in a node

1. Select a node and open **Edit content**.
2. Switch the inspector to **Handwriting** and choose **New drawing**. A narrow inspector switches to
   full screen for drawing; the toggle at the top right works at any time.
3. Write or sketch:
   - **Apple Pencil** or mouse draw; pen pressure changes the stroke width.
   - **Fingers** move the canvas, two fingers zoom. A resting hand moves nothing, even when it lands
     a moment before the pen tip.
   - On devices without a pen, turn on **Draw with finger** (hand icon).
4. Tools: pen, highlighter, stroke eraser, lasso, five colors, three widths, undo/redo and
   **Fit drawing**.
5. **Done** saves and returns to the text. Drawings are also saved automatically.

The drawing is an SVG file in your vault's attachment folder, embedded into the node as
`![[Note ink.svg]]`. Obsidian therefore shows it everywhere – also without the plugin and on devices
where BloomMD is not installed.

### Changing it later

Circle handwriting with the **lasso**. The selection can be moved, scaled proportionally from its
corners, recolored or deleted.

### Linking handwriting to notes

The map shows how things connect; details stay in their own notes:

1. Select a word or symbol with the lasso.
2. Choose **Link to note** and pick a note from the vault.

The linked word is underlined with a dashed line. Hovering it in the preview with a mouse or Apple
Pencil (hover on supported iPads) shows Obsidian's page preview; a tap or click opens the note.
BloomMD also adds the link as `[[note]]` to the node so Obsidian's graph, backlinks and renames know
about it. If the note is renamed, the drawing follows.

## Concept map: nodes, notes and connections

The map shows how things connect; details live in their own notes.

- **Link a node to a note:** select a node → **Edit content** → **Link a note**. A note badge appears on the
  node; tapping it opens the note, hovering it with a mouse or Apple Pencil shows the page preview. BloomMD
  also adds `[[note]]` to the node.
- **Connect any two nodes:** in the inspector under **Connections**, pick another node, optionally add a
  label and add it. Connections are dashed and independent of the heading structure.
- **Move:** drag nodes with a mouse, finger or pencil. The position is kept, connections follow, and the
  note itself does not change.
- **Resize:** select a node and drag its corners; **Reset size** returns to the default size.

Linked notes and connections are stored in the node's Markdown and survive editing in the BloomMD apps.
The plugin keeps positions and sizes per note.

## Focus mode and presentation

- **Focus mode** (toolbar icon or the **Toggle focus mode** command) lays the map over the whole Obsidian
  window, also in split view on iPad. **Esc** or the icon leaves it.
- **Presentation mode** shows node content like Obsidian – drawings as images, links clickable.

## Writing directly on the map

**Draw on map** (signature icon in the toolbar) turns on draw mode: Apple Pencil or mouse write directly
on the map, fingers keep panning and zooming. Pen, highlighter, eraser, lasso and undo work as in a
node. A stroke that starts on one node and ends on another creates a **connection** between them. The
drawing is its own SVG file, linked from the note's `bloommd-map-ink` property. **Esc** or **Done**
leaves draw mode. While the pen writes, the map and its nodes stay still, even with a resting hand.

### Everything with the pen

In draw mode the whole map works with Apple Pencil (or the mouse):

| Gesture | Result |
|---|---|
| Tap a node | Select it |
| Double tap a node | Open its content (inspector) |
| Hold the pen on a node and lift | Node menu |
| Hold the pen on a node, then drag | Move the node |
| Line from node to node | Connection |
| Straight line from a node into free space | New child node where the line ends; type or Scribble its title right away |
| Zigzag over ink | Scratch the ink out |
| Lasso ink, then **New node from selection** | New node holding that handwriting, where it was |

## Handwriting to text and to nodes

- The **Text** tool places a text field on the drawing. On iPad, write into it with the Pencil and
  iPadOS Scribble turns it into text.
- Lasso handwriting and choose **New node from selection**: a child node with its own drawing is
  created; a text field in the selection becomes the node title.
- Drawings can use **paper, dark paper or a transparent** background.

## Node menu, study mode and export

- **Long press** (iPad) or **right click** a node for a menu with all actions.
- **Study mode** (hat icon): node contents are covered; tap to reveal them one by one.
- **Export** (image icon): the whole map as PNG or PDF in the attachment folder.

## Learning progress on the map

In study mode you rate every node you reveal: **New**, **Unsure** and **Got it** by default, or five
levels with your own names. Tap with Apple Pencil or a finger, click, or use the keyboard: **Space**
reveals the selected node, **1–5** rate it and move on to the next one.

- **On the map** each node shows its level as a colored border, a fill tint or a badge (or not at
  all). Due nodes carry a **Due** marker; optionally every branch shows how much of it you know.
- **The study bar** shows e.g. "12/30 mastered · 5 due", the order (due first, only due, only
  unsure), **Next**, and an optional exam date with the days left and how many nodes to cover per day.
- **Spaced repetition** (optional): every level has an interval in days (default New 0, Unsure 1,
  Got it 4). "Got it" several times in a row multiplies the interval by 2.5 each time
  (4 → 10 → 25 → 63 days, at most 180); a lower rating resets it.
- **Storage:** progress never goes into the note. It lives in the vault under `.bloommd/learning/`,
  so it travels with the vault (e.g. via iCloud) between Mac and iPad. Ratings belong to node IDs;
  renaming a node or the note loses nothing, and two devices do not overwrite each other. Obsidian
  Sync does not sync hidden folders.
- Configure everything under **Settings → BloomMD → Learning**, where you can also reset the progress
  of the open map.

## Limits

- **Shared mode** (collaboration) is desktop-only for now.
- **Apple Pencil Pro** gestures (squeeze, barrel roll) and double tap are not available to Obsidian
  plugins; switch tools in the toolbar.
- **Recognition of existing ink** is not included yet; for text, use text fields with Scribble.
- If you choose "Don't update" when Obsidian asks about links after a rename, the drawing points to
  the renamed note while the `[[…]]` in the node keeps the old name.
