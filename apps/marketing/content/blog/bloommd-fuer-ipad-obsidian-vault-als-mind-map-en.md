---
title: "BloomMD for iPad: your Obsidian vault as a mind map with Apple Pencil"
description: "The BloomMD app opens your Obsidian vault in iCloud Drive, shows notes as a map and saves straight into the Markdown files – with handwriting that Obsidian sees too."
date: 2026-10-04
tags:
  - iPad
  - Obsidian
  - Handwriting
  - Local-first
draft: true
---

# BloomMD for iPad: your Obsidian vault as a mind map with Apple Pencil

Many Obsidian vaults live in iCloud Drive so that Mac, iPad and iPhone see the same notes. That is
exactly where the BloomMD app comes in: it doesn't work on a copy or in a format of its own – it edits
the Markdown files in your vault directly.

## Open the vault

In the side menu, tap **Open folder** and pick your vault's folder in the Files app, for example
*iCloud Drive › Obsidian › Obsidian Vault*. The app keeps access across restarts. **This device**
switches back to the app's own folder on the device.

The note list shows the vault's subfolders and gets a filter once the vault is large enough. Notes
that iCloud currently keeps only in the cloud are downloaded before you open them.

## Every heading is a node

BloomMD reads a note as it is: the headings form the map, the text below belongs to the node. You
move, add and rename nodes on the map – and afterwards the file contains ordinary headings again.
Obsidian on the Mac shows the same note unchanged as text.

![The BloomMD side menu with the open folder “Obsidian Vault” and notes from several subfolders](/blog/bloommd-ipad-vault-en.png)

![A note from the vault as a map on iPad](/blog/bloommd-ipad-map-en.png)

## Safe saving, even with several devices

When a vault is open on several devices, saving is a matter of trust. The app therefore follows three
rules:

- **Opening writes nothing.** Only real changes are saved; just viewing a note never changes the
  file.
- **No overwriting someone else's changes.** If Obsidian on the Mac changed the note while you were
  writing on the iPad, BloomMD keeps your version as a separate note, such as
  “Physik (iPad-Konflikt).md”, and opens the version from the other device. Both remain.
- **Save before going to the background.** When you switch apps, pending changes are written first.

## Handwriting that Obsidian sees too

In the node editor, **Handwriting** opens a canvas for Apple Pencil: formulas, arrows, sketches. It is
the same editor as in the Obsidian plugin, with lasso, highlighter and eraser. The drawing is saved
as `<note> ink.svg` in the attachment folder you configured in Obsidian and embedded in the node as
`![[…]]`.

Obsidian shows the SVG file everywhere, and the BloomMD plugin opens it for further drawing – on the
Mac as well as on iPad. Why we chose SVG is explained in
[Why handwriting in BloomMD is an SVG file](/en/blog/why-handwriting-in-bloommd-is-an-svg-file).

![The handwriting editor on iPad with a handwritten formula and a word linked to a note](/blog/bloommd-ipad-handwriting-en.png)

## From Obsidian straight to the node

The app understands links like `bloommd://open?path=School/Physics.md&node=…`. They open a note of the
opened folder right at the requested node. The Obsidian plugin will offer this jump as *Open app* once
the app is publicly distributed.

## On iPhone too

On iPhone the map is the same; the node editor opens as a sheet at the bottom. For longer writing with
a pencil the iPad is the better tool; for looking things up and adding to notes on the go, the iPhone
is enough.

## Status

The app is a beta, and the App Store release is being prepared. You don't need an account to work
with your vault; signing in with a BloomMD account for cloud workspaces is optional (beta).
