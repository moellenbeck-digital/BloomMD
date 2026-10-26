# Learnings: Format, Bereiche und Lebenszyklus

Learnings halten fest, was das Team (Agenten und Menschen) bei der Arbeit gelernt hat: ein Fehlerbild, seine
Ursache und was künftig anders zu tun ist. Ohne feste Konvention werden sie nicht wiedergefunden und nicht
gepflegt. Dieses Dokument legt Format, Bereiche und Lebenszyklus fest.

## Grundsatz: Wissen, keine Regeln

- **Learnings sind Wissen, keine Regeln.** Ein Learning beschreibt, was beobachtet wurde und was sich bewährt hat.
- Agenten schreiben Learnings **direkt** in die Ablage, mit Protokoll (`bloommd_changes`) und Undo
  (`bloommd_undo`). Ein Review ist dafür nicht nötig.
- Änderungen am **Verhalten der Agenten** (Regeln, Rollen, Hooks, Arbeitsanweisungen) bleiben **Pull Request mit
  Review**. Sie werden nie nur als Learning abgelegt. Ein Learning darf auf einen solchen Pull Request
  hinweisen oder ihn auslösen, ersetzt ihn aber nicht.

## Bereiche

- Oberste Ebene (Bereich): `Learnings`. Alle Learning-Maps liegen in diesem Bereich (Ordner `Learnings/`).
- Je Rolle ein Tag: `architect`, `coder`, `tester`, `chief`. Ein Learning kann mehrere Rollen tragen.
- Der Bereich-Tag `bereich/learnings` entsteht automatisch beim Anlegen; die Rollen-Tags gibt der Aufruf mit
  (`tags`).

## Eine Map je Learning

Jedes Learning ist eine eigene Map aus der Vorlage `learning`. Der Titel nennt Symptom oder Regel in einem
kurzen Satz. Die Knoten:

| Knoten | Inhalt |
|---|---|
| Symptom | Was wurde beobachtet? Fehlermeldung nur als kurzer Auszug. |
| Ursache | Warum ist es passiert? |
| Regel | Was ist künftig zu tun? Eine konkrete Handlung, kein Gemeinplatz. |
| Beleg | Ticket, Pull Request oder CI-Lauf als Link. Auszug und Link, keine Rohlogs. |
| Gilt für | Brand, Rolle und Komponente, für die das Learning gilt. |
| Aufgaben | Optional. Nur füllen, wenn aus dem Learning Folgearbeit entsteht; sonst leer lassen. |

`bloommd_templates {id: learning}` liefert Vorlage und Hinweise für den Agenten.

## Frontmatter

Das Format entspricht dem Frontmatter einer Seite im Wiki-Bundle (OKF 0.2): Eine Learning-Map ist eine
gewöhnliche Wiki-Seite mit `type: learning` und lässt sich mit `bloommd-wiki lint` prüfen.

| Feld | Bedeutung |
|---|---|
| `type` | Immer `learning`. Die Vorlage setzt es. |
| `status` | `neu`, `bestätigt`, `veraltet` oder `ersetzt` (siehe Lebenszyklus). Neue Learnings starten mit `neu`. |
| `scope` | Wofür das Learning gilt, kurz, z. B. `BloomMD, coder`. Kommt aus dem Aufruf. |
| `source` | Woher es stammt (Ticket, PR, Lauf, Datum). Kommt aus dem Aufruf. |
| `verified` | Wer es bestätigt hat, als Liste aus `by` und `at` (wie überall im Wiki). Bei neuen Learnings leer oder nicht gesetzt. |
| `stale_after` | Datum (`YYYY-MM-DD`), ab dem das Learning erneut zu prüfen ist. Standard: Anlegetag plus 90 Tage; die Vorlage trägt das konkrete Datum ein. |
| `replaced_by` | Pfad des Nachfolgers, nur bei `ersetzt`. |

Beispiel:

```yaml
---
type: learning
title: "Bun-Lockfile nur mit der festgelegten Bun-Version erzeugen"
status: neu
scope: "BloomMD, coder"
source: "Aufbau Dev-Team, 2026-10-26"
stale_after: 2027-01-24
tags: ["bereich/learnings", "coder"]
---
```

### Verträglichkeit mit dem Wiki-Lint

`bloommd-wiki lint` (`lintWikiBundle`) kennt für Wiki-Seiten die Status `draft`, `stable` und `deprecated` und
meldet jeden anderen Wert als `invalid-status`. Für Seiten mit `type: learning` gelten stattdessen die
Learning-Status; alle anderen Seiten verhalten sich unverändert. Die Status werden auf den Wiki-Lebenszyklus
abgebildet:

| Learning-Status | Wiki-Lebenszyklus |
|---|---|
| `neu` | `draft` |
| `bestätigt` | `stable` |
| `veraltet` | `deprecated` |
| `ersetzt` | `deprecated` |

- Auf einer Learning-Seite sind nur diese vier Wörter gültig; `draft`, `stable` und `deprecated` meldet der Lint
  dort als `invalid-status`. Auf jeder anderen Seite meldet er `neu` & Co. als `invalid-status`.
- `stale_after` ist ein Datum. Ist es überschritten, meldet der Lint `expired-page`, auch bei Learnings.
- `verified` bleibt die Liste aus `by` und `at`.

## Lebenszyklus

```text
neu → bestätigt → veraltet → ersetzt
```

1. **neu:** frisch angelegt, ein Beleg.
2. **bestätigt:** ein zweiter, unabhängiger Beleg oder die Bestätigung durch einen Menschen. In `verified` einen
   Eintrag (`by`, `at`) ergänzen und `status` ändern.
3. **veraltet:** `stale_after` ist überschritten und das Learning wurde nicht erneut geprüft, oder es gilt nicht
   mehr. Stimmt es weiterhin, bleibt es `bestätigt`: `stale_after` um 90 Tage verlängern und `verified`
   ergänzen.
4. **ersetzt:** ein Nachfolger deckt es ab. `replaced_by` zeigt auf den Nachfolger; das alte Learning bleibt als
   Verlauf erhalten und wird nicht gelöscht.

Statuswechsel sind Änderungen wie jede andere: `bloommd_update_map` bzw. Bearbeitung der Datei, mit Protokoll
und Undo.

## Anlegen

1. **Suchen vor anlegen:** `bloommd_search` im Bereich `Learnings` nach Symptom und Stichworten. Gibt es das
   Learning, ergänzen (weiterer Beleg, erweitertes `Gilt für`, ggf. Status `bestätigt`), statt zu duplizieren.
2. Sonst `bloommd_create_map` mit der Vorlage:

   ```json
   {
     "area": "Learnings",
     "title": "Bun-Lockfile nur mit der festgelegten Bun-Version erzeugen",
     "template": "learning",
     "scope": "BloomMD, coder",
     "source": "Ticket #109",
     "tags": ["coder"],
     "nodes": [
       { "parent": "symptom", "title": "…", "content": "…" },
       { "parent": "regel", "title": "…", "content": "…" }
     ]
   }
   ```

   `type`, `status: neu` und `stale_after` (heute plus 90 Tage) setzt die Vorlage; `scope` und `source` kommen
   aus dem Aufruf.

## Verbote

- **Keine Secrets:** keine Tokens, Passwörter, Schlüssel und keine Zugangsdaten, auch nicht „zur Illustration“.
  Bei Fehlermeldungen mit Zugangsdaten diese vorher entfernen.
- **Keine Personendaten:** keine Namen, E-Mail-Adressen oder Chat-IDs von Personen.
- **Keine Rohlogs:** nur ein kurzer Auszug (die aussagekräftigen Zeilen) und der Link auf Ticket, PR oder
  CI-Lauf.

## Beispielbündel

[learnings-beispiel/index.md](learnings-beispiel/index.md) enthält drei Learnings aus dem Aufbau des Dev-Teams
am 26.10.2026 als lint-fähiges Wiki-Bundle (`bloommd-wiki lint docs/learnings-beispiel`).
