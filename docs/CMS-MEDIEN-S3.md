# CMS-Medien im S3-Speicher

Das CMS (`apps/cms`) legt die Dateien der Collection `media` (Bilder für Blog und News) in einem privaten S3-Bucket bei Hetzner ab ([ADR 0001](adr/0001-payload-cms.md), Abschnitt 2). Der lokale Ordner bleibt nur als Fallback für die Entwicklung.

## Umschalten

Der Speicher wird allein über fünf Umgebungsvariablen gewählt (Werte kommen im Cluster aus 1Password und External Secrets, nie aus dem Repository):

| Variable | Bedeutung |
|---|---|
| `CMS_S3_BUCKET` | Name des Buckets (nur Medien) |
| `CMS_S3_ENDPOINT` | Endpoint des S3-Dienstes als URL (Hetzner Object Storage, lokal MinIO) |
| `CMS_S3_REGION` | Region für die Signatur |
| `CMS_S3_ACCESS_KEY` | Access-Key |
| `CMS_S3_SECRET_KEY` | Secret-Key |

- **Alle fünf gesetzt:** Medien liegen im Bucket. Der Dienst spricht den Bucket mit `forcePathStyle` an (nötig für Hetzner und MinIO); ein lokaler Ordner wird nicht gebraucht.
- **Keine gesetzt:** Medien liegen im lokalen Ordner (`CMS_MEDIA_DIR`, Standard `./media`) wie bisher. Er überlebt keinen Pod-Neustart und ist nur für die Entwicklung gedacht.
- **Teilweise gesetzt:** Der Start bricht ab (`runtimeConfigErrors` in `src/lib/env.ts`). Die Meldung nennt nur die Namen der fehlenden Variablen, nie Werte. Ein ungültiger Endpoint oder Platzhalter-Schlüssel (`replace`, `placeholder` …) bricht ebenfalls ab.

Das Datenbankschema ist in beiden Betriebsarten gleich (Migration `media_s3_fields`: Spalten `prefix` und `_objectkey` an `media`), ein Wechsel braucht keine eigene Migration. Bereits lokal abgelegte Dateien werden beim Wechsel **nicht** in den Bucket übertragen.

## Zugriff

- **Der Bucket ist privat:** kein öffentlicher Zugriff, kein ACL-Eintrag, kein öffentliches Präfix, keine vorsignierten Download-Links, keine Direkt-Uploads vom Browser.
- **Zugriff nur über das CMS:** Dateien werden über `/api/media/file/<name>` ausgeliefert, mit den Access-Funktionen der Collection und dem Guard vor `/api` (`lib/rest-guard.ts`). Wie veröffentlichte Medien den Browser erreichen, ist weiter offen (ADR 0001, O11).
- **Eigener Schlüssel:** Der Zugangsschlüssel gilt nur für diesen Bucket und hat kein Recht auf andere Buckets (ADR 0001, Abschnitt 2). Nur das CMS schreibt.
- **Keine Zugangsdaten in Code, Logs, Fehlermeldungen oder Testausgaben.** `apps/cms/.env.example` enthält nur Platzhalter.

## Bereitschaft

`GET /svc/v1/health/ready` prüft mit S3 den Bucket (`HeadBucket`, 3 s Timeout) statt des lokalen Ordners. Die Antwort bleibt `{ "ready": true }`; bei Fehler `503 { "ready": false }`, ohne Details und ohne Zugangsdaten.

## Tests

- Unit-Tests (`src/lib/env.test.ts`, `src/lib/media-storage.test.ts`): keine Variablen = lokal, alle = S3, teilweise = Startfehler ohne Werte.
- Beleg gegen einen echten S3-Dienst: `src/testing/svc.db.test.ts` (Block „media in S3 (MinIO)“) lädt ein PNG über Payload hoch, liest es aus dem Bucket zurück und prüft, dass das Objekt nach dem Löschen weg ist; außerdem `503` ohne Details bei unerreichbarem Bucket. In der CI läuft MinIO als Service im Job `verify` (Image per Digest gepinnt, Bucket je Lauf). Lokal überspringt sich der Block, wenn `BLOOMMD_TEST_S3_ENDPOINT` fehlt; zum Lauf setzen: `BLOOMMD_TEST_S3_ENDPOINT`, `BLOOMMD_TEST_S3_ACCESS_KEY`, `BLOOMMD_TEST_S3_SECRET_KEY` (optional `BLOOMMD_TEST_S3_REGION`) zusammen mit `BLOOMMD_TEST_DATABASE_URL`.
