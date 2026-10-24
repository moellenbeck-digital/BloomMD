---
title: "BloomMD für iPad: dein Obsidian-Vault als Mind Map mit Apple Pencil"
description: "Die BloomMD-App öffnet deinen Obsidian-Vault in iCloud Drive, zeigt Notizen als Map und speichert direkt in die Markdown-Dateien – mit Handschrift, die auch Obsidian sieht."
date: 2026-10-04
tags:
  - iPad
  - Obsidian
  - Handschrift
  - Local-first
draft: true
---

# BloomMD für iPad: dein Obsidian-Vault als Mind Map mit Apple Pencil

Viele Obsidian-Vaults liegen in iCloud Drive, damit Mac, iPad und iPhone dieselben Notizen sehen.
Genau dort setzt die BloomMD-App an: Sie arbeitet nicht mit einer Kopie und nicht mit einem eigenen
Speicherformat, sondern bearbeitet die Markdown-Dateien in deinem Vault direkt.

## Den Vault öffnen

Im Seitenmenü tippst du auf **Ordner öffnen** und wählst in der Dateien-App den Ordner deines
Vaults, zum Beispiel *iCloud Drive › Obsidian › Obsidian Vault*. Die App merkt sich den Zugriff über
Neustarts hinweg. Mit **Nur hier** wechselst du zurück in den App-eigenen Ordner auf dem Gerät.

Die Notizliste zeigt die Unterordner des Vaults, ab einer gewissen Größe mit Filter. Notizen, die
iCloud gerade nur in der Cloud hält, werden geladen, bevor du sie öffnest.

![Das Seitenmenü der BloomMD-App mit dem geöffneten Ordner „Obsidian Vault“ und Notizen aus mehreren Unterordnern](/blog/bloommd-ipad-vault.png)

## Jede Überschrift ein Knoten

BloomMD liest eine Notiz so, wie sie ist: Die Überschriften bilden die Map, der Text darunter gehört
zum Knoten. Du verschiebst, ergänzt und benennst Knoten auf der Map – und in der Datei stehen danach
wieder ganz normale Überschriften. Obsidian auf dem Mac zeigt dieselbe Notiz unverändert als Text.

![Eine Notiz aus dem Vault als Map auf dem iPad](/blog/bloommd-ipad-map.png)

## Sicher speichern, auch mit mehreren Geräten

Wenn ein Vault auf mehreren Geräten offen ist, entscheidet das Speichern über Vertrauen. Die App
folgt deshalb drei Regeln:

- **Öffnen schreibt nichts.** Nur echte Änderungen werden gespeichert; eine Notiz nur anzusehen
  verändert die Datei nicht.
- **Kein Überschreiben fremder Änderungen.** Hat Obsidian auf dem Mac die Notiz geändert, während du
  auf dem iPad schreibst, sichert BloomMD deine Fassung als eigene Notiz, etwa
  „Physik (iPad-Konflikt).md“, und öffnet die Version vom anderen Gerät. Beide Stände bleiben
  erhalten.
- **Speichern vor dem Hintergrund.** Wechselst du die App, werden offene Änderungen vorher
  geschrieben.

## Handschrift, die Obsidian auch sieht

Im Knoten-Editor öffnet **Handschrift** eine Zeichenfläche für den Apple Pencil: Formeln, Pfeile,
Skizzen. Es ist derselbe Editor wie im Obsidian-Plugin, mit Lasso, Textmarker und Radierer. Die
Zeichnung wird als `<Notiz> ink.svg` im Anhangsordner gespeichert, den du in Obsidian eingestellt
hast, und als `![[…]]` im Knoten eingebettet.

Obsidian zeigt die SVG-Datei überall an, das BloomMD-Plugin öffnet sie zum Weiterzeichnen – auf dem
Mac genauso wie auf dem iPad. Warum wir dafür SVG gewählt haben, erklärt
[Warum Handschrift in BloomMD eine SVG-Datei ist](/blog/warum-handschrift-in-bloommd-eine-svg-datei-ist).

![Der Handschrift-Editor auf dem iPad mit einer handschriftlichen Formel und einem mit einer Notiz verknüpften Wort](/blog/bloommd-ipad-handwriting.png)

## Von Obsidian direkt zum Knoten

Die App versteht Links der Form `bloommd://open?path=Schule/Physik.md&node=…`. Sie öffnen eine Notiz
des geöffneten Ordners genau am gewünschten Knoten. Das Obsidian-Plugin wird einen solchen Sprung als
*Open app* anbieten, sobald die App öffentlich verteilt wird.

## Auch auf dem iPhone

Auf dem iPhone ist die Map dieselbe; der Knoten-Editor öffnet sich als Sheet am unteren Rand. Für
längeres Schreiben mit dem Stift ist das iPad das bessere Werkzeug, zum Nachschlagen und Ergänzen
unterwegs reicht das iPhone.

![BloomMD auf dem iPhone mit einer Map aus dem Vault](/blog/bloommd-iphone-map.png)

## Stand

Die App ist eine Beta, die Veröffentlichung im App Store wird vorbereitet. Ein Konto brauchst du für
die Arbeit mit deinem Vault nicht; die Anmeldung mit einem BloomMD-Konto für Cloud-Workspaces ist
optional (Beta).
