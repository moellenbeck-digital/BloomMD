import type { Access, FieldAccess, PayloadRequest } from "payload";
import { mfaVerified } from "../lib/mfa-session";

/**
 * Access functions and the role matrix (ADR 2, 3, O2, O9). Every collection and global lists each
 * operation explicitly, and anything not listed denies: `deny` is the default, grants are narrow (ADR 3,
 * layer 4). The REST routes are additionally closed by the guard in front of `/api`
 * (`lib/rest-guard.ts`); the services use the Local API with `overrideAccess` and never these functions.
 *
 * The roles, in one place:
 * - `admin`: everything, including the operators, the audit, the trial end, per-account duration,
 *   cloud access, entitlements and the default duration (O2).
 * - `support`: reads accounts, entitlements, trial ends and content; changes nothing.
 * - `editor`: blog, news and media only.
 *
 * A session counts only after the second factor (`mfaVerified`): without it `operatorRole` is `null`
 * and everything denies, in the admin UI and over REST alike. A blocked operator has no role either.
 */
export type OperatorRole = "admin" | "support" | "editor";

type RequestLike = Pick<PayloadRequest, "user"> & { headers?: Headers };

/** The operator of a request whose password login succeeded, whatever the second factor says. */
export function signedInOperator(req: RequestLike): { id: string; role: OperatorRole | null; email?: string; blocked: boolean } | null {
  const user = req.user as { id?: unknown; collection?: string; role?: string; email?: string; blocked?: boolean } | null | undefined;
  if (!user || user.collection !== "operators" || user.id === undefined || user.id === null) return null;
  const role = user.role === "admin" || user.role === "support" || user.role === "editor" ? user.role : null;
  return { id: String(user.id), role, email: user.email, blocked: user.blocked === true };
}

/** Role of an operator who passed password and second factor and is not blocked; `null` for everybody else. */
export function operatorRole(req: RequestLike): OperatorRole | null {
  const operator = signedInOperator(req);
  if (!operator || operator.blocked || operator.role === null) return null;
  return mfaVerified(req.headers, operator.id) ? operator.role : null;
}

export const deny: Access = () => false;
export const denyField: FieldAccess = () => false;

export function allowRoles(...roles: OperatorRole[]): Access {
  return ({ req }) => {
    const role = operatorRole(req);
    return role !== null && roles.includes(role);
  };
}

export function allowRolesField(...roles: OperatorRole[]): FieldAccess {
  return ({ req }) => {
    const role = operatorRole(req);
    return role !== null && roles.includes(role);
  };
}

export const adminOnly = allowRoles("admin");
export const adminOrSupport = allowRoles("admin", "support");
export const contentRoles = allowRoles("admin", "editor");
export const contentReaders = allowRoles("admin", "editor", "support");
export const anyOperator = allowRoles("admin", "support", "editor");
export const adminOnlyField = allowRolesField("admin");

/**
 * `admin.hidden` of a collection: the menu entry is shown only to these roles. The access functions are the
 * real barrier (a collection without read access stays closed by URL as well); this only keeps the menu tidy.
 */
export function hiddenUnless(...roles: OperatorRole[]) {
  return ({ user }: { user?: { collection?: string; role?: string } | null }): boolean => !(user?.collection === "operators" && roles.includes(user.role as OperatorRole));
}
