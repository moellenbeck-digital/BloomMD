---
type: learning
title: "Bun-Lockfile nur mit der festgelegten Bun-Version erzeugen"
area: "Learnings"
status: neu
scope: "BloomMD, coder"
source: "Aufbau Dev-Team, 2026-10-26"
stale_after: 2027-01-24
tags: ["bereich/learnings", "coder"]
---

# Bun-Lockfile nur mit der festgelegten Bun-Version erzeugen

## Symptom

`bun install --frozen-lockfile` schlägt fehl (Auszug: „lockfile had changes, but lockfile is frozen“) oder ändert `bun.lock`, sobald eine andere Bun-Version als die festgelegte läuft.

## Ursache

Das Repo legt Bun 1.3.14 fest (`packageManager` in `package.json`, Dockerfile, CI). Eine andere Bun-Version schreibt bzw. liest das Lockfile anders; die eingefrorene Installation sieht dann „Änderungen“.

## Regel

- Vor jeder Installation `bun --version` mit `packageManager` in `package.json` abgleichen und im Arbeitsumfeld (Agenten-Image, Runner) dieselbe Version bereitstellen.
- `bun.lock` nur mit dieser Version erzeugen und committen; ein von anderer Version umgeschriebenes Lockfile nicht committen.
- Nicht auf `--frozen-lockfile` verzichten, um den Fehler zu umgehen: erst die Version angleichen.

## Beleg

- Aufbau des Dev-Teams, 2026-10-26 (Ticket-/Lauf-Link bei Bestätigung ergänzen)
- Festlegung der Version: `package.json` (`packageManager`), `Dockerfile`, `.github/workflows/ci.yml`

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: Bun-Workspace, Docker-Build, CI
