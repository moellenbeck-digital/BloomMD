# Testaccount: 30 Tage, Hinweis-Mails, Sperre nach Ablauf (#274)

Der kostenlose Testaccount gilt 30 Tage ab E-Mail-Bestätigung. Die Texte dazu stehen in den
Datenschutzerklärungen (`apps/app` und `apps/marketing`, je `datenschutz/page.tsx`) und in den AGB. Fristen und Konto-Löschung: `docs/LOESCHKONZEPT.md`.

## Regeln

| Konto | Testende | Hinweis-Mails |
| --- | --- | --- |
| Neu (nach Migration `013` angelegt) | Bestätigung + 30 Tage, einmal gesetzt (`trial_ends_at`) | nach 15 und nach 23 Tagen |
| Bestand (alle Konten bei der Migration, auch frühere Wartelisten-Konten; `trial_legacy`) | fest 15.12.2026 00:00 UTC (Zählung ab 15.11.2026) | 30.11.2026 und 08.12.2026, nur mit eigenem Schalter |

- Alle Zeiten in UTC; die Berechnung ist rein in `apps/app/src/lib/trial.ts` (getestet, Grenzen Tag 14/15, 22/23, 29/30).
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
- Zahlende Konten (Stripe) sind nicht ausgenommen. Billing ist in M1 aus (`BLOOMMD_BILLING_ENABLED=0`); gäbe es dennoch zahlende Konten, müsste ihre Behandlung vor dem Einschalten entschieden werden.

## Rollout-Reihenfolge

1. Migration `013` anwenden: `bun run --cwd apps/app db:migrate` (ohne sie scheitert die Prod-App am Schema-Check). Sie ist idempotent und löscht nichts.
2. App ausrollen (beide Schalter aus). Neue Konten bekommen ab da Testende und Sprache.
3. Admin-Go einholen. Dann plant Ops den Job (zuerst Dry-Run prüfen, `heldBackExisting` und `dueByKind` ansehen), für Bestandskonten zusätzlich `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` setzen. Das globale Mailbudget (60/Stunde, 300/Tag) vorher gegen die Zahl der Bestandskonten rechnen.
4. `BLOOMMD_TRIAL_READONLY=1` erst nach Admin-Go und Absprache mit Ops, frühestens zum Testende.

## Für den Oberflächentest

Testsystem mit E2E-Outbox, Schalter nach Bedarf. Neues Konto registrieren und bestätigen, `/account` zeigt „Testzeitraum bis“ = Bestätigungstag + 30 Tage. Den Job mit `--jetzt` auf Bestätigung + 14, 15, 22, 23, 30 Tage laufen lassen (`--apply`): bei +15 und +23 je genau eine Mail im Outbox, bei +14/+22/+30 keine, ein zweiter Lauf zur selben Zeit keine. Zum Prüfen der Sperre `trial_ends_at` des Testkontos auf die Vergangenheit setzen und `BLOOMMD_TRIAL_READONLY=1` auf dem Dev-System setzen.
