"use client";

import { useEffect, useState } from "react";
import { ANALYTICS_CONSENT_KEY } from "../analytics-provider";
import type { AppLocale } from "../../lib/locale";

type Consent = "accepted" | "rejected" | null;

export function AnalyticsConsentSettings({ locale = "de" }: { locale?: AppLocale }) {
  const [consent, setConsent] = useState<Consent>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    setConsent(stored === "accepted" || stored === "rejected" ? stored : null);
  }, []);

  const update = (value: Exclude<Consent, null>) => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    setConsent(value);
    window.dispatchEvent(new CustomEvent("bloommd:analytics-consent", { detail: value }));
  };

  return (
    <div className="mt-4 rounded-md border border-[#E8E4DF] bg-[#FCFBFA] p-4">
      <p className="text-sm">{locale === "en" ? "Current status" : "Aktueller Status"}: <strong>{consent === "accepted" ? (locale === "en" ? "Analytics allowed" : "Analyse erlaubt") : consent === "rejected" ? (locale === "en" ? "Necessary data only" : "Nur notwendige Daten") : (locale === "en" ? "Not decided yet" : "Noch nicht entschieden")}</strong></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => update("rejected")} className="h-10 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#F2F0ED]">
          {locale === "en" ? "Reject analytics" : "Analyse ablehnen"}
        </button>
        <button type="button" onClick={() => update("accepted")} className="h-10 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white hover:bg-[#333333]">
          {locale === "en" ? "Allow anonymous analytics" : "Anonyme Analyse erlauben"}
        </button>
      </div>
    </div>
  );
}
