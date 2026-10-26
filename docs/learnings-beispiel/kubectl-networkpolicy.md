---
type: learning
title: "NetworkPolicy begrenzt den Egress des Pods, nicht kubectl"
area: "Learnings"
status: neu
scope: "BloomMD, coder"
source: "Aufbau Dev-Team, 2026-10-26"
stale_after: 2027-01-24
tags: ["bereich/learnings", "coder"]
---

# NetworkPolicy begrenzt den Egress des Pods, nicht kubectl

## Symptom

`kubectl logs`, `kubectl exec` und `kubectl cp` funktionieren, aber der Pod erreicht ein Ziel nicht (Timeout nach außen), sobald eine neue Verbindung nötig ist, z. B. zu einem weiteren Dienst.

## Ursache

`kubectl` läuft über den API-Server und wird von einer NetworkPolicy nicht berührt. Die Policy in `deploy/openclaw/kubernetes.yaml` erlaubt dem Pod nur DNS (Port 53 in `kube-system`) und ausgehend TCP 443 und sperrt alles andere, auch eingehend. Dass kubectl funktioniert, sagt also nichts über den Netzwerkzugang des Pods.

## Regel

- Braucht eine Änderung neue Verbindungen vom Pod (anderer Port, anderes Ziel), die NetworkPolicy in derselben Änderung erweitern, so eng wie möglich.
- Erreichbarkeit aus dem Pod prüfen (`kubectl exec … --` mit einem Verbindungstest), nicht aus dem Terminal.
- Die Policy nicht pauschal öffnen oder entfernen, um einen Timeout zu beheben.

## Beleg

- Aufbau des Dev-Teams, 2026-10-26 (Ticket-/Lauf-Link bei Bestätigung ergänzen)
- Policy: `deploy/openclaw/kubernetes.yaml` (`bloommd-openclaw-agent-egress`)

## Gilt für

- Brand: BloomMD
- Rolle: coder
- Komponente: Kubernetes, NetworkPolicy
