---
type: learning
title: "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer"
area: "Learnings"
status: bestätigt
verified:
  - by: Brand-Chief bloommd
    at: 2026-10-28
scope: "bloommd-cluster, md-agents, coder"
source: "bloommd-cluster, Commit 1da7950, 2026-10-26"
stale_after: 2027-02-28
tags: ["bereich/learnings", "coder"]
---

# Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer

> **Beispiel (W0).** Fakten und Bestätigung stammen unverändert aus `docs/learnings-beispiel/bun-lockfile-version.md`. Fall: gültig und bestätigt.

## Symptom

Das Lockfile von `md-agents` scheiterte auf Bun 1.3.14 mit `UnknownLockfileVersion`.

## Ursache

Das dev-team-Image braucht Bun ab 1.4; mit Bun 1.3.14 lässt sich das Lockfile von `md-agents` dort nicht lesen.

## Regel

- Die Bun-Version je Repo festhalten, statt eine Version für alle Repos anzunehmen.
- Behoben wurde es im dev-team-Image mit Bun 1.4.2 (Commit `1da7950`).
- BloomMD selbst läuft seit Ticket #304 (PR #306, 06.11.2026) auf Bun 1.4.4.

## Beleg

- Commit `1da7950` im Repo `bloommd-cluster` (Forgejo), 2026-10-26
- Offen: Ticket- und CI-Link (nicht bekannt)

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: dev-team-Image, Bun-Lockfile von `md-agents`

## Entscheidung

- Datum: 2026-10-28
- Entscheid: bestätigt
- Grund: Gegen die Belege im Repo `bloommd-cluster` (Forgejo) geprüft
- Quelle: Commit `1da7950`, Repo `bloommd-cluster` (Forgejo)
- Wer: Brand-Chief bloommd
