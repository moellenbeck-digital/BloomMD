---
type: learning
title: "Bun-Version des Repos im Lockfile-Check der CI festhalten"
area: "Learnings"
status: neu
scope: "BloomMD, coder"
source: "BloomMD, Ticket #304, PR #306, 2026-11-06"
stale_after: 2027-02-28
tags: ["bereich/learnings", "coder"]
---

# Bun-Version des Repos im Lockfile-Check der CI festhalten

> **Beispiel (W0).** Aussage aus den Fakten von `gueltig.md` abgeleitet (Umstellung von BloomMD auf Bun 1.4.4, Ticket #304, PR #306). Fall: neu mit Quelle, wird im E2E-Lauf (Ticket #345) bestätigt.

## Symptom

Ein Lockfile, das mit einer neueren Bun-Version geschrieben wurde, lässt sich mit einer älteren nicht lesen (`UnknownLockfileVersion`).

## Ursache

Die CI nahm keine feste Bun-Version an, sondern die, die im Image zufällig vorhanden war.

## Regel

- Die Bun-Version des Repos (`packageManager`, `.bun-version`) in der CI festhalten, statt die Version des Images zu übernehmen.
- BloomMD läuft seit Ticket #304 (PR #306, 06.11.2026) auf Bun 1.4.4.

## Beleg

- PR #306 im Repo `moellenbeck-digital/BloomMD`: https://github.com/moellenbeck-digital/BloomMD/pull/306

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: CI, Bun-Lockfile
