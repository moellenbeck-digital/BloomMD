import type { CollectionConfig } from "payload";
import { adminOnly, anyOperator, allowRoles, operatorRole } from "../access";
import { passwordHooks } from "../lib/password-hooks";

/**
 * Operators: people who use the admin UI. Roles are a data model here (`admin`, `support`, `editor`,
 * ADR 2); the second factor and the role-specific UI are ticket #206. New operators default to the
 * least privileged role. The password rule applies to operators as well (spike: only with the hook).
 */
export const Operators: CollectionConfig = {
  slug: "operators",
  admin: { useAsTitle: "email", defaultColumns: ["email", "name", "role"], group: "Betreiber" },
  auth: {
    tokenExpiration: 8 * 60 * 60,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    useSessions: true,
    removeTokenFromResponses: true,
    cookies: { sameSite: "Strict", secure: process.env.NODE_ENV === "production" },
  },
  access: {
    // The admin UI is only for operators; the guard in front of /api lets only operator sessions in.
    admin: ({ req }) => operatorRole(req) !== null,
    create: adminOnly,
    // Everybody sees themselves; the list of all operators is for admins.
    read: ({ req }) => {
      const role = operatorRole(req);
      if (role === "admin") return true;
      if (role && req.user) return { id: { equals: req.user.id } };
      return false;
    },
    update: ({ req }) => {
      const role = operatorRole(req);
      if (role === "admin") return true;
      if (role && req.user) return { id: { equals: req.user.id } };
      return false;
    },
    delete: adminOnly,
    unlock: adminOnly,
    readVersions: adminOnly,
  },
  fields: [
    { name: "name", type: "text" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "editor",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Support", value: "support" },
        { label: "Editor", value: "editor" },
      ],
      access: {
        // Only admins assign roles; nobody raises their own.
        create: ({ req }) => operatorRole(req) === "admin",
        update: ({ req }) => operatorRole(req) === "admin",
      },
    },
  ],
  hooks: passwordHooks(),
};

export { anyOperator, allowRoles };
