"use client";

import { useState } from "react";
import { trackPlausibleEvent } from "../lib/plausible";

export interface WaitlistFormProps {
  /** Recorded with the entry, so a later wave can tell where people came from. */
  source?: string;
  locale?: "de" | "en";
}

/**
 * Waitlist signup form.
 *
 * The success message deliberately does not reveal whether the address was new. Saying "you are
 * already on the list" would turn the form into a way to check who signed up — the same reason the
 * login says nothing about whether an account exists.
 */
const copy = {
  de: {
    label: "E-Mail-Adresse",
    placeholder: "deine@adresse.de",
    submit: "Auf die Warteliste",
    sending: "Wird gesendet...",
    failed: "Eintrag fehlgeschlagen.",
    offline: "Keine Verbindung. Bitte später erneut.",
    done: "Fast geschafft - bitte bestätige die Adresse über den Link, den wir dir geschickt haben.",
    hint: "Doppelte Bestätigung per E-Mail. Wir schreiben nur, wenn ein Platz frei wird - kein Newsletter. Abmeldung jederzeit über den Link in jeder Nachricht.",
  },
  en: {
    label: "Email address",
    placeholder: "you@example.com",
    submit: "Join the waitlist",
    sending: "Sending...",
    failed: "Signup failed.",
    offline: "No connection. Please try again later.",
    done: "Almost done - confirm your address with the link we just sent.",
    hint: "Double opt-in by email. We only write when a beta seat opens - no newsletter. You can unsubscribe from every message.",
  },
} as const;

export function WaitlistForm({ source = "landing", locale = "de" }: WaitlistFormProps) {
  const text = copy[locale];
  const [email, setEmail] = useState("");
  const [formStartedAt] = useState(() => String(Date.now()));
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, source, website: "", formStartedAt, lang: locale }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? text.failed);
        setState("idle");
        return;
      }
      trackPlausibleEvent("waitlist_signup");
      setState("done");
    } catch {
      setError(text.offline);
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <p data-testid="waitlist-done" className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        {text.done}
      </p>
    );
  }

  return (
    <form onSubmit={submit} data-testid="waitlist-form" className="w-full max-w-md">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <input type="hidden" name="formStartedAt" value={formStartedAt} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="waitlist-email">{text.label}</label>
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          data-testid="waitlist-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder={text.placeholder}
          className="h-11 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-[#FF6B35]"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          data-testid="waitlist-submit"
          className="h-11 rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F] disabled:opacity-50"
        >
          {state === "sending" ? text.sending : text.submit}
        </button>
      </div>

      {error && <p data-testid="waitlist-error" className="mt-2 text-sm text-[#B84218]">{error}</p>}

      <p className="mt-2 text-xs text-neutral-600">
        {text.hint}
      </p>
    </form>
  );
}
