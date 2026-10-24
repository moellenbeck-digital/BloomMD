"use client";

import { useState } from "react";
import type { AuthLocale } from "../../../lib/auth-copy";

const copy = {
  de: {
    allow: "Erlauben",
    allowing: "Verbinde …",
    cancel: "Abbrechen",
    done: "Erlaubt. Die BloomMD-App übernimmt die Anmeldung.",
    reopen: "Falls die App sich nicht öffnet: BloomMD-App öffnen",
    cancelled: "Abgebrochen. Du kannst dieses Fenster schließen.",
    failed: "Die App konnte nicht verbunden werden. Starte die Anmeldung erneut in der App.",
  },
  en: {
    allow: "Allow",
    allowing: "Connecting…",
    cancel: "Cancel",
    done: "Allowed. The BloomMD app completes the sign-in.",
    reopen: "If the app does not open: open the BloomMD app",
    cancelled: "Cancelled. You can close this window.",
    failed: "The app could not be connected. Start the sign-in again in the app.",
  },
} as const;

interface MobileConsentActionsProps {
  challenge: string;
  state: string;
  device: string;
  denyUrl: string;
  locale: AuthLocale;
}

export function MobileConsentActions({ challenge, state, device, denyUrl, locale }: MobileConsentActionsProps) {
  const text = copy[locale];
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "cancelled">("idle");
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allow = async () => {
    setStatus("busy");
    setError(null);
    try {
      const response = await fetch("/api/mobile/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, state, device }),
      });
      const payload = await response.json().catch(() => ({})) as { redirectUrl?: string };
      if (!response.ok || !payload.redirectUrl?.startsWith("bloommd://auth?")) throw new Error("authorize failed");
      setRedirectUrl(payload.redirectUrl);
      setStatus("done");
      // The code is handed to the app through its URL scheme; the app closes this browser.
      window.location.assign(payload.redirectUrl);
    } catch (reason) {
      console.error("[BloomMD] App sign-in failed:", reason instanceof Error ? reason.message : "unknown");
      setError(text.failed);
      setStatus("idle");
    }
  };

  const cancel = () => {
    setStatus("cancelled");
    window.location.assign(denyUrl);
  };

  if (status === "done" && redirectUrl) {
    return (
      <div className="mt-6 grid gap-3" role="status" data-testid="mobile-consent-done">
        <p className="rounded-md border border-[#D8E7D3] bg-[#F4FAF1] px-3 py-3 text-sm leading-6 text-[#467642]">{text.done}</p>
        <a href={redirectUrl} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#D4CFC8] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F2F0ED]">{text.reopen}</a>
      </div>
    );
  }
  if (status === "cancelled") {
    return <p className="mt-6 rounded-md border border-[#E8E4DF] bg-[#FCFBFA] px-3 py-3 text-sm text-[#5F574F]" role="status">{text.cancelled}</p>;
  }

  return (
    <div className="mt-6 grid gap-3" data-testid="mobile-consent-actions">
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={cancel}
          disabled={status === "busy"}
          className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F2F0ED] disabled:opacity-60"
          data-testid="mobile-consent-cancel"
        >
          {text.cancel}
        </button>
        <button
          type="button"
          onClick={() => void allow()}
          disabled={status === "busy"}
          className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#8A3518] disabled:cursor-wait disabled:opacity-60"
          data-testid="mobile-consent-allow"
        >
          {status === "busy" ? text.allowing : text.allow}
        </button>
      </div>
    </div>
  );
}
