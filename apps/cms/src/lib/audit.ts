import type { PayloadRequest } from "payload";
import { signedInOperator } from "../access";
import { poolOf, type SqlPool } from "./shared-store";

/**
 * Audit of operator actions (ticket #206, ADR 13): an append-only collection (`operator-audit`) that only
 * the Local API writes, in the transaction of the change it records. Who, when, what, old to new; only
 * fields from the lists below ever get in, so no password, secret or code can end up here by accident.
 * Retention is 365 days like `docs/LOESCHKONZEPT.md`; a trigger in the database forbids changing a row and
 * deleting a younger one (migration `*_operator_audit`), and every write cleans up the expired rows (same
 * habit as the nonce table: no extra job).
 */
export const AUDIT_RETENTION_DAYS = 365;

export const AUDIT_ACTIONS = [
  { value: "account.trial_end", label: "Konto: Testende" },
  { value: "account.trial_days_override", label: "Konto: Dauer-Überschreibung" },
  { value: "account.trial_legacy", label: "Konto: Bestandskonto (Legacy)" },
  { value: "account.cloud_access", label: "Konto: Cloud-Zugang" },
  { value: "account.beta", label: "Konto: Beta-Teilnehmer" },
  { value: "entitlement.create", label: "Zugang (Entitlement) angelegt" },
  { value: "entitlement.update", label: "Zugang (Entitlement) geändert" },
  { value: "entitlement.delete", label: "Zugang (Entitlement) gelöscht" },
  { value: "settings.default_trial_days", label: "Plattform: Standarddauer" },
  { value: "operator.create", label: "Betreiber angelegt" },
  { value: "operator.role", label: "Betreiber: Rolle geändert" },
  { value: "operator.profile", label: "Betreiber: E-Mail oder Name geändert" },
  { value: "operator.block", label: "Betreiber gesperrt" },
  { value: "operator.unblock", label: "Betreiber entsperrt" },
  { value: "operator.delete", label: "Betreiber gelöscht" },
  { value: "operator.password", label: "Betreiber: Passwort geändert" },
  { value: "operator.mfa_enabled", label: "Betreiber: zweiter Faktor eingerichtet" },
  { value: "operator.mfa_reset", label: "Betreiber: zweiter Faktor zurückgesetzt" },
  { value: "operator.mfa_recovery_used", label: "Betreiber: Wiederherstellungscode benutzt" },
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number]["value"];

export interface AuditChange {
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export interface AuditEntry {
  action: AuditAction;
  targetType: "users" | "entitlements" | "platform-settings" | "operators";
  targetId?: string | number | null;
  /** Account concerned (users, entitlements): a relation that the database sets to NULL when the account is deleted. */
  targetUser?: string | null;
  /** Readable name of the target that is not an end user (operator e-mail). */
  targetLabel?: string | null;
  changes: AuditChange[];
}

function plain(value: unknown): AuditChange["from"] {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const time = /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
    return time && !Number.isNaN(time.getTime()) ? time.toISOString() : value.slice(0, 200);
  }
  if (typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return null;
}

/** Changes of exactly the listed fields, old to new; nothing for a field that did not change. */
export function diffFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined, fields: readonly string[]): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const from = plain(before?.[field]);
    const to = plain(after?.[field]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

type Actor = { id: string; email: string | null; role: string | null };

/** The operator of the request; or a name set by a script (`context.auditActor`), e.g. `cli`. Everybody else (the services) is not audited. */
export function auditActor(req: Pick<PayloadRequest, "user" | "context">): Actor | null {
  const operator = signedInOperator(req);
  if (operator) return { id: operator.id, email: operator.email ?? null, role: operator.role };
  const named = (req.context as { auditActor?: unknown } | undefined)?.auditActor;
  return typeof named === "string" && named ? { id: named, email: named, role: null } : null;
}

export async function purgeExpiredAudit(pool: SqlPool): Promise<number> {
  const result = await pool.query("delete from operator_audit where created_at < now() - ($1::int * interval '1 day')", [AUDIT_RETENTION_DAYS]);
  return result.rowCount ?? 0;
}

/** Writes one entry per change set into the transaction of `req`. Does nothing when no operator (or script) acts or nothing changed. */
export async function recordAudit(req: PayloadRequest, entry: AuditEntry): Promise<void> {
  const actor = auditActor(req);
  if (!actor || entry.changes.length === 0) return;
  await req.payload.create({
    collection: "operator-audit",
    data: {
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId === undefined || entry.targetId === null ? null : String(entry.targetId),
      targetUser: entry.targetUser ?? null,
      targetLabel: entry.targetLabel ?? null,
      changes: entry.changes as unknown as Record<string, unknown>[],
    },
    overrideAccess: true,
    req,
  });
  // Cleaning up must never fail the change that is being recorded.
  await purgeExpiredAudit(poolOf(req.payload)).catch(() => 0);
}

/** One entry per changed field, each with its own action (so the list can be filtered by what happened). */
export async function recordFieldAudits(req: PayloadRequest, base: Omit<AuditEntry, "action" | "changes">, changes: AuditChange[], actionOf: Record<string, AuditAction>): Promise<void> {
  for (const change of changes) {
    const action = actionOf[change.field];
    if (action) await recordAudit(req, { ...base, action, changes: [change] });
  }
}
