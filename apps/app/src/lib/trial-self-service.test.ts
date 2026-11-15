import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Nobody but the operator command changes the trial end, the mailbox rule or an exception (#277).
 * The app has no admin role and no per-account override a route could set, so the guarantee is
 * structural: the writers are a short, named list, and no route, page or other module can reach the
 * operator functions. A new writer or a new caller fails here and needs a conscious decision.
 */

const SRC = join(import.meta.dir, "..");
const APP = join(SRC, "..");

function files(dir: string, accept: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    return statSync(path).isDirectory() ? files(path, accept) : accept(path) ? [path] : [];
  });
}

const isSource = (path: string) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path);
const sources = files(SRC, isSource);
const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => relative(APP, path);

describe("trial fields cannot be changed by the app's own paths (#277)", () => {
  test("only the named functions of db.ts write the trial end or the mailbox rule", () => {
    const db = read(join(SRC, "lib/db.ts"));
    const starts = [...db.matchAll(/^(?:export )?async function (\w+)/gm)].map((match) => ({ name: match[1]!, index: match.index! }));
    const writers = starts
      .map((start, position) => ({ name: start.name, body: db.slice(start.index, starts[position + 1]?.index ?? db.length) }))
      // (createMarketSchema is the migration: it moves the fixed end of existing accounts, nothing per request.)
      // An assignment in SQL (`set trial_guarded = …`, `trial_ends_at = coalesce(…)`) or the column list of an insert.
      .filter(({ body }) => /\b(trial_ends_at|trial_guarded|trial_days_override)\s*=(?!=)/.test(body) || /insert into bloom_users[^`]*trial_(ends_at|guarded)/.test(body))
      .map(({ name }) => name)
      .sort();
    expect(writers).toEqual(["activateWaitlistAccount", "adminReleaseTrialGuard", "adminSetTrialEnd", "createMarketSchema", "markEmailVerified"]);
  });

  test("only the confirmation sets the end of a new account, and it never overwrites one (coalesce)", () => {
    const db = read(join(SRC, "lib/db.ts"));
    for (const name of ["markEmailVerified", "activateWaitlistAccount"]) {
      const start = db.indexOf(`async function ${name}`);
      const body = db.slice(start, db.indexOf("\nexport ", start + 10));
      expect(body).toContain("trial_ends_at = coalesce(u.trial_ends_at");
    }
  });

  test("the operator functions are reachable from the command only, not from a route, page or library", () => {
    const callers = sources.filter((path) => /\b(adminSetTrialEnd|adminReleaseTrialGuard|adminGrantTrialException)\b/.test(read(path))).map(rel);
    // trial-admin.ts only names them in its header comment.
    expect(callers.sort()).toEqual(["src/lib/db.ts", "src/lib/trial-admin.ts"]);
    const commandOnly = read(join(APP, "scripts/trial-admin.ts"));
    expect(commandOnly).toContain("adminSetTrialEnd");
    // Nothing else imports the command's pure helpers into a request path either.
    const helperUsers = sources.filter((path) => /from "\.{1,2}(\/\.\.)*\/(lib\/)?trial-admin"/.test(read(path))).map(rel);
    expect(helperUsers.sort()).toEqual(["src/lib/db.ts"]);
  });

  test("routes, pages and server actions never mention the guard flag, the exceptions or a per-account override", () => {
    const requestPaths = sources.filter((path) => rel(path).startsWith("src/app/") || /^["']use server["']/m.test(read(path)));
    expect(requestPaths.length).toBeGreaterThan(20);
    for (const path of requestPaths) {
      expect(read(path), rel(path)).not.toMatch(/trial_guarded|trial_exceptions|trial_days_override|trialDaysOverride|trialGuarded/);
      // No SQL at all that updates the trial end from a request path.
      expect(read(path), rel(path)).not.toMatch(/trial_ends_at\s*=(?!=)/);
    }
  });

  test("there is no HTTP route or UI for the command", () => {
    const routes = files(join(SRC, "app"), (path) => /(route|page)\.tsx?$/.test(path)).map(rel);
    expect(routes.filter((path) => /trial-admin|trial_admin|admin/i.test(path))).toEqual([]);
    const proxy = read(join(SRC, "proxy.ts"));
    expect(proxy).not.toMatch(/trial-admin/);
  });

  test("the command is a package script and needs the database URL, like db:migrate", () => {
    const pkg = JSON.parse(read(join(APP, "package.json"))) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:trial-admin"]).toBe("bun run scripts/trial-admin.ts");
    expect(read(join(APP, "scripts/trial-admin.ts"))).toContain('fail("DATABASE_URL is required.")');
  });
});
