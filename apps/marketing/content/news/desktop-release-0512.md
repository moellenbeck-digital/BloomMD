---
title: "BloomMD Desktop 0.5.12: große Ordner flüssiger öffnen"
description: "Eine kompakte Übersicht, Layout im Hintergrund und zuverlässige Aktualisierung lokaler Markdown-Dateien."
date: 2026-10-08
commitDate: 2026-10-08
tags:
  - Release
  - Desktop
version: "0.5.12"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.12"
---

# BloomMD Desktop 0.5.12: große Ordner flüssiger öffnen

Große lokale Workspaces öffnen sich ab 100 Dateien zunächst als Übersicht aus Ordnern und Dateien.
Klappe eine Datei auf, um ihre Überschriften zu sehen. Die Markdown-Inhalte bleiben vollständig
vorhanden; Querverweise bleiben auch in der kompakten Ansicht sichtbar.

Die Anordnung entsteht im Hintergrund. Währenddessen zeigt BloomMD einen Status an. Beim
Ordnerwechsel verwirft die App veraltete Berechnungen. Beim Verschieben und Zoomen rendert die
Ansicht nur die sichtbaren Knoten. Unveränderte Parsergebnisse und Workspace-Beiträge werden
wiederverwendet, wenn sich Dateien ändern.

![BloomMD Desktop 0.5.12 mit einem synthetischen Testworkspace, Dateiknoten und aufklappbaren Überschriften](/releases/desktop-0.5.12-workspace.png)

Auch externe Änderungen, neue Dateien und Löschungen einschließlich `.markdown` werden erfasst.
Die Pfeilnavigation öffnet eingeklappte Eltern, bevor sie das nächste Kind auswählt.

Der macOS-arm64-Release ist mit Developer ID signiert und von Apple notarisiert. In der App
unter **Hilfe und Einstellungen → Über BloomMD → Nach Updates suchen** aktualisieren oder
über die Download-Seite installieren. Der Release enthält einen Delta-Patch von 0.5.11.

[Download](/download) · [Desktop-Hilfe](/docs/desktop)
