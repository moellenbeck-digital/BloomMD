---
title: "Plausible now sees the real visitor region"
description: "BloomMD passes the real visitor region to Plausible for anonymous GeoIP reporting; as of November 5, 2026: forwarded through our own domain."
date: 2026-08-31
commitDate: 2026-08-31
tags:
  - Privacy
  - Plausible
  - Marketing
version: "0.4.1"
---

# Plausible now sees the real visitor region

Anonymous product analytics is only useful when the technical measurement data is not distorted by the site's own proxy. BloomMD therefore first loaded Plausible directly from its self-hosted instance.

## A direct path instead of an app rewrite

Scripts and events used to go directly to the Plausible instance. The former server-side Next.js rewrite through `bloommd.io` was gone. Plausible could therefore use the real visitor IP for GeoIP reporting instead of the marketing infrastructure's address.

## Update of November 5, 2026

Plausible now runs on a new instance at `plausible.ops.moellenbeck-digital.io`. The browser loads the script and sends events through our own domain again (`bloommd.io/_plausible/…`), and BloomMD forwards them to the instance on the server. The statement above that the rewrite is gone and that scripts and events go directly to the instance no longer applies.

So that GeoIP reporting stays accurate, the forwarding passes the visitor IP and the user agent on to Plausible. Cookies and all other headers stay with BloomMD. The Content-Security-Policy no longer allows a third-party host for this, only our own domain.

The integration remains cookieless and still sends no Markdown content, filenames, node titles or access tokens. Only approved anonymous pageviews and product events are measured.

**Commit date:** August 31, 2026
