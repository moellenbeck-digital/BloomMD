---
type: learning
title: "GHCR-Pull-Secret nie mit Platzhalter anlegen"
area: "Learnings"
status: neu
scope: "BloomMD, coder"
source: "Aufbau Dev-Team, 2026-10-26"
stale_after: 2027-01-24
tags: ["bereich/learnings", "coder"]
---

# GHCR-Pull-Secret nie mit Platzhalter anlegen

## Symptom

Der Pod startet nicht und bleibt in `ImagePullBackOff` (Auszug: „unauthorized“ beim Abruf von `ghcr.io/…`), obwohl das Pull-Secret im Cluster existiert.

## Ursache

Das Secret wurde mit einem Platzhalterwert statt eines echten Tokens angelegt. Ein Secret mit gültigem Namen und Aufbau, aber falschem Inhalt wird von Kubernetes akzeptiert und scheitert erst beim Image-Pull an GHCR.

## Regel

- Das Pull-Secret mit einem echten Token (nur Leserecht auf Pakete) aus dem Secret-Store anlegen, nie mit Platzhalter, und den Platzhalter nicht in Manifeste oder Git schreiben.
- Nach dem Anlegen prüfen, bevor der Rollout läuft: Pod-Events (`kubectl describe pod`) auf „unauthorized“ ansehen. Den Token nicht ausgeben und nicht in Logs oder Tickets kopieren.
- Bei „unauthorized“ zuerst den Secret-Inhalt ersetzen, nicht das Deployment ändern.

## Beleg

- Aufbau des Dev-Teams, 2026-10-26 (Ticket-/Lauf-Link bei Bestätigung ergänzen)
- Image-Quelle: `deploy/openclaw/kubernetes.yaml` (`ghcr.io/moellenbeck-digital/…`)

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: Kubernetes-Deployment, GHCR
