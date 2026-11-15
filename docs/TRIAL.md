# Testaccount: 30 Tage (Bestand 60 Tage), Hinweis-Mails, Sperre nach Ablauf (#274, #364, #378)

Der kostenlose Testaccount gilt 30 Tage ab E-Mail-Bestätigung; Bestandskonten bekommen 60 Tage (Ende 14.01.2027, #364). Die Texte dazu stehen in den
Datenschutzerklärungen (`apps/app` und `apps/marketing`, je `datenschutz/page.tsx`) und in den AGB. Fristen und Konto-Löschung: `docs/LOESCHKONZEPT.md`.

## Regeln

| Konto | Testende | Hinweis-Mails |
| --- | --- | --- |
| Neu (nach Migration `013` angelegt) | Bestätigung + 30 Tage, einmal gesetzt (`trial_ends_at`) | nach 15 und nach 23 Tagen |
| Bestand (alle Konten bei der Migration, auch frühere Wartelisten-Konten; `trial_legacy`) | fest 14.01.2027 00:00 UTC (Zählung ab 15.11.2026, 60 Tage; Migration `015`, vorher 15.12.2026) | 30.12.2026 und 07.01.2027 (Tag 45 und 53, vom Ende rückwärts: 15 und 7 Tage vorher), nur mit eigenem Schalter |

- Alle Zeiten in UTC; die Berechnung ist rein in `apps/app/src/lib/trial.ts` (getestet, Grenzen Tag 14/15, 22/23, 29/30; Bestand 44/45, 52/53, 59/60). Das Testende der Bestandskonten steht im Code nur in `LEGACY_TRIAL_ENDS_AT`; die Migration `015` und die Rechtstexte werden dagegen geprüft.
- Jede Hinweis-Mail geht höchstens einmal raus (Tabelle `bloom_trial_reminders`: erst beanspruchen, dann senden; ein fehlgeschlagener Versand gibt den Anspruch frei). Ein verspäteter Lauf sendet nur den letzten fälligen Hinweis, nie nach Testende.
- Kein Versand an unbestätigte Konten. Gelöschte Konten verlieren ihre Einträge per Cascade.
- Die Mails zählen gegen das globale Mailbudget (`AccountMailKind` `trial-reminder`); ist es aufgebraucht, hält der Lauf an, der nächste macht weiter.
- Ein Anspruch ohne `sent_at` (Lauf mitten im Senden gestorben) wird nicht wiederholt. Er zeigt sich im Dry-Run nicht; Ops sieht ihn mit `select * from bloom_trial_reminders where sent_at is null`.

## Schalter

| Variable | Standard | Wirkung |
| --- | --- | --- |
| `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` | aus | Der Job versendet auch die Hinweise an Bestandskonten. Ohne ihn zeigt der Dry-Run sie als `heldBackExisting`. Nur nach Admin-Go. |
| `BLOOMMD_TRIAL_READONLY=1` | aus | Konten mit abgelaufenem Testende sind nur lesbar (siehe unten). Nur nach Admin-Go und Absprache mit Ops. |

Neue Konten brauchen keinen eigenen Schalter. Beide Werte müssen genau `1` oder `0` sein, `release:check` lehnt anderes ab und meldet `BLOOMMD_TRIAL_READONLY=1` als Warnung.

## Der Job

```bash
bun run --cwd apps/app db:trial-reminders                       # Dry-Run (Standard): zählt, schreibt und sendet nichts
bun run --cwd apps/app db:trial-reminders --apply               # beansprucht und sendet
bun run --cwd apps/app db:trial-reminders --apply --limit 30    # höchstens 30 Mails (Budget für Anmeldungen frei lassen)
bun run --cwd apps/app db:trial-reminders --jetzt 2026-12-05T10:00:00Z   # Uhr dieses Laufs überschreiben (Tests)
```

Ausgabe: eine JSON-Zeile mit Zahlen (`due`, `dueByKind`, `heldBackExisting`, `mailSent`, `mailFailed`, `deferred`, `notClaimed`), keine Adressen. Exit 1 bei Fehlversand oder Abbruch durch das Budget. Er läuft nicht in `db:maintenance`; Ops plant ihn nach dem Admin-Go (täglich genügt).

`--jetzt` ändert nur die Uhr des Laufs. Auf einem Testsystem gehen Mails in das E2E-Outbox (`BLOOMMD_E2E_TEST_MODE=1`, `BLOOMMD_E2E_MAIL_OUTBOX=<Datei>`) oder an `delivered@resend.dev`. Nie mit `--apply` gegen die Produktionsdatenbank: ein zu einer erfundenen Zeit gesetzter Anspruch bleibt bestehen.

## Sperre nach Ablauf (`BLOOMMD_TRIAL_READONLY=1`)

- Eine zentrale Prüfung in `apps/app/src/proxy.ts` (`lib/trial-guard.ts`): jede schreibende Anfrage (alles außer GET/HEAD/OPTIONS) an `/api/…` eines Kontos, dessen `trial_ends_at` erreicht ist, wird mit 403, `code: "TRIAL_EXPIRED"` und einer Meldung auf Deutsch oder Englisch abgelehnt (`?lang=en` oder `Accept-Language`). Das gilt für Sitzung und Zugriffstoken. Neue Schreib-Routen sind ohne Zutun erfasst.
- Ausgenommen (`lib/trial-readonly.ts`): Anmeldung/Abmeldung (`/api/auth/`, `/api/mobile/`), Billing, interne Routen, Feedback, Konto löschen, Workspace verlassen, Zugriffstoken widerrufen, Link-Vorschau, Health/Config/Version.
- Der Sync-Ticket (`/api/sync-ticket`) wird nicht abgelehnt, sondern mit Berechtigung `read` ausgestellt: Dokumente lassen sich öffnen, nicht ändern. Eine schon offene Bearbeitungssitzung endet erst mit dem Ablauf ihres Tickets beim nächsten Verbindungsaufbau.
- Lesen und der Export (`GET /api/account/export`) bleiben. Es wird nichts gelöscht.
- Sichtbar: Hinweis in der App (unten eingeblendet) und auf `/account`. Auf `/account` steht außerdem „Testzeitraum bis TT.MM.JJJJ“, solange das Testende in der Zukunft liegt.
- Ohne Datenbank (Dateimodus, E2E-Bypass) gibt es kein Testende und keine Sperre.
- **Ausnahme: Konten mit aktivem Tarif (#378).** Sie bleiben nach Testende schreibbar, auch bei `BLOOMMD_TRIAL_READONLY=1`; Konten ohne Tarif bleiben wie oben nur lesbar. Das ist die Voraussetzung für das Billing (Entscheid #276, Tarif Cloud über Stripe).
  - **Aktiver Tarif** = das Konto hat in `bloom_entitlements` mindestens eine Zeile mit `active = true` und (`expires_at` leer oder in der Zukunft; genau jetzt zählt als abgelaufen). Die Tabelle schreibt `recordStripeSubscription` (`apps/app/src/lib/db.ts`); die Prüfung ist `hasActiveEntitlement(userId, now)`. Ein bestimmter Tarifname wird nicht geprüft: jeder aktive Eintrag genügt, der Tarif „Cloud“ braucht also keine weitere Änderung.
  - **Kündigung:** ein zum Periodenende gekündigtes Abo bleibt aktiv, bis `expires_at` (Periodenende) erreicht ist; danach ist das Konto wieder nur lesbar. Eine sofortige Kündigung (`canceled`) und **Zahlungsausfall** (`past_due` und andere Status außer `active`, `trialing`, `complete`, `paid`) setzen `active = false`: das Konto ist ab dem nächsten Schreibversuch wieder nur lesbar. Nichts wird gelöscht; zahlt das Konto wieder, ist es sofort wieder schreibbar.
  - **Eine Regel an einer Stelle:** `isTrialWriteLocked` in `apps/app/src/lib/trial-lock.ts` prüft erst das Testende und fragt den Tarif nur bei abgelaufenen Konten ab. Proxy-Guard, Sync-Ticket (Berechtigung `write` statt `read`) und der Hinweis in der App und auf `/account` nutzen sie gemeinsam; es gibt keine zweite Regel. Konten mit aktivem Tarif sehen den Sperr-Hinweis nicht.
  - **Fehlerverhalten unverändert:** schlägt die Abfrage fehl (Datenbank), blockiert der Guard nicht; die Route dahinter braucht die Datenbank ebenfalls und scheitert dort.

## Admin: Verlängerung und Freischaltung (#277)

Maßgeblich ist die Datenbank der Produkt-App (`bloom_users`). **Die Anbindung der Admin-App (`apps/cms`, #204) steht noch aus:** `apps/cms` hat eigene Felder (`trialEndsAt`, `trialGuarded`, `trialDaysOverride`) in einer eigenen Datenbank, die App liest sie nicht (sie ruft `/svc/v1` noch nicht auf). Eine Änderung dort wirkt heute nicht auf die App; ein Audit im CMS gibt es noch nicht (Folge von #204/#206). Bis zur Anbindung geht eine Verlängerung oder Freischaltung nur über das Operator-Kommando der App.

```bash
cd apps/app   # DATABASE_URL der Ziel-Datenbank gesetzt
bun run db:trial-admin --operator <kürzel> --konto <uuid> --um 30              # Testende: 30 Tage ab dem späteren von altem Ende und jetzt
bun run db:trial-admin --operator <kürzel> --konto <uuid> --bis 2027-02-01T00:00:00Z
bun run db:trial-admin --operator <kürzel> --konto <uuid> --entsperren         # bestehendes Konto verlässt die Postfach-Regel (trial_guarded = false)
bun run db:trial-admin --operator <kürzel> --adresse <e-mail> --freischalten [--tage 14]   # ein weiteres Testkonto für genau diese Adresse
# ohne --apply ist es ein Probelauf (zeigt die Änderung, schreibt nichts); mit --apply schreibt es
```

- **Kein Weg für Nutzer:** keine HTTP-Route, keine Oberfläche, kein Token. Nur wer die Datenbank erreicht, kann das Kommando ausführen. Ein Konto kann sein Testende und die Postfach-Regel nicht ändern; `src/lib/trial-self-service.test.ts` hält fest, dass keine Route die Felder schreibt und niemand außer dem Skript die Operator-Funktionen aufruft.
- **Verlängerung** (`--um`, `--bis`): nur später als das heutige Ende, in der Zukunft und höchstens 366 Tage voraus (`--um` höchstens 366 Tage). Die Hinweis-Mails folgen dem neuen Ende (15 und 23 Tage nach Start, also 15 und 7 Tage vor dem Ende): bereits versendete oder beanspruchte Hinweise, die zum neuen Ende noch nicht fällig sind, werden freigegeben und gehen zu ihrem neuen Termin einmal erneut raus; was beim neuen Ende schon fällig wäre, bleibt beansprucht, die Verlängerung löst also von sich aus keine Mail aus. Bestandskonten bekommen ihre Hinweise weiterhin nur mit `BLOOMMD_TRIAL_REMINDERS_EXISTING=1`.
- **Migration 015** und ein späteres `db:migrate` ändern nur Bestandskonten, deren Testende noch genau der Wert aus Migration 013 (15.12.2026) ist; ein vom Operator gesetztes Ende bleibt. Die Bestätigung setzt das Ende nur, wenn keines gesetzt ist (`coalesce`).
- **Weiteres Testkonto** (`--adresse … --freischalten`): hebt die Regel „ein bestätigtes Konto je Postfach“ (#289, `docs/ACCOUNT-ABUSE-PROTECTION.md`) für genau diese Adresse für `--tage` Tage auf (Standard 14, höchstens 90). Die Anmeldung findet dann keinen „bestätigten Zwilling“, und die Bestätigung nimmt das Konto aus der Regel (`trial_guarded = false`, also auch aus dem Unique-Index). Jede andere Schreibweise desselben Postfachs bleibt gesperrt. Gespeichert wird nur der SHA-256-Schlüssel der Adresse (Tabelle `bloom_trial_exceptions`, Migration `016`, kein Klartext). Die Ausnahme gilt nicht für den Wartelisten-Weg; ein dort angelegtes Konto gibt man mit `--entsperren` frei. Bis die Frist abläuft, kann die Adresse auch nach Löschen und erneutem Registrieren einen weiteren Testzeitraum starten.
- **Protokoll:** Jeder Lauf mit `--apply`, der etwas ändert, schreibt in derselben Transaktion ein Ereignis in `bloom_audit_events` (der vorhandene Audit der App): `trial.extended`, `trial.guard_released` oder `trial.exception_granted`. Zeitpunkt = `created_at`, `target_id` = Konto-ID, `details` = `operator`, `field`, `old`, `new` (bei Verlängerung zusätzlich `remindersReset`, bei der Ausnahme die ersten 12 Zeichen des Schlüssels). Ohne Konto handelt niemand: `actor_user_id` und `actor_agent_id` sind leer, der Operator steht in `details`. Keine Adresse im Protokoll und in der Ausgabe. Ein Lauf ohne Änderung (z. B. Konto schon entsperrt) schreibt nichts. Auslesen: `select created_at, event_type, target_id, details from bloom_audit_events where event_type like 'trial.%' order by created_at desc;`
- **Ausgabe:** eine JSON-Zeile (`mode`, `operator`, `event`, `accountId`, `field`, `oldValue`, `newValue`, `changed`, `applied`, `remindersReset`). Exit 1: Konto unbekannt; Exit 2: falsche Argumente.
- **Rollout:** `bun run --cwd apps/app db:migrate` legt die Tabelle an (Migration `016`); ohne sie scheitert der Schema-Check der Produktions-App.

## Rollout-Reihenfolge

1. Migration `013` anwenden: `bun run --cwd apps/app db:migrate` (ohne sie scheitert die Prod-App am Schema-Check). Sie ist idempotent und löscht nichts. Der Befehl wendet auch `015` an (siehe Schritt 2).
2. Migration `015` (`db/015_trial_legacy_60_days.sql`) vor dem Admin-Go anwenden (ebenfalls über `db:migrate`): sie setzt nur Bestandskonten, deren `trial_ends_at` noch 2026-12-15 ist, auf 2027-01-14 00:00 UTC. Von Hand geänderte Werte bleiben unberührt, nichts wird gelöscht, nichts wird versendet. Idempotent.
3. App ausrollen (beide Schalter aus). Neue Konten bekommen ab da Testende und Sprache.
4. Admin-Go einholen. Dann plant Ops den Job (zuerst Dry-Run prüfen, `heldBackExisting` und `dueByKind` ansehen), für Bestandskonten zusätzlich `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` setzen. Das globale Mailbudget (60/Stunde, 300/Tag) vorher gegen die Zahl der Bestandskonten rechnen.
5. `BLOOMMD_TRIAL_READONLY=1` erst nach Admin-Go und Absprache mit Ops, frühestens zum Testende. Zahlende Konten sind ausgenommen (siehe „Sperre nach Ablauf“, #378): vor dem Einschalten sicherstellen, dass das Billing deren `bloom_entitlements`-Zeilen schreibt, sonst gelten sie als Konten ohne Tarif.

## Für den Oberflächentest

Testsystem mit E2E-Outbox, Schalter nach Bedarf. Neues Konto registrieren und bestätigen, `/account` zeigt „Testzeitraum bis“ = Bestätigungstag + 30 Tage. Den Job mit `--jetzt` auf Bestätigung + 14, 15, 22, 23, 30 Tage laufen lassen (`--apply`): bei +15 und +23 je genau eine Mail im Outbox, bei +14/+22/+30 keine, ein zweiter Lauf zur selben Zeit keine. Bestandskonto (`trial_legacy`, Testende 2027-01-14 00:00 UTC; nur Testsystem, `BLOOMMD_TRIAL_REMINDERS_EXISTING=1`): `/account` zeigt „Testzeitraum bis 14.01.2027“; `--jetzt 2026-12-29T23:59:59Z` keine Mail, `2026-12-30T00:00:00Z` genau eine (Hinweis „noch 15 Tage“), `2027-01-06T23:59:59Z` keine weitere, `2027-01-07T00:00:00Z` genau eine („noch 7 Tage“), ab `2027-01-14T00:00:00Z` keine. Zum Prüfen der Sperre `trial_ends_at` des Testkontos auf die Vergangenheit setzen und `BLOOMMD_TRIAL_READONLY=1` auf dem Dev-System setzen.

Sperre mit und ohne Tarif (#378, Marke `@t378`), `BLOOMMD_TRIAL_READONLY=1`, zwei bestätigte Konten mit `trial_ends_at` in der Vergangenheit:

1. **Ohne Tarif:** Schreiben (z. B. `POST /api/workspaces` oder Speichern in der App) wird mit 403 und `code: "TRIAL_EXPIRED"` abgelehnt; `/account` und die App zeigen den Hinweis „Testzeitraum abgelaufen“; Lesen und `GET /api/account/export` gehen.
2. **Mit Tarif:** `insert into bloom_entitlements (user_id, feature, source, active, expires_at) values (<id>, 'cloud', 'test', true, null)` (oder `expires_at` in der Zukunft): Schreiben geht (201/200), `/account` und die App zeigen keinen Hinweis.
3. **Grenzen:** `active = false`, `expires_at` in der Vergangenheit oder genau jetzt → wieder gesperrt; `expires_at` leer → schreibbar.

Automatisiert: `bun run --cwd apps/app test:e2e:trial-readonly` (eigener Server, Postgres; Spec `e2e/trial-readonly-t378.spec.ts`, nicht Teil des CI-Jobs `full-e2e`) und `tests/integration/trial-lock-entitlement-db.integration.test.ts`.
