---
type: learning
title: "Zugangsdaten vor der Nutzung auf Länge und Gültigkeit prüfen, Platzhalter-Items kennzeichnen"
area: "Learnings"
status: neu
scope: "bloommd-cluster, coder"
source: "bloommd-cluster, Commit 9e71520, 2026-10-26"
stale_after: 2027-01-24
tags: ["bereich/learnings", "coder"]
---

# Zugangsdaten vor der Nutzung auf Länge und Gültigkeit prüfen, Platzhalter-Items kennzeichnen

> **Ungeprüftes Beispiel, noch nicht vom Brand-Chief bestätigt.** Die Fakten stammen aus dem Auftrag zu #109 (Vorfälle vom 26.10.2026); die Belege liegen im Repo `bloommd-cluster` (Forgejo).

## Symptom

Der Build-Lauf des dev-team-Images scheiterte.

## Ursache

Das Vault-Item „GHCR Pull - bloommd“ enthielt nur einen Platzhalter (11 Zeichen) statt eines echten Zugangs. Die Repo-Secrets `GHCR_*` kamen deshalb aus dem Item „GHCR Pull - wave-mesh“.

## Regel

- Zugangsdaten vor der Nutzung auf Länge und Gültigkeit prüfen, ohne den Wert auszugeben.
- Platzhalter-Items im Vault kennzeichnen, damit sie nicht für echte Zugangsdaten gehalten werden.
- Behoben wurde der Lauf im Workflow (Commit `9e71520`).

## Beleg

- Commit `9e71520` im Repo `bloommd-cluster` (Forgejo), 2026-10-26
- Offen: Ticket- und CI-Link (nicht bekannt)

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: Build-Workflow des dev-team-Images, GHCR-Zugang
