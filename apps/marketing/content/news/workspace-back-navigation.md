---
title: "Von der Datei zurück zur Workspace-Übersicht"
description: "BloomMD bewahrt beim Zurückwechseln Ordner, Remote-Kontext und Fokus."
date: 2026-08-30
commitDate: 2026-08-30
tags:
  - Workspace
  - Fokus
  - UX
version: "0.4.0"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.4.0"
---

# Von der Datei zurück zur Workspace-Übersicht

Eine Datei ist selten das Ende eines Arbeitswegs. Oft öffnest du zuerst einen Ordner, dann eine Markdown-Datei und möchtest anschließend wieder die Übersicht sehen, ohne deinen Kontext zu verlieren.

BloomMD behandelt diese beiden Ansichten jetzt als zusammengehörigen, aber klar getrennten Navigationsfluss. Ein sichtbarer Button führt zurück zur Workspace-Übersicht. Dabei bleibt der lokale Ordner oder der aktive Remote-Workspace erhalten.

Auch der Fokus bleibt nachvollziehbar: Nach der Rücknavigation steht wieder die Canvas im Mittelpunkt und die Dateiliste bleibt im richtigen Workspace-Kontext. Im Remote-Modus wird die einzelne Datei-Session sauber beendet, bevor die Übersicht geladen wird.

Für Tastatur-Workflows führt `Cmd/Ctrl + ←` zurück zur Workspace-Übersicht. Mit
`Cmd/Ctrl + →` öffnest du anschließend wieder die zuletzt geöffnete Datei.

**Commit-Datum:** 30. August 2026 · [Release ansehen](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.4.0)
