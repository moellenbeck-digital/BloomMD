"use client";

import { useMemo, useState } from "react";
import { listConflictCopies } from "@bloommd/core/browser";
import { useMindMapStore } from "../hooks/useMindMapStore";
import type { SyncFailureKind, SyncStatus as SyncStatusType } from "../sync/types";
import { getPresenceInitials, getPresenceLabel, shouldShowPresence } from "../sync/presence";
import { useLocale } from "../i18n/LocaleContext";

/**
 * Conflict copies from offline merges (#261): shows that there are some and lets the user adopt the
 * copied version or delete the copy. The copy itself is an ordinary "Konflikt: …" node on the map.
 */
function SyncConflicts() {
  const document = useMindMapStore((s) => s.document);
  const resolveConflict = useMindMapStore((s) => s.resolveConflict);
  const readOnly = useMindMapStore((s) => s.readOnly);
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const copies = useMemo(() => (document ? listConflictCopies(document) : []), [document]);
  if (copies.length === 0) return null;

  return (
    <span className="relative" data-testid="sync-conflicts">
      <button
        type="button"
        data-testid="sync-conflicts-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="rounded border border-[#B45309] px-1 text-[10px] font-semibold text-[#B45309]"
      >
        {t.syncConflictsLabel.replace("%count%", String(copies.length))}
      </button>
      {open && (
        <ul
          className="absolute right-0 top-5 z-50 flex w-80 flex-col gap-2 rounded border border-[var(--color-border,#ddd)] bg-[var(--color-surface,#fff)] p-2 text-[11px] text-[var(--color-ink)] shadow-lg"
          data-testid="sync-conflict-list"
        >
          {copies.map((copy) => (
            <li key={copy.id} data-testid="sync-conflict" data-conflict-copy-id={copy.id} className="flex flex-col gap-1">
              <span>
                {t.syncConflictItem
                  .replace("%node%", document?.nodes.get(copy.originalId)?.title ?? "")
                  .replace("%copy%", copy.title)
                  .replace("%device%", copy.device)
                  .replace("%time%", copy.time)}
              </span>
              {!readOnly && (
                <span className="flex gap-2">
                  <button type="button" data-testid="sync-conflict-adopt" className="underline" onClick={() => resolveConflict(copy.id, "adopt")}>
                    {t.syncConflictAdopt}
                  </button>
                  <button type="button" data-testid="sync-conflict-discard" className="underline" onClick={() => resolveConflict(copy.id, "discard")}>
                    {t.syncConflictDiscard}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export function SyncStatus() {
  const offlinePending = useMindMapStore((s) => s.offlinePending);
  const syncStatus = useMindMapStore((s) => s.syncStatus);
  const syncProvider = useMindMapStore((s) => s.syncProvider);
  const syncFailure = useMindMapStore((s) => s.syncFailure);
  const retrySync = useMindMapStore((s) => s.retrySync);
  const remoteUsers = useMindMapStore((s) => s.remoteUsers);
  const { t } = useLocale();

  // Only show when sync has been configured
  if (!syncProvider && syncStatus === "disconnected") return null;

  const statusCopy: Record<SyncStatusType, { color: string; label: string }> = {
    disconnected: { color: "var(--color-ink-faint)", label: t.syncOffline },
    connecting: { color: "#F59E0B", label: t.syncConnecting },
    reconnecting: { color: "#F59E0B", label: t.syncReconnecting },
    connected: { color: "#10B981", label: t.syncConnected },
    failed: { color: "#DC2626", label: t.syncFailed },
  };
  const failureCopy: Record<SyncFailureKind, string> = {
    "access-revoked": t.syncFailureAccessRevoked,
    "file-not-found": t.syncFailureFileNotFound,
    "room-capacity": t.syncFailureRoomCapacity,
    "quota-exceeded": t.syncFailureQuotaExceeded,
    unauthorized: t.syncFailureUnauthorized,
    "ticket-refresh-failed": t.syncFailureTicketRefresh,
    "reconnect-exhausted": t.syncFailureExhausted,
  };
  const { color } = statusCopy[syncStatus];
  const label = syncStatus === "failed" && syncFailure
    ? failureCopy[syncFailure.kind]
    : statusCopy[syncStatus].label;
  const userCount = remoteUsers.length + 1;
  const showPresence = shouldShowPresence(Boolean(syncProvider), remoteUsers.length);

  return (
    <div
      data-testid="sync-status"
      className="flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)]"
      title={t.syncTitle.replace("%status%", label).replace("%count%", String(userCount)).replace("%users%", userCount === 1 ? t.user : t.users)}
    >
      <span
        className="w-2 h-2 rounded-full inline-block shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="font-[var(--font-mono,monospace)]">{label}</span>
      {offlinePending && (
        <span
          data-testid="sync-offline-pending"
          className="font-[var(--font-mono,monospace)] text-[10px] opacity-80"
          title={t.syncOfflinePendingTitle}
        >
          {t.syncOfflinePending}
        </span>
      )}
      <SyncConflicts />
      {showPresence && userCount > 1 && (
        <>
          <span className="font-[var(--font-mono,monospace)] text-[10px] opacity-70">({userCount})</span>
          <span className="ml-1 flex items-center gap-0.5" data-testid="sync-presence-users">
            {remoteUsers.map((user) => (
              <span
                key={user.clientID}
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white px-0.5 text-[8px] font-bold leading-none text-white shadow-sm ${syncStatus === "connected" ? "" : "opacity-60"}`}
                style={{ backgroundColor: user.color }}
                title={getPresenceLabel(user.name, user.email)}
                aria-label={getPresenceLabel(user.name, user.email)}
                data-testid="sync-presence-user"
              >
                {getPresenceInitials(user.name, user.email, String(user.clientID))}
              </span>
            ))}
          </span>
        </>
      )}
      {syncStatus === "failed" && (
        <button
          type="button"
          onClick={retrySync}
          className="ml-1 underline underline-offset-2 hover:text-[var(--color-ink)]"
          aria-label={t.reconnect}
        >
          {t.reconnect}
        </button>
      )}
    </div>
  );
}
