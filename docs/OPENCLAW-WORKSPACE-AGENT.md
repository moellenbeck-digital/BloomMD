# Lokalen OpenClaw-Agenten mit einem Workspace verbinden

BloomMD benötigt keinen zentral gehosteten OpenClaw-Dienst. Jeder lokale OpenClaw-Agent kann sich als eigenes, widerrufbares Workspace-Mitglied paaren und baut ausschließlich ausgehend eine Verbindung zu BloomMD auf.

## Ablauf

1. Im Workspace unter **Agent beauftragen** einen Agenten hinzufügen.
2. Den einmaligen Pairing-Code sicher an den lokalen Agenten übergeben. Er gilt 15 Minuten und wird nach dem Einlösen ungültig.
3. Der Agent tauscht den Code gegen ein lokales Token aus. Dieses Token gehört in den lokalen Secret Store des Agenten, nie in Workspace-Dateien oder Git.
4. Der Agent fragt selbst nach offenen Aufträgen. BloomMD liefert höchstens einen ihm zugewiesenen Auftrag. Bei einem Knoten-Auftrag enthält der Kontext ausschließlich den ausgewählten Knoten (Titel, Pfad und Inhalt), nicht die gesamte Datei.
5. Der Agent sendet Ergebnis und optionalen Vorschlag zurück. Erst ein menschliches Workspace-Mitglied kann den Vorschlag anwenden.

## Produktintegration: OpenClaw-Plugin

BloomMD liefert den Runner und den dazugehörigen Skill als OpenClaw-Plugin aus. Damit muss keine
separate BloomMD-CLI dauerhaft laufen. Die Plugin-Commands leben innerhalb von OpenClaw. Der
normale Installationsweg lädt ein versioniertes Archiv von `https://bloommd.io/openclaw-plugin/latest.tgz`;
die Marketing-Route liefert ausschließlich ein veröffentlichtes GitHub-Release-Artefakt aus:

```bash
curl -fL https://bloommd.io/openclaw-plugin/latest.tgz \
  -o ~/Downloads/bloommd-openclaw-plugin.tgz
openclaw plugins install ~/Downloads/bloommd-openclaw-plugin.tgz \
  --force
```

Ein Checkout bleibt ausschließlich für Entwicklung gedacht:

```bash
openclaw plugins install --link ./plugins/openclaw --force
openclaw bloommd pair --server https://bloommd.app --bloommd-profile research \
  --pairing-code-file ./bloommd-pairing-code
```

Das Plugin bleibt nach der Installation zunächst deaktiviert. Erst nach Pairing und einer
expliziten Plugin-Konfiguration startet sein lokaler Runner. Eine ausgehende SSE-Verbindung weckt
ihn für eigene Aufträge sofort; ein 60-Sekunden-Poll ist ausschließlich ein Netzwerk-Fallback.
Ohne wartenden Auftrag startet er keinen Modell-Turn und verbraucht keine Modell-Tokens. Die
Oberfläche zeigt deshalb Zustände wie *gesendet*, *vom lokalen Agenten abgeholt*, *in Bearbeitung*,
*Vorschlag bereit* oder *nicht erreichbar*, niemals einen Cron-Job.

Für einen lokalen Entwicklungs-Checkout wird das Plugin bewusst verlinkt installiert:

```bash
openclaw plugins install --link ./plugins/openclaw --force
```

## Stabiler HTTP-Vertrag des Plugins

```bash
curl -X POST https://bloommd.app/api/agent/v1/pair \
  -H 'content-type: application/json' \
  --data '{"pairingCode":"bloom_pair_..."}'

curl -i -X POST https://bloommd.app/api/agent/v1/tasks/next \
  -H 'authorization: Bearer bloom_agent_...'

curl -X POST https://bloommd.app/api/agent/v1/tasks/<task-id>/result \
  -H 'authorization: Bearer bloom_agent_...' \
  -H 'content-type: application/json' \
  --data '{"summary":"Entwurf erstellt.","proposal":{"nodeContent":"Der neue Inhalt des ausgewählten Knotens.","rationale":"Struktur aus dem Auftrag übernommen."}}'
```

Mehrere Agenten können parallel in einem Workspace Mitglied sein. Jeder besitzt ein eigenes Token, sieht nur eigene Aufträge und kann einzeln widerrufen werden.

## Reproduzierbarer End-to-End-Test

Der lokale Test verwendet das offizielle OpenClaw-Image, zwei voneinander getrennte Agent-Workspaces und einen lokalen, deterministischen OpenAI-kompatiblen Modell-Stub. Der Stub entscheidet nur, welches Skill-Skript OpenClaw als `exec`-Tool aufruft – er kommuniziert selbst nie mit BloomMD.

```bash
bun run test:e2e:agent
```

Der Lauf startet kurzlebig PostgreSQL, BloomMD.app, BloomMD Sync, OpenClaw Agent A, OpenClaw Agent B und den Modell-Stub. Er prüft:

- einmaliges Pairing und lokale Token-Ablage;
- ausgehendes Echtzeit-Wakeup durch den Agenten statt eines zentralen `BLOOMMD_OPENCLAW_URL`-Pushs;
- Dokumentkontext nur für die eine zugewiesene Aufgabe;
- zwei getrennte Agenten: Agent B kann die Aufgabe von Agent A nicht beanspruchen;
- einen reviewbaren Vorschlag statt eines direkten Schreibens;
- menschliches Anwenden durch den Sync-Server inklusive Versionsfortschritt;
- Widerruf: das ehemalige Agent-Token erhält beim nächsten Poll HTTP 401.

Für Debugging bleiben die Container mit `BLOOMMD_E2E_KEEP_CONTAINERS=1 bun run test:e2e:agent` bestehen. Alle für den Test erzeugten Volumes werden sonst anschließend entfernt. Der Runner beendet einen blockierten Orchestrator nach 15 Minuten kontrolliert; für eine bewusst abweichende Diagnosezeit kann `BLOOMMD_AGENT_E2E_TIMEOUT_SECONDS` (30 bis 3600) gesetzt werden.

## Manueller Live-Abnahmetest mit Codex und OpenClaw

Der Docker-Test ersetzt keinen echten Modell- und Berechtigungsnachweis. Für diesen Test läuft
OpenClaw lokal mit dem persönlichen Codex-/OpenAI-Zugang; BloomMD bekommt weder Modellschlüssel noch
einen zentralen Agenten-Endpunkt.

### Vorbereitung

```bash
# Das Plugin enthält Runner und Skill.
openclaw plugins install --link ./plugins/openclaw --force

# Prüfen: Der lokale OpenClaw muss einen gültigen OpenAI-/Codex-Zugang anzeigen.
openclaw models status
```

### Durchlauf

1. In `https://bloommd.app` einen leeren Team-Workspace **Agent E2E** anlegen und einen Agenten
   mit eindeutigem Namen, etwa **OpenClaw Codex E2E**, hinzufügen.
2. Den einmaligen Code in eine lokale, nicht versionierte Datei schreiben und mit Modus `600`
   schützen, beispielsweise `~/.config/bloommd/pairing-code`.
3. Lokal über das installierte OpenClaw-Plugin pairen:

   ```bash
openclaw bloommd pair --server https://bloommd.app --bloommd-profile codex-e2e \
     --pairing-code-file ~/.config/bloommd/pairing-code
   rm ~/.config/bloommd/pairing-code
   ```

4. Im Workspace eine Aufgabe für genau diesen Agenten erstellen, deren Datei ein klar abgegrenztes,
   ungefährliches Testdokument ist. Beispiel: „Strukturiere diese kurze Testnotiz um und liefere
   nur einen Vorschlag.“
5. Den lokalen Runner in der OpenClaw-Plugin-Konfiguration aktivieren. Er ruft nur für eine
   wartende, eigene Aufgabe das Modell auf. OpenClaw erhält ausschließlich den im Auftrag
   autorisierten Knoten-Kontext und schreibt einen Vorschlag in eine temporäre Datei; das Plugin
   validiert und übermittelt ihn.

   ```json
   {
     "plugins": {
       "entries": {
         "bloommd-workspace-agent": {
           "enabled": true,
          "config": { "enabled": true, "profile": "codex-e2e", "openClawAgentId": "main", "pollIntervalSeconds": 60 }
         }
       }
     }
   }
   ```
6. In BloomMD prüfen: Der Task erscheint als Vorschlag; erst die menschliche Aktion **Anwenden**
   verändert die Datei. Prüfe danach die neue Dokumentversion und den Sync-Status.
7. Agent in BloomMD widerrufen und lokal prüfen, dass `openclaw bloommd status --bloommd-profile codex-e2e`
   den widerrufenen Zugang nicht weiter verwenden kann. Danach `openclaw bloommd forget --bloommd-profile codex-e2e` ausführen.

Der Nachweis ist bestanden, wenn der Vorschlag von einem echten OpenClaw-Turn mit echtem Modell
stammt, keine direkte Dateiänderung vor der menschlichen Freigabe erfolgt und das widerrufene Token
nicht mehr pollen kann.
