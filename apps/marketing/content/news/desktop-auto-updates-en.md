---
title: "macOS updates now come through BloomMD"
description: "The desktop app checks for stable updates and downloads them through the BloomMD update path."
date: 2026-08-23
commitDate: 2026-08-23
tags:
  - macOS
  - Updates
  - Desktop
version: "0.2.4"
---

# macOS updates now come through BloomMD

The macOS app can now check for stable updates and show the download in the About dialog. Installation still requires explicit confirmation.

The download path runs through BloomMD while CI builds, verifies and publishes the release artifacts. This lets the app point to new builds without exposing the GitHub release address in the interface.

For the closed beta, the trust chain remains separate: the build at that time was ad-hoc signed and not notarized yet.

**Commit date:** August 23, 2026
