"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { redactTelemetryPath } from "../lib/telemetryPrivacy";

export const ANALYTICS_CONSENT_KEY = "bloommd:analytics-consent:v1";
type Consent = "accepted" | "rejected" | null;

function analyticsEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST);
}

function PageviewCapture({ consent }: { consent: Consent }) {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    if (!analyticsEnabled() || consent !== "accepted") return;
    if (previousPathname.current === pathname) return;

    previousPathname.current = pathname;

    void import("posthog-js").then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          person_profiles: "identified_only",
          persistence: "localStorage+cookie",
          sanitize_properties: (properties) => {
            delete properties.$current_url;
            delete properties.$referrer;
            delete properties.$referring_domain;
            return properties;
          },
        });
      }

      posthog.capture("$pageview", {
        path: redactTelemetryPath(pathname),
      });
    });
  }, [consent, pathname]);

  return null;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<Consent>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    setConsent(stored === "accepted" || stored === "rejected" ? stored : null);

    const handleConsent = (event: Event) => {
      const detail = (event as CustomEvent<Consent>).detail;
      setConsent(detail === "accepted" || detail === "rejected" ? detail : null);
    };
    window.addEventListener("bloommd:analytics-consent", handleConsent);
    return () => window.removeEventListener("bloommd:analytics-consent", handleConsent);
  }, []);

  const updateConsent = (value: Exclude<Consent, null>) => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    setConsent(value);
    if (value === "rejected") {
      void import("posthog-js").then(({ default: posthog }) => {
        if (posthog.__loaded) posthog.opt_out_capturing();
      });
    }
  };

  if (!analyticsEnabled()) return children;

  return (
    <>
      <PageviewCapture consent={consent} />
      {children}
      {consent === null && (
        <aside
          role="dialog"
          aria-label="Analytics-Einwilligung"
          className="fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-2xl rounded-md border border-[#D4CFC8] bg-white p-4 text-[#1A1A1A] shadow-xl"
        >
          <p className="text-sm leading-6">
            BloomMD möchte ausschließlich anonyme Produktnutzung ohne Markdown, Datei- oder Node-Inhalte messen. Details stehen in den{" "}
            <Link href="/cookies" className="font-semibold text-[#B64A1F] underline">Cookie-Einstellungen</Link>.
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => updateConsent("rejected")} className="h-10 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#F2F0ED]">
              Nur notwendige
            </button>
            <button type="button" onClick={() => updateConsent("accepted")} className="h-10 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white hover:bg-[#333333]">
              Anonyme Analyse erlauben
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
