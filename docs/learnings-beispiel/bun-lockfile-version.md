---
type: learning
title: "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer"
area: "Learnings"
status: neu
scope: "bloommd-cluster, md-agents, coder"
source: "bloommd-cluster, Commit 1da7950, 2026-10-26"
stale_after: 2027-01-24
tags: ["bereich/learnings", "coder"]
---

# Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer

> **Ungeprüftes Beispiel, noch nicht vom Brand-Chief bestätigt.** Die Fakten stammen aus dem Auftrag zu #109 (Vorfälle vom 26.10.2026); die Belege liegen im Repo `bloommd-cluster` (Forgejo).

## Symptom

Das Lockfile von `md-agents` scheiterte auf Bun 1.3.14 mit `UnknownLockfileVersion`.

## Ursache

Das dev-team-Image braucht Bun ab 1.4; mit Bun 1.3.14 lässt sich das Lockfile von `md-agents` dort nicht lesen.

## Regel

- Die Bun-Version je Repo festhalten, statt eine Version für alle Repos anzunehmen.
- Behoben wurde es im dev-team-Image mit Bun 1.4.2 (Commit `1da7950`).
- BloomMD selbst bleibt auf Bun 1.3.14.

## Beleg

- Commit `1da7950` im Repo `bloommd-cluster` (Forgejo), 2026-10-26
- Offen: Ticket- und CI-Link (nicht bekannt)

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: dev-team-Image, Bun-Lockfile von `md-agents`
