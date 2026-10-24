import Link from "next/link";
import { type BloomSession } from "../../lib/auth";
import { authCopy, formatAuthDate, roleLabel, type AuthLocale } from "../../lib/auth-copy";
import type { WorkspaceInvitationPreview } from "../../lib/db";
import { appendAuthParams } from "../../lib/invite-intent";
import { WorkspaceInviteActions } from "./WorkspaceInviteActions";

interface WorkspaceInviteCardProps {
  invitation: WorkspaceInvitationPreview;
  handoff: string | null;
  locale: AuthLocale;
  session: BloomSession | null;
}

function inviterLabel(invitation: WorkspaceInvitationPreview) {
  return invitation.inviterName?.trim() || invitation.inviterEmail;
}

export function WorkspaceInviteCard({ invitation, handoff, locale, session }: WorkspaceInviteCardProps) {
  const copy = authCopy[locale];
  const inviteEmail = invitation.email.toLowerCase();
  const accountEmail = session?.email.toLowerCase() ?? null;
  const emailMismatch = Boolean(accountEmail && accountEmail !== inviteEmail);
  const canAccept = invitation.status === "pending" && Boolean(handoff) && Boolean(session) && !emailMismatch;
  const authParams = { invite: handoff, lang: locale };
  const signUpHref = appendAuthParams("/signup", authParams);
  const signInHref = appendAuthParams("/login", authParams);
  const logoutReturn = appendAuthParams("/invite/confirm", authParams);
  const statusCopy = invitation.status === "expired"
    ? copy.invitationExpired
    : invitation.status === "revoked"
      ? copy.invitationRevoked
      : invitation.status === "accepted"
        ? copy.invitationAccepted
        : null;

  return (
    <section className="w-full max-w-5xl rounded-2xl border border-[#E8E4DF] bg-white p-5 shadow-sm sm:p-8" data-testid="workspace-invite-card">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B64A1F]">{copy.invitation}</p>
          <h1 className="mt-3 font-[var(--font-outfit)] text-3xl font-semibold tracking-tight text-[#1A1A1A] sm:text-4xl">{copy.invitedBy(inviterLabel(invitation), invitation.workspaceName)}</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#5F574F]">{copy.invitationPending}</p>
          <div className="mt-7 flex items-center gap-2 text-sm text-[#5F574F]" aria-label={`${copy.invitationStep} · ${copy.authStep} · ${copy.joinStep}`}>
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B35]" aria-hidden="true" />
            <span>{copy.invitationStep}</span>
            <span aria-hidden="true">—</span>
            <span>{copy.authStep}</span>
            <span aria-hidden="true">—</span>
            <span>{copy.joinStep}</span>
          </div>
        </div>

        <div className="rounded-xl border border-[#F4CBB8] bg-[#FFF6F1] p-5" data-testid="workspace-invite-summary">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A3518]">{copy.workspace}</p>
          <h2 className="mt-2 text-xl font-semibold text-[#1A1A1A]">{invitation.workspaceName}</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <div>
              <dt className="text-[#8A3518]">{copy.invitationRole}</dt>
              <dd className="mt-1 font-semibold text-[#1A1A1A]">{roleLabel(invitation.role, locale)}</dd>
            </div>
            <div>
              <dt className="text-[#8A3518]">{copy.invitedEmailLabel}</dt>
              <dd className="mt-1 break-all font-mono text-xs text-[#1A1A1A]">{invitation.email}</dd>
            </div>
            <div>
              <dt className="text-[#8A3518]">{copy.expiresLabel}</dt>
              <dd className="mt-1 text-[#1A1A1A]">{formatAuthDate(invitation.expiresAt, locale)}</dd>
            </div>
          </dl>

          {statusCopy && (
            <div className="mt-5 rounded-md border border-[#D4CFC8] bg-white px-3 py-3 text-sm leading-6 text-[#5F574F]" role="status" data-testid={`workspace-invite-status-${invitation.status}`}>
              {statusCopy}
            </div>
          )}

          {emailMismatch && (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-900" role="alert" data-testid="workspace-invite-email-mismatch">
              <p>{copy.invitationEmailMismatch(invitation.email, session?.email ?? "")}</p>
              <p className="mt-1">{copy.emailMismatchDetail}</p>
              <form action="/api/auth/logout" method="post" className="mt-3">
                <input type="hidden" name="next" value={logoutReturn} />
                <button type="submit" className="min-h-11 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100">
                  {copy.signOutDifferentEmail}
                </button>
              </form>
            </div>
          )}

          {canAccept && <div className="mt-5"><WorkspaceInviteActions handoff={handoff!} workspaceId={invitation.workspaceId} locale={locale} /></div>}

          {invitation.status === "pending" && !session && handoff && (
            <div className="mt-5 grid gap-3">
              <Link href={signUpHref} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#B64A1F] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#8A3518]" data-testid="workspace-invite-signup">
                {copy.createFromInvitation}
              </Link>
              <Link href={signInHref} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#B64A1F] px-4 py-2 text-center text-sm font-semibold text-[#8A3518] hover:bg-[#FFF4EE]" data-testid="workspace-invite-login">
                {copy.signInAndJoin}
              </Link>
            </div>
          )}

          {invitation.status === "accepted" && session && !emailMismatch && (
            <Link href={`/app?workspace=${encodeURIComponent(invitation.workspaceId)}`} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#B64A1F] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#8A3518]">
              {copy.openWorkspace}
            </Link>
          )}

          {invitation.status === "accepted" && !session && (
            <Link href={appendAuthParams("/login", { lang: locale })} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[#B64A1F] px-4 py-2 text-center text-sm font-semibold text-[#8A3518] hover:bg-[#FFF4EE]">
              {copy.backToSignIn}
            </Link>
          )}

          {(invitation.status === "expired" || invitation.status === "revoked") && (
            <div className="mt-5 grid gap-3">
              <a href={`mailto:${encodeURIComponent(invitation.inviterEmail)}?subject=${encodeURIComponent(`BloomMD: ${copy.invitation}`)}`} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#B64A1F] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#8A3518]">
                {copy.contactInviter}
              </a>
              <Link href={appendAuthParams("/login", { lang: locale })} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#B64A1F] px-4 py-2 text-center text-sm font-semibold text-[#8A3518] hover:bg-[#FFF4EE]">
                {copy.backToSignIn}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
