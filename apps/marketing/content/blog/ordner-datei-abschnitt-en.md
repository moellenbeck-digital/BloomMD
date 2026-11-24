---
title: "Folders, files or sections: where do I edit my content?"
description: "The folder overview in Desktop 0.6.0 makes the path from a file to the right heading explicit."
date: 2026-11-24
tags:
  - Desktop
  - Markdown
  - Release
---

# Folders, files or sections: where do I edit my content?

A folder contains files. A Markdown file contains headings and text. On a shared map these three things can look similar even though they serve different purposes. BloomMD Desktop 0.6.0 makes that distinction visible.

Folders have a dashed outline and a folder icon. Files have a blue border, a Markdown-file label and their relative path. Headings appear as compact content previews. Colors provide an additional cue; type labels and icons keep the distinction understandable without color.

![Native folder overview with folders, a Markdown file and the selected Ziele heading preview](/releases/desktop-0.6.0-overview.png)

Choose **Open** on a file to edit its whole map. To work on a particular piece of text, select its content preview and **Edit section**. BloomMD opens the source file and selects the matching section in the editor. The overview itself remains a navigation view.

The return path is explicit too: **Back to folder overview** saves changes and restores the previous selection and view. If saving fails, the file stays open and the error is shown. Work continues in the actual Markdown file without creating a second copy of its content.

This workflow belongs to [Desktop 0.6.0](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.6.0). The screenshot comes from the native macOS test build with neutral sample data. See the [desktop guide](/en/docs/desktop) for details.
