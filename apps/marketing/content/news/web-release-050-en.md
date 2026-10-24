---
title: "BloomMD web app 0.5: share maps with read-only links, tasks right on the node"
description: "Colleagues can view a map without an account. Nodes show due dates, owners and decisions."
date: 2026-10-19
commitDate: 2026-10-19
tags:
  - Release
  - Web app
version: "0.5.0"
---

# BloomMD web app 0.5: share maps with read-only links, tasks right on the node

A map is often the quickest way to explain where a team stands – but until now everyone needed a
BloomMD account to see it. From web app 0.5 you can create a **read-only link**:
anyone who has it can view the map without signing in, as a map or as an outline, read only.

Read-only links live behind the chain icon in a cloud map's toolbar. Choose how long a link is
valid (1, 7, 30 or 90 days), see every link of the map and revoke it – a revoked link stops
working immediately. A link shows only titles, visible text and task details; frontmatter,
comments and attachments stay private. Search engines do not index shared maps.

**Tasks and decisions on the node:** in the node editor a task now gets a due date and a
responsible person, a decision its state (proposed, accepted, rejected). The map and the
read-only link show this right on the node, so it is clear at a glance who does what by when.

![Shared BloomMD map in outline view with tasks, due dates, owners and decisions](/releases/web-0.5.0-share-outline.png)

Also in 0.5:

- Obsidian links `[[note]]` and embedded drawings stay intact when a node is opened in the
  editor. Previously, merely opening it could break them in the file.
- Security updates for several dependencies and stricter limits for access tokens.
- Groundwork for the upcoming BloomMD app on iPad, iPhone and Android and for AI agents that file
  notes with their own, limited permissions. We will introduce both separately once they are
  available.

[Open the app](https://bloommd.app) · [Help](/docs?lang=en)
