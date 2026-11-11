import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";
import { AuthTokens } from "./collections/AuthTokens";
import { Blog, News } from "./collections/content";
import { Entitlements } from "./collections/Entitlements";
import { Media } from "./collections/Media";
import { Operators } from "./collections/Operators";
import { ReadTokens } from "./collections/ReadTokens";
import { TrialReminders } from "./collections/TrialReminders";
import { Users } from "./collections/Users";
import { PlatformSettings } from "./globals/PlatformSettings";
import { adminOrigin } from "./lib/env";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const origin = adminOrigin();
const allowedOrigins = origin ? [origin] : [];

/**
 * Layer 4 of ADR 3: GraphQL off (and the route files `api/graphql` and `api/graphql-playground` are
 * deleted, `graphQL.disable` alone does not close the playground), every collection denies by default and
 * grants only through explicit access functions, the default endpoints of `users` are closed by the guard
 * in front of `/api` (`lib/rest-guard.ts`), CORS and CSRF accept only the admin origin. The database
 * schema is managed by migrations only (`push: false`), also in development.
 */
export default buildConfig({
  admin: {
    user: Operators.slug,
    importMap: { baseDir: path.resolve(dirname) },
    components: {
      beforeLogin: ["@/components/BuildInfo#BuildInfoLogin"],
      afterNavLinks: ["@/components/BuildInfo#BuildInfoNav"],
    },
    meta: { titleSuffix: " · BloomMD CMS", robots: "noindex, nofollow" },
  },
  collections: [Operators, Users, Entitlements, AuthTokens, TrialReminders, ReadTokens, Blog, News, Media],
  globals: [PlatformSettings],
  graphQL: { disable: true, disablePlaygroundInProduction: true },
  cors: allowedOrigins,
  csrf: allowedOrigins,
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  db: postgresAdapter({
    pool: { connectionString: process.env.CMS_DATABASE_URL || "" },
    push: false,
    migrationDir: path.resolve(dirname, "migrations"),
  }),
});
