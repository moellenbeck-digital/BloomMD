"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale } from "@bloommd/ui";
import { Bot, Check, ChevronDown, Cloud, Mail, Pencil, RefreshCw, Shield, UserMinus, UserPlus, Users, X } from "lucide-react";

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
}

interface WorkspaceMember {
  userId: string;
  email: string;
  name: string | null;
  role: "owner" | "editor" | "viewer";
  createdAt: string;
}

interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface WorkspaceAgent {
  id: string;
  provider: "openclaw";
  displayName: string;
  status: "active" | "revoked";
}

interface WorkspaceManagerProps {
  activeWorkspace: WorkspaceInfo | null;
  onWorkspaceChange: (workspace: WorkspaceInfo) => void;
  onRename: () => void;
  onManageAgents?: () => void;
}

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

export function WorkspaceManager({ activeWorkspace, onWorkspaceChange, onRename, onManageAgents }: WorkspaceManagerProps) {
  const { locale } = useLocale();
  const copy = locale === "en" ? {
    workspaceLoad: "Could not load workspaces.", membersLoad: "Could not load members.", invitationsLoad: "Could not load invitations.", agentsLoad: "Could not load workspace agents.", dataLoad: "Could not load workspace data.", create: "Could not create team workspace.", created: "Team workspace created.", inviteCreate: "Could not create invitation.", sent: "Invitation sent.", createdNoMail: "Invitation created; email delivery is not configured.", revokeConfirm: "Revoke this invitation?", revoke: "Could not revoke invitation.", revoked: "Invitation revoked.", resend: "Could not resend invitation.", resent: "Invitation resent.", renewedNoMail: "Invitation renewed; email delivery is not configured.", role: "Could not change role.", roleUpdated: "Role updated.", removeConfirm: "Remove this member from the workspace?", remove: "Could not remove member.", removed: "Member removed.", leaveConfirm: "Leave this workspace?", leave: "Could not leave workspace.", rename: "Rename workspace", management: "Workspace management", workspaces: "Workspaces", manage: "Manage cloud team access and roles", active: "active", loading: "Loading workspace data…", newWorkspace: "New team workspace", newWorkspaceLabel: "Name of new team workspace", createButton: "Create", members: "Members", agent: "Agent", reviewOnly: "Review-only proposals", manageAgents: "Manage agents", invite: "Invite member", emailLabel: "Email of member to invite", roleLabel: "Invitation role", review: "Review invitation", invitationTo: "Invitation for", change: "Change", send: "Send invitation", sending: "Sending…", pending: "Open invitations", resendButton: "Resend", revokeButton: "Revoke", leaveButton: "Leave workspace", personal: "This is your personal workspace. You can create team workspaces above.", help: "Team collaboration help", ownerNote: "Owner actions are checked on the server."
  } : {
    workspaceLoad: "Workspaces konnten nicht geladen werden.", membersLoad: "Mitglieder konnten nicht geladen werden.", invitationsLoad: "Einladungen konnten nicht geladen werden.", agentsLoad: "Workspace-Agenten konnten nicht geladen werden.", dataLoad: "Workspace-Daten konnten nicht geladen werden.", create: "Team-Workspace konnte nicht erstellt werden.", created: "Team-Workspace erstellt.", inviteCreate: "Einladung konnte nicht erstellt werden.", sent: "Einladung gesendet.", createdNoMail: "Einladung angelegt; E-Mail-Versand ist derzeit nicht konfiguriert.", revokeConfirm: "Diese Einladung wirklich widerrufen?", revoke: "Einladung konnte nicht widerrufen werden.", revoked: "Einladung widerrufen.", resend: "Einladung konnte nicht erneut gesendet werden.", resent: "Einladung erneut gesendet.", renewedNoMail: "Einladung erneuert; E-Mail-Versand ist derzeit nicht konfiguriert.", role: "Rolle konnte nicht geändert werden.", roleUpdated: "Rolle aktualisiert.", removeConfirm: "Dieses Mitglied wirklich aus diesem Workspace ausladen?", remove: "Mitglied konnte nicht ausgeladen werden.", removed: "Mitglied ausgeladen.", leaveConfirm: "Diesen Workspace wirklich verlassen?", leave: "Workspace konnte nicht verlassen werden.", rename: "Workspace umbenennen", management: "Workspace-Verwaltung", workspaces: "Workspaces", manage: "Cloud-Teamzugriff und Rollen verwalten", active: "aktiv", loading: "Lade Workspace-Daten…", newWorkspace: "Neuer Team-Workspace", newWorkspaceLabel: "Name des neuen Team-Workspaces", createButton: "Erstellen", members: "Mitglieder", agent: "Agent", reviewOnly: "Nur überprüfbare Vorschläge", manageAgents: "Agenten verwalten", invite: "Mitglied einladen", emailLabel: "E-Mail des einzuladenden Mitglieds", roleLabel: "Rolle der Einladung", review: "Einladung prüfen", invitationTo: "Einladung an", change: "Ändern", send: "Einladung senden", sending: "Sende…", pending: "Offene Einladungen", resendButton: "Erneut senden", revokeButton: "Widerrufen", leaveButton: "Workspace verlassen", personal: "Das ist dein persönlicher Workspace. Team-Workspaces kannst du oben erstellen.", help: "Hilfe zu Team-Kollaboration", ownerNote: "Owner-Aktionen werden serverseitig geprüft."
  };
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [agents, setAgents] = useState<WorkspaceAgent[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteReview, setInviteReview] = useState<{ email: string; role: "editor" | "viewer" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = async () => {
    const response = await fetch("/api/workspaces", { cache: "no-store" });
    const payload = await response.json() as { workspaces?: WorkspaceInfo[]; error?: string };
    if (!response.ok || !payload.workspaces) throw new Error(errorMessage(payload, copy.workspaceLoad));
    setWorkspaces(payload.workspaces);
  };

  const loadMembers = async (workspaceId: string) => {
    const [memberResponse, invitationResponse, agentResponse] = await Promise.all([
      fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, { cache: "no-store" }),
      activeWorkspace?.role === "owner"
        ? fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/invitations`, { cache: "no-store" })
        : Promise.resolve(null),
      fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agents`, { cache: "no-store" }),
    ]);
    const memberPayload = await memberResponse.json() as { members?: WorkspaceMember[]; error?: string };
    if (!memberResponse.ok || !memberPayload.members) throw new Error(errorMessage(memberPayload, copy.membersLoad));
    setMembers(memberPayload.members);
    const agentPayload = await agentResponse.json() as { agents?: WorkspaceAgent[]; error?: string };
    if (!agentResponse.ok || !agentPayload.agents) throw new Error(errorMessage(agentPayload, copy.agentsLoad));
    setAgents(agentPayload.agents.filter((agent) => agent.status === "active"));
    if (invitationResponse) {
      const invitationPayload = await invitationResponse.json() as { invitations?: WorkspaceInvitation[]; error?: string };
      if (!invitationResponse.ok || !invitationPayload.invitations) throw new Error(errorMessage(invitationPayload, copy.invitationsLoad));
      setInvitations(invitationPayload.invitations);
    } else {
      setInvitations([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void Promise.all([
      loadWorkspaces(),
      activeWorkspace ? loadMembers(activeWorkspace.id) : Promise.resolve(),
    ]).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : copy.dataLoad))
      .finally(() => setLoading(false));
  }, [activeWorkspace, open]);

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName }),
      });
      const payload = await response.json() as { workspace?: WorkspaceInfo; error?: string };
      if (!response.ok || !payload.workspace) throw new Error(errorMessage(payload, copy.create));
      setWorkspaceName("");
      setMessage(copy.created);
      onWorkspaceChange(payload.workspace);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : copy.create);
    } finally {
      setSaving(false);
    }
  };

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeWorkspace) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteReview({ email, role: inviteRole });
  };

  const sendInvitation = async () => {
    if (!activeWorkspace || !inviteReview) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteReview.email, role: inviteReview.role, locale }),
      });
      const payload = await response.json() as { invitation?: WorkspaceInvitation; emailSent?: boolean; error?: string };
      if (!response.ok || !payload.invitation) throw new Error(errorMessage(payload, copy.inviteCreate));
      setInviteEmail("");
      setInviteReview(null);
      setMessage(payload.emailSent ? copy.sent : copy.createdNoMail);
      await loadMembers(activeWorkspace.id);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : copy.inviteCreate);
    } finally {
      setSaving(false);
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    if (!activeWorkspace || !window.confirm(copy.revokeConfirm)) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(errorMessage(payload, copy.revoke));
      setMessage(copy.revoked);
      await loadMembers(activeWorkspace.id);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : copy.revoke);
    } finally {
      setSaving(false);
    }
  };

  const resendInvitation = async (invitation: WorkspaceInvitation) => {
    if (!activeWorkspace) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invitation.email, role: invitation.role, locale }),
      });
      const payload = await response.json() as { invitation?: WorkspaceInvitation; emailSent?: boolean; error?: string };
      if (!response.ok || !payload.invitation) throw new Error(errorMessage(payload, copy.resend));
      setMessage(payload.emailSent ? copy.resent : copy.renewedNoMail);
      await loadMembers(activeWorkspace.id);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : copy.resend);
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (memberUserId: string, role: WorkspaceMember["role"]) => {
    if (!activeWorkspace) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/members/${encodeURIComponent(memberUserId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(errorMessage(payload, copy.role));
      setMessage(copy.roleUpdated);
      await loadMembers(activeWorkspace.id);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : copy.role);
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (member: WorkspaceMember) => {
    if (!activeWorkspace || !window.confirm(`${member.email} ${copy.removeConfirm}`)) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/members/${encodeURIComponent(member.userId)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(errorMessage(payload, copy.remove));
      setMessage(copy.removed);
      await loadMembers(activeWorkspace.id);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : copy.remove);
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    if (!activeWorkspace || !window.confirm(copy.leaveConfirm)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/leave`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(errorMessage(payload, copy.leave));
      window.location.assign("/app");
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : copy.leave);
      setSaving(false);
    }
  };

  const roleLabel = (role: WorkspaceMember["role"] | WorkspaceInvitation["role"]) => role === "owner" ? "Owner" : role === "viewer" ? "Viewer" : "Editor";
  const roleDescription = (role: "editor" | "viewer") => locale === "en"
    ? role === "editor" ? "Can read and edit workspace content." : "Can read workspace content only."
    : role === "editor" ? "Kann Inhalte lesen und bearbeiten." : "Kann Inhalte nur lesen.";
  const invitationExpiry = (value: string) => new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", { dateStyle: "medium" }).format(new Date(value));
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <div className="relative ml-3" data-testid="workspace-manager">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex max-w-64 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]"
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="workspace-manager-toggle"
        >
          <Cloud size={15} className="shrink-0 text-[#FF6B35]" aria-hidden="true" />
          <span className="sr-only">Cloud</span>
          <span className="max-w-36 truncate font-semibold text-[var(--color-ink)]">{activeWorkspace?.name ?? "Workspace"}</span>
          <span className="hidden text-[var(--color-ink-faint)] sm:inline">{roleLabel(activeWorkspace?.role ?? "viewer")}</span>
          <ChevronDown size={14} className="shrink-0" aria-hidden="true" />
        </button>
        {activeWorkspace?.role === "owner" && <button type="button" onClick={onRename} className="flex h-8 w-7 items-center justify-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]" title={copy.rename} aria-label={copy.rename} data-testid="rename-workspace"><Pencil size={13} /></button>}
      </div>

      {open && (
        <div className="absolute left-0 top-11 z-50 w-[min(94vw,28rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-[var(--color-ink)] shadow-xl" role="dialog" aria-label={copy.management}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{copy.workspaces}</h2>
              <p className="text-xs text-[var(--color-ink-faint)]">{copy.manage}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)]" aria-label={locale === "en" ? "Close workspace management" : "Workspace-Verwaltung schließen"}><X size={16} /></button>
          </div>

          {error && <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300" role="alert">{error}</p>}
          {message && <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300" role="status">{message}</p>}

          <div className="mt-4 grid gap-1">
            {workspaces.map((workspace) => (
              <button
                type="button"
                key={workspace.id}
                onClick={() => onWorkspaceChange(workspace)}
                className={`flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] ${workspace.id === activeWorkspace?.id ? "bg-[#FF6B35]/10" : ""}`}
                data-testid="workspace-option"
              >
                <span className="flex min-w-0 items-center gap-2"><Cloud size={14} className="shrink-0 text-[#FF6B35]" /><span className="truncate">{workspace.name}</span></span>
                <span className="ml-2 shrink-0 text-xs text-[var(--color-ink-faint)]">{roleLabel(workspace.role)}{workspace.id === activeWorkspace?.id ? ` · ${copy.active}` : ""}</span>
              </button>
            ))}
            {loading && <p className="px-2 py-2 text-xs text-[var(--color-ink-faint)]"><RefreshCw size={13} className="mr-1 inline animate-spin" />{copy.loading}</p>}
          </div>

          <form onSubmit={(event) => void createWorkspace(event)} className="mt-4 flex gap-2 border-t border-[var(--color-border)] pt-4">
            <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder={copy.newWorkspace} className="h-9 min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs outline-none focus:border-[#FF6B35]" aria-label={copy.newWorkspaceLabel} />
            <button type="submit" disabled={saving || !workspaceName.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-[#FF6B35] px-2.5 text-xs font-semibold text-white disabled:opacity-50"><Users size={14} />{copy.createButton}</button>
          </form>

          {activeWorkspace?.kind === "team" && (
            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{copy.members}</h3><span className="text-xs text-[var(--color-ink-faint)]">{members.length}</span></div>
              <div className="mt-2 grid gap-1.5">
                {members.map((member) => (
                  <div key={member.userId} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 py-2 text-xs">
                    <Shield size={13} className={member.role === "owner" ? "text-[#FF6B35]" : "text-[var(--color-ink-faint)]"} />
                    <span className="min-w-0 flex-1 truncate" title={member.email}>{member.name || member.email}<span className="ml-1 text-[var(--color-ink-faint)]">({member.email})</span></span>
                    {activeWorkspace.role === "owner" && member.role !== "owner" ? <select value={member.role} onChange={(event) => void changeRole(member.userId, event.target.value as WorkspaceMember["role"])} className="h-7 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-xs" aria-label={`${copy.roleLabel} ${member.email}`} disabled={saving}><option value="editor">Editor</option><option value="viewer">Viewer</option></select> : <span className="shrink-0 text-[var(--color-ink-faint)]">{roleLabel(member.role)}</span>}
                    {activeWorkspace.role === "owner" && member.role !== "owner" && <button type="button" onClick={() => void removeMember(member)} className="rounded p-1 text-red-600 hover:bg-red-500/10" title={copy.remove} aria-label={`${member.email} ${copy.remove}`} disabled={saving}><UserMinus size={14} /></button>}
                  </div>
                ))}
                {agents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2 rounded-md border border-[#FF6B35]/35 bg-[#FF6B35]/5 px-2.5 py-2 text-xs" data-testid="workspace-agent-member">
                    <Bot size={13} className="text-[#FF6B35]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{agent.displayName}<span className="ml-1 text-[var(--color-ink-faint)]">({copy.agent} · {copy.reviewOnly})</span></span>
                    {onManageAgents && <button type="button" onClick={onManageAgents} className="shrink-0 rounded px-1.5 py-1 font-semibold text-[#C94D20] hover:bg-[#FF6B35]/10">{copy.manageAgents}</button>}
                  </div>
                ))}
              </div>

              {activeWorkspace.role === "owner" && (
                <>
                  <form onSubmit={(event) => void invite(event)} className="mt-3 grid gap-2 rounded-md border border-dashed border-[#FF6B35]/50 bg-[#FF6B35]/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold"><UserPlus size={14} className="text-[#FF6B35]" />{copy.invite}</div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" className="min-h-10 min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs" aria-label={copy.emailLabel} />
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")} className="min-h-10 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs" aria-label={copy.roleLabel}>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                    <p className="text-[11px] leading-5 text-[var(--color-ink-faint)]">{roleDescription(inviteRole)}</p>
                    <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-1 rounded bg-[#FF6B35] px-3 text-xs font-semibold text-white disabled:opacity-50"><Mail size={13} />{copy.review}</button>
                  </form>
                  {inviteReview && (
                    <div className="mt-3 grid gap-2 rounded-md border border-[#FF6B35]/40 bg-[#FFF6F1] p-3 text-xs" role="group" aria-label={copy.review}>
                      <p className="font-semibold">{copy.invitationTo} {inviteReview.email}</p>
                      <p>{roleLabel(inviteReview.role)} · {roleDescription(inviteReview.role)}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button type="button" onClick={() => setInviteReview(null)} disabled={saving} className="min-h-10 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-semibold">{copy.change}</button>
                        <button type="button" onClick={() => void sendInvitation()} disabled={saving} className="min-h-10 rounded bg-[#FF6B35] px-3 font-semibold text-white">{saving ? copy.sending : copy.send}</button>
                      </div>
                    </div>
                  )}
                  {pendingInvitations.length > 0 && <div className="mt-3"><h4 className="text-xs font-semibold text-[var(--color-ink-muted)]">{copy.pending}</h4><div className="mt-1 grid gap-1">{pendingInvitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--color-surface-sunken)] px-2 py-2 text-xs"><Mail size={13} className="shrink-0 text-[var(--color-ink-faint)]" /><span className="min-w-0 flex-1 truncate">{invitation.email}<span className="ml-1 text-[var(--color-ink-faint)]">· {roleLabel(invitation.role)} · {invitationExpiry(invitation.expiresAt)}</span></span><button type="button" onClick={() => void resendInvitation(invitation)} className="min-h-9 rounded px-1.5 py-1 text-[var(--color-ink-muted)] hover:bg-[var(--color-border)]" disabled={saving}>{copy.resendButton}</button><button type="button" onClick={() => void revokeInvitation(invitation.id)} className="min-h-9 rounded px-1.5 py-1 text-red-600 hover:bg-red-500/10" disabled={saving}>{copy.revokeButton}</button></div>)}</div></div>}
                </>
              )}
              {activeWorkspace.role !== "owner" && <button type="button" onClick={() => void leave()} disabled={saving} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-300"><UserMinus size={14} />{copy.leaveButton}</button>}
            </div>
          )}
          {activeWorkspace?.kind === "personal" && <p className="mt-4 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-ink-faint)]">{copy.personal}</p>}
          <a href={`https://bloommd.io/docs/collaboration?lang=${locale}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-xs font-semibold text-[#C94D20] hover:underline">{copy.help}</a>
          {activeWorkspace?.role === "owner" && <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]"><Check size={12} className="mr-1 inline text-emerald-600" />{copy.ownerNote}</p>}
        </div>
      )}
    </div>
  );
}
