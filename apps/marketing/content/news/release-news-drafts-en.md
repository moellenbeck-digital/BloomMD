---
title: "Release news now start as reviewable drafts"
description: "Published BloomMD releases can now prepare bilingual news drafts for the marketing site without bypassing editorial review."
date: 2026-08-28
commitDate: 2026-08-28
tags:
  - News
  - Releases
  - Marketing
version: "0.2.12"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12"
---

# Release news now start as reviewable drafts

New BloomMD releases should be visible without publishing unchecked commit messages directly. The marketing site now supports an editorial workflow for release news.

## From GitHub to a draft

When a stable GitHub release is published, CI creates a German and English Markdown draft from it. The draft is placed in a pull request so it can be reviewed, shortened and expanded before it is merged.

The public news therefore remains file-based and traceable. Private issues, internal comments, credentials and other sensitive release content are filtered before the draft is created.

After editorial approval, the article appears under `/news`, is added to the sitemap and RSS feed, and gets its own detail page. Blog posts remain separate for longer editorial writing.

**Commit date:** August 28, 2026 · [View the release](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12)
