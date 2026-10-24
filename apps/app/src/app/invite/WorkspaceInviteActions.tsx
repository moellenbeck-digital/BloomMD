"use client";

import { useState } from "react";
import { authCopy, type AuthLocale } from "../../lib/auth-copy";

interface WorkspaceInviteActionsProps {
  handoff: string;
  workspaceId: string;
  locale: AuthLocale;
}

export function WorkspaceInviteActions({ handoff, workspaceId, locale }: WorkspaceInviteActionsProps) {
  const copy = authCopy[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspace-invitations/${encodeURIComponent(handoff)}/accept`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { workspaceId?: string; error?: string };
      if (!response.ok || !payload.workspaceId) {
        const serverError = payload.error;
        const message = locale === "en" && (serverError === "INVITATION_EMAIL_MISMATCH" || serverError === "Sign in with the invited email address to accept this invitation.")
          ? "This invitation belongs to a different email address."
          : locale === "en" && (serverError === "INVITATION_INVALID" || serverError === "This invitation is expired, revoked, or already used.")
            ? "This invitation is expired, revoked, or already used."
            : locale === "de" && (serverError === "INVITATION_EMAIL_MISMATCH" || serverError === "Sign in with the invited email address to accept this invitation.")
              ? "Diese Einladung gehört zu einer anderen E-Mail-Adresse."
              : locale === "de" && (serverError === "INVITATION_INVALID" || serverError === "This invitation is expired, revoked, or already used.")
                ? "Diese Einladung ist abgelaufen, widerrufen oder bereits verwendet."
                : serverError || copy.invitationJoinFailed;
        throw new Error(message);
      }
      window.location.assign(`/app?workspace=${encodeURIComponent(payload.workspaceId || workspaceId)}`);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : copy.invitationJoinFailed);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3" data-testid="workspace-invite-actions">
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <button
        type="button"
        onClick={() => void accept()}
        disabled={busy}
        className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#8A3518] disabled:cursor-wait disabled:opacity-60"
        data-testid="accept-workspace-invite"
      >
        {busy ? (locale === "de" ? "Beitritt wird bestätigt…" : "Confirming…") : copy.joinWorkspace}
      </button>
    </div>
  );
}
