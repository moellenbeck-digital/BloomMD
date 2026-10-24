---
title: "BloomMD Desktop 0.5.13: Knoten zuverlässig speichern"
description: "Neue Dateien behalten ihre Änderungen. Die Ordnerübersicht zeigt identische Datei- und Überschriftentitel nur einmal."
date: 2026-10-12
commitDate: 2026-10-12
tags:
  - Release
  - Desktop
version: "0.5.13"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.13"
---

# BloomMD Desktop 0.5.13: Knoten zuverlässig speichern

Ordner öffnen, eine Datei anlegen, Knoten ergänzen und speichern: Dieser Ablauf konnte durch
verspätete Aktualisierungen der Ordneransicht oder des Dateiwächters unterbrochen werden.
Dabei konnten gerade eingegebene Knoten aus der Ansicht verschwinden. Desktop 0.5.13 behebt
beide Ursachen. Neue Dateien bleiben beim Bearbeiten aktiv; das Speichern schreibt ihre
Knoten in die Markdown-Datei.

Die Ordnerübersicht ist jetzt schreibgeschützt. Zum Bearbeiten wählst du eine Datei und
öffnest sie über **Ressource öffnen** oder den Datei-Browser. Werden während deiner Bearbeitung
auch außerhalb von BloomMD Änderungen gespeichert, bleiben deine ungespeicherten Änderungen
erhalten und BloomMD zeigt einen Konflikthinweis. Unveränderte Dateien lädt die App weiterhin
automatisch neu, wenn sie extern bearbeitet werden.

Auch die doppelte Anzeige identischer Titel ist korrigiert: Wenn Dateititel und eine einzelne
oberste Überschrift übereinstimmen, erscheinen sie in der Ordnerübersicht gemeinsam als ein
Dateiknoten. Im Beispiel steht „Digitaler Avatar“ einmal über „Rolle“, „Name“ und „Icon“.
Die Markdown-Datei selbst wird dadurch nicht verändert. Unterschiedliche Titel und mehrere
oberste Überschriften bleiben getrennt sichtbar.

![Native BloomMD-Ordneransicht mit einem Dateiknoten Digitaler Avatar und den drei direkten Unterknoten Rolle, Name und Icon](/releases/desktop-0.5.13-workspace.png)

Der Ablauf wurde automatisiert mit echten temporären Markdown-Dateien und zusätzlich in der
nativen macOS-App einschließlich Speichern, erneutem Öffnen und Neustart geprüft.

Aktualisiere über **Hilfe und Einstellungen → Über BloomMD → Nach Updates suchen** oder
installiere den aktuellen Build von der Download-Seite. Das Update stellt bereits verlorene,
nie gespeicherte Knoten nicht nachträglich wieder her.

[Download](/download) · [Desktop-Hilfe](/docs/desktop)
