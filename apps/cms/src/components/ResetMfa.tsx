"use client";

import { useAuth, useDocumentInfo } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Button on the operator form: an admin removes the second factor of another operator (ticket #206). The
 * operator then signs in with the password and sets the factor up again; open sessions end. The last
 * admin without a factor uses `bun run operator reset-mfa <email>`.
 */
export function ResetMfa() {
  const { user } = useAuth();
  const { id } = useDocumentInfo();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  if (!id || !isAdmin) return null;

  async function reset() {
    if (!window.confirm("Den zweiten Faktor dieses Betreibers zurücksetzen? Offene Sitzungen enden, bei der nächsten Anmeldung wird er neu eingerichtet.")) return;
    setState("busy");
    try {
      const response = await fetch(`/api/operators/${String(id)}/mfa-reset`, { method: "POST", credentials: "same-origin" });
      setState(response.ok ? "done" : "error");
      if (response.ok) router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="field-type" data-testid="mfa-reset">
      <button type="button" className="btn btn--style-secondary btn--size-medium" disabled={state === "busy"} onClick={reset} data-testid="mfa-reset-button">
        Zweiten Faktor zurücksetzen
      </button>
      {state === "done" && <p role="status">Der zweite Faktor wurde zurückgesetzt.</p>}
      {state === "error" && <p role="alert">Das Zurücksetzen ist fehlgeschlagen.</p>}
    </div>
  );
}
