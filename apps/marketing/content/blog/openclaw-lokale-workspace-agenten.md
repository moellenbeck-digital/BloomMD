---
title: "Lokale KI-Agenten, die im Workspace mitdenken"
description: "Wie OpenClaw-Agenten in BloomMD nur ausgewählte Knoten bearbeiten, Vorschläge machen und auf deine Freigabe warten."
date: 2026-09-10
tags:
  - OpenClaw
  - KI-Agenten
  - Markdown
  - Zusammenarbeit
---

# Lokale KI-Agenten, die im Workspace mitdenken

Ein Agent soll eine Recherche vorbereiten oder eine Gliederung erweitern. Aber er soll nicht still eine ganze Wissensbasis lesen, keine Datei direkt überschreiben und nicht im Hintergrund unklar weiterarbeiten. Genau an dieser Grenze setzt die OpenClaw-Integration in BloomMD an: Der Agent ist ein sichtbares Workspace-Mitglied, bekommt einen klaren Auftrag an einem ausgewählten Knoten und liefert einen prüfbaren Vorschlag zurück.

![Ein BloomMD-Knoten, ein lokaler Agent und eine menschliche Freigabe in einem klaren Ablauf](/blog/openclaw-workspace-agent-hero.svg)

*Nicht „Agent übernimmt alles“, sondern ein nachvollziehbarer Arbeitszyklus: Auftrag, Vorschlag, Entscheidung.*

## Ein Auftrag beginnt an einem Knoten

In vielen Wissensräumen ist der schwierige Teil nicht das Formulieren einer Frage. Es ist die Eingrenzung: Welcher Abschnitt ist gemeint? Welche Annahmen gehören dazu? Was darf verändert werden?

Darum startest du in BloomMD direkt an der Stelle, um die es geht. Du wählst einen Knoten aus und öffnest den Agenten-Tab in der rechten Seitenleiste. Dort bleiben Titel, Pfad und Inhalt des Knotens sichtbar, während du deinen Auftrag formulierst.

Ein guter Auftrag kann zum Beispiel lauten: „Erweitere diesen Knoten um drei prüfbare Fragen und recherchiere dafür belastbare Quellen.“ Der Agent erhält dabei nicht automatisch den gesamten Workspace. Er arbeitet nur mit diesem Knoten und seinem expliziten Auftrag.

## Der Agent läuft dort, wo du ihn betreibst

OpenClaw wird lokal auf deinem Rechner, in Docker oder in deiner Kubernetes-Umgebung betrieben. BloomMD öffnet keine Verbindung in dein Netzwerk. Stattdessen fragt der Agent selbst in einem ruhigen Intervall nach eigenen offenen Aufgaben.

Das ist aus zwei Gründen praktisch:

- Dein Modellzugang und das Agent-Token bleiben in deiner Umgebung.
- Es wird erst dann ein Modellturn ausgelöst, wenn tatsächlich ein Auftrag wartet.

Das Pairing verbindet beide Seiten mit einem einmaligen Code. Danach hat jeder Agent ein eigenes, widerrufbares Token. Eine ausgehende Echtzeitverbindung weckt ihn bei einem neuen Auftrag; nur bei gestörten Netzwerkbedingungen sichert ein seltener interner Fallback-Poll die Zustellung. Mehrere Agenten können nebeneinander arbeiten, ohne Aufgaben oder Zugriffsdaten zu teilen.

## Vorschlagen statt heimlich schreiben

Der wichtigste Teil ist nicht, dass ein Agent Text erzeugen kann. Entscheidend ist, was danach passiert. In BloomMD entsteht zuerst ein Vorschlag:

1. Der Agent bereitet eine Struktur oder Markdown-Änderung vor.
2. BloomMD zeigt sie am ursprünglichen Knoten an.
3. Du prüfst sie in der passenden Darstellung: als Baum bei strukturellen Änderungen oder als Markdown beim Text.
4. Erst mit **Übernehmen** wird die Änderung über BloomMD Sync in den Workspace geschrieben.

So bleibt sichtbar, was der Agent vorgeschlagen hat, was du akzeptiert oder abgelehnt hast und welcher Knoten betroffen war. Wenn sich die Quelle zwischenzeitlich verändert, bleibt der Vorschlag zur Prüfung erhalten, statt eine Änderung blind zu überschreiben.

![Die echte BloomMD-Vorschau zeigt den Ausgangsknoten und die vorgeschlagenen Kindknoten als Baum.](/docs/openclaw-agent-proposal.png)

## Ein Agent ist ein Mitglied mit Grenzen

Ein Workspace-Agent ist kein unsichtbares Administrator-Konto. Er hat eine eigene Identität, nur eigene Aufgaben und keinen direkten Schreibzugriff. Auch wenn er Kindknoten anlegt oder eine Struktur umformuliert, erscheint das zunächst als prüfbarer Vorschlag.

Diese Grenzen machen den Ablauf im Alltag angenehmer: Du kannst eine kleine Recherche delegieren, während du weiter an der Map arbeitest. Sobald der Vorschlag bereit ist, erscheint er direkt im Knoten-Kontext — nicht in einem losgelösten Chatfenster ohne Bezug zur Arbeit.

Die Status machen außerdem den nächsten Schritt klar: **wartet auf Agent**, **in Arbeit**, **Vorschlag bereit**, **übernommen**, **abgelehnt** oder **fehlgeschlagen**. Frühere Aufträge werden als Historie gehalten, aber nicht über die aktuelle Entscheidung gelegt.

## Mit einem klaren ersten Auftrag starten

Der beste Einstieg ist kein großer Umbau. Wähle einen kleinen, abgrenzbaren Knoten: eine offene Frage, einen Architekturabschnitt oder eine noch leere Projektphase. Formuliere, welches Ergebnis du erwartest und was der Agent nicht ändern soll.

Wenn du den Vorschlag übernimmst, wird die Erweiterung als normale Workspace-Änderung synchronisiert. Wenn sie nicht passt, lehnst du sie ab — ohne eine Datei reparieren oder einen Agenten erklären zu müssen.

> **Lokaler Agent, sichtbare Entscheidung:** Lies die [OpenClaw-Anleitung](/docs/openclaw-agent), teste den Ablauf in der [BloomMD-Demo](/demo) oder [lade BloomMD herunter](/download).
