---
title: "Plausible now sees the real visitor region"
description: "BloomMD loads Plausible directly and avoids proxy distortion in anonymous GeoIP reporting."
date: 2026-08-31
commitDate: 2026-08-31
tags:
  - Privacy
  - Plausible
  - Marketing
version: "0.4.1"
---

# Plausible now sees the real visitor region

Anonymous product analytics is only useful when the technical measurement data is not distorted by the site's own proxy. BloomMD now loads Plausible directly from its self-hosted instance.

## A direct path instead of an app rewrite

Scripts and events go directly to `plausible.moellenbeck-digital.io`. The former server-side Next.js rewrite through `bloommd.io` is gone. Plausible can therefore use the real visitor IP for GeoIP reporting instead of the marketing infrastructure's address.

The integration remains cookieless and still sends no Markdown content, filenames, node titles or access tokens. Only approved anonymous pageviews and product events are measured.

**Commit date:** August 31, 2026
