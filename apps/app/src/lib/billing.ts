export type BillingTier = "pro-monthly" | "pro-annual" | "lifetime" | "sync-monthly";

export interface BillingPlan {
  tier: BillingTier;
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  cta: string;
  mode: "payment" | "subscription";
  envKey: string;
}

export const billingPlans: Record<BillingTier, BillingPlan> = {
  "pro-monthly": {
    tier: "pro-monthly",
    name: "Pro Monthly",
    price: "9 EUR",
    cadence: "pro Monat",
    description: "Für intensive Wissensarbeit ohne lange Bindung.",
    features: ["Alle lokalen Funktionen", "Große Maps", "Präsentation und Export", "Keyboard-first Workflow"],
    cta: "Monatlich starten",
    mode: "subscription",
    envKey: "STRIPE_PRICE_PRO_MONTHLY",
  },
  "pro-annual": {
    tier: "pro-annual",
    name: "Pro Annual",
    price: "79 EUR",
    cadence: "pro Jahr",
    description: "Für regelmäßige Wissensarbeit mit Pro-Workflows und besserem Jahrespreis.",
    features: ["Alle lokalen Funktionen", "Große Maps", "Präsentation und Export", "Keyboard-first Workflow"],
    cta: "Pro kaufen",
    mode: "subscription",
    envKey: "STRIPE_PRICE_PRO_ANNUAL",
  },
  lifetime: {
    tier: "lifetime",
    name: "Lifetime",
    price: "149 EUR",
    cadence: "einmalig",
    description: "Für Local-first-Nutzer, die eine dauerhafte Lizenz für die Hauptversion wollen.",
    features: ["Dauerlizenz für v1", "Desktop und Mobile", "Priorisierte Updates", "Beta-Zugang"],
    cta: "Lifetime sichern",
    mode: "payment",
    envKey: "STRIPE_PRICE_LIFETIME",
  },
  "sync-monthly": {
    tier: "sync-monthly",
    name: "Sync Monthly",
    price: "5 EUR",
    cadence: "pro Monat",
    description: "Optionaler Cloud-Sync für mehrere Geräte und spätere Team-Funktionen.",
    features: ["Mehrgeräte-Sync", "Realtime-Präsenz", "Cloud-Backup", "Jederzeit kündbar"],
    cta: "Sync aktivieren",
    mode: "subscription",
    envKey: "STRIPE_PRICE_SYNC_MONTHLY",
  },
};

export const landingPlans = [
  {
    id: "free",
    name: "Free",
    price: "0 EUR",
    cadence: "lokal starten",
    description: "Für Einzelpersonen, die BloomMD mit echten Markdown-Dateien testen wollen.",
    features: ["Lokale Markdown-Dateien", "Basis-Mindmap", "Import und Export", "Offenes .md-Format"],
    cta: "Kostenlos starten",
    href: "/app",
  },
  billingPlans["pro-monthly"],
  billingPlans["pro-annual"],
  billingPlans.lifetime,
  billingPlans["sync-monthly"],
];

export function getBillingPlan(tier: string | null): BillingPlan | null {
  if (!tier) return null;
  return billingPlans[tier as BillingTier] ?? null;
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3210";
}

export async function cancelStripeSubscriptions(subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) return;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe ist nicht konfiguriert; laufende Abos können nicht sicher beendet werden.");

  for (const subscriptionId of [...new Set(subscriptionIds)]) {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!response.ok) {
      throw new Error("Ein laufendes Stripe-Abo konnte nicht beendet werden. Der Account wurde nicht gelöscht.");
    }
  }
}

/**
 * Paid plans are unreachable unless billing is explicitly switched on.
 *
 * BloomMD ships as a free beta, so checkout, the customer portal and the Stripe webhook must not
 * respond at all. Failing closed keeps a stray Stripe key or a copied deployment from opening a
 * purchase flow that the product does not currently offer.
 */
export function isBillingEnabled(): boolean {
  return process.env.BLOOMMD_BILLING_ENABLED === "1";
}
