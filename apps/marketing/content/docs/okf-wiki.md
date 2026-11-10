---
title: OKF und LLM-Wiki
description: Wissensseiten mit nachprüfbarer Herkunft — Wiki-Ansicht, Bundle anlegen und prüfen, Vorschläge und Grenzen.
order: 5
---

# OKF und LLM-Wiki

Ein Wiki Bundle ist ein Ordner mit Markdown-Dateien im **Open Knowledge Format** (OKF v0.2). Kein
Datenbankformat, kein Export — dieselben Dateien lassen sich in Obsidian öffnen und nach git
committen. Alles läuft lokal, ohne Modell und ohne Netzwerk.

## Wozu das gut ist

Von einer KI geschriebene Dokumentation liest sich autoritativ und lässt sich meist nicht
überprüfen. OKF hängt an jede Seite, woher sie stammt:

- **Vertrauensstufe:** von einem Menschen geprüft, KI-generiert und ungeprüft, oder ohne Angabe.
- **Quellen** mit Inhalts-Hash. Ändert sich die Quelle, wird die Seite als *Quelle hat sich
  geändert* markiert — genau der Moment, in dem eine Aussage ihre Grundlage verliert.
- **Lebenszyklus:** Entwurf, stabil, veraltet, samt Ablaufdatum.

## Die Wiki-Ansicht im Überblick

![Echter Screenshot der Wiki-Ansicht mit dem Beispiel-Bundle: Kopfzeile mit Seiten, Quellen, geprüft, ungeprüft und Problemen, links die Seitenliste mit Suche, rechts die Seite KI-generiert, ungeprüft mit der Plakette generated](/docs/okf-wiki.png)

- **Kopfzeile:** Zahl der Seiten und Quellen, dazu *geprüft*, *ungeprüft*, *veraltet* und die Zahl
  der Probleme. Steht dort *Herkunft nicht geprüft*, hat die Ansicht keine Quell-Hashes zum
  Vergleich; dann wird nur angezeigt, was in den Seiten steht.
- **Drei Ansichten:** *Seiten* (Liste und Seitentext), *Knowledge Map* (Seiten als Knoten, Verweise
  als Kanten) und *Log* (Protokoll des Bundles).
- **Suche und Filter:** Die Suche läuft über Titel, Pfad, Tag, Status und Inhalt. **Nur Seiten mit
  Problemen** zeigt Seiten ohne Quelle, mit veränderter Quelle, mit Befunden oder mit fehlenden
  Medien; Tags filtern zusätzlich.
- **Je Seite:** Pfad, Vertrauensstufe als Plakette (*verified*, *generated*, *unattributed*), Status,
  Tags und die Zitate. Eine Quelle ohne Hash trägt den Hinweis *ohne Hash — Drift nicht feststellbar*.

Die Wiki-Ansicht unter `/wiki` ist standardmäßig **aus**. Sie läuft nur, wenn der Betreiber sie
einschaltet und ein Bundle bereitstellt; sonst steht dort „Wiki ist hier nicht aktiviert“.

## Ein Bundle anlegen und prüfen

Mit dem optionalen Kommandozeilen-Werkzeug `bloommd-wiki` (Download und Prüfsumme:
[Kommandozeilen-Tools](/docs/command-line-tools)):

1. Bundle anlegen: `bloommd-wiki init ./wiki "Projektwissen"`.
2. Seiten als Markdown-Dateien im Ordner ablegen und oben im Frontmatter Quellen und
   Vertrauensangaben eintragen (Beispiel unten).
3. Zustand prüfen: `bloommd-wiki status ./wiki` zeigt Seiten, Quellen, die Zahl der geprüften,
   ungeprüften und quellenlosen Seiten, veraltete Quellen und abgelaufene Seiten.
4. Befunde im Einzelnen: `bloommd-wiki lint ./wiki`. Der Befehl endet mit Exit-Code 1, sobald es
   Befunde gibt — brauchbar für eine CI-Prüfung.
5. Quell-Hashes vergleichen: `status` und `lint` nehmen eine Datei `source-hashes.json` oder mit
   `--sources <ordner>` einen Ordner mit den Quelldateien. Ohne beides bleibt der Vergleich aus.

So sieht der Kopf einer geprüften Seite aus:

```yaml
---
type: concept
title: "Von Menschen geprüft"
status: stable
tags: [beispiel]
sources:
  - id: quelle-1
    resource: "https://example.com/spezifikation"
    contentHash: "sha256:aaaa1111"
    title: "Die Spezifikation"
    retrievedAt: "2026-08-01"
verified:
  - by: "max"
    at: "2026-08-02T10:00:00Z"
---
```

Eine Seite mit dem Eintrag `generated` (wer, wann) gilt als KI-generiert und ungeprüft; eine Seite
ohne Quelle gilt als ohne Angabe und taucht im Filter **Nur Seiten mit Problemen** auf. Das Beispiel
oben ist ein Teil des Test-Bundles im Repository (`test-wiki/`), aus dem auch das Bild stammt.

## Vorschauen sind freiwillig

Eine Wiki-Seite lädt **keine** externen Bilder von selbst. Eine Vorschau braucht einen Klick, und
die Schaltfläche nennt vorher den Server, der kontaktiert wird. Vorher verlässt keine Anfrage die
Seite — sonst würde allein das Lesen einer Seite verraten, wer gerade was liest.

Defekte Verweise und fehlende Dateien bleiben sichtbar. Ein Wiki, dessen tote Verweise unsichtbar
sind, wirkt gesünder als es ist.

## KI-Vorschläge

Ein Agent kann Seiten **vorschlagen**, nicht schreiben. Jeder Vorschlag braucht eine ausdrückliche
Freigabe, und beim Anwenden werden die Inhalts-Hashes erneut geprüft: Hat sich die Seite seit dem
Vorschlag geändert, wird er abgelehnt statt fremde Arbeit zu überschreiben. Vorschläge ohne
Quellenangabe werden verworfen.

Das gilt unabhängig vom Anbieter — OpenAI, Anthropic, lokale Modelle oder MCP-Clients laufen alle
durch dieselbe Prüfung. Den Ablauf `propose → approve → apply` und die Einrichtung eines Agenten
beschreibt [Notizen vom Agenten ablegen lassen](/docs/agent-wissen).

## Was OKF nicht leistet

- **Es prüft keine Wahrheit.** OKF zeigt, woher eine Seite stammt und ob sich ihre Quelle geändert
  hat. Ob die Aussage stimmt, entscheidet weiterhin ein Mensch.
- **Es hat kein eingebautes Modell.** Die Werkzeuge lesen, prüfen und berichten; Seiten schreibt ein
  Mensch oder ein Agent, den du selbst anbindest — und der nur vorschlagen darf.
- **Es gibt keine gehosteten autonomen Agenten.** Ein Vorschlag wird nie ohne namentliche Freigabe
  angewendet.
- **Hash-Vergleich nur mit Gegenstück.** Ohne Hash-Datei oder Quellordner meldet die Ansicht *Herkunft
  nicht geprüft*; Quellen aus `http`/`https` überwacht `status` nicht selbst.
- **Die öffentliche Wiki-Ansicht ist nicht überall an.** Sie braucht die Freischaltung durch den
  Betreiber (siehe oben).
