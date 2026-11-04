# Löschkonzept: Fristen und Konto-Löschung (Entwurf, Ticket #199)

**Status: Entwurf, nicht freigegeben.** Rechtliche Prüfung und Freigabe liegen bei den Admins, ggf. bei einer
Rechtsberatung. Dieses Dokument beschreibt den **Ist-Zustand des Codes** (Stand: 4. November 2026) und
die Texte, die ihn öffentlich beschreiben: `/datenschutz`, Abschnitte „Speicherdauer und Löschung“ und
„Empfänger und Auftragsverarbeiter“ (je in `apps/app` und `apps/marketing`, DE und EN). Was ein Mensch
entscheiden muss, steht in Abschnitt 6.

## 1. Fristen

| Daten | Frist | Quelle im Code | Läuft über |
| --- | --- | --- | --- |
| Konten ohne bestätigte E-Mail-Adresse (samt Tokens) | 7 Tage nach Anlage | `apps/app/src/lib/unconfirmed-accounts.ts`, `BLOOMMD_UNCONFIRMED_ACCOUNT_RETENTION_DAYS` | `db:maintenance` |
| Aus der Warteliste vorbereitete, nie aktivierte Konten | 90 Tage nach der Aktivierungs-E-Mail | `apps/app/src/lib/waitlist-transfer-constants.ts` | `db:maintenance` |
| Auth-Tokens (E-Mail-Bestätigung, Passwort-Reset, Wartelisten-Aktivierung) | 7 Tage nach Ablauf oder Verbrauch | `apps/app/scripts/maintenance.ts` | `db:maintenance` |
| Sitzungen | 7 Tage nach Ablauf oder Widerruf | `maintenance.ts` | `db:maintenance` |
| Zugriffstoken | 30 Tage nach Ablauf oder Widerruf | `maintenance.ts` | `db:maintenance` |
| Zähler der Anfrage-Begrenzung (nur Hash) | 7 Tage nach letzter Änderung | `maintenance.ts` | `db:maintenance` |
| Gelöschte Dokumente (samt Revisionen, Share-Links) | 30 Tage nach dem Löschen, `BLOOMMD_DELETED_DOCUMENT_RETENTION_DAYS` | `maintenance.ts` | `db:maintenance` |
| Audit-Ereignisse | 365 Tage, `BLOOMMD_AUDIT_EVENT_RETENTION_DAYS` | `maintenance.ts` | `db:maintenance` |
| Stripe-Ereignisse | 180 Tage, `BLOOMMD_STRIPE_EVENT_RETENTION_DAYS` | `maintenance.ts` | `db:maintenance` (Billing ist aus, im öffentlichen Text nicht genannt) |
| Wartelisten-Einträge | 90 Tage nach der letzten Einladungs-E-Mail | `apps/marketing/src/lib/waitlist-retention.ts` | **manuell:** `bun run --cwd apps/marketing waitlist purge --apply` (verweigert vor Ablauf der Frist) |
| Feedback (Datenbank, Ticket, Anhänge im Objektspeicher) | **keine Löschung im Repo.** Anhänge bekommen `retention_expires_at` (Standard 90 Tage, `BLOOMMD_FEEDBACK_ATTACHMENT_RETENTION_DAYS`), es löscht sie aber nichts | `apps/app/src/app/api/feedback/feedback-handler.ts` | nichts |

Die Zahlen im öffentlichen Text sind die Standardwerte. `scripts/qa/legal-pages-consistency.test.ts`
prüft, dass Text und Code übereinstimmen.

## 2. Testaccount nach Ablauf

Ein abgelaufener Testaccount wird **nicht automatisch gelöscht**. Mit `BLOOMMD_TRIAL_READONLY=1` ist er nur
lesbar, der Export (`GET /api/account/export`) und das Löschen des Kontos bleiben möglich (`docs/TRIAL.md`).
Ohne den Schalter (Standard) ist das Konto weiter voll nutzbar. Konto und Inhalte bleiben bestehen, bis die
Nutzerin oder der Nutzer das Konto löscht. Die Texte beschreiben das so.

## 3. Konto-Löschung durch die Nutzer (`deleteAccountData`)

Auslöser: `/account` (E-Mail-Adresse und Passwort zur Bestätigung), Route `POST /api/account/delete`. Laufende
Stripe-Abonnements werden vorher gekündigt. Die Löschung wirkt sofort in einer Transaktion
(`apps/app/src/lib/db.ts`).

**Wird gelöscht** (Fremdschlüssel `on delete cascade` auf `bloom_users`): das Konto, Sitzungen, Auth-Tokens,
Zugriffstoken, mobile Anmeldecodes, Berechtigungen, Workspace-Mitgliedschaften, gespeicherte Ansichten, die
Hinweis-Mail-Protokolle, der persönliche Workspace samt Dokumenten, Revisionen und Share-Links, von der Person
angelegte Workspace-Agenten und Agenten-Aufträge und verschickte Workspace-Einladungen.

**Team-Workspaces im Eigentum der Person:** ohne weitere Mitglieder wird der Workspace samt Dokumenten gelöscht.
Mit weiteren Mitgliedern wird eines Eigentümer (Rolle `owner`, sonst `editor`, sonst das am längsten beigetretene
Mitglied); der Workspace bleibt bestehen. In Workspaces, die bestehen bleiben, behalten Dokumente der Person ihren
Inhalt, `created_by`, `updated_by` und `saved_by` werden leer (`on delete set null`).

**Bleibt bestehen:**

| Daten | Was passiert | Frist |
| --- | --- | --- |
| Audit-Ereignisse | Bezug zum Konto entfällt (`actor_user_id` leer), Eintrag bleibt | 365 Tage nach dem Ereignis |
| Zahlungsdatensätze (`bloom_subscriptions`) | `raw` wird geschwärzt, Stripe-Kundennummer entfernt, Bezug zum Konto entfällt | keine Frist im Code (Billing ist aus, es gibt keine) |
| Feedback (`bloom_feedback`) | Bezug zum Konto entfällt, `user_email` und Text bleiben; GitHub-Ticket und Anhänge bleiben | **keine Frist** |
| Wartelisten-Eintrag (Marketing-Datenbank, eigene Datenbank) | wird von der Konto-Löschung nicht berührt | 90 Tage nach der letzten Einladungs-E-Mail, manuell |

## 4. Was Ops vor dem Go einrichten muss

- `bun run --cwd apps/app db:maintenance` täglich planen (z. B. Kubernetes-CronJob mit dem App-Image und der
  Datenbank-Verbindung der App). Im Repo gibt es dafür keinen Zeitplan. Ohne ihn gelten die Fristen im Text nicht.
- `waitlist purge` (Marketing) nach Ablauf der 90 Tage von Hand ausführen oder planen.
- `BLOOMMD_TRIAL_READONLY=1` und `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` nur nach Admin-Go (`docs/TRIAL.md`).

## 5. Pflege

Alle Rechtsseiten gibt es zweimal (`apps/app/src/app/…` und `apps/marketing/src/app/…`). Jede Änderung gehört in
beide Apps und in DE und EN. `scripts/qa/legal-pages-consistency.test.ts` vergleicht die Abschnitte. Ändert sich
eine Frist im Code, ändert sich der Text im selben PR.

## 6. Offene Entscheidungen (Admins, ggf. Rechtsberatung)

Diese Punkte stehen bewusst **nicht** als Platzhalter im öffentlichen Text.

1. **Anwendbares Recht und Gerichtsstand** (AGB): nicht formuliert.
2. **Haftung** (AGB): nur der gesetzliche Mindeststandard (keine Beschränkung bei Vorsatz, grober Fahrlässigkeit,
   Personenschäden, Produkthaftungsgesetz; sonst gesetzliche Haftung). Ob bei leichter Fahrlässigkeit beschränkt wird
   (z. B. wesentliche Vertragspflichten), ist offen.
3. **Änderung der Bedingungen** (AGB): Entwurf „für die Zukunft, wesentliche Änderungen informieren wir vorab“. Verfahren
   (E-Mail, Zustimmung) ist nicht festgelegt und im Code nicht umgesetzt.
4. **Nutzungsrechte an Inhalten** (Einräumung für den Betrieb): nicht formuliert.
5. **Abgelaufene Testaccounts:** Es gibt keine automatische Löschung. Soll nach einer Inaktivitätsfrist gelöscht werden
   (Grundsatz der Speicherbegrenzung)? Wenn ja, wie lang, mit Vorwarnung?
6. **Feedback:** bleibt nach der Konto-Löschung mit E-Mail-Adresse und Text bestehen, ohne Löschfrist. Das Ticket bei GitHub
   enthält E-Mail-Adresse, Konto-ID, Nachricht, Seite, Browser und einen Link auf Anhänge. Zu klären: In welches Repository
   gehen die Tickets (`BLOOMMD_FEEDBACK_GITHUB_REPO`), ist es **privat**? Löschfrist für Datenbank, Ticket und Anhänge? Soll die
   Konto-Löschung die Feedback-Einträge anonymisieren? Wer löscht die Anhänge nach dem Ablaufdatum (Lifecycle-Regel im
   Objektspeicher oder Job)?
7. **Hosting:** Anbieter und Serverstandort sind aus dem Repo nicht belegt (der Store-Entwurf nennt Hetzner, das README erwähnt
   Hetzner-Deployments). Deshalb steht kein Hosting-Anbieter im Abschnitt „Empfänger und Auftragsverarbeiter“. Bitte bestätigen
   und ergänzen.
8. **Auftragsverarbeitung und Drittland:** Für Hosting, Resend, Sentry, Plausible (eigene Instanz, Betreiber klären), PostHog,
   GitHub und den Objektspeicher: Verträge nach Art. 28 DSGVO, Standort, Drittlandübermittlung. Aus dem Repo nicht belegbar,
   daher nicht im Text.
9. **Backups:** Aufbewahrung von Datensicherungen (Datenbank, Objektspeicher, Hosting) ist nicht belegt und nicht im Text.
   Wirkt sich auf die Aussage „sofort gelöscht“ aus.
10. **Impressum:** Die Telefonzeile entfällt, wenn `BLOOMMD_LEGAL_PHONE` leer, „-“ oder „Nicht angegeben“ ist. Gibt es neben der
    E-Mail-Adresse einen zweiten schnellen Kontaktweg (§ 5 DDG verlangt eine schnelle elektronische Kontaktaufnahme und
    unmittelbare Kommunikation)? Apple und Google verlangen für den Store-Eintrag (DSA-Händlerstatus) eine Telefonnummer
    (`packages/mobile/store/OWNER-CHECKLIST.md`); sie sollte mit dem Impressum übereinstimmen. Weitere Pflichtangaben
    (Register, USt-ID, Verantwortlicher) kommen aus `BLOOMMD_LEGAL_*`, Werte setzt Ops.
11. **Datenschutz, Lücken:** Die Feedback-Funktion ist nur im Löschabschnitt und im Empfängerabschnitt kurz genannt, nicht als
    eigener Abschnitt mit Zweck und Rechtsgrundlage. Rechtsgrundlagen sind weiter nur allgemein genannt.
12. **Store-Formulare:** Google Play „Data safety“ und Apple App Privacy erst nach den Entscheidungen zu 5 bis 9 ausfüllen
    (`packages/mobile/store/PRIVACY-ANSWERS.md`).
