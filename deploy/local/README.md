# Lokaler Runtime-Stack

Postgres und Sync-Server in Docker, damit Collaboration gegen eine echte Datenbank prüfbar ist,
ohne von einer externen Datenbank oder vom Plattform-Cluster abzuhängen.

## Abgrenzung — bitte nicht verwechseln

| | Dieser Stack | Private Beta |
|---|---|---|
| Datenbank | Postgres-Container, bekanntes Default-Passwort | CloudNativePG-Cluster |
| TLS | `sslmode=disable`, Verbindung verlässt das Docker-Netz nie | `sslmode=require` oder `verify-full`, vom Release-Gate erzwungen |
| Erreichbarkeit | nur `127.0.0.1` | nur clusterintern |
| Zweck | Entwicklung, Review, Beta-Proben | echte Nutzerdaten |

Der Anwendungscode sieht keinen Unterschied — beides ist gewöhnliches PostgreSQL. Die Trennung
liegt deshalb hier, in der Datei, die man bewusst auswählen muss. Eine URL wie die aus diesem Stack
wird vom Release-Gate für Produktion abgelehnt, und das ist Absicht.

## Start

```bash
cp deploy/local/.env.example deploy/local/.env
# Beide Secrets erzeugen — sie haben bewusst keinen Default:
openssl rand -hex 32

docker compose -f deploy/local/docker-compose.yml up -d postgres sync
```

Schema anlegen und prüfen:

```bash
export DATABASE_URL="postgresql://bloommd:bloommd-local-dev@127.0.0.1:55432/bloommd?sslmode=disable"
bun run --cwd apps/app db:migrate
bun run --cwd apps/app db:verify
```

`db:verify` prüft nicht nur, ob Tabellen existieren, sondern auch die Isolationsgarantien:
Workspace-Trennung, gleichnamige Dateien in verschiedenen Workspaces, optimistische Versionierung,
Session- und Token-Widerruf.

Die Web-App läuft normalerweise nebenher über `bun dev` mit Hot Reload. Wer sie im Container
braucht:

```bash
docker compose -f deploy/local/docker-compose.yml --profile full up -d
```

## Ports

Der Host-Port für Postgres ist **55432**, nicht 5432. Auf den meisten Entwicklungsrechnern läuft
dort bereits eine lokale PostgreSQL-Instanz, und ein Stack, der beim ersten Klonen nicht startet,
ist ein schlechter Einstieg. Überschreibbar über `POSTGRES_PORT`.

## Sync-Persistenz bei Datenbankstörungen

Der Sync-Dienst wiederholt nur Fehler, bei denen der Storage-Adapter nachweislich **noch keinen**
Schreibvorgang gestartet hat. Die Grenzen `SYNC_PERSIST_RETRY_*` steuern Anzahl, Backoff und
Gesamtdauer. `SYNC_PERSIST_SAVE_TIMEOUT_MS` begrenzt einen einzelnen Speicherversuch (Standard:
15 Sekunden). Ein Timeout kann nach einem erfolgreichen Datenbank-Commit eintreten; BloomMD prüft
deshalb die eindeutige Operation und wiederholt ihn nie blind.

## Kontrollierter Sync-Shutdown

Bei `SIGTERM` oder `SIGINT` nimmt der Sync-Dienst keine neuen Räume, WebSocket-Nachrichten oder
internen Dokumentmutationen mehr an. Bestehende Clients werden mit WebSocket-Code `1012` getrennt;
anschließend erhält jeder aktive Raum bis zu `SYNC_SHUTDOWN_TIMEOUT_MS` (Standard: 20 Sekunden)
für einen finalen Flush. Ein einzelner hängender Raum blockiert die übrigen nicht. Nicht bestätigte
oder abgelaufene Flushes werden mit einem nur pro Prozess nutzbaren, gehashten Raumkontext
protokolliert und beenden den Prozess mit Exit-Code `1`.

`/health` bleibt währenddessen für Liveness-Prüfungen erreichbar und meldet `status: "draining"`.
`/ready` liefert während des Drains oder bei einer degradierten Persistenz `503`; ein Router darf
deshalb keine neue Collaboration-Verbindung mehr auf diese Replica schicken. Die Compose-Datei gibt
dem Container 30 Sekunden Grace-Period und damit bewusst mehr Zeit als dem eigentlichen Flush.

## Sync-Metriken und datensparsame Logs

Der Sync-Container schreibt strukturierte JSON-Events. Sie enthalten nur technische Operation,
Ergebnis, Dauer, Retry-Nummer, Fehlerklasse und einen pro Prozess gehashten Raumkontext – nie
Dateiname, Pfad, Markdown, Nutzer- oder Tokenwerte. Für einen lokalen Abruf der aggregierten
Prometheus-Metriken nutze den Sync-Secret-Header:

```bash
curl -H "Authorization: Bearer $BLOOMMD_SYNC_SECRET" http://localhost:4100/metrics
```

In der Hosted-Umgebung bleibt `/metrics` im internen Netz; die Ausgabe enthält ausschließlich
globale Zähler, Gauges und Dauer-Summen ohne Labels.

## Verifiziert am 2026-08-09

- `docker compose up -d postgres sync` startet reproduzierbar; beide Healthchecks werden grün
  (Postgres nach ~8 s, Sync nach ~2 s).
- `db:migrate` und `db:verify` laufen gegen den Container durch, alle 15 Schema-Garantien bestehen.
- `/health` des Sync-Servers antwortet mit `{"status":"ok",...}`.
- Nach vollständigem `docker compose down` und erneutem Start sind alle 14 Tabellen und eine
  Testzeile weiterhin vorhanden — das Volume persistiert.

## Aufräumen

```bash
docker compose -f deploy/local/docker-compose.yml down          # Container weg, Daten bleiben
docker compose -f deploy/local/docker-compose.yml down -v       # Daten ebenfalls löschen
```
