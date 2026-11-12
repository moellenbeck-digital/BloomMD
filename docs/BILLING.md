# Billing „Cloud“ mit Stripe (#379)

Stand: Verhalten von `main` nach #386. Das Dokument beschreibt nur, was der Code tut. Zusagen zu Widerruf oder Rückerstattung sind
nicht Teil des Codes; die öffentlichen Texte dazu und ihre offenen Rechtsfragen stehen im Abschnitt „Rechtstexte (#381)“.

## Tarif

- Ein einziger bezahlter Tarif **Cloud** (`tier=cloud`) als Stripe-Abo: **6 EUR/Monat** (`interval=monthly`) oder **60 EUR/Jahr** (`interval=annual`).
  Definition: `apps/app/src/lib/billing.ts`.
- Keine Lifetime-Option, kein Studienrabatt, keine Promo-Codes (`allow_promotion_codes=false`). Die Tarife `pro-*`, `lifetime` und
  `sync-monthly` gibt es nicht mehr; ein unbekannter Tarif oder ein fehlendes Intervall endet in `/?billing=unknown-plan#pricing`.

## Checkout (`POST /api/billing/checkout`)

- Rechnungsadresse ist Pflicht (`billing_address_collection=required`), die USt-IdNr. kann im Checkout angegeben werden
  (`tax_id_collection`), Stripe Tax berechnet die USt (`automatic_tax`).
- Bei einem bestehenden Stripe-Kunden werden Name und Adresse aus dem Checkout am Kunden gespeichert (`customer_update`).
- `tier` und `interval` stehen als Metadaten auf Session und Abo.

## Schalter und Schlüssel

- Alle Billing-Routen (`checkout`, `portal`, `webhook`) antworten **404**, solange `BLOOMMD_BILLING_ENABLED` nicht `1` ist.
- Bei `BLOOMMD_BILLING_ENABLED=1` verlangt die Prod-Konfigurationsprüfung (`production-config.ts`): `STRIPE_SECRET_KEY` (live),
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CLOUD_MONTHLY`, `STRIPE_PRICE_CLOUD_ANNUAL`. Die Werte gehören nicht in dieses Repository.

## Entitlement und Webhook (`POST /api/billing/webhook`)

`checkout.session.completed` und `customer.subscription.created|updated|deleted` schreiben über `recordStripeSubscription` ein Entitlement mit
Feature `cloud`. Aktiv ist es bei Status `active`, `trialing`, `complete` oder `paid`; jeder andere Status (z. B. `past_due`, `unpaid`, `canceled`) setzt es inaktiv.
Zahlende Konten bleiben nach Testende schreibbar (`docs/TRIAL.md`).

## Kündigung

- **Durch den Kunden:** Konto → „Rechnungen und Abo verwalten“ öffnet das Stripe-Kundenportal (`POST /api/billing/portal`). Die Kündigung selbst
  geschieht in Stripe; ob sie zum Periodenende oder sofort wirkt, bestimmt die Konfiguration des Kundenportals im Stripe-Dashboard, nicht der Code.
  Ohne Stripe-Kunden am Konto leitet die Route auf `/account?billing=no-stripe-customer` zurück.
- **`cancel_at_period_end=true`** (Kündigung zum Periodenende): Das Abo bleibt `active`, das Entitlement bleibt aktiv und läuft zum Periodenende
  (`current_period_end`) aus. `/account` zeigt „Kündigung zum Periodenende vorgemerkt“.
- **`canceled`** (Abo beendet, auch sofortige Kündigung; Event `customer.subscription.deleted`): Das Entitlement wird sofort inaktiv, bei eingeschalteter Lesesperre (`BLOOMMD_TRIAL_READONLY=1`) ist das Konto nach Testende wieder nur lesbar.
- **Konto-Löschung** (`POST /api/account/delete`): Laufende Abos (Status `active`, `trialing`, `past_due`, `unpaid`, `paused`) werden vorher über
  `cancelStripeSubscriptions` bei Stripe beendet. Schlägt das fehl, wird das Konto nicht gelöscht.

## Rückerstattung

Der Code erstattet **nichts** automatisch, weder bei Kündigung noch bei Konto-Löschung. Ein Admin kann auf Anfrage manuell im Stripe-Dashboard erstatten.

**Offen — Entscheidung Admin/Ops vor Prod-Go:** ob und in welchem Umfang erstattet wird (gesetzlicher Widerruf, Kulanz) und wie lange.

## Vor Prod-Go

1. Die Rechtsseiten `agb`, `widerruf` und `datenschutz` (App und Marketing) beschreiben den Tarif seit #381 (siehe unten). `leistungen` (Marketing) nennt
   den Tarif ebenfalls (Nacharbeit #381). Die Texte nennen den Tarif, kein Startdatum; sie gehen zusammen mit dem Admin-Go live, nicht früher.
2. Erstattungsregel entscheiden (siehe oben).
3. Admin-Go und die Stripe-Schlüssel (live) kommen über Ops-CoS; danach `BLOOMMD_BILLING_ENABLED=1`.
4. Testmodus-Durchlauf (Checkout, Webhook, Portal, Kündigung) mit Stripe-Testschlüsseln und Test-Price-IDs ist noch offen.

## Rechtstexte (#381)

Stand der Texte in `agb`, `widerruf` und `datenschutz` (je `apps/app` und `apps/marketing`, DE und EN; `scripts/qa/legal-pages-consistency.test.ts` hält beide Apps
gleich). Nur Text, keine Funktionsänderung. Der Text nennt Lifetime und Studierendenrabatt weder noch schließt er sie aus.

| Aussage im Text | Beleg im Code / in der Doku |
| --- | --- |
| Tarif „Cloud“, 6 EUR/Monat oder 60 EUR/Jahr, Zahlung über Stripe, Rechnungsadresse Pflicht, USt-IdNr. optional, Stripe Tax | `apps/app/src/lib/billing.ts`, Abschnitt „Checkout“ |
| Kündigung über Konto → „Rechnungen und Abo verwalten“ (Stripe-Kundenportal), Wirkung zum Periodenende, danach wie nach Testende | Abschnitt „Kündigung“ (`cancel_at_period_end`) |
| Nicht aktives Abo (z. B. `past_due`) schaltet den Tarif ab | Abschnitt „Entitlement und Webhook“ |
| Zahlende Konten bleiben nach Testende schreibbar | Abschnitt „Entitlement und Webhook“, `docs/TRIAL.md` |
| Löschen des Kontos beendet laufende Abos vorher bei Stripe, sonst keine Löschung | `POST /api/account/delete`, `cancelStripeSubscriptions` |
| 100 MB je Konto, bei Überschreitung wird nichts gelöscht, Lesen/Export/Löschen/Verkleinern bleiben möglich | `docs/QUOTA.md` |
| Keine automatische Erstattung; Erstattung manuell über Stripe | Abschnitt „Rückerstattung“ |
| BloomMD speichert keine Kartendaten; gespeichert sind Abo-Datensatz, Freischaltung, Stripe-Ereignisse | `apps/app/db/001_market.sql` (`bloom_subscriptions`, `bloom_entitlements`, `bloom_stripe_events`), `apps/app/src/app/api/billing/webhook/route.ts` (`raw` und `payload` enthalten nur Kennungen, Status, Periodenende), `recordStripeSubscription` in `apps/app/src/lib/db.ts` |
| Stripe-Ereignisse: 180 Tage nach Verarbeitung | `apps/app/scripts/maintenance.ts` (`BLOOMMD_STRIPE_EVENT_RETENTION_DAYS`, Standard 180; der Test prüft den Wert) |
| Abo-Datensatz bei Konto-Löschung: `raw` geschwärzt, `stripe_customer_id` entfernt, `user_id` gelöst; keine Löschfrist | `apps/app/src/lib/db.ts` (Konto-Löschung, `update bloom_subscriptions set raw = …`), `on delete set null` in `001_market.sql`; `maintenance.ts` löscht `bloom_subscriptions` nicht |

### Offen — Rechtsprüfung vor Admin-Go

Diese Punkte sind **nicht** als Platzhalter im Text, sondern hier. Der Text ist ein Entwurf ohne anwaltliche Prüfung.

1. **Aufbewahrungsdauer Rechnungs- und Zahlungsdaten** (Buchführung, Stripe): Der Text sagt „für die Dauer der gesetzlichen Aufbewahrungspflichten“ und nennt keine Zahl.
   Zu prüfen (Steuerberater/Anwalt): Dauer (nach unserem Kenntnisstand 8 Jahre für Buchungsbelege/Rechnungen nach § 147 AO, 6 Jahre für Handelsbriefe; nicht geprüft)
   und wer die Daten hält.
2. **Löschfrist Abo-Datensatz:** Im Code gibt es keine (`bloom_subscriptions` wird nie gelöscht). Der Text sagt „derzeit nicht vorgesehen“. Entscheiden: Frist
   (Folgeticket, `maintenance.ts`) oder Begründung über die Aufbewahrung.
3. **Stripe-Kunde bei Konto-Löschung:** Der Code beendet nur die Abos; der Kunde und seine Daten bei Stripe bleiben bestehen. Entscheiden, ob das Löschen/Anonymisieren
   des Stripe-Kunden per API ergänzt wird (Folgeticket) oder die Aufbewahrung bei Stripe genügt.
4. **Stripes Rolle und Drittland:** Der Text nennt Stripe Payments Europe, Ltd. (Irland) als Auftragsverarbeiter und weist darauf hin, dass Stripe für eigene Zwecke
   (Betrugsprävention, gesetzliche Pflichten) selbst verantwortlich ist (so beschreibt es Stripes öffentliche DPA, Stand 28.09.2026). Die Übermittlung in Drittländer ist
   nur mit Verweis auf die DPA beschrieben (https://stripe.com/legal/dpa). Zu prüfen: DPA im Stripe-Dashboard akzeptiert, Verzeichnis der Verarbeitungstätigkeiten, Verweis auf Stripes Datenschutzerklärung.
5. **Widerruf:** Die Belehrung folgt dem gesetzlichen Muster für Dienstleistungsverträge (Anlage 1 zu Art. 246a § 1 Abs. 2 EGBGB), mit Muster-Widerrufsformular. Nicht abgebildet:
   das vorzeitige Erlöschen des Widerrufsrechts bei vollständiger Leistung (§ 356 Abs. 4 BGB), das ein ausdrückliches Verlangen und eine Kenntnisbestätigung im Checkout
   voraussetzt (der Checkout hat dafür kein Element), und die Bestätigung der Widerrufsbelehrung sowie die Beschriftung der Bestell-Schaltfläche (§ 312j Abs. 3 BGB).
   Entscheiden, ob der Checkout dafür erweitert wird (Folgeticket). Der Wertersatz-Absatz des Musters („Hast du verlangt, …“) hat ohne dieses Verlangen keinen Anwendungsfall.
6. **Erstattung:** Der Text sagt „manuell über Stripe, nicht automatisch“ und „binnen vierzehn Tagen“ (Muster). Ops braucht dafür einen Prozess, der die Frist einhält;
   Kulanz über den Widerruf hinaus ist weiter offen (Abschnitt „Rückerstattung“) und im Text nicht zugesagt.
7. **Kündigung zum Periodenende:** Der Text sagt, die Kündigung wirke zum Ende der laufenden Periode. Der Code folgt dem, was Stripe meldet; ob das Kundenportal zum Periodenende
   oder sofort kündigt, steht in der Portal-Konfiguration im Stripe-Dashboard. Vor Admin-Go auf „zum Periodenende“ stellen und prüfen, sonst weicht der Text vom Verhalten ab.
8. **Preise netto/brutto:** Ob 6 EUR/60 EUR die Umsatzsteuer enthalten, hängt an `tax_behavior` der Stripe-Preise (nicht im Code). Der Text verweist auf den im Checkout angezeigten
   Gesamtbetrag. Prüfen (Preisangabe, Kleinunternehmerregelung).
9. **Laufzeit und Verlängerung:** „Verlängert sich automatisch um dieselbe Periode, Abrechnung durch Stripe je Periode“ ist Stripe-Standard, nicht im Code erzwungen. Nicht geregelt:
   Preisänderungen bei laufenden Abos, Unterscheidung Verbraucher/Unternehmer in den AGB.
10. **Schalter:** Der Text sagt 100 MB je Konto und Schreibsperre ohne Löschung; das gilt erst mit `BLOOMMD_ACCOUNT_QUOTA=1` (`docs/QUOTA.md`). Der Schalter muss mit dem Verkauf
    eingeschaltet werden, sonst weicht der Text vom Verhalten ab. Dasselbe gilt für `BLOOMMD_TRIAL_READONLY=1` (Lesesperre nach Testende).
