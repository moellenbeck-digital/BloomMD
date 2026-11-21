---
type: learning
title: "Eine Bun-Version reicht für alle Repos"
area: "Learnings"
status: ersetzt
replaced_by: gueltig.md
verified:
  - by: Brand-Chief bloommd
    at: 2026-10-28
scope: "bloommd-cluster, md-agents, coder"
source: "Beispielaussage zu bloommd-cluster, Commit 1da7950, 2026-10-26"
stale_after: 2027-02-28
tags: ["bereich/learnings", "coder"]
---

# Eine Bun-Version reicht für alle Repos

> **Beispiel (W0).** Die Aussage ist zur Veranschaulichung formuliert: Sie ist die Annahme, die das Learning [gueltig.md](./gueltig.md) widerlegt. Fall: korrigiert, `ersetzt` durch `gueltig.md`; die Datei bleibt als Verlauf erhalten.

## Symptom

Angenommen wurde, dass für alle Repos dieselbe Bun-Version genügt, hier Bun 1.3.14.

## Ursache

Die Annahme beruhte darauf, dass keine Repos mit unterschiedlichem Lockfile-Format im Spiel waren.

## Regel

Nicht mehr gültig. Die Nachfolgeregel steht in [gueltig.md](./gueltig.md): die Bun-Version je Repo festhalten.

## Beleg

- Widerspruch: Das Lockfile von `md-agents` scheiterte auf Bun 1.3.14 mit `UnknownLockfileVersion`; das dev-team-Image braucht Bun ab 1.4 (Commit `1da7950` im Repo `bloommd-cluster`, 2026-10-26). Eine Version für alle Repos genügt also nicht.
- Nachfolger: [gueltig.md](./gueltig.md)

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: dev-team-Image, Bun-Lockfile von `md-agents`
