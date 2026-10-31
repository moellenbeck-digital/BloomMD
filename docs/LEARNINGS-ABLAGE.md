# Learnings-Ablage im Brand-Cluster

Wo und wie die Agenten einer Brand (architect, coder, tester, bei Bedarf weitere Rollen) ihre Learnings
ablegen und wie Menschen und der Chief of Staff sie lesen. Das Muster gilt für jede Brand mit Chief of Staff
und hängt nicht von einer Cloud-Workspace-Instanz ab. Format, Bereiche und Lebenszyklus der Learnings selbst
stehen in [LEARNINGS.md](LEARNINGS.md).

## Überblick

```text
Agenten (architect, coder, tester)
   │  MCP über stdio: bloommd-wiki agent mcp --vault /data/learnings --name <rolle>
   ▼
/data/learnings            Vault auf eigenem Volume im Dev-Team-Pod (Maps als Markdown-Dateien)
   │  täglich: bloommd-wiki export /data/learnings /data/learnings-export --overwrite
   ▼
/data/learnings-export     statischer Export (index.html, wiki.json, Maps), offline lesbar
```

Es gibt keinen eigenen Server, keine Datenbank und kein neues Netzziel: Der MCP-Server läuft als Kindprozess
des Agenten und spricht nur über stdin/stdout. Netzwerkzugriff gibt es im Code nur mit `--cloud`
(`packages/wiki-cli/src/cloud-agent.ts`), das hier nicht verwendet wird.

## Bausteine

| Baustein | Wert (Dev-Team-Pod) | Hinweis |
| --- | --- | --- |
| Volume | `/data/learnings` (ext4, eigenes Volume) | Anlage, Backup und Restore-Test gehören dem Betrieb. |
| Vault | `/data/learnings` selbst | `lost+found` und Ordner mit Punkt (`.bloommd`) liest das Werkzeug nicht. |
| Binary | `/home/node/.openclaw/bin/bloommd-wiki` | Auf dem persistenten State-Volume, **nicht** im Repo und nicht in `~/.local` (Overlay, geht beim Neustart verloren). |
| Export | `/data/learnings-export` | Eigener Ordner **außerhalb** des Vaults; das Werkzeug lehnt einen Zielordner im Vault ab. |

### Binary bauen

Bun ist im Pod vorhanden. Aus einem Checkout des Repositories:

```bash
bun install --frozen-lockfile
bun build --compile packages/wiki-cli/src/cli.ts --outfile /home/node/.openclaw/bin/bloommd-wiki.new
mv /home/node/.openclaw/bin/bloommd-wiki.new /home/node/.openclaw/bin/bloommd-wiki
bloommd-wiki --version
```

Nach einem Update des Werkzeugs gleich neu bauen und ersetzen (Version in `packages/wiki-cli/package.json`).

## Rechte

Im Vault gibt es **eine** Rechtedatei (`/data/learnings/.bloommd/agent.json`). Sie gilt für alle Agenten gleich:

```bash
bloommd-wiki agent setup /data/learnings --access read --area Learnings=write
bloommd-wiki agent rights /data/learnings
```

- Alle Rollen dürfen in `Learnings/**` direkt schreiben und sonst nur lesen.
- Ohne Einstellung dürfen Agenten nur Vorschläge machen (`propose`); die Freigabe geben Menschen
  (`agent proposals`, `agent approve`, `agent reject`), nie der Agent selbst.

**Einschränkung:** Die Rechte lassen sich im Vault **nicht je Agent** setzen. `--agent` von `agent setup` und
`agent rights` wirkt nur bei `--cloud`; `--name` am MCP-Server ist im Vault nur ein Etikett im Protokoll. Ein
zweites `setup` überschreibt das erste. Die Trennung nach Rolle ist eine Konvention, keine Sperre:

- Jede Rolle legt ihre Learnings unter `Learnings/<rolle>/` ab (`Learnings/architect`, `Learnings/coder`,
  `Learnings/tester`).
- Das Protokoll nennt den Agenten (`--name`) und die Zeit jeder Änderung.

## MCP-Einträge in OpenClaw

`openclaw mcp set` schreibt in die globale `mcp.servers`-Konfiguration; es gibt keine Zuordnung je Agent. Deshalb
ein Server je Rolle, damit das Protokoll den Namen trägt. Alle Server sind für alle Agenten sichtbar.

```bash
for rolle in architect coder tester; do
  openclaw mcp set "bloommd-$rolle" \
    "{\"command\":\"/home/node/.openclaw/bin/bloommd-wiki\",\"args\":[\"agent\",\"mcp\",\"--vault\",\"/data/learnings\",\"--name\",\"$rolle\"]}"
done
openclaw mcp probe          # je Server: Anzahl der Werkzeuge (bloommd_*)
openclaw mcp reload         # neue Konfiguration ab dem nächsten Lauf
```

Vor dem Eintragen `openclaw.json` sichern; `openclaw mcp set` ergänzt nur den Abschnitt `mcp.servers`. Ein Agent
nutzt den Server, der seiner Rolle entspricht (Werkzeuge `bloommd_search`, `bloommd_create_map`,
`bloommd_update_map`, `bloommd_changes`, `bloommd_undo` u. a.). Für Skripte und den Adapter gibt es zusätzlich die
Einzelbefehle mit JSON (siehe unten).

## Einzelbefehle für Skripte und den Adapter

Neben dem MCP gibt es unter `bloommd-wiki agent …` Einzelbefehle mit **JSON auf stdout** (Meldungen auf
stderr). **Sie sind die Grundlage des künftigen Adapters `wissen/bloommd` in `md-agents`**: Der Adapter ruft sie
auf, statt den MCP zu sprechen. Sie arbeiten nur im Bereich `Learnings`, mit denselben Rechten, demselben
Protokoll und demselben Undo wie der MCP (`--name` nennt die Rolle). Freigeben kann ein Agent nichts: Liegt das
Recht auf `propose`, kommt `"modus":"vorgeschlagen"` mit einer Vorschlags-ID zurück, und ein Mensch gibt mit
`agent approve` frei. Ziel ist `--vault /data/learnings` (oder `--cloud <url> [--workspace <id>]` mit
`BLOOMMD_TOKEN`).

```bash
V=/data/learnings
# Suchen: nur gültige Learnings (nicht veraltet/ersetzt/verworfen, nicht abgelaufen); --include-stale nimmt die übrigen mit
bloommd-wiki agent search "lockfile" --vault $V --name coder --rolle coder --tag bun --komponente Dockerfile --limit 5
# {"treffer":[{"pfad":"Learnings/coder/Bun-Version je Repo festhalten.md","titel":"Bun-Version je Repo festhalten","status":"neu","rolle":"coder","tags":["bereich/learnings/coder","coder"],"auszug":"Symptom Lockfile scheitert.","stale_after":"2027-01-25","abgelaufen":false}],"anzahl":1,"gesamt":1,"limit":5}

# Lesen: Frontmatter, Inhalt (Markdown ohne Frontmatter) und Version
bloommd-wiki agent read "Learnings/coder/Bun-Version je Repo festhalten.md" --vault $V
# {"pfad":"…","version":"d7e468b17e7313d7","bereich":"Learnings/coder","frontmatter":{"titel":"…","status":"neu","rolle":"coder","tags":[…],"scope":"Dockerfile, coder","source":"Ticket 113, …","created":"2026-10-27","stale_after":"2027-01-25","abgelaufen":false,"verified":[]},"inhalt":"# …\n\n## Symptom\n\n…"}

# Anlegen nach der Vorlage (Pflicht: --titel --rolle --beleg --inhalt --ticket --name); --inhalt - liest stdin,
# mit "## Symptom", "## Ursache", "## Regel" im Text je Abschnitt, sonst kommt der Text unter „Regel“
bloommd-wiki agent create --vault $V --name coder --ticket 113 --titel "Bun-Version je Repo festhalten" \
  --rolle coder --beleg https://github.com/org/repo/issues/113 --inhalt "Version je Repo festhalten" --komponente Dockerfile
# {"ok":true,"pfad":"Learnings/coder/Bun-Version je Repo festhalten.md","modus":"geschrieben","aenderung":"cmvr43otp11l8p","version":"d7e468b17e7313d7","status":"neu","ticket":"113","schreibvorgang":1,"limit":3}

# Ergänzen: neuer Knoten (--abschnitt, --titel) und/oder Beleg-Link; hängt verified an (by = --name) und
# verlängert stale_after auf heute + 90 Tage, außer bei veraltet/ersetzt/verworfen; der Status bleibt
bloommd-wiki agent append "Learnings/coder/Bun-Version je Repo festhalten.md" --vault $V --name tester --ticket 113 \
  --inhalt "Zweiter Vorfall" --beleg https://github.com/org/repo/actions/runs/1
# {"ok":true,"pfad":"…","modus":"geschrieben","aenderung":"…","version":"…","verified":{"by":"tester","at":"2026-10-27"},"stale_after":"2027-01-25","ticket":"113","schreibvorgang":2,"limit":3}

# Abgelaufene und bald ablaufende Learnings (gleiche Logik wie bloommd_stale)
bloommd-wiki agent stale --vault $V --days 14
# {"stale":[{"pfad":"…","titel":"…","status":"neu","stale_after":"2026-10-20","tage_ueberfaellig":7,"abgelaufen":true,"scope":"Dockerfile, coder"}],"anzahl":1,"tage":14}

# Nur Bestätigtes suchen (so liest der Preflight): exakter Statusfilter, Groß-/Kleinschreibung egal, bestaetigt = bestätigt.
# Der Filter hat Vorrang vor dem Ausblenden von Abgelaufenem und Ausgemustertem; der Suchtext darf dann fehlen.
bloommd-wiki agent search "lockfile" --status bestätigt --vault $V --name coder
bloommd-wiki agent search --status neu --vault $V --name chief-of-staff --limit 50

# Entscheiden (CoS): neu → bestätigt|verworfen, unbestätigt → verworfen, bestätigt → verworfen (Korrektur). Pflicht:
# --entscheid bestaetigt|verworfen, --grund, --quelle (Link oder Text), --name (wer). Kein --ticket, kein Schreibzähler.
bloommd-wiki agent decide "Learnings/coder/Bun-Version je Repo festhalten.md" --vault $V --name chief-of-staff \
  --entscheid bestaetigt --grund "Zweiter Vorfall im Cluster belegt die Regel" --quelle https://github.com/org/repo/issues/120
# {"ok":true,"pfad":"…","modus":"geschrieben","aenderung":"…","version":"…","entscheid":"bestätigt","vorher":"neu","status":"bestätigt","verified":{"by":"chief-of-staff","at":"2026-10-31"},"stale_after":"2027-01-29"}

# Wochenlauf (Montag): Text für den CoS, kein JSON; ohne Befund genau NO_REPLY
bloommd-wiki agent review --vault $V --days 14
```

`agent stale <ordner>` ohne `--vault`/`--json` bleibt die Textform für Routinen (leer: `NO_REPLY`).

**Duplikatprüfung vor `create`:** Gibt es ein Learning mit gleichem Titel (ohne Beachtung von Groß-/Kleinschreibung
und Satzzeichen) oder ein sehr ähnliches (70 % Wortüberlappung des Titels, 30 % der Tags, mindestens ein gemeinsamer
Tag, Schwelle 0,7; `veraltet`, `ersetzt` und `verworfen` zählen nicht), wird nichts angelegt. Der Befehl endet mit Exitcode 3 und
`{"fehler":"…","duplicate":true,"pfad":"Learnings/coder/…md","titel":"…","aehnlichkeit":1}`; der Aufrufer nimmt dann
`append`. Ein `--force` gibt es nicht.

**Entscheidung (`agent decide`):** Erlaubt sind `neu` → `bestätigt`, `neu` → `verworfen`, `unbestätigt` → `verworfen` und
`bestätigt` → `verworfen` (Korrektur). Alles andere endet mit Exitcode 2 und einer Meldung, ohne etwas zu schreiben:
`unbestätigt` → `bestätigt` (eine Ableitung ohne Vorfall bleibt unbestätigt), `bestätigt` → `bestätigt` und
`veraltet`, `ersetzt` oder `verworfen` als Ausgangsstatus. Wirkung: `status` wird gesetzt, `verified` um (`by` = `--name`,
`at` = heute) ergänzt, bei `bestätigt` `stale_after` auf heute + 90 Tage gesetzt, und ein Knoten „Entscheidung“ (Datum,
Entscheid, Grund, Quelle, wer) angehängt. Der Schreibweg ist der von `append` (Rechte, `modus` geschrieben oder
vorgeschlagen, Protokoll mit `agent log`, `agent undo`), aber ohne `--ticket` und ohne Schreibzähler: Das ist keine
Ticket-Schreibung.

**Wochenlauf (`agent review`):** Text für den Chief of Staff, nur Bereich `Learnings`, ändert nichts. (a) alle Learnings mit
Status `neu`: Pfad, Titel, Alter in Tagen (ab `created`), Beleg-Link, älteste zuerst; (b) abgelaufene und bald
ablaufende Learnings (Logik von `agent stale`, `--days`, Standard 14); (c) Duplikat-Kandidaten unter den nicht
ausgemusterten Learnings (gleiche Ähnlichkeit und Schwelle 0,7 wie bei `create`). Leere Teile entfallen; gibt es in
keinem Teil etwas, ist die Ausgabe genau `NO_REPLY`.

**Schreibzähler je Ticket:** `create` und `append` (nicht `decide`) brauchen `--ticket <id>` und erlauben höchstens 3 Schreibvorgänge
je Ticket-ID (`113` und `#113` sind dasselbe Ticket). Der vierte Versuch endet mit Exitcode 4 und
`{"fehler":"…","limit":3,"ticket":"113","geschrieben":3}`. Lesen und Suchen zählen nicht, ein Duplikat oder ein
abgelehnter Schreibversuch auch nicht; ein Vorschlag zählt. Der Zähler liegt im Vault unter
`.bloommd/ticket-writes/<ticket>/` (je Schreibvorgang eine Datei, exklusiv angelegt) und gehört zum Vault-Backup. Er
ist auch bei parallelen Aufrufen genau.

**Fehler und Exitcodes:** Fehler stehen als `{"fehler":"…"}` auf stdout (ein falscher Aufruf zusätzlich mit
`"aufruf"`), die Meldung auf stderr. `0` ok, `1` Fehler (z. B. fehlendes Recht, Learning nicht gefunden), `2` Aufruf
(fehlende Pflichtfelder, ungültiger Pfad oder Pfad außerhalb von `Learnings/`), `3` Duplikat, `4` Limit.
`agent <befehl> --help` zeigt die Hilfe als Text.

**Rechte je Rolle:** Im Vault gelten die Rechte der einen `agent.json` für alle Rollen (siehe „Rechte“); `--name` ist
nur das Etikett im Protokoll und in `verified`. Eine Rolle, die nur lesen und eigene Learnings anlegen darf (tester),
lässt sich im Vault deshalb nur über die Bereiche `Learnings/<rolle>` und die Konvention trennen, mit `--cloud` über
Agent-Tokens mit eigenen Rechten.

## Änderungen nachvollziehen und zurücknehmen

```bash
bloommd-wiki agent log /data/learnings --limit 20          # Agent, Zeit, Werkzeug, Pfad, Änderungs-ID
bloommd-wiki agent undo /data/learnings <change-id>        # stellt den Stand davor wieder her
```

`undo` nimmt auch eine Änderung zurück, die ein Mensch freigegeben hat. Ein angelegtes Learning verschwindet
dabei wieder, eine geänderte Map erhält ihren vorherigen Stand. Das Protokoll liegt in
`/data/learnings/.bloommd/agent-log.jsonl`, die Vorgängerstände in `.bloommd/history/`. Beides gehört zum
Vault-Backup.

## Statischer Export für Menschen und den Chief of Staff

```bash
bloommd-wiki export /data/learnings /data/learnings-export --overwrite
```

- Erzeugt `index.html` (Wiki-Browser, ein Dokument, öffnet sich ohne Netz auch von `file://`), `wiki.json`
  (dieselben Daten maschinenlesbar) und eine Kopie der Maps (`Learnings/…`). `.bloommd/` (Rechte, Protokoll,
  Vorschläge) wird nie exportiert.
- Ohne `--overwrite` bricht der Befehl ab, wenn der Zielordner nicht leer ist. Mit `--overwrite` ersetzt er nur
  einen früheren Export (erkennbar an `wiki.json`); liegt dort etwas anderes, passiert nichts.
- Das Ergebnis ist deterministisch: gleicher Vault, gleiche Dateien.

Täglich erzeugt das Skript [`scripts/learnings-export.sh`](../scripts/learnings-export.sh) den Export
(`LEARNINGS_VAULT`, `LEARNINGS_EXPORT_DIR` und `BLOOMMD_WIKI_BIN` überschreiben die Vorgaben). Im Pod läuft es als
OpenClaw-Automation (der Pod hat keinen cron-Daemon); die Datei liegt dafür unter `/home/node/.openclaw/bin/`:

```bash
cp scripts/learnings-export.sh /home/node/.openclaw/bin/learnings-export.sh
openclaw cron add --name learnings-export --cron "30 3 * * *" --tz UTC \
  --command /home/node/.openclaw/bin/learnings-export.sh --timeout-seconds 300 --no-deliver
openclaw cron list          # Status; openclaw cron runs --id <id> zeigt den letzten Lauf
```

Das Ausliefern des Ordners (Webserver, Ingress) gehört nicht zu diesem Muster; ausgeliefert werden nur die
Dateien in `/data/learnings-export`. Der Export enthält Learnings als Klartext, also vor dem Veröffentlichen die
Zugriffsfrage klären.

## Wiederherstellung

1. **Einzelne Änderung falsch:** `agent log`, dann `agent undo <change-id>` (siehe oben), danach Export neu erzeugen.
2. **Vault beschädigt oder Volume verloren:** Volume aus dem Backup des Betriebs zurückspielen. Der Vault ist ein
   Ordner mit Markdown-Dateien plus `.bloommd/`; er braucht keine Datenbank und kein Neuaufsetzen. Danach
   `bloommd-wiki agent rights /data/learnings` prüfen und den Export neu erzeugen.
3. **Export verloren:** ist abgeleitet; mit dem Export-Befehl aus dem Vault neu erzeugen.
4. **Binary verloren:** wie oben neu bauen.

## Muster für eine weitere Brand

1. Eigenes Volume für den Vault im Pod mounten (Betrieb) und den Ordner für den Export bereitstellen.
2. Binary bauen und unter `/home/node/.openclaw/bin/` ablegen.
3. `agent setup … --access read --area Learnings=write`, Rechte prüfen.
4. Je Rolle einen MCP-Eintrag `bloommd-<rolle>` setzen, `openclaw mcp probe`.
5. Export-Skript und Automation einrichten.
6. Prüfen: Learning per MCP anlegen, mit einer anderen Rolle per `bloommd_search` finden, `agent log` ansehen,
   Export öffnen.

Zugangsdaten gibt es in diesem Muster nicht; legt niemand welche an, gehören sie auch nicht in die Learnings
(siehe „Verbote“ in [LEARNINGS.md](LEARNINGS.md)).
