---
title: Software Architecture Map
id: template-software-architecture
created: "2026-07-21T00:00:00.000Z"
updated: "2026-07-21T00:00:00.000Z"
tags:
  - template
  - architecture
  - development
layout:
  direction: LR
---

# Software Architecture Map <!-- bloommd:id=software-architecture-root -->

A practical architecture map for a subscription SaaS product that needs to ship quickly without losing operational clarity.

## System Goals <!-- bloommd:id=software-architecture-goals -->

- Keep customer data portable and exportable.
- Support web, desktop and mobile clients from the same domain model.
- Make deploys boring: predictable migrations, rollback paths and observable failures.
- Keep the MVP small enough that a two-person team can maintain it.

## Architecture <!-- bloommd:id=software-architecture-architecture -->

The system is split into a public web app, an authenticated application shell, a sync service and shared domain packages. The critical boundary is between local-first document editing and optional cloud services.

### Frontend <!-- bloommd:id=software-architecture-frontend -->

- Next.js App Router for the public site, demo and account pages.
- Shared React components for canvas, editor and command palette.
- React Flow renders the map and keeps pan, zoom and drag interactions consistent.
- Client-side demo mode never uploads Markdown content.

### Backend <!-- bloommd:id=software-architecture-backend -->

- API routes handle auth, billing, templates and file operations.
- The sync service is separate so public browsing and local editing are not coupled to realtime infrastructure.
- Background work should be limited to email, billing webhooks and optional metadata enrichment.

### Database <!-- bloommd:id=software-architecture-database -->

- Postgres stores users, subscriptions, entitlements and auth tokens.
- Markdown documents stay in the user's workspace unless sync is explicitly enabled.
- Template content is static and versioned in Git.

### Integrations <!-- bloommd:id=software-architecture-integrations -->

- Stripe for checkout and billing portal.
- Resend for transactional email.
- Sentry for operational errors.
- Optional PostHog events without document content, filenames or node text.

### Security <!-- bloommd:id=software-architecture-security -->

- Signed HTTP-only session cookies.
- No Markdown content in analytics payloads.
- API keys required for external API access when configured.
- Sync tokens are separate from app sessions.

### Deployment <!-- bloommd:id=software-architecture-deployment -->

- Web app on Vercel or any Next.js host.
- Sync server on a separate Bun-capable host.
- Static templates are shipped with the app and cached aggressively.
- Source maps are blocked in production.

## Roadmap <!-- bloommd:id=software-architecture-roadmap -->

- Public demo without login.
- Template library and template landing pages.
- Obsidian companion plugin.
- Optional sync hardening and offline queueing.

## Open Questions <!-- bloommd:id=software-architecture-open-questions -->

- Should website metadata previews be user-triggered only?
- What is the long-term desktop update channel?
- Which sync features belong in the free tier?
