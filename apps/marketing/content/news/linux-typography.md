---
title: "BloomMD bleibt unter Omarchy auch bei 160 Prozent gut lesbar"
description: "Die Linux-Desktop-App nutzt lokale Schriften und bessere Kontraste für Mindmap, Dateiliste und Editor."
date: 2026-09-07
commitDate: 2026-09-07
tags:
  - Linux
  - Omarchy
  - Accessibility
  - Desktop
version: "0.5.4"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.4"
---

# BloomMD bleibt unter Omarchy auch bei 160 Prozent gut lesbar

Native Linux-Apps müssen sich in die Darstellung des Systems einfügen. BloomMD verwendet unter Omarchy/Linux deshalb einen lokalen Font-Stack und verlässt sich auf das native WebKitGTK-Hinting statt auf eine zusätzliche WebView-Skalierung.

## Kleine Beschriftungen, klarere Mindmaps

Dateiliste, Toolbar, Mindmap-Knoten und Editor erhalten stabilere Schriftmetriken und bessere Kontraste für sekundäre Texte. Die native 160-%-Skalierung bleibt erhalten; BloomMD skaliert nicht ein zweites Mal per CSS nach.

Damit bleibt die Oberfläche bei hoher Display-Skalierung scharf und lesbar, ohne dass die Anordnung der Arbeitsfläche unnötig verändert wird.

**Release-Datum:** 7. September 2026 · [Release ansehen](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.4)
