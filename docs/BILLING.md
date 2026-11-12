# Billing „Cloud“ mit Stripe (#379)

Stand: Verhalten von `main` nach #386. Das Dokument beschreibt nur, was der Code tut. Zusagen zu Widerruf oder Rückerstattung sind
nicht Teil des Codes und stehen hier nicht.

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

1. Die öffentlichen Rechtsseiten (`leistungen`, `widerruf`, `agb`, `datenschutz`) sagen heute zu Recht „keine kostenpflichtigen Pläne“. Sie müssen die
   Preise und die Erstattungsregel aufnehmen, bevor Billing eingeschaltet wird.
2. Erstattungsregel entscheiden (siehe oben).
3. Admin-Go und die Stripe-Schlüssel (live) kommen über Ops-CoS; danach `BLOOMMD_BILLING_ENABLED=1`.
4. Testmodus-Durchlauf (Checkout, Webhook, Portal, Kündigung) mit Stripe-Testschlüsseln und Test-Price-IDs ist noch offen.
