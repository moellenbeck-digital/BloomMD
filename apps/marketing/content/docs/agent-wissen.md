---
title: Notizen vom Agenten ablegen lassen
description: Ein KI-Agent wie OpenClaw legt Gespräche, Besprechungen, Lernstoff und Projekte selbstständig als BloomMD-Maps ab – mit einstellbaren Rechten, Protokoll und Rückgängig.
order: 7
draft: true
---

# Notizen vom Agenten ablegen lassen

Ein Agent (z. B. OpenClaw oder Claude) bekommt Rohmaterial – ein Transkript, eine Chat-Mitschrift,
Unterrichtsnotizen – und legt daraus eine verständliche Map an: Themen, Entscheidungen, Aufgaben mit
Fälligkeit und Verantwortlichen, offene Fragen, Begriffe mit Erklärung und Lernfragen. Gibt es zum
Thema schon eine Map, ergänzt er sie, statt eine zweite anzulegen.

Abgelegt wird als normales Markdown:

- **Vault** (lokaler Ordner, z. B. ein Obsidian-Vault in iCloud) für Privates wie Schule und eigene
  Gespräche. Bereiche sind Ordner: `Schule/Physik`, `Gespräche`, `Projekte`.
- **BloomMD-Cloud-Workspace** für Arbeit und alles, was Kolleginnen und Kollegen sehen sollen.

## Einrichten

1. `bloommd-wiki` installieren (Release-Binary oder aus dem Quellcode).
2. Rechte festlegen – ohne Einstellung darf der Agent nur **vorschlagen**:

   ```bash
   bloommd-wiki agent setup "~/…/Obsidian Vault" --access write --area Arbeit=propose
   ```

   | Recht | Bedeutung |
   |---|---|
   | `read` | nur lesen und suchen |
   | `propose` | Änderungen landen als Vorschlag; erst du übernimmst sie |
   | `write` | der Agent schreibt direkt, mit Protokoll und Rückgängig |

3. Den MCP-Server im Agenten eintragen, für OpenClaw:

   ```bash
   openclaw mcp add bloommd --command bloommd-wiki \
     --arg agent --arg mcp --arg --vault --arg "/Pfad/zum/Vault" --arg --name --arg OpenClaw
   openclaw mcp doctor bloommd --probe
   ```

   Für den Cloud-Workspace zusätzlich `--arg --cloud --arg https://… --arg --workspace --arg <id>`;
   das Zugriffstoken steht in der Umgebungsvariable `BLOOMMD_TOKEN`, nie im Befehl.

4. Für OpenClaw den Skill `bloommd-knowledge` installieren (liegt im OpenClaw-Plugin von BloomMD). Er
   erklärt dem Agenten, wie er ablegt, welche Vorlage passt und was in Vault oder Cloud gehört.

## Benutzen

- „Leg das Teammeeting in BloomMD ab“ und die Mitschrift einfügen.
- „Hier sind meine Notizen aus Physik, mach daraus eine Lernmap.“
- „Was steht diese Woche an?“ – der Agent liest alle offenen Aufgaben mit Fälligkeit.
- „Bereite mich auf das Gespräch mit Lea vor.“ – er sucht die passenden Maps und fasst zusammen.
- „Frag mich die Lernfragen zur Thermodynamik ab.“

Vorlagen: **Besprechung**, **Gespräch**, **Diskussion**, **Lerneinheit**, **Projekt**,
**Wochenrückblick**. Die Maps lassen sich in BloomMD präsentieren, im Lernmodus abfragen und als
PNG/PDF exportieren – so lassen sie sich gut erklären und teilen.

## Mit Kolleg:innen teilen

Für Maps im Cloud-Workspace öffnet **Lese-Links** (Ketten-Symbol in der Werkzeugleiste) die Übersicht:
Dort erstellst du einen Link (1, 7, 30 oder 90 Tage gültig), mit dem andere die Map ohne Konto ansehen
können – als Map oder als Gliederung, nur lesend. Ebenda siehst du alle Links der Map und widerrufst
sie; ein widerrufener Link funktioniert sofort nicht mehr. Der Link zeigt nur Titel, sichtbaren Text
und Aufgaben-Infos – keine Frontmatter, Kommentare oder Zeichnungen. Suchmaschinen indexieren diese
Seiten nicht.

Auch der Agent kann Links erstellen („schick Lea einen Link zur Projekt-Map“), aber nur, wenn du das
für sein Token erlaubst: **Konto → Desktop- und Agenten-Zugriff → Darf Lese-Links erstellen**. Jeder
Link, den der Agent erstellt, steht mit seinem Namen im Audit-Log.

## In Obsidian: das Agent-Panel

Mit dem BloomMD-Plugin für Obsidian behältst du den Agenten direkt im Vault im Blick – auf dem Mac
wie auf dem iPad. Öffne das Panel über das Roboter-Symbol in der Seitenleiste oder den Befehl
**BloomMD: Open agent panel**. Das Symbol zählt offene Vorschläge; kommt ein neuer hinzu, erscheint
ein Hinweis.

- **Proposals** (Vorschläge): Agent, Zeitpunkt, Notiz, Grund und Quelle, dazu eine Gliederung der
  Änderung (+ neu, ~ geändert, − entfernt) und der volle Text. **Approve** übernimmt den Vorschlag;
  hat sich die Notiz seitdem geändert, zeigt das Panel den Unterschied, und du entscheidest:
  **Apply anyway** oder **Reject**. Beim Ablehnen kannst du dem Agenten einen Grund mitgeben.
- **Requests** (Anfragen): siehe unten.
- Auf der Map markiert ein kleiner violetter Punkt Knoten, die der Agent seit deinem letzten Öffnen
  der Map auf diesem Gerät geändert hat.
- **History** (Verlauf): wer hat wann was geändert. **Undo** stellt den Stand vor einer Änderung
  des Agenten oder einem übernommenen Vorschlag wieder her – nach Rückfrage und nur, wenn die
  Notiz seitdem niemand bearbeitet hat.
- **Rights** (Rechte): Standard und je Ordner der obersten Ebene `read`, `propose` oder `write`,
  genau wie `bloommd-wiki agent setup`. Für deinen eigenen Agenten ist `write` üblich.

Panel und `bloommd-wiki agent …` arbeiten mit denselben Dateien in `.bloommd/` und denselben
Regeln. Übernehmen kann nur ein Mensch; der Agent hat dafür kein Werkzeug.

## Den Agenten zu einem Knoten fragen

Im Knotenmenü der Map (Rechtsklick, auf dem iPad langer Druck) steht **Ask agent…**: Frage oder
Auftrag eintippen, etwa „Ergänze hier die nächsten Schritte“. Die Anfrage landet in
`.bloommd/requests/` und steht im Panel unter **Requests** mit ihrem Status. Der Agent holt offene
Anfragen mit dem Werkzeug `bloommd_requests` ab und beantwortet sie mit `bloommd_answer_request`.
Seine Antwort erscheint im Panel; Knoten, die er dabei ergänzt, folgen seinen Rechten – direkt
geschrieben oder als Vorschlag zum Freigeben. Ohne Map geht es auch: **Ask agent about current
note**.

Damit OpenClaw Anfragen von selbst abarbeitet, eine Routine anlegen, z. B. alle 15 Minuten:

```bash
openclaw cron add --name bloommd-anfragen --cron "*/15 * * * *" --tz Europe/Berlin \
  --message "Prüfe mit bloommd_requests offene BloomMD-Anfragen. Lies jeweils die Map, beantworte jede mit bloommd_answer_request und ergänze Knoten nur, wenn danach gefragt wurde. Ohne offene Anfragen: NO_REPLY."
```

## Routinen

`bloommd-wiki agent due <vault>` listet fällige und überfällige Aufgaben aller Maps und gibt
`NO_REPLY` aus, wenn nichts ansteht. Als OpenClaw-Automation meldet er sich so nur, wenn es etwas zu
tun gibt:

```bash
openclaw cron add --name bloommd-faellige-aufgaben --cron "50 7 * * *" --tz Europe/Berlin \
  --command-argv '["bloommd-wiki","agent","due","/Pfad/zum/Vault"]' \
  --announce --channel telegram --to <chat-id>
```

`--days 7` zeigt die ganze kommende Woche.

Ebenso meldet `bloommd-wiki agent stale <vault>` Maps, deren `stale_after` erreicht oder überschritten ist
(mit `--days 14` auch die der nächsten zwei Wochen), und gibt `NO_REPLY` aus, wenn nichts abläuft.

### Vertrauen und Veraltung

Der Agent kann `status` (`neu`, `bestätigt`, `veraltet`, `ersetzt`), `stale_after`, `verified` (wird angehängt),
`scope` und `replaced_by` beim Anlegen und später gezielt setzen; `bloommd_update_map` ändert dann nur diese
Felder. `bloommd_search` findet zusätzlich Tags und Frontmatter-Werte und filtert nach `status`, `tag` und
`scope`. Abgelaufene sowie als `veraltet` oder `ersetzt` markierte Maps liefert die Suche nur mit
`includeStale: true` (oder mit einem `status`-Filter). `bloommd_stale` listet die abgelaufenen Maps.

## Kontrolle

```bash
bloommd-wiki agent log "/Pfad/zum/Vault"            # was hat der Agent geändert?
bloommd-wiki agent undo "/Pfad/zum/Vault" <change-id> # Änderung zurücknehmen
bloommd-wiki agent proposals "/Pfad/zum/Vault"       # offene Vorschläge
bloommd-wiki agent approve "/Pfad/zum/Vault" <id> --reviewer Max
bloommd-wiki agent reject "/Pfad/zum/Vault" <id> --reviewer Max --reason "Gehört nach Projekte"
```

Für den Cloud-Workspace steht statt des Ordners `--cloud <url> --workspace <id>` – dieselben Angaben
wie beim MCP-Server. Rechte, Protokoll und Vorschläge des Workspace liegen auf deinem Rechner unter
`~/.bloommd/agent-cloud/`; `approve`, `undo`, `log` und `due` brauchen zusätzlich das Token in
`BLOOMMD_TOKEN`:

```bash
bloommd-wiki agent setup --cloud https://… --workspace <id> --access write --area Arbeit=propose
bloommd-wiki agent proposals --cloud https://… --workspace <id>
bloommd-wiki agent approve --cloud https://… --workspace <id> <vorschlags-id> --reviewer Max
```

- Der Agent schreibt nie ganze Dateien neu, sondern legt Knoten an oder ergänzt sie. Hat jemand die
  Map inzwischen geändert, bricht er ab und liest neu.
- Vorschläge kann nur ein Mensch übernehmen; der Agent hat dafür kein Werkzeug.
- Der Agent kann nur seine eigenen direkten Änderungen zurücknehmen, und nur im Rahmen seiner Rechte:
  In einem `propose`-Bereich wird daraus ein Vorschlag. Freigegebene Vorschläge nimmst nur du zurück
  (`agent undo`).
- Bereiche gelten unabhängig von der Schreibweise: Eine Regel für `Arbeit` gilt auch für `arbeit`.
- Ganze Maps lassen sich in der Cloud nur ersetzen (Rückgängig, übernommener Vorschlag), solange
  niemand sie geöffnet hat; sonst kommt eine Meldung, und du versuchst es nach dem Schließen erneut.
- Protokoll, Verlauf und Vorschläge liegen im Vault unter `.bloommd/` und synchronisieren mit.
- Dateien, die iCloud nur in der Cloud vorhält, werden übersprungen und in der Übersicht gemeldet.
