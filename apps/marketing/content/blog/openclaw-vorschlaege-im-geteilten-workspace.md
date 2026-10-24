---
title: "OpenClaw im geteilten Workspace: Vorschläge dort prüfen, wo die Entscheidung fällt"
description: "Lokale Agenten ergänzen Shared Mode mit knotengebundenen Aufträgen, sichtbarem Status und menschlicher Freigabe statt direktem Schreiben."
date: 2026-09-22
tags:
  - OpenClaw
  - KI-Agenten
  - Shared Mode
  - Zusammenarbeit
  - Markdown
draft: false
---

# OpenClaw im geteilten Workspace: Vorschläge dort prüfen, wo die Entscheidung fällt

Ein geteilter Markdown-Workspace ist ein guter Ort für Zusammenarbeit — aber nicht für einen
Agenten, der unbemerkt alles verändern darf. Wenn ein Agent recherchiert oder einen Ast erweitert,
braucht die Aufgabe eine klare Grenze und das Ergebnis eine klare Entscheidung.

BloomMD verbindet beides mit lokalen OpenClaw-Agenten: Der Auftrag gehört zu einem ausgewählten
Knoten, der Agent arbeitet lokal und gibt eine Änderung nur als Vorschlag zurück. Die Entscheidung
bleibt im Workspace sichtbar bei den Menschen.

## Der Knoten ist der Kontext

Statt einen losgelösten Chat ohne Bezug zur Map zu öffnen, wählst du den relevanten Knoten und
wechselst in den Agenten-Tab der rechten Seitenleiste. Titel, Inhalt und Knotenpfad bleiben sichtbar.
So kann ein Auftrag präzise sein:

> „Erweitere diesen Knoten um drei prüfbare Fragen und recherchiere belastbare Quellen. Lege die
> Ergebnisse als Kindknoten an.“

Der Agent erhält diesen Auftrag und den expliziten Knoten-Kontext — nicht automatisch den gesamten
Workspace oder den lokalen Ordner.

![Echte BloomMD-Aufnahme: Ein Agentenauftrag ist an einen ausgewählten Knoten gebunden und kann in der Seitenleiste formuliert werden.](/docs/openclaw-agent-composer.png)

*Echte Produktaufnahme aus dem Agenten-E2E-Ablauf: Auftrag und Knoten-Kontext bleiben zusammen in
der Seitenleiste.*

## Ein lokaler Agent wird nicht zu einem stillen Editor

Nach dem Pairing hat der Agent eine eigene, widerrufbare Identität. Er holt nur ihm zugewiesene
Aufträge ab. Ein Modellturn startet erst, wenn wirklich ein Auftrag vorliegt — nicht während die Map
einfach geöffnet ist.

Der Ablauf bleibt für alle Beteiligten nachvollziehbar:

1. Ein Mitglied erteilt den Auftrag am Knoten.
2. Der lokale Agent bearbeitet nur diesen Auftrag.
3. BloomMD zeigt **wartet auf Agent**, **in Arbeit**, **Vorschlag bereit** oder einen Fehler an.
4. Das Team prüft den Vorschlag im Knoten-Kontext.
5. Erst **Übernehmen** schreibt die Änderung in das gemeinsame Dokument.

Damit kann ein Agent Kindknoten, Strukturänderungen oder Markdown-Inhalte vorschlagen, ohne selbst
einen endgültigen Stand festzulegen.

## Die Vorschau passt zur Art der Änderung

Eine Liste von Markdown-Zeilen hilft wenig, wenn die Frage lautet: „Welche Äste entstehen in meiner
Map?“ Deshalb zeigt BloomMD strukturelle Vorschläge als Baum. Bei Textänderungen bleibt die
Markdown-Ansicht die geeignete Prüfung. Der Unterschied ist nicht dekorativ — er beantwortet vor
dem Übernehmen die Frage, was genau passieren würde.

![Echte BloomMD-Aufnahme: Die Vorschau zeigt den Ausgangsknoten und vorgeschlagene Kindknoten als Baum.](/docs/openclaw-agent-proposal.png)

*Echte Produktaufnahme aus dem Agenten-E2E-Ablauf: Struktur kann vor der Freigabe als Baum geprüft
werden.*

## Shared Mode und Agenten ergänzen sich

Shared Mode legt fest, welche einzelne lokale Datei zu welchem Workspace gehört. Rollen legen fest,
wer lesen und schreiben darf. OpenClaw ergänzt eine dritte Grenze: Ein Agent kann etwas vorbereiten,
aber keine Entscheidung erzwingen.

Das passt für gemeinsame Recherchen, Review-Listen oder eine noch unklare Projektstruktur. Eine
Person kann eine Frage delegieren; andere sehen den Vorschlag am gleichen Knoten und können ihn
besprechen. Bei einer Ablehnung bleibt die Markdown-Datei unverändert.

## Mit einer kleinen Aufgabe anfangen

Der erste Auftrag sollte überschaubar sein: eine offene Frage, ein leeres Kapitel oder eine
Prüfliste. Beschreibe das gewünschte Ergebnis und explizit, was nicht geändert werden soll. So wird
der Vorschlag schneller zu einer hilfreichen Gesprächsgrundlage statt zu einem großen, schwer
prüfbaren Umbau.

> Einrichtung, Pairing, Docker/Kubernetes und Widerruf beschreibt die
> [OpenClaw-Agenten-Hilfe](/docs/openclaw-agent). Wie du die zugrundeliegende lokale Datei bewusst
> teilst, steht in der [Zusammenarbeits-Hilfe](/docs/collaboration).
