"use client";

import { useMindMapStore } from "../hooks/useMindMapStore";
import type { SyncFailureKind, SyncStatus as SyncStatusType } from "../sync/types";
import { getPresenceInitials, getPresenceLabel, shouldShowPresence } from "../sync/presence";
import { useLocale } from "../i18n/LocaleContext";

export function SyncStatus() {
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
