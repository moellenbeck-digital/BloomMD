---
title: BloomMD on Android
description: The BloomMD app for Android phones and tablets – edit your Obsidian vault in place, handwriting with a stylus, conflict protection.
order: 8
draft: true
---

# BloomMD on Android

The Android app is the same app as on iPad: mind maps from Markdown notes, the node editor and
handwriting. It is not in the Play Store yet and starts in a closed test.

## Open a vault

Side menu → *Open folder* → pick the vault in the Android folder picker, e.g. in internal storage,
on an SD card or in a synced folder. BloomMD asks for access to exactly this folder and keeps it
across restarts. Notes are read and written in place; `.obsidian` and `.trash` are skipped. *Only
here* switches back to the app's own storage (*On this device*).

## Only your changes are saved

Opening a note never rewrites it. If another device changed or deleted the note meanwhile, BloomMD
does not overwrite it: your version is saved next to it as "… (Android-Konflikt).md".

## Write with a stylus

Styluses such as the S Pen are recognized: draw with the pen, pan and zoom with your finger, and a
resting palm does not draw. Drawings are SVG files in the vault and also show up in the Obsidian
plugin.

## Links

`bloommd://open?path=Folder/Note.md&node=<id>` opens a note of the open folder at a node.
