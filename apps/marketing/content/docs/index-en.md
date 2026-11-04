---
title: Getting started
description: What BloomMD is, what the closed beta includes, and where to begin.
order: 1
---

# Getting started

BloomMD turns Markdown files into a map and writes them back unchanged. There is no proprietary
file format, no export step, and no lock-in to this application.

## The important part first

Your file remains a normal Markdown file. Open it in Obsidian, commit it to git, or edit it in a
text editor at the same time. BloomMD only adds invisible HTML comments for stable node IDs; every
Markdown renderer ignores them.

## Where to begin

The closed beta starts with the **Desktop app**. It works locally, needs no account, and does not
need an internet connection. The **Web app** at `/app` is the second path. What stays local and what
goes to the cloud is explained in [Local or cloud](/docs/lokal-oder-cloud?lang=en).

### Getting started with the desktop app (macOS)

1. Download the macOS arm64 desktop build from [bloommd.io/download](/download?lang=en). (Omarchy/Linux:
   Pacman package, see [Desktop app](/docs/desktop?lang=en).)
2. Open the DMG file and drag BloomMD to the Applications folder.

   ![BloomMD 0.5.7 DMG window with the BloomMD app and the Applications shortcut](/releases/desktop-0.5.7-installer.png)

3. Double-click BloomMD in the Applications folder to start it.
4. Open a folder with Markdown files, or create a new one.
5. Select a file. Its headings become the map.

![Diagram, not a screenshot: the file list of the opened folder on the left, the map of the selected file with headings as nodes on the right](/docs/desktop-ordner-en.svg)

### Getting started with the Web app

1. Create an account, confirm your email address, and sign in. The steps are in
   [Closed beta access](/docs/closed-beta-zugang?lang=en).
2. In `/app`, choose the folder icon (tooltip **Open local Markdown folder**) at the top and grant access to a
   folder. Chrome and Edge support this; nothing is uploaded.
3. If the folder is read-only, a **Read only** notice appears. Click it to request write access.
4. Pick a file in the selector next to the folder name. Its headings become the map.

![Real screenshot of the Web app: the file Kapitel 1 from a local folder as a map with three child nodes](/docs/web-app-map-en.png)

Without an account, the [browser demo](/demo?lang=en) works right away. It loads a built-in template
and saves nothing.

![Real screenshot of the browser demo: a Markdown input on the left, the map of the Software Architecture Map template on the right](/docs/demo-en.png)

The Web app, cloud workspaces, sync, and collaboration require an account. You
register yourself, without an invitation and without a waitlist. Registration, email confirmation,
and sign-in are described in [Closed beta access](/docs/closed-beta-zugang?lang=en).

**Available without an invitation:** the [browser demo](/demo?lang=en), desktop
builds on the [download page](/download?lang=en), and the [Obsidian plugin](/obsidian?lang=en)
through BRAT or GitHub releases. Only while the access switch is on does an invitation apply, and then only to Web and cloud access.

## Not included in the beta

- The standalone BloomMD app for iPad, iPhone and Android has no public app-store
  download yet. The Obsidian plugin is separate and is also available as a mobile beta.
- There is no recovery promise for cloud data. Do not upload anything you do not have elsewhere.
- Windows desktop builds are not part of this closed beta.
