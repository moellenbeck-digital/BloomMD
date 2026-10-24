---
title: Desktop app
description: The recommended closed-beta path — local and account-free on macOS and Omarchy/Linux.
order: 2
---

# Desktop app

The main beta path. It runs locally, without an account and without a network connection.

## Download

The tester download page is [bloommd.io/download](/download?lang=en). It shows the current desktop
builds for macOS arm64 and Omarchy/Linux x86_64 or aarch64, with platform status and installation
instructions.

The build is not publicly listed during the closed beta. If your account is enabled, the concrete
download link is provided through beta access. If a link is missing or expired, reply to the beta
invitation or contact `feedback@bloommd.io`.

## Working with nodes from 0.5.14

Clicking a node selects it without recentering the visible map. Arrow keys move between parents,
children and siblings; an offscreen target is brought into view. In an open Markdown file,
**double-click** the title or press **R** to rename a node, including resource nodes. **Enter**
confirms and **Escape** cancels the edit. **Tab** creates a child and shows its title field.

Use **Open resource** to open linked files. In the read-only workspace overview,
**Open source file** on a file node or heading takes you to the editable file. In the node editor,
**Cmd+I** and **Cmd+K** apply italics and open the link editor; on the map **Cmd+K** opens the
command palette. On Linux, use the corresponding **Ctrl** shortcuts.

## Editing and saving files from 0.5.13

The folder overview is read-only. Select a file node and **Open resource**, or open the file
in the file browser. Creating a mind map opens its editable file view directly. Add your nodes
and save with **Cmd+S** (macOS) or **Ctrl+S** (Linux).

Delayed folder and file updates no longer discard unsaved nodes. If an external application
changes the file while you edit it, BloomMD keeps your edits and shows a conflict message.
Compare both versions before saving or reloading.

When a file title matches a single top-level heading, the folder overview shows one file node
with its children. The Markdown file remains unchanged.

## Large local workspaces from 0.5.12

Folders containing at least 100 Markdown files open as a compact file/folder overview.
Expand file nodes to see their headings. Individual files remain fully usable. Cross-links
in the overview connect the visible ancestors of their endpoints.

“Arranging mind map …” indicates background layout. Changing folders discards outdated
results. If layout fails, use “Try again” to repeat the calculation. External edits,
including added and deleted `.markdown` files, refresh the view automatically.


## Installing the closed-beta build

The native client is available in the closed beta for **macOS and Omarchy/Linux**. The macOS build
targets arm64; Omarchy 4 and other Arch-based systems have Pacman packages for x86_64 and aarch64.
Windows follows as a separate beta release.

**Starting with version 0.5.7, the macOS arm64 release is Developer ID signed and notarized by Apple.**
Open the DMG, drag BloomMD to Applications, and double-click it there. This release does not require
a manual Gatekeeper exception. If macOS blocks launch, report the version and message to
`feedback@bloommd.io`.

![BloomMD 0.5.7 DMG window with the BloomMD app and the Applications shortcut](/releases/desktop-0.5.7-installer.png)

### Installing Omarchy/Linux

1. Download the `x86_64` or `aarch64` package from [bloommd.io/download](/download?lang=en).
2. Install it from your download directory:

```bash
sudo pacman -U ./bloommd-desktop-<version>-<arch>.pacman
```

3. Start BloomMD:

```bash
bloommd-desktop
```

The package also registers the `bloommd://` URI scheme, so files and folders can be handed to
BloomMD directly.

## Opening files and folders

Open a single Markdown file or a complete folder from the menu, the file manager, or the command
line:

```bash
bloommd ./notes        # folder as workspace
bloommd note.md        # single file
```

## Connecting to the Web app

Local work needs no account. To collaborate with someone in a cloud file, create a personal token
under [Account](/account?lang=en), open **Connect to server** in the desktop app, enter
`https://bloommd.app`, paste the token, and open the same cloud file.

Windows is intentionally outside this closed beta. A separate release follows after installer, OS
handoff, keyboard, and platform testing.
