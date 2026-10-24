---
title: "Concept maps with Apple Pencil in Obsidian"
description: "Why a good concept map stays short – and how linked handwriting in BloomMD brings formulas, arrows and Obsidian notes together."
date: 2026-09-28
tags:
  - Obsidian
  - Handwriting
  - Learning
  - iPad
draft: true
---

# Concept maps with Apple Pencil in Obsidian

Learning is about connections. A formula, an arrow, a word next to it – on paper that is quick. On a
screen it often turns into either a long note or a sketch that is cut off from what you actually know.

BloomMD brings both together: handwriting shows the connection, the details stay in Obsidian notes.

## An example from thermodynamics

You write the first law of thermodynamics by hand in the node "Thermodynamics":

`ΔU = Q + W`

To explain the variables, you draw a line to **W** and write "work" next to it. You do not squeeze the
definition of physical work into the map. Instead you circle "work" with the lasso and link it to your
existing note **Work**.

- **The map stays short.** It only shows how the quantities relate.
- **The detail is one glance away.** Hover "work" with a mouse or Apple Pencil and Obsidian shows the
  note's page preview. A tap opens it.
- **Obsidian knows the connection.** BloomMD also writes the link as `[[Work]]` into the node, so it
  appears in the graph and backlinks and survives renames.

![A BloomMD drawing in Obsidian: hovering a linked word shows the note's page preview](/blog/obsidian-ink-hover-preview.png)

## Rearranging later

Concept maps grow. With the lasso you move a thought to where it fits better and shrink large writing
from the corners of the selection to make room. The highlighter marks what matters, the eraser removes
whole strokes.

## The pen writes, fingers move

On iPad BloomMD works like Freeform: Apple Pencil draws with pressure, fingers pan and zoom the canvas,
and a resting palm does not draw. A narrow inspector switches to full screen for writing.

The handwriting lives right in the node of the map – where the topic already is.

![The BloomMD map in Obsidian: the root node previews its embedded drawing](/blog/obsidian-ink-map-node.png)

Support for Obsidian on iPad is a beta. How to get started and which limits apply is described in the
[Obsidian plugin help](/docs/obsidian?lang=en).
