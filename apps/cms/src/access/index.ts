import type { Access, FieldAccess, PayloadRequest } from "payload";

/**
 * Access functions. Every collection and global lists each operation explicitly, and anything not
 * listed denies: `deny` is the default, grants are narrow (ADR 3, layer 4). The REST routes are
 * additionally closed by the guard in front of `/api` (`lib/rest-guard.ts`); the services use the
 * Local API with `overrideAccess` and never these functions.
 */
export type OperatorRole = "admin" | "support" | "editor";

export function operatorRole(req: Pick<PayloadRequest, "user">): OperatorRole | null {
  const user = req.user as { collection?: string; role?: string } | null | undefined;
  if (!user || user.collection !== "operators") return null;
  return user.role === "admin" || user.role === "support" || user.role === "editor" ? user.role : null;
}

export const deny: Access = () => false;
export const denyField: FieldAccess = () => false;

export function allowRoles(...roles: OperatorRole[]): Access {
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
