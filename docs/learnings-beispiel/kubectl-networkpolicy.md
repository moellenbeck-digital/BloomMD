---
type: learning
title: "Nach Umbau der Control-Plane die API-Egress-Ziele der NetworkPolicies prüfen"
area: "Learnings"
status: bestätigt
verified:
  - by: Brand-Chief bloommd
    at: 2026-10-28
scope: "bloommd-cluster, chief"
source: "bloommd-cluster, Commit d8de6f2, 2026-10-26"
stale_after: 2027-01-24
tags: ["bereich/learnings", "chief"]
---

# Nach Umbau der Control-Plane die API-Egress-Ziele der NetworkPolicies prüfen

> Vom Brand-Chief am 28.10.2026 gegen die Belege im Repo `bloommd-cluster` (Forgejo) geprüft und bestätigt. Die Fakten stammen aus den Vorfällen vom 26.10.2026.

## Symptom

Aus dem Brand-Chief-Pod scheiterte `kubectl`: 9 von 12 Aufrufen schlugen fehl.

## Ursache

Die NetworkPolicy `brand-chief-kubernetes-api-egress` erlaubte als Ziel nur `10.42.0.11/32:6443`. Die Aufrufe, die einen anderen Control-Plane-Knoten erreichten, wurden gesperrt.

## Regel

- Nach einem Umbau der Control-Plane die API-Egress-Ziele der NetworkPolicies prüfen: Sind alle Control-Plane-Knoten erlaubt?
- Behoben wurde es, indem die Policy alle drei Control-Plane-Knoten erlaubt (Commit `d8de6f2`). Gegenprobe: 12 von 12 Aufrufen gelingen.

## Beleg

- Commit `d8de6f2` im Repo `bloommd-cluster` (Forgejo), 2026-10-26
- Offen: Ticket- und CI-Link (nicht bekannt)

## Gilt für

- Brand: BloomMD
- Rolle: chief
- Komponente: NetworkPolicy `brand-chief-kubernetes-api-egress`, Kubernetes-API-Zugriff des Brand-Chief-Pods
