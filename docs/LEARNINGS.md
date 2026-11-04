# Learnings: Format, Bereiche und Lebenszyklus

Learnings halten fest, was das Team (Agenten und Menschen) bei der Arbeit gelernt hat: ein Fehlerbild, seine
Ursache und was künftig anders zu tun ist. Ohne feste Konvention werden sie nicht wiedergefunden und nicht
gepflegt. Dieses Dokument legt Format, Bereiche und Lebenszyklus fest. Wo die Learnings im Cluster liegen
(Vault, Rechte, MCP, Export), steht in [LEARNINGS-ABLAGE.md](LEARNINGS-ABLAGE.md).

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
| `status` | `neu`, `bestätigt`, `veraltet`, `ersetzt`, `unbestätigt` oder `verworfen` (siehe Lebenszyklus). Neue Learnings mit Vorfall und Quelle starten mit `neu`. |
| `scope` | Wofür das Learning gilt, kurz, z. B. `BloomMD, coder`. Kommt aus dem Aufruf. |
| `source` | Woher es stammt (Ticket, PR, Lauf, Datum). Kommt aus dem Aufruf. |
| `verified` | Wer es bestätigt hat, als Liste aus `by` und `at` (wie überall im Wiki). Bei neuen Learnings leer oder nicht gesetzt. |
| `stale_after` | Datum (`YYYY-MM-DD`), ab dem das Learning erneut zu prüfen ist. Standard: Anlegetag plus 90 Tage; die Vorlage trägt das konkrete Datum ein. |
| `replaced_by` | Pfad des Nachfolgers, nur bei `ersetzt`. |

Beispiel:

```yaml
---
type: learning
title: "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer"
status: neu
scope: "bloommd-cluster, md-agents, coder"
source: "bloommd-cluster, Commit 1da7950, 2026-10-26"
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
| `unbestätigt` | `draft` |
| `verworfen` | `deprecated` |

- Auf einer Learning-Seite sind nur diese sechs Wörter gültig; `draft`, `stable` und `deprecated` meldet der Lint
  dort als `invalid-status`. Auf jeder anderen Seite meldet er `neu` & Co. als `invalid-status`.
- `stale_after` ist ein Datum. Ist es überschritten, meldet der Lint `expired-page`, auch bei Learnings.
- `verified` bleibt die Liste aus `by` und `at`.

## Lebenszyklus

```text
neu → bestätigt → veraltet → ersetzt
```

1. **neu:** frisch angelegt; Vorfall und Quelle (Ticket, PR, Lauf) liegen vor.
   **unbestätigt:** abgeleitete Aussage ohne Beleg. `Beleg` nennt, was fehlt. Kein Ruhestand: Die Standardsuche
   liefert die Map weiter und nennt den Status im Treffer; der Lint meldet ihn als gültig (`draft`). Sobald ein
   Beleg vorliegt, wird sie `neu` (ein Beleg) oder `bestätigt`.
2. **bestätigt:** ein zweiter, unabhängiger Beleg oder die Bestätigung durch einen Menschen bzw. den Chief. In `verified` einen
   Eintrag (`by`, `at`) ergänzen und `status` ändern.
3. **veraltet:** `stale_after` ist überschritten und das Learning wurde nicht erneut geprüft, oder es gilt nicht
   mehr. Stimmt es weiterhin, bleibt es `bestätigt`: `stale_after` um 90 Tage verlängern und `verified`
   ergänzen.
4. **ersetzt:** ein Nachfolger deckt es ab. `replaced_by` zeigt auf den Nachfolger; das alte Learning bleibt als
   Verlauf erhalten und wird nicht gelöscht.
5. **verworfen:** ein Mensch (der Chief of Staff) hat gegen das Learning entschieden, mit Grund und Quelle. Es ist
   ausgemustert wie `veraltet` und `ersetzt`: Die Standardsuche blendet es aus, `includeStale` und ein
   `status`-Filter holen es zurück, es zählt nicht für die Duplikatprüfung, und der Lint bildet es auf
   `deprecated` ab. Es bleibt als Verlauf erhalten und wird nicht gelöscht.

### Bestätigen und Verwerfen (Kreislauf)

Kein Learning wird von allein `bestätigt`: Der Chief of Staff (CoS) entscheidet. Der Preflight (#171) liest nur
Bestätigtes, also `bloommd-wiki agent search --status bestätigt`; ohne diesen Filter bleibt die Suche wie sie ist.

| von | nach `bestätigt` | nach `verworfen` |
|---|---|---|
| `neu` | ja | ja |
| `unbestätigt` | nein (eine Ableitung ohne Vorfall bleibt `unbestätigt`) | ja |
| `bestätigt` | nein (schon bestätigt) | ja (Korrektur) |
| `veraltet`, `ersetzt`, `verworfen` | nein | nein |

`bloommd-wiki agent decide` führt den Wechsel aus (`docs/LEARNINGS-ABLAGE.md`): Er setzt `status`, hängt
`verified` (`by`, `at`) an, setzt bei `bestätigt` `stale_after` auf heute plus 90 Tage und hängt einen Knoten
„Entscheidung“ mit Datum, Entscheid, Grund, Quelle und Name an. Grund und Quelle sind Pflicht. Der Eintrag steht im
Protokoll und lässt sich mit `agent undo` zurücknehmen.

Einmal in der Woche (Montag 07:00 UTC, `scripts/learnings-review.sh`, Einrichtung in `docs/LEARNINGS-ABLAGE.md`) fasst
`bloommd-wiki agent review` zusammen, was zu tun ist: die Learnings mit Status `neu` (älteste zuerst, mit Beleg-Link),
abgelaufene und bald ablaufende Learnings und Duplikat-Kandidaten. Das ist die Meldung an den CoS; sie soll höchstens
zehn Minuten Aufmerksamkeit je Woche kosten. Ohne Befund ist die Ausgabe genau `NO_REPLY`. Kommen in einer Woche mehr als
10 neue Learnings ohne Bestätigung hinzu, steht oben die Zeile „Qualitätsmeldung: n neue Learnings ohne Bestätigung“.

**Wer entscheidet was**

- **`neu`:** der Chief of Staff entscheidet `bestätigt` oder `verworfen` (`agent decide`, mit Grund und Quelle).
  `unbestätigt` (Ableitung ohne Vorfall) bleibt `unbestätigt`, bis ein Beleg vorliegt; es lässt sich nur verwerfen.
- **Abgelaufen (`stale_after` überschritten):** der architect prüft und entscheidet mit Beleg: bestätigen (neues
  `stale_after` und `verified` per `agent append`), ersetzen (`ersetzt` mit `replaced_by`) oder archivieren
  (`veraltet`). Nie ohne Beleg löschen.
- **Preflight:** Neue Learnings aus Tickets sind erst nach der Bestätigung für den Preflight sichtbar; er ruft
  `bloommd-wiki agent search --status bestätigt` ab.

Statuswechsel sind Änderungen wie jede andere: `bloommd_update_map` bzw. Bearbeitung der Datei, mit Protokoll
und Undo.

## Felder setzen, finden und prüfen (Wissens-MCP)

- **Schreiben:** `bloommd_create_map` und `bloommd_update_map` nehmen `status`, `stale_after`, `verified`
  (`{by, at}`), `scope` und `replaced_by`. Beim Anlegen überschreiben `status` und `stale_after` die Werte der
  Vorlage (`neu`, heute plus 90 Tage). `bloommd_update_map` ändert nur die mitgegebenen Felder und braucht dann
  keine `nodes`. `verified` hängt einen Eintrag an die Liste an und ersetzt sie nie. `replaced_by` ist nur
  zusammen mit `status: ersetzt` erlaubt. Ungültige Eingaben (Status außerhalb der sechs Wörter, kein echtes
  Datum, Text über mehrere Zeilen oder zu lang) lehnt der Server ab.
- **Finden:** `bloommd_search` durchsucht zusätzlich `tags`, `scope`, `source`, `status` und `title` im
  Frontmatter (Trefferart `frontmatter`, `nodeId` leer) und filtert mit `status` (exakt), `tag` (exakt, ohne
  Beachtung der Groß-/Kleinschreibung) und `scope` (Teilstring); mit Filter darf `query` leer sein. Jeder Treffer
  nennt `status`, `stale_after`, `expired` und `ageDays` (ab `created`, sonst ab dem letzten `verified.at`), soweit
  die Map sie hat.
- **Abgelaufenes:** Die Suche liefert Maps mit überschrittenem `stale_after` und Status `veraltet`, `ersetzt` oder `verworfen`
  nur mit `includeStale: true`; ein `status`-Filter hat Vorrang. `bloommd_stale` (nur lesend) listet Maps mit
  `stale_after` bis heute, mit `days` auch die der nächsten n Tage (ohne Treffer ist der Text genau `NO_REPLY`,
  `structuredContent` bleibt `{stale: []}`); `bloommd-wiki agent stale <ziel> [--days <n>]` gibt dasselbe als
  kurze Liste aus (leer: `NO_REPLY`), z. B. für eine tägliche Routine.

## Anlegen

1. **Suchen vor anlegen:** `bloommd_search` im Bereich `Learnings` nach Symptom und Stichworten. Gibt es das
   Learning, ergänzen (weiterer Beleg, erweitertes `Gilt für`, ggf. Status `bestätigt`), statt zu duplizieren.
2. Sonst `bloommd_create_map` mit der Vorlage:

   ```json
   {
     "area": "Learnings",
     "title": "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer",
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

> Die drei Beispiele hat der Brand-Chief am 28.10.2026 gegen die Belege im Repo `bloommd-cluster` (Forgejo)
> geprüft und bestätigt (`status: bestätigt`, `verified`).

[learnings-beispiel/index.md](learnings-beispiel/index.md) enthält drei Learnings aus den Vorfällen vom
26.10.2026 (kubectl/NetworkPolicy, GHCR-Platzhalter, Bun-Lockfile) als lint-fähiges Wiki-Bundle
(`bloommd-wiki lint docs/learnings-beispiel`).
