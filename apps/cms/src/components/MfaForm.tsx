"use client";

import { useEffect, useState } from "react";

/**
 * Form of the second factor (ticket #206): verify (code or recovery code) or set up (secret, QR code, first code,
 * recovery codes shown once). Plain fetch against `/api/operators/mfa/*`; the cookie of the session does the rest.
 */
type Setup = { secret: string; uri: string; qr: string };

const field = { display: "block", width: "100%", padding: "0.5rem", margin: "0.25rem 0 1rem", font: "inherit", boxSizing: "border-box" } as const;

async function post(path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, any> }> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { ok: response.ok, status: response.status, json: await response.json().catch(() => ({})) };
}

export function MfaForm({ enrolled, email, adminRoute }: { enrolled: boolean; email: string; adminRoute: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (enrolled) return;
    let cancelled = false;
    post("/api/operators/mfa/begin").then((reply) => {
      if (cancelled) return;
      if (reply.ok) setSetup(reply.json as Setup);
      else setError(reply.json.message ?? "Die Einrichtung konnte nicht gestartet werden.");
    });
    return () => {
      cancelled = true;
    };
  }, [enrolled]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const reply = await post(enrolled ? "/api/operators/mfa/verify" : "/api/operators/mfa/confirm", { code });
    setBusy(false);
    if (!reply.ok) {
      setError(reply.json.message ?? "Der Code ist nicht gültig.");
      setCode("");
      return;
    }
    if (enrolled) window.location.assign(adminRoute);
    else setRecoveryCodes(reply.json.recoveryCodes as string[]);
  }

  if (recoveryCodes) {
    return (
      <div data-testid="mfa-recovery">
        <h1>Wiederherstellungscodes</h1>
        <p>Bewahren Sie diese Codes sicher auf (nicht im Browser, nicht im Chat). Jeder Code gilt einmal, falls die Authenticator-App nicht verfügbar ist. Sie werden nur jetzt angezeigt.</p>
        <ul data-testid="mfa-recovery-codes" style={{ fontFamily: "monospace", columns: 2, listStyle: "none", padding: 0 }}>
          {recoveryCodes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <label>
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} data-testid="mfa-recovery-saved" /> Ich habe die Codes gesichert.
        </label>
        <p>
          <button type="button" className="btn btn--style-primary btn--size-medium" disabled={!saved} onClick={() => window.location.assign(adminRoute)} data-testid="mfa-continue">
            Weiter zur Oberfläche
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} data-testid={enrolled ? "mfa-verify" : "mfa-setup"}>
      <h1>{enrolled ? "Zweiter Faktor" : "Zweiten Faktor einrichten"}</h1>
      <p>{email}</p>
      {enrolled ? (
        <p>Geben Sie den 6-stelligen Code Ihrer Authenticator-App ein, oder einen Wiederherstellungscode.</p>
      ) : (
        <>
          <p>Für den Zugang zur Oberfläche ist ein zweiter Faktor Pflicht. Scannen Sie den QR-Code mit einer Authenticator-App und geben Sie den angezeigten Code ein.</p>
          {setup ? (
            <>
              <img src={setup.qr} alt="QR-Code für die Authenticator-App" width={200} height={200} data-testid="mfa-qr" />
              <p>
                Oder den Schlüssel von Hand eingeben: <code data-testid="mfa-secret">{setup.secret}</code>
              </p>
            </>
          ) : (
            !error && <p>Einrichtung wird vorbereitet …</p>
          )}
        </>
      )}
      <label>
        {enrolled ? "Code oder Wiederherstellungscode" : "Code aus der App"}
        <input
          style={field}
          name="code"
          autoComplete="one-time-code"
          inputMode={enrolled ? "text" : "numeric"}
          autoFocus
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          data-testid="mfa-code"
        />
      </label>
      {error && (
        <p role="alert" data-testid="mfa-error" style={{ color: "var(--theme-error-500)" }}>
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--style-primary btn--size-medium" disabled={busy || (!enrolled && !setup)} data-testid="mfa-submit">
        {enrolled ? "Anmelden" : "Einrichtung bestätigen"}
      </button>
      <p>
        <a href={`${adminRoute}/logout`}>Abmelden</a>
      </p>
    </form>
  );
}
