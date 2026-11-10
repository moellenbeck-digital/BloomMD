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

## Link-Vorschau: Limit je Client (#208)

`GET /api/link-preview` ruft im Auftrag des Aufrufers eine fremde URL ab und ist ohne Anmeldung erreichbar (app und marketing). Ohne Limit ließe sich die Route als begrenzter Outbound-Proxy missbrauchen. Das Limit wird **vor** dem Abruf geprüft: Eine abgelehnte Anfrage löst keinen ausgehenden Request aus.

| App | Wer | Zähler | Limit je Minute |
|---|---|---|---|
| app | anonym | Quelladresse | 30 |
| app | angemeldet (Sitzung oder Zugriffstoken) | Konto | 120 |
| app | angemeldet, zusätzlich | Quelladresse (getrennt vom anonymen Zähler) | 300 |
| marketing | alle (keine Anmeldung) | Quelladresse | 30 |

Die Werte stehen als `LINK_PREVIEW_RATE_LIMIT` in `apps/*/src/lib/link-preview-rate-limit.ts`. Das Fenster ist eine feste Minute (UTC). Das Einfügen eines Links im Editor oder die Demo sendet eine Anfrage je Link; das bleibt weit unter den Grenzen. Die 300 je Adresse für Angemeldete verhindern nur, dass eine Adresse viele Konten aufspannt; ein Büro oder Campus mit einer gemeinsamen Adresse bleibt damit nutzbar.

- **Antwort bei Überschreitung:** HTTP `429`, Body `{ "error": … }`, Header `Retry-After` (Sekunden bis zum Fensterende) und `Cache-Control: private, no-store`.
- **Fail-closed:** Lässt sich der Zähler nicht prüfen (z. B. Datenbankfehler), antwortet die Route mit `503` und ruft nichts ab. Die Ursache steht als `[BloomMD] Link preview rate limit unavailable` im Log.
- **Logging:** Je abgelehnter Anfrage eine JSON-Zeile per `console.warn`: `{"event":"rate-limit-exceeded","action":"link-preview","windowSeconds":60,"subject":"anonymous"|"account","key":"<16 Hex-Zeichen>"}`. `key` ist der Anfang des SHA-256 des Zählerschlüssels (Adresse bzw. Konto), keine Roh-IP, kein Konto, keine abgefragte URL. Wiederholte Verstöße erscheinen als wiederkehrender `key`; Alarm auf `"event":"rate-limit-exceeded"` mit `"action":"link-preview"` filtern. Der Hash ist nicht gesalzen: Eine IPv4-Adresse lässt sich daraus durch Durchprobieren zurückrechnen, das Log gehört also wie ein Zugriffslog behandelt.
- **Quelladresse:** In beiden Apps zählt dieselbe Regel wie bei der Registrierung (siehe oben): Geglaubt wird nur `BLOOMMD_TRUSTED_PROXY_HEADER`, sonst der **letzte** Eintrag von `x-forwarded-for`; fehlt der Header im Produktionsbuild, teilen sich alle Anfragen einen Schlüssel (`unattributed`, dann gilt das Limit für alle zusammen). Die marketing-App nahm bisher den **ersten** Eintrag und mehrere Header ungeprüft; das war vom Client wählbar und hätte das Limit aushebelbar gemacht. Sie nutzt jetzt dieselbe Funktion wie die app. **Ops:** `BLOOMMD_TRUSTED_PROXY_HEADER` muss auch für die marketing-App gesetzt werden, wenn der Proxy davor einen eigenen Header überschreibt (z. B. `cf-connecting-ip`); `release:check` der marketing-App warnt dafür nicht.
- **Zähler und Laufzeitmodell:** app: Tabelle `bloom_rate_limits` in der Datenbank (`DATABASE_URL`), ohne Datenbank ein Zähler im Speicher je Prozess. marketing: Tabelle `bloom_waitlist_rate_limits` in der Waitlist-Datenbank (`BLOOMMD_WAITLIST_DATABASE_URL`), die nur noch bis zum Abschluss der Waitlist gesetzt ist; ohne sie zählt marketing im Speicher je Prozess. **Einschränkung:** Der Speicher-Zähler gilt je Instanz und geht beim Neustart verloren; bei mehreren Instanzen vervielfacht sich das Limit entsprechend, und ohne gemeinsame Datenbank gibt es keinen Ausgleich. Unterstützt ist laut README eine einzelne Instanz, dann stimmt das Limit. (`replicas: 1` in `deploy/openclaw/kubernetes.yaml` betrifft den OpenClaw-Agenten, nicht die Web-Apps.) Mit E2E-Bypass (`BLOOMMD_E2E_AUTH_BYPASS`, nur Test) wird nicht gezählt.

## Bereinigung unbestätigter Konten

`bun run --cwd apps/app db:purge-unconfirmed` ist ein **Probelauf** und gibt nur Zahlen aus (Konten, Tokens, ältestes Anlagedatum). Löschen nur mit `--apply`; die Frist ändert `--days <n>`.

Gelöscht werden nur Passwort-Konten, die nie bestätigt wurden (also nie angemeldet waren), älter als die Frist sind und nichts besitzen: kein Zahlungskunde, kein Workspace, keine Mitgliedschaft, kein Zugriffstoken, keine versendete Workspace-Einladung. Alle anderen Tabellen verweisen mit `on delete cascade` oder `set null` auf das Konto. Offene Tokens werden mitgelöscht.

Einladungen **an** eine Adresse (Workspace-Einladung, Beta-Einladung) hängen an der Mailadresse und nicht am Konto. Sie bleiben gültig; wer sich nach der Löschung erneut registriert, kann sie annehmen. Eine Mitgliedschaft entsteht erst, nachdem sich jemand angemeldet hat, und das setzt eine bestätigte Adresse voraus. Ein unbestätigtes Konto kann also keine Mitgliedschaft haben; die Prüfung steht trotzdem in der Abfrage, falls sich das einmal ändert.

## Mehrfach-Testkonten (#277)

Eine Person soll mit Schreibweisen desselben Postfachs nicht mehrere Testzeiträume bekommen. Datensparsam: keine neue Datenquelle, niemand wird dauerhaft ausgeschlossen.

- **Kanonische Adresse** (`canonicalEmail`, `apps/app/src/lib/email-canonical.ts`): Kleinbuchstaben; `+tag` im Lokalteil entfällt (alle Domains); bei `gmail.com`/`googlemail.com` zusätzlich Punkte im Lokalteil weg und `googlemail.com` → `gmail.com`; andere Domains behalten ihre Punkte; ein sonst leerer Lokalteil bleibt unverändert. Gespeichert als generierte Spalte `bloom_users.email_canonical` (Migration `014_email_canonical.sql`, `db:migrate` vor dem Ausrollen). Sie rechnet dieselben Regeln in SQL; beide Stellen müssen zusammen geändert werden (der Integrationstest `mailbox-trial-db` prüft die Übereinstimmung).
- **Bestand:** Die Migration füllt alle Konten, ändert sonst nichts und scheitert nicht an alten Kollisionen. `trial_guarded` ist für Bestandskonten `false`, für neue `true`. Nur geschützte Konten werden bei der Bestätigung geprüft und liegen im partiellen Unique-Index `bloom_users_trial_canonical_idx` (kanonische Adresse, bestätigt, geschützt); der Index lässt sich deshalb auf beliebigen Daten anlegen.
- **Signup:** Gibt es ein *bestätigtes* Konto mit gleicher kanonischer, aber anderer Adresse, wird kein Konto angelegt und keine Mail gesendet (kein Mail-Budget); die Antwort ist dieselbe wie bei einer bereits bestätigten Adresse (`verification=sent`). Unbestätigte Konten blockieren nicht.
- **Bestätigung** (`markEmailVerified`, Waitlist-Aktivierung): Prüfung und Bestätigung sind ein SQL-Statement; kommen zwei Bestätigungen gleichzeitig, entscheidet der Unique-Index (zweite gilt als „duplicate-trial“). Das blockierte Konto bekommt keinen Testzeitraum und wird nicht bestätigt; die Person sieht eine verständliche Meldung. Audit-Ereignis `email.verification_blocked`.
- **Rate-Limit:** Das Konto-Limit des Signups zählt je kanonischer Adresse (weiter gehasht). Resend-Verification und Passwort-Reset unverändert.
- **Nicht abgedeckt:** Wegwerf-Domains, andere Postfächer derselben Person, Löschen und Neu-Registrieren (die Spalte verschwindet mit dem Konto, ein neues Konto startet einen neuen Testzeitraum).

## Gewählte Grenzwerte

- **60 Mails je Stunde, 300 je Tag** sind die Vorschlagswerte aus dem Ticket. Sie begrenzen den Schaden eines Angriffs mit vielen Adressen auf höchstens 300 Mails am Tag (Kosten und Absender-Ruf bei Resend), ohne die Limits je Konto (5 je Stunde) und je Quelladresse (20 je Stunde) zu ersetzen.
- Normalbetrieb der offenen Registrierung ist noch nicht gemessen. Ob die Werte passen, zeigt sich nach dem Rollout am `[ALERT]`-Eintrag und an den Zählern in `bloom_mail_budget`; Max kann sie mit den beiden Variablen anpassen.
- Die Fenster sind feste UTC-Stunden und UTC-Tage. Eine abgelehnte Anfrage verbraucht kein Budget.
- Die einmalige Aktivierungsmail der Waitlist-Übertragung (`db:transfer-waitlist`, #105) zählt gegen dasselbe Budget und konkurriert dort mit der Registrierung. Bei 60 Mails je Stunde reicht eine große Waitlist nicht in einem Lauf: Der Lauf hält an der Grenze an und meldet den Rest als `deferred`; mit `--limit <n>` bleibt Platz für Registrierungen. Neue Migration `011_waitlist_transfers.sql` (Tabelle `bloom_waitlist_transfers`) gehört ebenfalls vor den Rollout (`db:migrate`), sonst schlägt der Schema-Check der Produktions-App fehl.

## Testsysteme

Der Bypass im Produktionsbuild braucht `BLOOMMD_E2E_AUTH_BYPASS=1`, `BLOOMMD_E2E_TEST_MODE=1` **und** `BLOOMMD_LOCAL_DEPLOYMENT=1`. Das gilt auch für die Mail-Outbox (`BLOOMMD_E2E_MAIL_OUTBOX`). Ein Testsystem mit Produktionsbuild (z. B. `bloommd-test`) muss `BLOOMMD_LOCAL_DEPLOYMENT=1` zusätzlich bekommen, sonst bleibt der Bypass aus. `BLOOMMD_LOCAL_DEPLOYMENT=1` lenkt außerdem Formular-Weiterleitungen auf `NEXT_PUBLIC_APP_URL`; dort muss die URL des Testsystems stehen.

Die Hinweis-Mails des Testzeitraums zählen ebenfalls gegen dieses Mailbudget, siehe [TRIAL.md](TRIAL.md).
