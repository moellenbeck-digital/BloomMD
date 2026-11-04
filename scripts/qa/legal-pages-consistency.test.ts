import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");

function read(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

const page = (app: "app" | "marketing", name: string) => read(`apps/${app}/src/app/${name}/page.tsx`);

/** All <LegalSection …>…</LegalSection> blocks of a legal page, keyed by their title expression. */
function sections(source: string) {
  const blocks = new Map<string, string>();
  for (const match of source.matchAll(/<LegalSection title=\{([^}]*)\}>[\s\S]*?<\/LegalSection>/g)) blocks.set(match[1], match[0]);
  return blocks;
}

describe("legal pages are maintained twice (apps/app and apps/marketing)", () => {
  test("the terms have the same sections and text in both apps", () => {
    const marketing = sections(page("marketing", "agb"));
    const app = sections(page("app", "agb"));
    expect(marketing.size).toBeGreaterThanOrEqual(12);
    expect([...app.keys()]).toEqual([...marketing.keys()]);
    for (const [title, block] of marketing) expect(app.get(title)).toBe(block);
  });

  test("the license page has the same sections and text in both apps", () => {
    const marketing = sections(page("marketing", "lizenz"));
    const app = sections(page("app", "lizenz"));
    expect([...app.keys()]).toEqual([...marketing.keys()]);
    for (const [title, block] of marketing) expect(app.get(title)).toBe(block);
  });

  test("the retention section of the privacy policy is the same in both apps", () => {
    const title = 'en ? "Retention and deletion" : "Speicherdauer und Löschung"';
    const marketing = sections(page("marketing", "datenschutz")).get(title);
    expect(marketing).toBeDefined();
    expect(sections(page("app", "datenschutz")).get(title)).toBe(marketing as string);
  });

  test("terms and license no longer speak of M1, the beta or invited testers", () => {
    for (const app of ["app", "marketing"] as const) {
      for (const name of ["agb", "lizenz"]) {
        expect(page(app, name)).not.toMatch(/\bM1\b|[Bb]eta|eingeladene Tester|invited testers/);
      }
    }
  });
});

describe("retention periods named in the privacy policy match the code", () => {
  const maintenance = read("apps/app/scripts/maintenance.ts");
  const retention = sections(page("app", "datenschutz")).get('en ? "Retention and deletion" : "Speicherdauer und Löschung"') ?? "";

  test("tokens and sessions: 7 days, access tokens: 30 days", () => {
    expect(maintenance).toMatch(/delete from bloom_auth_tokens where expires_at < now\(\) - interval '7 days' or consumed_at < now\(\) - interval '7 days'/);
    expect(maintenance).toMatch(/delete from bloom_sessions where expires_at < now\(\) - interval '7 days' or revoked_at < now\(\) - interval '7 days'/);
    expect(maintenance).toMatch(/delete from bloom_access_tokens where expires_at < now\(\) - interval '30 days' or revoked_at < now\(\) - interval '30 days'/);
    expect(retention).toContain("Sitzungen (Anmeldung im Browser): 7 Tage");
    expect(retention).toContain("Einmal-Tokens (E-Mail-Bestätigung, Passwort-Zurücksetzen, Aktivierung eines vorbereiteten Wartelisten-Kontos): 7 Tage");
    expect(retention).toContain("Zugriffstoken (zum Beispiel für die Mobile-App): 30 Tage");
  });

  test("deleted documents: 30 days, audit events: 365 days", () => {
    expect(maintenance).toContain('positiveDays("BLOOMMD_DELETED_DOCUMENT_RETENTION_DAYS", 30)');
    expect(maintenance).toContain('positiveDays("BLOOMMD_AUDIT_EVENT_RETENTION_DAYS", 365)');
    expect(retention).toContain("30 Tage nach dem Löschen");
    expect(retention).toContain("365 Tage nach dem Ereignis");
  });

  test("unconfirmed accounts: 7 days", () => {
    expect(read("apps/app/src/lib/unconfirmed-accounts.ts")).toContain("UNCONFIRMED_ACCOUNT_RETENTION_DAYS = 7;");
    expect(retention).toContain("7 Tage nach der Registrierung");
    expect(page("app", "agb")).toContain("nach 7 Tagen gelöscht");
  });

  test("the trial period named in the terms matches the trial code", () => {
    const trial = read("apps/app/src/lib/trial.ts");
    expect(trial).toContain("TRIAL_DAYS = 30;");
    expect(trial).toContain('TRIAL_REMINDER_DAYS: Record<TrialReminderKind, number> = { "15": 15, "23": 23 };');
    expect(trial).toContain('LEGACY_TRIAL_ENDS_AT = "2026-12-15T00:00:00.000Z";');
    expect(read("docs/TRIAL.md")).toContain("fest 15.12.2026 00:00 UTC (Zählung ab 15.11.2026)");
    for (const app of ["app", "marketing"] as const) {
      expect(page(app, "agb")).toContain("15.12.2026 um 00:00 Uhr UTC");
      expect(page(app, "lizenz")).toContain("15.12.2026");
    }
  });
});
