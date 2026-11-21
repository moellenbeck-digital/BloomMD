# Runbook: Warteliste löschen (Job `waitlist purge-due`)

Ticket #166. Die Warteliste ist geschlossen (die Registrierung ersetzt sie). Ihre Daten werden **90 Tage nach der
letzten Einladungs-E-Mail** gelöscht (`apps/marketing/src/lib/waitlist-retention.ts`, Text in `/datenschutz`).
Dieses Runbook beschreibt, wie Ops das Löschen täglich plant, ohne dass der Job bis zum Fristende als Fehler
gemeldet wird. Ob und wann der Job auf Prod läuft, entscheidet der Chief of Staff mit Ops.

## Der Befehl

```bash
bun run --cwd apps/marketing waitlist purge-due [--apply]
```

- Nutzt dieselbe Prüfung und dieselbe Löschung wie `purge` (`waitlistPurgeStatus`, `evaluateWaitlistPurge`,
  `purgeWaitlist`); es gibt keine zweite Löschlogik. Die Prüfung läuft zusätzlich in `purgeWaitlist` selbst.
- **Ohne `--apply`** löscht er nie, er meldet nur. **Mit `--apply`** löscht er alle Einträge, aber nur, wenn
  die Prüfung es erlaubt.
- Ein Löschverbot ist ein normales Ergebnis, kein Fehler: Exit 0, nichts gelöscht. Ebenso eine leere Liste.
- Exit ≠ 0 nur bei echten Fehlern: `BLOOMMD_WAITLIST_DATABASE_URL` fehlt (Exit 2), unbekannte Option (Exit 2),
  Datenbank nicht erreichbar oder Abfrage fehlgeschlagen (Exit 1, Meldung auf stderr).
- Ausgabe auf stdout: genau eine JSON-Zeile, ohne Adressen.

```json
{"mode":"apply","total":120,"notInvited":0,"allowed":false,"reason":"retention-running","allowedFrom":"2027-02-19T09:30:00.000Z","deleted":0}
```

| Feld | Bedeutung |
| --- | --- |
| `mode` | `dry-run` oder `apply` |
| `total` | Einträge in der Tabelle vor dem Lauf |
| `notInvited` | bestätigte, nicht abgemeldete Adressen ohne Einladung |
| `allowed` | ob gelöscht werden darf |
| `reason` | `retention-running` (Frist läuft), `invitation-pending` (Einladung offen), `no-invitation-sent` (noch keine gesendet), `retention-over` (Frist abgelaufen), `empty-list` (nichts zu löschen) |
| `allowedFrom` | Ende der Frist (ISO, UTC), nur bei `retention-running`, sonst `null` |
| `deleted` | gelöschte Einträge dieses Laufs |

Die Zeiten sind UTC; die Zeile ist für Maschinen, nicht für die Anzeige.

## Einrichten

- **Zeitplan:** täglich, z. B. 04:00 Uhr (Europe/Berlin).
- **Image:** das Marketing-Image (`FROM … AS marketing` im `Dockerfile`), es enthält `apps/marketing/scripts/waitlist.ts`.
  Befehl des Containers (statt `start`): `bun run --cwd apps/marketing waitlist purge-due --apply`.
- **Umgebung:** nur `BLOOMMD_WAITLIST_DATABASE_URL` (die Datenbank der Warteliste). Der Job braucht weder
  E-Mail-Schlüssel noch die App-Datenbank. Kubernetes: `restartPolicy: Never`, `concurrencyPolicy: Forbid`.
- Der Job ist dauerhaft grün. Rot heißt: Datenbank oder Variable (siehe unten).

Reihenfolge beim ersten Einrichten:

1. **Stand ansehen:** `bun run --cwd apps/marketing waitlist count` (bestätigt, offen, abgemeldet, gesamt).
2. **Dry-Run:** `bun run --cwd apps/marketing waitlist purge-due`. Erwartet vor Fristende `allowed:false` mit
   `reason:"retention-running"` und `allowedFrom`; vor der Einladung `no-invitation-sent` bzw.
   `invitation-pending`. Passt das nicht zur Erwartung, nicht weitermachen.
3. **Job mit `--apply` planen.** Ab da löscht er am ersten Tag, an dem die Prüfung es erlaubt, ohne weitere Handarbeit.

## Ergebnis prüfen

Nach dem Lauf, der gelöscht hat (`allowed:true`, `deleted` > 0 im Log des Jobs):

```bash
bun run --cwd apps/marketing waitlist count   # gesamt: 0
```

Ein weiterer Lauf meldet `reason:"empty-list"`, `total:0`, `deleted:0`.

## Danach aufräumen

Reihenfolge einhalten:

1. **Job entfernen** (CronJob löschen).
2. **Erst dann** `BLOOMMD_WAITLIST_DATABASE_URL` aus der Marketing-Umgebung nehmen. Ohne Variable läuft der
   Job mit Exit 2 und würde rot melden; ohne Job schadet das Entfernen nichts.

## Fehlerbilder

| Bild | Ursache | Was tun |
| --- | --- | --- |
| Exit 2, `BLOOMMD_WAITLIST_DATABASE_URL fehlt.` | Variable nicht im Job gesetzt | Variable am CronJob setzen |
| Exit 1, `purge-due fehlgeschlagen: …` | Datenbank nicht erreichbar, Netz, Zugang | Datenbank und Zugang prüfen; der nächste Lauf versucht es erneut |
| `reason:"invitation-pending"` lange nach der Einladung | bestätigte Adressen ohne Einladung | Chief of Staff fragen: `invite --apply` oder `mark-transferred --apply` (Hinweise in `waitlist --help`); der Job löscht nichts, solange jemand offen ist |
| `reason:"no-invitation-sent"` | es wurde noch keine Einladung gesendet (`invite --apply` oder `mark-transferred --apply` fehlt noch) | Chief of Staff fragen; die Frist rechnet ab der **letzten** Einladungsmail |
| Frist soll sich ändern | — | nicht hier: Konstante, `/datenschutz` und Einladungsmail ändern sich gemeinsam (`waitlist-retention.ts`) |

Siehe auch `docs/LOESCHKONZEPT.md` (Fristen und Ops-Aufgaben).
