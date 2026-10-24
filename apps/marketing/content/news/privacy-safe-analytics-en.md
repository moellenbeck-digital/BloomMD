---
title: "Anonymous product analytics stays cookieless"
description: "BloomMD measures public usage without sending Markdown content, names, email addresses or tokens."
date: 2026-08-23
commitDate: 2026-08-23
tags:
  - Privacy
  - Plausible
  - Marketing
version: "0.2.2"
---

# Anonymous product analytics stays cookieless

BloomMD uses Plausible for anonymous pageviews and selected product events on the marketing site. The integration loads the self-hosted Plausible instance directly and does not require cookies.

Only approved events such as demo, login or contact clicks are tracked. Markdown content, filenames, node titles, form contents and personal data stay out of event payloads.

This gives us a limited signal about public-site usage without undermining the local-first approach with content tracking.

**Commit date:** August 23, 2026
