"use client";

import { useState } from "react";
import { Check, Clipboard, KeyRound, Trash2 } from "lucide-react";
import type { AccessTokenRecord } from "../../lib/db";
import type { AppLocale } from "../../lib/locale";

function date(value: string | null, locale: AppLocale) {
  return value ? new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", { dateStyle: "medium" }).format(new Date(value)) : locale === "de" ? "nie" : "never";
}

interface TokenWorkspace {
  id: string;
  name: string;
  kind: "personal" | "team";
}

export function AccessTokens({ initialTokens, workspaces = [], locale }: { initialTokens: AccessTokenRecord[]; workspaces?: TokenWorkspace[]; locale: AppLocale }) {
  const copy = locale === "de"
    ? { purpose: "Für", desktop: "BloomMD Desktop (voller Zugriff)", agent: "KI-Agent (z. B. OpenClaw)", agentName: "Name des Agenten", access: "Recht", readOnly: "Nur lesen", readWrite: "Lesen und schreiben", workspace: "Workspace", allWorkspaces: "Alle meine Workspaces", agentHint: "Agenten-Tokens gelten nur für Dokumente, nie für Konto, Mitglieder oder Abrechnung. Schreibzugriffe stehen mit dem Agenten-Namen im Audit-Log.", allowShare: "Darf Lese-Links erstellen (Inhalte ohne Konto teilen)", shareBadge: "darf teilen", agentBadge: "Agent", appBadge: "App", appHint: "BloomMD-App: per Anmeldung in der App verbunden. Widerrufen meldet das Gerät ab.", readBadge: "nur lesen", limitedBadge: "begrenzt auf Workspace", title: "Desktop- und Agenten-Zugriff", intro: "Erzeuge ein persönliches Token für die Desktop-App oder einen KI-Agenten. Es wird nur einmal vollständig angezeigt.", device: "Gerätename", validity: "Gültigkeit", days: "Tage", year: "Jahr", create: "Token erzeugen", paste: "Jetzt in BloomMD Desktop einfügen. Danach wird dieses Token nicht erneut angezeigt.", copy: "Token kopieren", empty: "Noch keine Desktop-Tokens.", valid: "Gültig bis", revoked: "Abgelaufen oder widerrufen", lastUsed: "Zuletzt genutzt", revoke: "Widerrufen" }
    : { purpose: "For", desktop: "BloomMD Desktop (full access)", agent: "AI agent (e.g. OpenClaw)", agentName: "Agent name", access: "Access", readOnly: "Read only", readWrite: "Read and write", workspace: "Workspace", allWorkspaces: "All my workspaces", agentHint: "Agent tokens only work for documents, never for account, members or billing. Writes appear in the audit log with the agent's name.", allowShare: "May create read-only links (share content without an account)", shareBadge: "may share", agentBadge: "Agent", appBadge: "App", appHint: "BloomMD app: connected by signing in from the app. Revoking signs that device out.", readBadge: "read only", limitedBadge: "limited to workspace", title: "Desktop and agent access", intro: "Create a personal token for the Desktop app or an AI agent. It is shown in full only once.", device: "Device name", validity: "Validity", days: "days", year: "year", create: "Create token", paste: "Paste this into BloomMD Desktop now. The token will not be shown in full again.", copy: "Copy token", empty: "No Desktop tokens yet.", valid: "Valid until", revoked: "Expired or revoked", lastUsed: "Last used", revoke: "Revoke" };
  const [tokens, setTokens] = useState(initialTokens);
  const [createdToken, setCreatedToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState<"desktop" | "agent">("desktop");

  async function createToken(formData: FormData) {
    setBusy(true);
    setError("");
    setCreatedToken("");
    try {
      const response = await fetch("/api/account/access-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || "BloomMD Desktop"),
          expiresInDays: Number(formData.get("expiresInDays") || 90),
          ...(purpose === "agent"
            ? {
                agentName: String(formData.get("agentName") || "Agent"),
                scope: formData.get("scope") === "read" ? "read" : "write",
                ...(formData.get("workspaceId") ? { workspaceIds: [String(formData.get("workspaceId"))] } : {}),
                allowShare: formData.get("allowShare") === "on",
              }
            : {}),
        }),
      });
      const data = await response.json() as Partial<AccessTokenRecord> & { token?: string; error?: string };
      if (!response.ok || !data.token || !data.id) throw new Error(data.error || (locale === "de" ? "Token konnte nicht erstellt werden." : "Token could not be created."));
      setCreatedToken(data.token);
      setTokens((current) => [{
        id: data.id!,
        name: data.name!,
        createdAt: data.createdAt!,
        expiresAt: data.expiresAt ?? null,
        lastUsedAt: null,
        revokedAt: null,
        scope: data.scope ?? "write",
        workspaceIds: data.workspaceIds ?? null,
        agentName: data.agentName ?? null,
        allowShare: data.allowShare ?? false,
        client: null,
      }, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (locale === "de" ? "Token konnte nicht erstellt werden." : "Token could not be created."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/access-tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });
      if (!response.ok) throw new Error(locale === "de" ? "Token konnte nicht widerrufen werden." : "Token could not be revoked.");
      setTokens((current) => current.map((token) => token.id === tokenId ? { ...token, revokedAt: new Date().toISOString() } : token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (locale === "de" ? "Token konnte nicht widerrufen werden." : "Token could not be revoked."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <KeyRound size={19} className="text-[#FF6B35]" aria-hidden="true" />
        <h2 className="text-xl font-semibold">{copy.title}</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#666666]">
        {copy.intro}
      </p>

      <form action={createToken} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
        <label className="grid gap-1 text-sm font-medium sm:col-span-3">
          {copy.purpose}
          <select name="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value === "agent" ? "agent" : "desktop")} className="h-11 rounded-md border border-[#D4CFC8] bg-white px-3 outline-none focus:border-[#FF6B35]">
            <option value="desktop">{copy.desktop}</option>
            <option value="agent">{copy.agent}</option>
          </select>
        </label>
        {purpose === "agent" && (
          <div className="grid gap-3 sm:col-span-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">
              {copy.agentName}
              <input name="agentName" defaultValue="OpenClaw" required maxLength={60} className="h-11 rounded-md border border-[#D4CFC8] px-3 outline-none focus:border-[#FF6B35]" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {copy.access}
              <select name="scope" defaultValue="write" className="h-11 rounded-md border border-[#D4CFC8] bg-white px-3 outline-none focus:border-[#FF6B35]">
                <option value="write">{copy.readWrite}</option>
                <option value="read">{copy.readOnly}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {copy.workspace}
              <select name="workspaceId" defaultValue="" className="h-11 rounded-md border border-[#D4CFC8] bg-white px-3 outline-none focus:border-[#FF6B35]">
                <option value="">{copy.allWorkspaces}</option>
                {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="allowShare" className="h-4 w-4 accent-[#FF6B35]" />
              {copy.allowShare}
            </label>
            <p className="text-xs leading-5 text-[#666666] sm:col-span-3">{copy.agentHint}</p>
          </div>
        )}
        <label className="grid gap-1 text-sm font-medium">
          {copy.device}
          <input name="name" key={purpose} defaultValue={purpose === "agent" ? "OpenClaw (Mac)" : "BloomMD Desktop"} required maxLength={80} className="h-11 rounded-md border border-[#D4CFC8] px-3 outline-none focus:border-[#FF6B35]" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {copy.validity}
          <select name="expiresInDays" defaultValue="90" className="h-11 rounded-md border border-[#D4CFC8] bg-white px-3 outline-none focus:border-[#FF6B35]">
            <option value="30">30 {copy.days}</option>
            <option value="90">90 {copy.days}</option>
            <option value="365">1 {copy.year}</option>
          </select>
        </label>
        <button disabled={busy} className="mt-auto h-11 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white disabled:opacity-50">{copy.create}</button>
      </form>

      {createdToken && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">{copy.paste}</div>
          <div className="mt-3 flex gap-2">
            <code tabIndex={0} aria-label={locale === "de" ? "Neues persönliches Token" : "New personal access token"} className="min-w-0 flex-1 overflow-x-auto rounded border border-amber-200 bg-white px-3 py-2 text-xs">{createdToken}</code>
            <button type="button" aria-label={copy.copy} title={copy.copy} onClick={async () => { await navigator.clipboard.writeText(createdToken); setCopied(true); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-amber-300 bg-white">
              {copied ? <Check size={17} aria-hidden="true" /> : <Clipboard size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-2">
        {tokens.length === 0 && <p className="text-sm text-[#666666]">{copy.empty}</p>}
        {tokens.map((token) => {
          const active = !token.revokedAt && (!token.expiresAt || new Date(token.expiresAt) > new Date());
          return (
            <div key={token.id} className="flex flex-col gap-3 rounded-md border border-[#E8E4DF] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  {token.name}
                  {token.client === "mobile_app" && <span className="rounded bg-[#EAF3FF] px-1.5 py-0.5 text-xs font-medium text-[#1F4F8A]" title={copy.appHint} data-testid="access-token-app-badge">{copy.appBadge}</span>}
                  {token.agentName && <span className="rounded bg-[#FFF1EA] px-1.5 py-0.5 text-xs font-medium text-[#B4471F]">{copy.agentBadge}: {token.agentName}</span>}
                  {token.agentName && token.allowShare && <span className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-xs font-medium text-[#555]">{copy.shareBadge}</span>}
                  {token.scope === "read" && <span className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-xs font-medium text-[#555]">{copy.readBadge}</span>}
                  {token.workspaceIds?.length ? <span className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-xs font-medium text-[#555]">{copy.limitedBadge}</span> : null}
                </div>
                <div className="mt-1 text-[#666666]">{active ? `${copy.valid} ${date(token.expiresAt, locale)}` : copy.revoked} · {copy.lastUsed}: {date(token.lastUsedAt, locale)}</div>
              </div>
              {active && <button type="button" disabled={busy} onClick={() => void revoke(token.id)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 size={15} aria-hidden="true" />{copy.revoke}</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
