---
title: "BloomMD stays readable at 160 percent on Omarchy"
description: "The Linux desktop app uses local fonts and stronger contrast for mind maps, file lists and the editor."
date: 2026-09-07
commitDate: 2026-09-07
tags:
  - Linux
  - Omarchy
  - Accessibility
  - Desktop
version: "0.5.4"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.4"
---

# BloomMD stays readable at 160 percent on Omarchy

Native Linux apps need to fit the system's rendering model. On Omarchy/Linux, BloomMD now uses a local font stack and native WebKitGTK hinting instead of adding a second WebView scaling layer.

## Clearer small labels and mind maps

The file list, toolbar, mind map nodes and editor use more stable font metrics and stronger contrast for secondary text. Native 160-percent display scaling remains in control; BloomMD does not scale the interface a second time with CSS.

The result is a sharper, more readable interface at high display scaling without unnecessarily changing the workspace layout.

**Release date:** September 7, 2026 · [View the release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.4)
