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
`bloommd_update_map`, `bloommd_changes`, `bloommd_undo` u. a.).

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
