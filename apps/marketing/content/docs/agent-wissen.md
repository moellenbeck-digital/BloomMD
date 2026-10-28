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

   Ein Bereich darf ein Unterbereich sein: `--area Learnings/dev-team=write` gilt für alles unter
   `Learnings/dev-team`. Es gilt immer der längste passende Bereich – Unterbereich vor übergeordnetem
   Bereich vor Standard. So kann `Learnings` auf `read` stehen und `Learnings/dev-team` auf `write`.

   Im Cloud-Workspace gelten die Rechte **je Agent-Token auf dem Server** (siehe unten): Du setzt sie
   im Browser unter **Agenten verwalten** oder mit `agent setup --cloud …`, und der Server erzwingt
   sie – auch gegen einen veränderten Client.

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

### Einrichtung in Claude Code

Claude Code startet den MCP-Server als lokalen Prozess (stdio). Die Rechte (Schritt 2) gelten
unverändert; `--name` erscheint im Protokoll.

Für einen **Vault** trägst du den Server für alle deine Projekte ein (`--scope user`) und prüfst ihn:

```bash
claude mcp add --scope user bloommd -- \
  bloommd-wiki agent mcp --vault "/Pfad/zum/Vault" --name "Claude Code"
claude mcp list
```

Für einen **Cloud-Workspace** (oder beides zusammen) kommt `--cloud` und `--workspace` dazu. Das
Zugriffstoken steht nie im Befehl und nie in der Konfiguration: Setze `BLOOMMD_TOKEN` in der Umgebung,
in der du Claude Code startest, und lass Claude Code die Variable beim Start einsetzen (die
einfachen Anführungszeichen verhindern, dass die Shell sie schon vorher ersetzt):

```bash
export BLOOMMD_TOKEN=…   # Zugriffstoken des Agenten, z. B. aus dem Passwortmanager
claude mcp add-json --scope user bloommd '{
  "type": "stdio",
  "command": "bloommd-wiki",
  "args": ["agent", "mcp", "--vault", "/Pfad/zum/Vault",
           "--cloud", "https://…", "--workspace", "<id>", "--name", "Claude Code"],
  "env": { "BLOOMMD_TOKEN": "${BLOOMMD_TOKEN}" }
}'
```

Ohne `--vault` arbeitet der Server nur mit der Cloud, ohne `--cloud` nur mit dem Vault; Werkzeuge
wählen mit `target` zwischen beiden. Läuft der Server, steht er in Claude Code unter `/mcp`. Teams
können denselben Eintrag mit `--scope project` in die `.mcp.json` des Projekts legen – auch dort steht
nur `${BLOOMMD_TOKEN}`, nie der Wert.

## Werkzeuge

Der Server bietet 18 Werkzeuge `bloommd_*`. Lesend (ohne Änderung):

| Werkzeug | Zweck |
|---|---|
| `bloommd_overview` | Bereiche, Rechte und Maps |
| `bloommd_search` | Suche in Knoten, Tags und Frontmatter (Filter `status`, `tag`, `scope`) |
| `bloommd_get_map` | eine Map als Gliederung mit `version` |
| `bloommd_get_node` | **ein** Knoten: Titel, Inhalt, Metadaten, Eltern, Kinder-IDs, Beziehungen und `version` der Map |
| `bloommd_backlinks` | **Rückverweise**: Maps und Knoten, die auf eine Map oder Note verlinken |
| `bloommd_changes` | Änderungsprotokoll des Agenten, mit `since` ab einem Zeitpunkt |
| `bloommd_tasks`, `bloommd_decisions`, `bloommd_stale`, `bloommd_templates`, `bloommd_requests` | Aufgaben, Entscheidungen, ablaufende Maps, Vorlagen, Anfragen |

Schreibend, nach den Rechten des Agenten: `bloommd_create_map`, `bloommd_ingest`, `bloommd_update_map`,
`bloommd_update_node`, `bloommd_answer_request`, `bloommd_undo` und `bloommd_share_link`.

### Einzelner Knoten, Rückverweise, Änderungen seit

- `bloommd_get_node {path, nodeId}` liest einen Knoten samt `version` der Map, ohne die ganze Map zu
  laden. Eine unbekannte `nodeId` wird abgelehnt.
- `bloommd_backlinks {path}` nennt je Treffer Map, Knoten (`nodeId`, `nodeTitle`), Zeile und den Link,
  wie er geschrieben steht (`[[Note]]` oder Markdown-Link). Es werden nur Maps durchsucht, die der Agent
  lesen kann; Treffer aus Maps, die der Speicher nicht lesen lässt, fehlen.
- `bloommd_changes {since}` zeigt nur Änderungen ab einem ISO-Datum (`2026-10-27`, ab Tagesbeginn UTC)
  oder Zeitpunkt (`2026-10-27T08:30:00Z`; ohne Zeitzone gilt UTC). Ohne `since` bleibt alles wie bisher;
  `limit` begrenzt weiter. Ein ungültiges `since` wird abgelehnt.

Alle drei gelten für `target` `vault` und `cloud` und ändern nie etwas.

## Benutzen

- „Leg das Teammeeting in BloomMD ab“ und die Mitschrift einfügen.
- „Hier sind meine Notizen aus Physik, mach daraus eine Lernmap.“
- „Was steht diese Woche an?“ – der Agent liest alle offenen Aufgaben mit Fälligkeit.
- „Bereite mich auf das Gespräch mit Lea vor.“ – er sucht die passenden Maps und fasst zusammen.
- „Frag mich die Lernfragen zur Thermodynamik ab.“

Vorlagen: **Besprechung**, **Gespräch**, **Diskussion**, **Lerneinheit**, **Projekt**,
**Wochenrückblick**. Die Maps lassen sich in BloomMD präsentieren, im Lernmodus abfragen und als
PNG/PDF exportieren – so lassen sie sich gut erklären und teilen.

## Text als Map ablegen (Ingest)

Hat der Agent Rohtext (Transkript, Chat, Notiz) und daraus schon die Abschnitte gegliedert, legt
`bloommd_ingest` die Map nach Vorlage an und hält das Original als Quelle fest. Das Werkzeug erfindet
nichts und ruft kein Modell auf: die Gliederung kommt vom Agenten, es ist nur eine Anlege- und
Prüfschicht über `bloommd_create_map` mit denselben Rechten (lesen: abgelehnt, vorschlagen:
Vorschlag, den nur ein Mensch freigibt, schreiben: geschrieben), Protokoll und Undo.

```bash
bloommd-wiki agent ingest --vault ~/Vault --name coder --vorlage meeting \
  --titel "Wochenbesprechung Produktteam" --text transkript.txt \
  --quelle "Teams-Aufzeichnung 20.10." --quelle-datum 2026-10-20 \
  --abschnitte abschnitte.json          # Datei oder - für stdin
```

- **Eingabe:** Originaltext (`--text <datei|->`, MCP: `text`), Vorlage (`meeting`, `conversation`,
  `discussion`, `lesson`, `project`, `weekly`; `learning` nicht, dafür gibt es `agent create|append`),
  Titel, optional Bereich (Standard: der Bereich der Vorlage), Quellenverweis (`--quelle`, MCP: `source`;
  Pfad, URL oder Ticket) und Datum der Quelle (`--quelle-datum`, MCP: `sourceDate`, `YYYY-MM-DD`), dazu die
  Abschnitte als JSON-Array von Knoten im Format von `bloommd_create_map` (`--abschnitte`, MCP: `nodes`);
  `parent` ist ein Skelett-Ref der Vorlage (`themen`, `aufgaben`, …). Nur ein Eingang darf stdin (`-`) sein.
- **Quelle:** Der Originaltext steht wörtlich als Knoten „Originaltext“ (`kind: source`) unter „Quellen“,
  mit Verweis und Datum in `citation` (eine http(s)-URL auch als `url`) und in `source` der Map. Er steht in
  einem Codeblock, damit Überschriften, Listen und `---` im Text Text bleiben; nichts wird gekürzt oder
  umformuliert (einzige Änderung: Zeilenumbrüche werden als `\n` gespeichert). Hat die Vorlage keinen
  „Quellen“-Knoten (`weekly`), legt das Werkzeug ihn an. Ohne Originaltext oder Quellenverweis wird nichts
  geschrieben („Fehlende Quelle“).
- **Grenzen:** Originaltext höchstens **200 000 Zeichen**, Abschnitte höchstens **150 Knoten** (ohne
  Vorlagen-Skelett und Quellen-Knoten). Darüber kommt eine Fehlermeldung mit Ist- und Grenzwert, nichts
  wird geschrieben.
- **Duplikate:** Gibt es im Zielbereich schon eine Map mit gleichem Titel (Groß-/Kleinschreibung und
  Satzzeichen zählen nicht), wird nichts angelegt; die Fehlermeldung nennt den Pfad. Gleicher Titel in
  einem anderen Bereich ist kein Duplikat. Ein `--force` gibt es nicht.
- **Exitcodes** (`agent ingest`): 0 ok, 1 Fehler (z. B. unbekannte Vorlage, keine Berechtigung), 2 Aufruf oder
  abgelehnte Eingabe (Grenzen, fehlende Quelle), 3 Duplikat (`{"duplicate":true,"pfad":…}`).
- **Keine Zugangsdaten und keine Personendaten** (Passwörter, Tokens, Schlüssel, private Angaben) in
  Originaltext oder Abschnitte: das Werkzeug filtert nichts. Was nicht in die Map gehört, vorher
  entfernen (wie bei den Learnings).

## Einen Knoten gezielt ändern

Für die Teiländerung eines einzelnen Knotens – Status setzen, Text ergänzen, Verknüpfung ziehen, neue
Unterpunkte anhängen – gibt es `bloommd_update_node`. Nur die genannten Felder ändern sich, der Rest
des Knotens und der Map bleibt; die Map wird nie ersetzt. Die Änderung wirkt auch, während jemand die
Map gerade bearbeitet. Rechte, Vorschlag oder direktes Schreiben und das Protokoll sind dieselben wie
bei `bloommd_update_map`, im Vault wie im Cloud-Workspace:

```bash
bloommd-wiki agent update-node --cloud https://… --workspace <id> "Arbeit – Plan.md" <knoten-id> \
  --patch '{"status":"done","children":[{"title":"Folgeaufgabe","status":"open"}]}' \
  --reason "Aufgabe erledigt" --source "Teams-Transkript 27.10."
```

Statt `--cloud` geht ein Vault-Ordner; `--patch -` liest das JSON von stdin. Mit einem Agent-Token gelten
dessen Rechte, mit deinem Besitzer-Token schreibt der Befehl wie du.

Felder: `title`, `content` (wird angehängt, `contentMode: "replace"` ersetzt), `kind`, `status`,
`decision`, `due`, `assignee`, `note`, `citation`, `url`, `relations` und `children`. Neue
`children` stehen am Ende des Knotens (Felder wie bei den `nodes` von `bloommd_update_map`; mit `ref`
und `parent` entstehen auch Unterbäume). Metadaten lassen sich setzen, nicht leeren.

Über die Server-Schnittstelle (Agent-Token, Sitzung oder persönliches Token):

```http
PATCH /api/mindmaps/<datei>/nodes/<knoten-id>
{ "status": "done", "children": [{ "title": "Folgeaufgabe" }], "agentMeta": { "source": "Teams-Transkript 27.10.", "reason": "Aufgabe erledigt" } }
```

| Antwort | Bedeutung |
| --- | --- |
| 200 `{ ids, created, updated, version, mode, changeId }` | direkt geschrieben; `mode` und `changeId` (für Rückgängig) bei Agent-Tokens |
| 202 `{ mode: "proposed", proposalId }` | der Agent darf im Bereich nur vorschlagen; der Vorschlag trägt die Basisversion der Map |
| 403 `AGENT_READ_ONLY` | der Agent darf im Bereich nur lesen |
| 404 `NODE_NOT_FOUND` | die Knoten-ID gibt es in der Map nicht |
| 400 `INVALID_NODES` | ungültige oder unbekannte Felder, ungültiges Datum, `children` mit `id` |

`POST /api/mindmaps/<datei>/nodes` bleibt für mehrere Knoten auf einmal (anlegen und ändern per ID).

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
  genau wie `bloommd-wiki agent setup`. Unterbereiche wie `Learnings/dev-team` setzt
  `agent setup --area …`. Für deinen eigenen Agenten ist `write` üblich.

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
wie beim MCP-Server. Rechte, Vorschläge und Protokoll liegen dort **je Agent-Token auf dem Server**
und werden dort erzwungen, nicht mehr auf dem Rechner des Agenten; mehrere Pods oder Rechner mit
demselben Token haben also dieselben Rechte und dasselbe Protokoll. Alle Befehle mit `--cloud` brauchen
dein Besitzer-Token in `BLOOMMD_TOKEN`; `--agent <name|id>` wählt den Agent-Token (bei nur einem
entfällt es):

```bash
bloommd-wiki agent setup --cloud https://… --workspace <id> --agent OpenClaw --access propose \
  --area Learnings=read --area Learnings/dev-team=write
bloommd-wiki agent rights --cloud https://… --workspace <id>
bloommd-wiki agent proposals --cloud https://… --workspace <id>
bloommd-wiki agent approve --cloud https://… --workspace <id> <vorschlags-id>
bloommd-wiki agent log --cloud https://… --workspace <id> --agent OpenClaw
```

### Im Browser freigeben und Rechte setzen

Als Workspace-Besitzer öffnest du im Cloud-Workspace **Agenten verwalten** (Workspace-Menü) und
findest dort **Agent-Zugriff**:

- **Offene Vorschläge** mit Agent, Bereich, Zeitpunkt, Grund und einer Gliederung der Änderung
  (+ neu, ~ geändert, − entfernt). **Freigeben** übernimmt den Vorschlag, **Ablehnen** verwirft ihn
  (mit optionalem Grund). Hat sich die Map seitdem geändert, siehst du das und entscheidest, ob du
  trotzdem übernimmst. Im Protokoll steht, wer freigegeben oder abgelehnt hat – mit deinem
  angemeldeten Namen. `agent approve|reject` mit deinem Token läuft über denselben Serverweg; `--reviewer`
  ist dort nicht nötig.
- **Rechte** je Agent-Token: Standardrecht und Rechte je Bereich (auch Unterbereiche).
  Ohne Eintrag darf der Agent nur vorschlagen.
- **Protokoll** der Änderungen mit **Rückgängig**.

Die Rechte gelten sofort. Ein abgelaufenes oder widerrufenes Token wird auf jedem Weg beim nächsten Aufruf
mit 401 abgelehnt (nur eine Live-Bearbeitung, die schon offen ist, behält das beim Öffnen vergebene Recht,
bis sie geschlossen wird). Ein Token mit Scope `read` schreibt nirgends, auch keine Vorschläge. Rechte,
Vorschläge, Protokoll und Rückgängig sind Werkzeuge des Workspace-Besitzers; ein Agent-Token erreicht sie nicht
und kann sich nicht selbst freigeben. Das Protokoll nennt zu jeder Änderung den Agenten, das Werkzeug und – wenn
der Agent sie nennt – Quelle und Grund; die Oberfläche zeigt sie an. Was der Server
im Einzelnen prüft: `read` lehnt jede Änderung mit einer Meldung ab, die den Bereich nennt; `propose`
legt nur einen Vorschlag an; `write` schreibt direkt und protokolliert. Auch Umbenennen, Löschen,
Lese-Links und die Live-Bearbeitung brauchen `write` im Bereich.

### Alte lokale Rechte

Früher lagen die Rechte eines Cloud-Workspace als `agent.json` unter
`~/.bloommd/agent-cloud/<host>-<workspace>/`. Beim ersten Start mit Cloud-Ziel weist `bloommd-wiki`
einmal darauf hin. **Lokale Rechte werden nie stillschweigend übernommen:** Bis du entscheidest, gilt
das Recht des Servers (ohne Eintrag: `propose`).

```bash
bloommd-wiki agent migrate --cloud https://… --workspace <id> --agent OpenClaw           # zeigt nur, was gilt
bloommd-wiki agent migrate --cloud https://… --workspace <id> --agent OpenClaw --apply   # genau die alten Rechte setzen
bloommd-wiki agent migrate --cloud https://… --workspace <id> --agent OpenClaw --discard # verwerfen
```

`--apply` setzt höchstens die bisherigen lokalen Rechte und nur, wenn für den Token auf dem Server noch
nichts gesetzt wurde. Alte lokale Protokolle und Vorschläge bleiben unverändert liegen; sie werden
weder auf den Server übernommen noch gelöscht.

- Der Agent schreibt nie ganze Dateien neu, sondern legt Knoten an oder ergänzt sie. Hat jemand die
  Map inzwischen geändert, bricht er ab und liest neu.
- Vorschläge kann nur ein Mensch übernehmen; der Agent hat dafür kein Werkzeug.
- Der Agent kann nur seine eigenen direkten Änderungen zurücknehmen, und nur im Rahmen seiner Rechte:
  In einem `propose`-Bereich wird daraus ein Vorschlag. Freigegebene Vorschläge nimmst nur du zurück
  (`agent undo`).
- Bereiche gelten unabhängig von der Schreibweise: Eine Regel für `Arbeit` gilt auch für `arbeit`.
  Im Cloud-Workspace steht der Bereich im Dateinamen (`Learnings › dev-team – Idee.md`).
- Ganze Maps lassen sich in der Cloud nur ersetzen (Rückgängig, übernommener Vorschlag), solange
  niemand sie geöffnet hat; sonst kommt eine Meldung, und du versuchst es nach dem Schließen erneut.
- Im Vault liegen Protokoll, Verlauf und Vorschläge unter `.bloommd/` und synchronisieren mit; im
  Cloud-Workspace liegen sie auf dem Server.
- Dateien, die iCloud nur in der Cloud vorhält, werden übersprungen und in der Übersicht gemeldet.
