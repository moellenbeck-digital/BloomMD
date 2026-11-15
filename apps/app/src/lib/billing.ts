export type BillingTier = "cloud";
export type BillingInterval = "monthly" | "annual";

export interface BillingIntervalPlan {
  interval: BillingInterval;
  price: string;
  cadence: string;
  cta: string;
  envKey: string;
}

export interface BillingPlan {
  tier: BillingTier;
  name: string;
  description: string;
  features: string[];
  mode: "subscription";
  intervals: Record<BillingInterval, BillingIntervalPlan>;
}

export const billingIntervals: readonly BillingInterval[] = ["monthly", "annual"];

export const billingPlans: Record<BillingTier, BillingPlan> = {
  cloud: {
    tier: "cloud",
    name: "Cloud",
    description: "Cloud-Workspaces mit Sync für mehrere Geräte, Realtime-Präsenz und Cloud-Backup.",
    features: ["Mehrgeräte-Sync", "Realtime-Präsenz", "Cloud-Backup", "Jederzeit kündbar"],
    mode: "subscription",
    intervals: {
      monthly: {
        interval: "monthly",
        price: "6 EUR",
        cadence: "pro Monat",
        cta: "Monatlich buchen",
        envKey: "STRIPE_PRICE_CLOUD_MONTHLY",
      },
      annual: {
        interval: "annual",
        price: "60 EUR",
        cadence: "pro Jahr",
        cta: "Jährlich buchen",
        envKey: "STRIPE_PRICE_CLOUD_ANNUAL",
      },
    },
  },
};

export const landingPlans = [
  {
    id: "free",
    name: "Free",
    price: "0 EUR",
    cadence: "lokal starten",
    description: "Für Einzelpersonen, die BloomMD mit echten Markdown-Dateien testen wollen.",
    features: ["Lokale Markdown-Dateien", "Basis-Mindmap", "Alle Exporte: Markdown, OPML, PDF, PNG, SVG", "Offenes .md-Format"],
    cta: "Kostenlos starten",
    href: "/app",
  },
  billingPlans.cloud,
];

/** Only `cloud` resolves; legacy tier names (`pro-*`, `lifetime`, `sync-monthly`) are unknown here. */
export function getBillingPlan(tier: string | null): BillingPlan | null {
  return tier === "cloud" ? billingPlans.cloud : null;
}

/** `monthly` or `annual`; anything else (missing, empty, other case) is not a billing interval. */
export function getBillingInterval(interval: string | null): BillingInterval | null {
  return interval === "monthly" || interval === "annual" ? interval : null;
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
