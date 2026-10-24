---
title: "Remote documents can now be deleted while open"
description: "BloomMD cleanly separates an active sync session before deleting a remote document."
date: 2026-09-07
commitDate: 2026-09-07
tags:
  - Sync
  - Collaboration
  - Web
  - Desktop
version: "0.4.3"
---

# Remote documents can now be deleted while open

An open remote document should not prevent it from being removed from the workspace. BloomMD now handles deletion as a controlled flow in both the web and desktop apps.

## End the session, delete the document, restore the connection

Before the server-side delete, an active sync room is disconnected cleanly. The server then deletes the document and the file list is refreshed. If deletion fails, BloomMD attempts to restore the previous connection and surfaces the specific error.

This keeps active Yjs sessions separate from server-side document operations without silently losing a delete attempt.

**Commit date:** September 7, 2026
