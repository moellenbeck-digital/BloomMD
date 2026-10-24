---
type: concept
id: collaboration
okf_version: '0.1'
updated: '2026-08-06'
sources:
  - id: architecture:collaboration
    contentHash: local-demo
---

# Collaboration with Yjs

Yjs is the client-side collaboration layer for shared editing. It provides conflict-free updates, awareness information and offline-friendly synchronization without making the shared document format proprietary.

## Responsibility split

- Yjs manages transient shared edits and presence.
- Markdown remains the durable export and interoperability format.
- Storage persists authenticated document snapshots and update streams.
- Sync transports updates; it does not decide document permissions.

The public Wiki is intentionally read-only. Collaborative workspaces need authentication, authorization, a persistence policy and a clear recovery path before they are exposed publicly.
