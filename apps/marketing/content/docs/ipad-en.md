---
title: BloomMD on iPad and iPhone
description: The BloomMD app for iPad and iPhone – edit your Obsidian vault in place, handwriting with Apple Pencil, optional sign-in, help and contact.
order: 7
draft: true
---

# BloomMD on iPad and iPhone

The app shows Markdown notes as a mind map: every heading is a node, and the file stays an ordinary
Markdown file. It runs on iPad, iPhone and Macs with Apple silicon and follows the device language
(German or English). It needs iOS or iPadOS 15 or later.

## Set up

1. Get BloomMD from the App Store and open it. You do not need an account, and the app also works
   without an internet connection.
2. Without a folder, your maps live in the app's own folder on the device (*On this device*).
   *New* creates a map, *Import* takes a Markdown or OPML file (up to 10 MB).
3. If you already have an Obsidian vault, open it as described below.

## Open a folder

Side menu → *Open folder* → pick the folder in the Files app, for example your Obsidian vault in
iCloud Drive. BloomMD edits the notes where they are: no import, no copy. The folder stays open
across restarts. Notes that iCloud has not downloaded to the device yet are fetched when needed.
*This device* switches back to the app's own folder.

Whether and where the folder is synced (iCloud Drive, Nextcloud, Syncthing …) is decided by the
storage provider, not by BloomMD.

## Only your changes are saved

Opening a note never rewrites it. If another device changed or deleted the note meanwhile, BloomMD
does not overwrite it: your version is saved next to it as "… (iPad-Konflikt).md", the version from
the other device is opened, and you get a notice.

## Map, outline, presentation

The canvas modes switch between mind map, outline and presentation. On iPad the node editor opens
as a side panel next to the map, on iPhone as a sheet at the bottom. Nodes can be tasks (status,
due date) or decisions.

## Write with Apple Pencil

Open the node editor of a node (in the outline, tap the row) and choose *Handwriting* → *New
drawing*. The pencil draws with pressure, a finger pans and zooms, and a resting palm does not
draw. Tools: Pen, Highlighter, Eraser, Lasso (move, scale, delete) and Text; handwritten words can
be linked to other notes.

Every drawing is an SVG file next to your notes and is embedded in the node. The BloomMD plugin for
Obsidian shows the same drawings and opens them for further drawing.

## Share and export

The share icon at the top opens the system share sheet: the map as Markdown, OPML, PDF, PNG or SVG
(for example "Save to Files"). Nothing is locked.

## Sign in with a BloomMD account (optional)

Local folders need no account. With a BloomMD account (beta) you edit maps from your cloud
workspaces together in real time.

1. Side menu → *Sign in*. BloomMD opens the sign-in page in the browser; you enter your password
   only there. You can also create an account on that page.
2. Check the prompt ("Connect the BloomMD app on …?") and confirm it. The app returns.
3. *Connect* opens the cloud maps. *Work locally* switches back to the files on the device.
4. *Sign out* revokes the access on the server and deletes it on the device. The access is kept in
   the device keychain and is valid for one year; you can also revoke it in your account under
   *Desktop and agent access*.

Self-hosted servers go under *Advanced: custom server* (`https://` only). *Manage or delete
account* opens the account page, where you can permanently delete the account with its cloud data.

## Links into the app

`bloommd://open?path=Folder/Note.md&node=<id>` opens a note of the open folder at a node – for
example from Shortcuts or other notes.

## Contact and help

Questions, bugs, trouble signing in: write to `feedback@bloommd.io` (please include your device, iOS
version and app version). Provider and privacy: [Legal notice](/impressum?lang=en),
[Privacy policy](/datenschutz?lang=en).
