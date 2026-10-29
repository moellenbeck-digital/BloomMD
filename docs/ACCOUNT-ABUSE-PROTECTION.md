# Spamschutz für die offene Registrierung

Betriebshinweise zu Ticket #169 (Teil C2 von Epic #162, Rollout-Gate für Teil B). Der Code liegt in
`apps/app`; hier steht, was Ops vor und nach dem Rollout einstellen muss. Das Einrichten selbst ist
Sache von Ops und Max, nicht des Entwicklungsteams.

## Was der Code tut

| Schutz | Wirkung | Konfiguration |
|---|---|---|
| Vertrauenswürdige Quelladresse | Limits je Quelladresse zählen nach einem Header, den der Angreifer nicht wählen kann | `BLOOMMD_TRUSTED_PROXY_HEADER` |
| Globale Mail-Obergrenze | Bestätigungs- und Reset-Mails je Stunde und je Tag insgesamt begrenzt; Zähler in der Datenbank | `BLOOMMD_MAIL_HOURLY_LIMIT` (60), `BLOOMMD_MAIL_DAILY_LIMIT` (300) |
| Bereinigung | Unbestätigte Konten nach 7 Tagen samt Tokens gelöscht | `BLOOMMD_UNCONFIRMED_ACCOUNT_RETENTION_DAYS` (7) |
| Bypass fail-closed | Der Test-Login-Bypass gilt im Produktionsbuild nur mit drei Variablen zugleich | nie in Produktion setzen |

## Rollout-Reihenfolge

1. `bun run --cwd apps/app db:migrate` (neue Tabelle `bloom_mail_budget`, Migration `010_account_mail_budget.sql`). Ohne sie schlägt der Schema-Check der Produktions-App fehl.
2. `bun run --cwd apps/app release:check` mit der Produktions-Umgebung. Er bleibt Pflicht und lehnt `BLOOMMD_E2E_AUTH_BYPASS`, `BLOOMMD_E2E_TEST_MODE`, `BLOOMMD_E2E_MAIL_OUTBOX` und `BLOOMMD_LOCAL_DEPLOYMENT=1` ab. Er warnt, wenn `BLOOMMD_TRUSTED_PROXY_HEADER` fehlt, und lehnt einen ungültigen Namen oder ungültige Mail-Limits ab.
3. Deployen, danach `GET /api/health/ready` prüfen: Das Feld `warnings` darf `BLOOMMD_TRUSTED_PROXY_HEADER` nicht mehr nennen.

## Einstellungen außerhalb des Codes (Ops/Max)

- **Proxy:** Der Proxy vor der App muss den gewählten Header selbst setzen und Werte des Clients überschreiben (z. B. `cf-connecting-ip` bei Cloudflare). Dann denselben Namen in `BLOOMMD_TRUSTED_PROXY_HEADER` eintragen. Ohne die Variable gilt der **letzte** Eintrag von `x-forwarded-for`; das stimmt nur hinter genau einem Proxy. Fehlt der maßgebliche Header ganz, zählen alle solchen Anfragen unter einem gemeinsamen Schlüssel (strenger, aber sicher); die App schreibt dann einmal pro Prozess eine Warnung ins Log.
- **Mailanbieter (Resend):** Sende-Limit und Alarm dort zusätzlich setzen. Die Obergrenze der App ist die erste, nicht die einzige Sperre.
- **Alarm:** Bei erreichter Obergrenze schreibt die App eine Zeile mit `[BloomMD][ALERT] Global account mail limit reached` ins Log (höchstens einmal pro Minute und Prozess, ohne Mailadresse). Auf diese Zeichenkette sollte der Log-Alarm filtern.
- **Wartungsjob einhängen:** Die Bereinigung läuft im Job `bun run --cwd apps/app db:maintenance` (mit `DATABASE_URL`), der auch abgelaufene Tokens, Sitzungen und Rate-Limit-Zeilen entfernt. Im Repository gibt es dafür keinen Zeitplan. Empfehlung: täglich, z. B. als Kubernetes-CronJob mit dem App-Image und derselben Datenbank-Verbindung wie die App. Die Ausgabe ist ein JSON mit Zählern (`deletedUnconfirmedAccounts`), ohne Adressen.

## Bereinigung unbestätigter Konten

`bun run --cwd apps/app db:purge-unconfirmed` ist ein **Probelauf** und gibt nur Zahlen aus (Konten, Tokens, ältestes Anlagedatum). Löschen nur mit `--apply`; die Frist ändert `--days <n>`.

Gelöscht werden nur Passwort-Konten, die nie bestätigt wurden (also nie angemeldet waren), älter als die Frist sind und nichts besitzen: kein Zahlungskunde, kein Workspace, keine Mitgliedschaft, kein Zugriffstoken, keine versendete Workspace-Einladung. Alle anderen Tabellen verweisen mit `on delete cascade` oder `set null` auf das Konto. Offene Tokens werden mitgelöscht.

Einladungen **an** eine Adresse (Workspace-Einladung, Beta-Einladung) hängen an der Mailadresse und nicht am Konto. Sie bleiben gültig; wer sich nach der Löschung erneut registriert, kann sie annehmen. Eine Mitgliedschaft entsteht erst, nachdem sich jemand angemeldet hat, und das setzt eine bestätigte Adresse voraus. Ein unbestätigtes Konto kann also keine Mitgliedschaft haben; die Prüfung steht trotzdem in der Abfrage, falls sich das einmal ändert.

## Gewählte Grenzwerte

- **60 Mails je Stunde, 300 je Tag** sind die Vorschlagswerte aus dem Ticket. Sie begrenzen den Schaden eines Angriffs mit vielen Adressen auf höchstens 300 Mails am Tag (Kosten und Absender-Ruf bei Resend), ohne die Limits je Konto (5 je Stunde) und je Quelladresse (20 je Stunde) zu ersetzen.
- Normalbetrieb der offenen Registrierung ist noch nicht gemessen. Ob die Werte passen, zeigt sich nach dem Rollout am `[ALERT]`-Eintrag und an den Zählern in `bloom_mail_budget`; Max kann sie mit den beiden Variablen anpassen.
- Die Fenster sind feste UTC-Stunden und UTC-Tage. Eine abgelehnte Anfrage verbraucht kein Budget.

## Testsysteme

Der Bypass im Produktionsbuild braucht `BLOOMMD_E2E_AUTH_BYPASS=1`, `BLOOMMD_E2E_TEST_MODE=1` **und** `BLOOMMD_LOCAL_DEPLOYMENT=1`. Das gilt auch für die Mail-Outbox (`BLOOMMD_E2E_MAIL_OUTBOX`). Ein Testsystem mit Produktionsbuild (z. B. `bloommd-test`) muss `BLOOMMD_LOCAL_DEPLOYMENT=1` zusätzlich bekommen, sonst bleibt der Bypass aus. `BLOOMMD_LOCAL_DEPLOYMENT=1` lenkt außerdem Formular-Weiterleitungen auf `NEXT_PUBLIC_APP_URL`; dort muss die URL des Testsystems stehen.
