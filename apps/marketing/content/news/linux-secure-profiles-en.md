---
title: "Linux server profiles now store credentials securely"
description: "BloomMD uses the system Secret Service on Linux so server profiles can be reused safely after a restart."
date: 2026-09-05
commitDate: 2026-09-05
tags:
  - Linux
  - Security
  - Sync
  - Desktop
version: "0.5.3"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.3"
---

# Linux server profiles now store credentials securely

A server profile is only useful if it is still available the next time the app starts — without putting the personal access token in an ordinary settings file. BloomMD now supports the standard Secret Service on Linux.

## The profile stays, the token stays protected

Profile metadata is stored locally, while the token itself is kept in the system keyring. BloomMD can offer profiles again after a restart without writing secrets to JSON files, command-line arguments or logs.

If the Secret Service is missing or locked, the app shows concrete Linux-specific guidance. The implementation is not tied to GNOME Keyring; it uses the standard `org.freedesktop.secrets` interface.

**Release date:** September 5, 2026 · [View the release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.3)
