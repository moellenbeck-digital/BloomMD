import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = join(import.meta.dir, "../..");

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

function expectMissing(paths: string[]) {
  const existing = paths.filter((path) => existsSync(join(repoRoot, path)));
  expect(existing).toEqual([]);
}

describe("web app split boundaries", () => {
  test("the product app has no marketing-only route tree", () => {
    expectMissing([
      "apps/app/src/app/demo",
      "apps/app/src/app/docs",
      "apps/app/src/app/templates",
      "apps/app/src/app/waitlist",
      "apps/app/src/app/api/templates",
      "apps/app/src/app/api/waitlist",
      "apps/app/src/lib/waitlist-db.ts",
      "apps/app/src/lib/waitlist.test.ts",
      "apps/app/src/app/waitlist-form.tsx",
      "apps/app/scripts/waitlist.ts",
    ]);
  });

  test("the marketing app has no private app route tree", () => {
    expectMissing([
      "apps/marketing/src/app/app",
      "apps/marketing/src/app/account",
      "apps/marketing/src/app/login",
      "apps/marketing/src/app/signup",
      "apps/marketing/src/app/forgot-password",
      "apps/marketing/src/app/reset-password",
      "apps/marketing/src/app/beta",
      "apps/marketing/src/app/api/account",
      "apps/marketing/src/app/api/auth",
      "apps/marketing/src/app/api/billing",
      "apps/marketing/src/app/api/mindmaps",
      "apps/marketing/src/app/api/sync-ticket",
      "apps/marketing/src/lib/auth.ts",
      "apps/marketing/src/lib/betaAccess.ts",
      "apps/marketing/src/lib/billing.ts",
      "apps/marketing/src/lib/db.ts",
      "apps/marketing/src/lib/mindmap-storage.ts",
      "apps/marketing/src/lib/passwordAuth.ts",
      "apps/marketing/src/lib/stripe-signature.ts",
      "apps/marketing/scripts/migrate.ts",
      "apps/marketing/scripts/verify-database.ts",
      "apps/marketing/scripts/verify-restore.ts",
      "apps/marketing/scripts/maintenance.ts",
      "apps/marketing/scripts/setup-stripe-test-prices.mjs",
    ]);
  });

  test("marketing route files do not import app-only modules", () => {
    const routeFiles = listFiles(join(repoRoot, "apps/marketing/src/app")).filter((file) => /\.(ts|tsx)$/.test(file));
    const forbidden = [
      /from\s+["'][^"']*lib\/auth["']/,
      /from\s+["'][^"']*lib\/passwordAuth["']/,
      /from\s+["'][^"']*lib\/billing["']/,
      /from\s+["'][^"']*lib\/mindmap-storage["']/,
    ];
    const offenders = routeFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(repoRoot, file)} matches ${pattern.source}`);
    });

    expect(offenders).toEqual([]);
  });

  test("marketing runtime configuration has no sync origin", () => {
    const source = readFileSync(join(repoRoot, "apps/marketing/next.config.mjs"), "utf8");
    expect(source).not.toContain("NEXT_PUBLIC_SYNC_URL");
  });

  test("active workspaces expose exactly two web applications", () => {
    const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { workspaces: string[] };
    expect(rootPackage.workspaces).toContain("apps/*");
    expect(rootPackage.workspaces).not.toContain("packages/*");
  });
});
