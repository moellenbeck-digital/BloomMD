---
title: "Remote connections now reconnect in a controlled way"
description: "BloomMD distinguishes temporary network interruptions from permanent sync failures and makes reconnects predictable."
date: 2026-08-28
commitDate: 2026-08-28
tags:
  - Sync
  - Desktop
  - Collaboration
version: "0.2.12"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12"
---

# Remote connections now reconnect in a controlled way

A short network interruption should not pull BloomMD out of the user's workflow. The desktop client and SyncProvider now share one clearly defined reconnect flow.

## One flow instead of competing loops

Temporary interruptions use exponential backoff with a bounded number of attempts. Each new attempt can request a fresh sync ticket, so expired tickets are not reused indefinitely.

Permanent states such as revoked access, a missing document or a full room switch to a clear failure state. From there, the connection can be restarted manually.

The interface distinguishes offline, reconnecting and a permanently failed reconnect. Intentional disconnects and workspace changes do not trigger a late reconnect.

**Commit date:** August 28, 2026 · [View the release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12)
