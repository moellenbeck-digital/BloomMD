import type { Metadata } from "next";
import { deleteWaitlistEntryAction, inviteWaitlistAction, resendWaitlistConfirmationAction } from "./actions";
import { CopySignupLink } from "./copy-signup-link";
import { WaitlistActionForm } from "./waitlist-action-form";
import { actionMessage, inviteMessage, rowErrorMessage, rowSuccessMessage, waitlistAdminActionLabel } from "./waitlist-admin-labels";
import { getBetaInviteStatuses, isBetaInviteClientConfigured, type BetaInviteStatus } from "../../../lib/beta-invite-client";
import { getBuildInfo } from "../../../lib/build-info";
import { publicAppUrl } from "../../../lib/deployment";
import { getMarketingLocale, type MarketingLocale } from "../../../lib/locale";
import {
  formatWaitlistAllowlist,
  normalizeWaitlistAllowlistLimit,
  normalizeWaitlistStatusFilter,
  type WaitlistStatusFilter,
} from "../../../lib/waitlist-admin";
import {
  countWaitlistAdmin,
  isWaitlistConfigured,
  listWaitlistAdminEntries,
  waitlistRetentionPolicy,
  type WaitlistAdminEntry,
} from "../../../lib/waitlist-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Waitlist Admin · BloomMD",
  robots: { index: false, follow: false },
};

interface WaitlistAdminPageProps {
  searchParams: Promise<{
    limit?: string;
    status?: string;
    invited?: string;
    inviteError?: string;
    inviteMail?: string;
    resent?: string;
    resendError?: string;
    deleted?: string;
    deleteError?: string;
    adminError?: string;
    actionEmail?: string;
    lang?: string;
  }>;
}

const waitlistStatusLabels: Record<MarketingLocale, Record<WaitlistAdminEntry["status"], string>> = {
  de: { pending: "Offen", confirmed: "Bestätigt", unsubscribed: "Abgemeldet" },
  en: { pending: "Pending", confirmed: "Confirmed", unsubscribed: "Unsubscribed" },
};

const betaInviteStatusLabels: Record<MarketingLocale, Record<BetaInviteStatus, string>> = {
  de: { none: "Nicht eingeladen", invited: "Eingeladen", accepted: "Angenommen", revoked: "Widerrufen", expired: "Abgelaufen" },
  en: { none: "Not invited", invited: "Invited", accepted: "Accepted", revoked: "Revoked", expired: "Expired" },
};

const betaWorkflowStatusLabels: Record<MarketingLocale, Record<BetaInviteStatus | "pending" | "confirmed" | "unsubscribed", string>> = {
  de: { pending: "Bestätigung offen", confirmed: "Bereit zur Einladung", none: "Nicht eingeladen", invited: "Eingeladen", accepted: "Account erstellt", revoked: "Einladung widerrufen", expired: "Einladung abgelaufen", unsubscribed: "Abgemeldet" },
  en: { pending: "Confirmation pending", confirmed: "Ready to invite", none: "Not invited", invited: "Invited", accepted: "Account created", revoked: "Invitation revoked", expired: "Invitation expired", unsubscribed: "Unsubscribed" },
};

function formatDateTime(value: string, locale: MarketingLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatOptionalDateTime(value: string | null, locale: MarketingLocale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function filterHref(status: WaitlistStatusFilter, limit: number, locale: MarketingLocale) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status !== "all") params.set("status", status);
  params.set("lang", locale);
  return `/admin/waitlist?${params.toString()}`;
}

function StatusBadge({ status, locale }: { status: WaitlistAdminEntry["status"]; locale: MarketingLocale }) {
  const className =
    status === "confirmed"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "unsubscribed"
        ? "border-neutral-300 bg-neutral-100 text-neutral-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${className}`}>
      {waitlistStatusLabels[locale][status]}
    </span>
  );
}

function BetaInviteBadge({ status, locale }: { status: BetaInviteStatus; locale: MarketingLocale }) {
  const className =
    status === "accepted"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "invited"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : status === "expired" || status === "revoked"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-neutral-200 bg-neutral-50 text-neutral-600";

  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${className}`}>
      {betaInviteStatusLabels[locale][status]}
    </span>
  );
}

function inviteMailMessage(status: string | undefined, email: string | undefined, locale: MarketingLocale = "de") {
  if (!email) return null;
  const en = locale === "en";
  switch (status) {
    case "sent":
      return en ? `Invitation for ${email} was created and sent by email.` : `Einladung für ${email} wurde erstellt und per E-Mail versendet.`;
    case "already-invited":
      return en ? `Invitation for ${email} is active. No new email was sent.` : `Einladung für ${email} ist aktiv. Es wurde keine neue E-Mail versendet.`;
    case "not-configured":
      return en ? `Invitation for ${email} is active, but the mail provider is not configured. Use the signup link as a fallback.` : `Einladung für ${email} ist aktiv, aber der Mail-Provider ist nicht konfiguriert. Nutze den Signup-Link als Fallback.`;
    case "provider-error":
      return en ? `Invitation for ${email} is active, but the mail provider rejected delivery. Use the signup link as a fallback.` : `Einladung für ${email} ist aktiv, aber der Mail-Provider hat den Versand abgelehnt. Nutze den Signup-Link als Fallback.`;
    case "disabled":
      return en ? `Invitation for ${email} is active. Email delivery was disabled for this action.` : `Einladung für ${email} ist aktiv. Der Mailversand war für diese Aktion deaktiviert.`;
    case "unknown":
      return en ? `Invitation for ${email} is active. The email status could not be determined.` : `Einladung für ${email} ist aktiv. Der Mailstatus konnte nicht ermittelt werden.`;
    default:
      return en ? `Invitation for ${email} was created.` : `Einladung für ${email} wurde erstellt.`;
  }
}

function rowFeedbackForEntry(
  entryEmail: string,
  params: {
    invited?: string;
    inviteMail?: string;
    resent?: string;
    actionEmail?: string;
    inviteError?: string;
    adminError?: string;
    resendError?: string;
    deleteError?: string;
    locale?: MarketingLocale;
  },
) {
  const success = rowSuccessMessage({
    entryEmail,
    invited: params.invited,
    inviteMail: params.inviteMail,
    resent: params.resent,
    locale: params.locale,
  });
  if (success) return { tone: "success" as const, message: success };

  const error = rowErrorMessage({
    entryEmail,
    actionEmail: params.actionEmail,
    inviteError: params.inviteError,
    adminError: params.adminError,
    resendError: params.resendError,
    deleteError: params.deleteError,
    locale: params.locale,
  });
  if (error) return { tone: "error" as const, message: error };

  return null;
}

function WorkflowCard({ label, value, description }: { label: string; value: number | string; description: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-700">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#1A1A1A]">{value}</p>
      <p className="mt-2 text-sm leading-5 text-neutral-600">{description}</p>
    </div>
  );
}

function signupUrl(email: string, locale: MarketingLocale) {
  const url = new URL("/signup", publicAppUrl());
  url.searchParams.set("email", email);
  url.searchParams.set("next", "/app");
  url.searchParams.set("lang", locale);
  return url.toString();
}

function ActionCell({
  entry,
  inviteStatus,
  inviteConfigured,
  inviteStatusAvailable,
  actionContext,
  locale,
}: {
  entry: WaitlistAdminEntry;
  inviteStatus: BetaInviteStatus;
  inviteConfigured: boolean;
  inviteStatusAvailable: boolean;
  actionContext: { status: WaitlistStatusFilter; limit: number };
  locale: MarketingLocale;
}) {
  const label = waitlistAdminActionLabel({ waitlistStatus: entry.status, betaInviteStatus: inviteStatus, inviteConfigured, locale });

  const deleteAction = (
    <WaitlistActionForm
      action={deleteWaitlistEntryAction}
      email={entry.email}
      label={locale === "en" ? "Delete" : "Löschen"}
      pendingLabel={locale === "en" ? "Deleting…" : "Lösche..."}
      ariaLabel={locale === "en" ? `Delete ${entry.email} from the waitlist` : `${entry.email} aus der Waitlist löschen`}
      variant="danger"
      confirmBeforeSubmit
      locale={locale}
      hiddenFields={{ intent: "delete", status: actionContext.status, limit: String(actionContext.limit), lang: locale }}
    />
  );

  if (entry.status === "pending") {
    const pendingActionLabel = label ?? (locale === "en" ? "Resend confirmation" : "Bestätigung erneut senden");
    return (
      <div className="flex flex-col items-start gap-3 lg:items-end">
        <WaitlistActionForm
          action={resendWaitlistConfirmationAction}
          email={entry.email}
          label={pendingActionLabel}
          pendingLabel={locale === "en" ? "Sending…" : "Sende..."}
          ariaLabel={locale === "en" ? `Resend confirmation email to ${entry.email}` : `Bestätigungs-E-Mail an ${entry.email} erneut senden`}
          variant="warning"
          locale={locale}
          hiddenFields={{ intent: "resend-confirmation", status: actionContext.status, limit: String(actionContext.limit), lang: locale }}
        />
        {deleteAction}
      </div>
    );
  }

  if (entry.status === "unsubscribed") {
    return deleteAction;
  }

  if (!inviteStatusAvailable) {
    return (
      <div className="flex flex-col items-start gap-3 lg:items-end">
        <span className="text-sm font-medium text-amber-700">{locale === "en" ? "Invite status unavailable" : "Invite-Status nicht verfügbar"}</span>
        {deleteAction}
      </div>
    );
  }

  if (!inviteConfigured) {
    return (
      <div className="flex flex-col items-start gap-3 lg:items-end">
        <span className="text-sm font-medium text-amber-700">{label}</span>
        {deleteAction}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 lg:items-end">
      {label ? (
        <WaitlistActionForm
          action={inviteWaitlistAction}
          email={entry.email}
          label={label}
          pendingLabel={locale === "en" ? "Sending…" : "Sende..."}
          ariaLabel={inviteStatus === "invited" ? (locale === "en" ? `Resend beta invitation to ${entry.email}` : `Beta-Einladung an ${entry.email} erneut senden`) : (locale === "en" ? `Invite ${entry.email} to the beta` : `${entry.email} zur Beta einladen`)}
          variant="primary"
          locale={locale}
          hiddenFields={{
            intent: "invite",
            mode: inviteStatus === "invited" ? "resend" : "invite",
            status: actionContext.status,
            limit: String(actionContext.limit),
            lang: locale,
          }}
        />
      ) : (
        <span className="text-sm text-neutral-400">{locale === "en" ? "No further invitation needed" : "Keine weitere Einladung nötig"}</span>
      )}
      {deleteAction}
    </div>
  );
}

function WaitlistEntryCard({
  entry,
  inviteStatus,
  inviteConfigured,
  inviteStatusAvailable,
  actionContext,
  rowFeedback,
  locale,
}: {
  entry: WaitlistAdminEntry;
  inviteStatus: BetaInviteStatus;
  inviteConfigured: boolean;
  inviteStatusAvailable: boolean;
  actionContext: { status: WaitlistStatusFilter; limit: number };
  rowFeedback?: { tone: "success" | "error"; message: string } | null;
  locale: MarketingLocale;
}) {
  const canUseSignupLink = inviteStatus === "invited";
  const flowStatus = entry.status === "pending" || entry.status === "unsubscribed"
    ? entry.status
    : inviteStatus === "none"
      ? "confirmed"
      : inviteStatus;
  const statusDescription = !inviteStatusAvailable && entry.status === "confirmed"
    ? (locale === "en" ? "The beta invite status could not be loaded. Reload before sending an invitation." : "Der Beta-Invite-Status konnte nicht geladen werden. Lade die Seite neu, bevor du eine Einladung sendest.")
    : canUseSignupLink
    ? (locale === "en" ? "Beta access is enabled. The user creates an account with their own password through the signup link." : "Der Beta-Zugang ist freigeschaltet. Der Nutzer erstellt den Account mit eigenem Passwort über den Signup-Link.")
    : inviteStatus === "accepted"
      ? (locale === "en" ? "The user accepted beta access and created an account." : "Der Nutzer hat den Beta-Zugang angenommen und einen Account erstellt.")
      : entry.status === "confirmed"
        ? (locale === "en" ? "Ready for the beta invitation." : "Bereit für die Beta-Einladung.")
        : entry.status === "pending"
          ? (locale === "en" ? "Still waiting for waitlist email confirmation." : "Wartet noch auf die Bestätigung der Waitlist-E-Mail.")
          : (locale === "en" ? "No longer on the active waitlist." : "Nicht mehr auf der aktiven Waitlist.");

  return (
    <article
      className={`grid gap-4 border-t px-5 py-4 lg:grid-cols-[minmax(280px,1.4fr)_minmax(220px,0.9fr)_minmax(260px,0.9fr)] lg:items-start ${
        rowFeedback?.tone === "success"
          ? "border-l-4 border-l-green-500 bg-green-50/40"
          : rowFeedback?.tone === "error"
            ? "border-l-4 border-l-red-500 bg-red-50/40"
            : "border-neutral-100"
      }`}
    >
      <div>
        <p className="break-all text-base font-semibold text-[#1A1A1A]">{entry.email}</p>
        <dl className="mt-3 grid gap-1 text-sm text-neutral-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-neutral-500">{locale === "en" ? "Joined" : "Eingetragen"}</dt>
            <dd>{formatDateTime(entry.createdAt, locale)}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">{locale === "en" ? "Source" : "Quelle"}</dt>
            <dd className="break-words">{entry.source ?? "—"}</dd>
          </div>
          {entry.confirmedAt && (
            <div>
            <dt className="font-medium text-neutral-500">{locale === "en" ? "Confirmed" : "Bestätigt"}</dt>
              <dd>{formatDateTime(entry.confirmedAt, locale)}</dd>
            </div>
          )}
          {entry.unsubscribedAt && (
            <div>
            <dt className="font-medium text-neutral-500">{locale === "en" ? "Unsubscribed" : "Abgemeldet"}</dt>
              <dd>{formatDateTime(entry.unsubscribedAt, locale)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-700">{locale === "en" ? "Status" : "Status"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge status={entry.status} locale={locale} />
          <BetaInviteBadge status={inviteStatus} locale={locale} />
        </div>
        <p className="mt-3 text-sm font-medium text-[#1A1A1A]">{betaWorkflowStatusLabels[locale][flowStatus]}</p>
        <p className="mt-1 text-sm leading-5 text-neutral-600">{statusDescription}</p>
        {rowFeedback && (
          <p
            role={rowFeedback.tone === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mt-3 rounded-md border px-3 py-2 text-sm font-medium ${
              rowFeedback.tone === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {rowFeedback.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:items-end">
        <ActionCell
          entry={entry}
          inviteStatus={inviteStatus}
          inviteConfigured={inviteConfigured}
          inviteStatusAvailable={inviteStatusAvailable}
          actionContext={actionContext}
          locale={locale}
        />
        {canUseSignupLink && (
          <div className="flex flex-col gap-2 lg:items-end">
            <CopySignupLink url={signupUrl(entry.email, locale)} />
            <a href={signupUrl(entry.email, locale)} className="text-xs font-semibold text-[#B64A1F] hover:text-[#FF6B35]">
              {locale === "en" ? "Open signup link" : "Signup-Link öffnen"}
            </a>
          </div>
        )}
      </div>
    </article>
  );
}

export default async function WaitlistAdminPage({ searchParams }: WaitlistAdminPageProps) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const limit = normalizeWaitlistAllowlistLimit(params.limit);
  const statusFilter = normalizeWaitlistStatusFilter(params.status);

  let state:
    | { kind: "not-configured" }
    | { kind: "error"; message: string }
    | { kind: "ready"; counts: Awaited<ReturnType<typeof countWaitlistAdmin>>; entries: Awaited<ReturnType<typeof listWaitlistAdminEntries>> };

  if (!isWaitlistConfigured()) {
    state = { kind: "not-configured" };
  } else {
    try {
      const [counts, entries] = await Promise.all([countWaitlistAdmin(), listWaitlistAdminEntries()]);
      state = { kind: "ready", counts, entries };
    } catch (error) {
      console.error("[BloomMD] Waitlist admin load failed:", error instanceof Error ? error.name : "unknown");
      state = {
        kind: "error",
        message: locale === "en" ? "The waitlist database is currently unreachable." : "Die Waitlist-Datenbank ist aktuell nicht erreichbar.",
      };
    }
  }

  const entries = state.kind === "ready" ? state.entries : [];
  const confirmedEntries = entries
    .filter((entry) => entry.status === "confirmed" && entry.confirmedAt)
    .sort((left, right) => left.confirmedAt!.localeCompare(right.confirmedAt!))
    .map((entry) => ({ email: entry.email, confirmedAt: entry.confirmedAt!, source: entry.source }));
  const visibleEntries = statusFilter === "all" ? entries : entries.filter((entry) => entry.status === statusFilter);
  const allowlist = formatWaitlistAllowlist(confirmedEntries, limit);
  let inviteStatuses = new Map<string, BetaInviteStatus>();
  let inviteStatusError = false;
  const inviteConfigured = isBetaInviteClientConfigured();
  if (state.kind === "ready" && inviteConfigured) {
    try {
      inviteStatuses = await getBetaInviteStatuses(entries.map((entry) => entry.email));
    } catch (error) {
      inviteStatusError = true;
      console.error("[BloomMD] Waitlist beta invite statuses failed:", error instanceof Error ? error.name : "unknown");
    }
  }
  const inviteStatusCounts = entries.reduce((counts, entry) => {
    const status = inviteStatuses.get(entry.email.toLowerCase()) ?? "none";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {} as Record<BetaInviteStatus, number>);
  const errorMessage = inviteMessage(params.inviteError, locale);
  const successMessage = inviteMailMessage(params.inviteMail, params.invited, locale);
  const resendErrorMessage = actionMessage("resend", params.resendError, locale);
  const deleteErrorMessage = actionMessage("delete", params.deleteError, locale);
  const adminErrorMessage = actionMessage("resend", params.adminError, locale);
  const buildInfo = getBuildInfo("marketing");
  const formattedBuildTime = formatOptionalDateTime(buildInfo.buildTime, locale);
  const retentionPolicy = waitlistRetentionPolicy();

  return (
    <main className="min-h-screen bg-[#F7F5F2] px-6 py-10 text-[#1A1A1A]">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9A3412]">BloomMD Admin</p>
            <h1 className="mt-2 text-4xl font-semibold">Waitlist</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
              {locale === "en" ? "All waitlist entries from the separate marketing database. Only confirmed, non-unsubscribed addresses enter the beta allowlist." : "Alle Waitlist-Einträge aus der getrennten Marketing-Datenbank. In die Beta-Allowlist gehen nur bestätigte, nicht abgemeldete Adressen."}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
              Retention: {locale === "en" ? <>Pending entries are cleaned up after {retentionPolicy.pendingDays} days and unsubscribed entries after {retentionPolicy.unsubscribedDays} days. Confirmed addresses remain for invite waves.</> : <>Offene Einträge werden nach {retentionPolicy.pendingDays} Tagen bereinigt, abgemeldete Einträge nach {retentionPolicy.unsubscribedDays} Tagen. Bestätigte Adressen bleiben für Einladungswellen erhalten.</>}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
              {locale === "en" ? "Deleting removes only the entry from this waitlist. Existing product accounts or beta invitations are not deleted or revoked." : "Die Löschaktion entfernt nur den Eintrag aus dieser Waitlist. Bestehende Produkt-Accounts oder Beta-Einladungen werden dadurch nicht gelöscht oder widerrufen."}
            </p>
            <p className="mt-3 font-mono text-xs text-neutral-700" data-testid="admin-build-version">
              {locale === "en" ? "Marketing build" : "Marketing-Build"} {buildInfo.version}
              {buildInfo.shortSha ? ` · ${buildInfo.shortSha}` : ""}
              {formattedBuildTime ? ` · ${formattedBuildTime}` : ""}
            </p>
          </div>
          <a
            href="/admin/waitlist/export.csv"
            className="inline-flex h-11 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-[#1A1A1A] hover:border-[#FF6B35]"
          >
            {locale === "en" ? "Export CSV" : "CSV exportieren"}
          </a>
        </div>

        {state.kind === "not-configured" && (
          <section className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-950">
            <h2 className="text-lg font-semibold">{locale === "en" ? "Waitlist database not configured" : "Waitlist-Datenbank nicht konfiguriert"}</h2>
            <p className="mt-2 text-sm leading-6">
              {locale === "en" ? "Set BLOOMMD_WAITLIST_DATABASE_URL so the admin view can load entries. Admin access itself is already active." : "Setze `BLOOMMD_WAITLIST_DATABASE_URL`, damit die Admin-Ansicht Einträge laden kann. Der Admin-Zugriff selbst ist bereits aktiv."}
            </p>
          </section>
        )}

        {state.kind === "error" && (
          <section className="mt-8 rounded-md border border-red-300 bg-red-50 p-5 text-red-950">
            <h2 className="text-lg font-semibold">{locale === "en" ? "Could not load waitlist" : "Waitlist konnte nicht geladen werden"}</h2>
            <p className="mt-2 text-sm leading-6">{state.message}</p>
          </section>
        )}

        {state.kind === "ready" && (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label={locale === "en" ? "Beta workflow counters" : "Beta-Workflow-Zähler"}>
              <WorkflowCard label={locale === "en" ? "Pending" : "Offen"} value={state.counts.pending} description={locale === "en" ? "Waiting for email confirmation." : "Wartet auf E-Mail-Bestätigung."} />
              <WorkflowCard label={locale === "en" ? "Confirmed" : "Bestätigt"} value={state.counts.confirmed} description={locale === "en" ? "Can be invited to the beta." : "Darf in die Beta eingeladen werden."} />
              <WorkflowCard label={locale === "en" ? "Invited" : "Eingeladen"} value={inviteStatusError ? "—" : inviteStatusCounts.invited ?? 0} description={locale === "en" ? "Signup link is active." : "Signup-Link ist aktiv."} />
              <WorkflowCard label={locale === "en" ? "Accepted" : "Angenommen"} value={inviteStatusError ? "—" : inviteStatusCounts.accepted ?? 0} description={locale === "en" ? "Account was created." : "Account wurde erstellt."} />
              <WorkflowCard label={locale === "en" ? "Unsubscribed" : "Abgemeldet"} value={state.counts.unsubscribed} description={locale === "en" ? "Can be deleted manually." : "Kann manuell gelöscht werden."} />
              <WorkflowCard label={locale === "en" ? "Total" : "Gesamt"} value={state.counts.total} description={locale === "en" ? "All waitlist entries." : "Alle Waitlist-Einträge."} />
            </section>

            <section className="mt-8 rounded-md border border-neutral-200 bg-white p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{locale === "en" ? "Beta invitations" : "Beta-Einladungen"}</h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    {locale === "en" ? "An invitation enables registration. The user then creates their own account and password through the signup link." : "Eine Einladung schaltet die Registrierung frei. Der Nutzer erstellt danach selbst Account und Passwort über den Signup-Link."}
                  </p>
                </div>
              </div>
              {successMessage && (
                <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                  {successMessage}
                </p>
              )}
              {params.resent && (
                <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                  {locale === "en" ? "Confirmation link for" : "Bestätigungslink für"} {params.resent} {locale === "en" ? "was sent again." : "wurde erneut gesendet."}
                </p>
              )}
              {params.deleted && (
                <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                  {params.deleted} {locale === "en" ? "was deleted from the waitlist." : "wurde aus der Waitlist gelöscht."}
                </p>
              )}
              {errorMessage && (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {errorMessage}
                </p>
              )}
              {resendErrorMessage && (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {resendErrorMessage}
                </p>
              )}
              {deleteErrorMessage && (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {deleteErrorMessage}
                </p>
              )}
              {adminErrorMessage && (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {adminErrorMessage}
                </p>
              )}
              {inviteStatusError && (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  {locale === "en" ? "Beta invite statuses could not be loaded. Invitations are temporarily disabled; reload the page and try again." : "Die Beta-Invite-Status konnten nicht geladen werden. Einladungssendungen sind vorübergehend deaktiviert; lade die Seite neu und versuche es erneut."}
                </p>
              )}
              {!inviteConfigured && (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  {locale === "en" ? "Inviting is disabled until `BLOOMMD_APP_INTERNAL_URL` and `BLOOMMD_INTERNAL_INVITE_SECRET` are set." : "Einladen ist deaktiviert, bis `BLOOMMD_APP_INTERNAL_URL` und `BLOOMMD_INTERNAL_INVITE_SECRET` gesetzt sind."}
                </p>
              )}
              <details className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-neutral-800">{locale === "en" ? "Show env allowlist fallback" : "Env-Allowlist-Fallback anzeigen"}</summary>
                <form className="mt-4 flex flex-wrap items-center gap-2">
                  <label htmlFor="limit" className="text-sm font-medium text-neutral-600">{locale === "en" ? "Count" : "Anzahl"}</label>
                  <input
                    id="limit"
                    name="limit"
                    type="number"
                    min="1"
                    max="500"
                    defaultValue={limit}
                    className="h-10 w-24 rounded-md border border-neutral-300 px-3 text-sm"
                  />
                  <button type="submit" className="h-10 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F]">
                    {locale === "en" ? "Update" : "Aktualisieren"}
                  </button>
                </form>
                <textarea
                  readOnly
                  data-testid="waitlist-allowlist"
                  className="mt-4 min-h-24 w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-sm text-neutral-900"
                  value={allowlist}
                />
              </details>
            </section>

            <section className="mt-8 overflow-hidden rounded-md border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{locale === "en" ? "Email entries" : "E-Mail-Einträge"}</h2>
                    <p className="mt-1 text-sm text-neutral-600">{locale === "en" ? "Pending entries are still waiting for email confirmation." : "Offene Einträge warten noch auf die Bestätigung per E-Mail."}</p>
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label={locale === "en" ? "Waitlist status filter" : "Waitlist-Statusfilter"}>
                    {[
                      { status: "all" as const, label: locale === "en" ? "All" : "Alle", count: state.counts.total },
                      { status: "confirmed" as const, label: locale === "en" ? "Confirmed" : "Bestätigt", count: state.counts.confirmed },
                      { status: "pending" as const, label: locale === "en" ? "Pending" : "Offen", count: state.counts.pending },
                      { status: "unsubscribed" as const, label: locale === "en" ? "Unsubscribed" : "Abgemeldet", count: state.counts.unsubscribed },
                    ].map((filter) => (
                      <a
                        key={filter.status}
                        href={filterHref(filter.status, limit, locale)}
                        className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                          statusFilter === filter.status
                            ? "border-[#C94317] bg-[#FFF4EE] text-[#A93612]"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-[#FF6B35] hover:text-[#1A1A1A]"
                        }`}
                      >
                        {filter.label} ({filter.count})
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              {visibleEntries.length === 0 ? (
                <p className="px-5 py-8 text-sm text-neutral-600">{locale === "en" ? "No waitlist entries for this filter." : "Keine Waitlist-Einträge für diesen Filter."}</p>
              ) : (
                <div>
                  {visibleEntries.map((entry) => (
                    <WaitlistEntryCard
                      key={`${entry.email}-${entry.createdAt}`}
                      entry={entry}
                      inviteStatus={inviteStatuses.get(entry.email.toLowerCase()) ?? "none"}
                      inviteConfigured={inviteConfigured}
                      inviteStatusAvailable={!inviteStatusError}
                      actionContext={{ status: statusFilter, limit }}
                      rowFeedback={rowFeedbackForEntry(entry.email, { ...params, locale })}
                      locale={locale}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
