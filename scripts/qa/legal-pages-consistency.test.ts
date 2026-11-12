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

  test("terms, withdrawal and privacy policy describe the Cloud plan and no longer say there are no payments (#381)", () => {
    for (const app of ["app", "marketing"] as const) {
      const agb = page(app, "agb");
      for (const text of ["6 EUR pro Monat", "60 EUR pro Jahr", "6 EUR per month", "60 EUR per year", "100 MB", "Stripe", "Rechnungen und Abo verwalten"]) expect(agb).toContain(text);
      expect(agb).not.toMatch(/keine kostenpflichtigen Pläne|no paid plans/);
      const widerruf = page(app, "widerruf");
      for (const text of ["binnen vierzehn Tagen ohne Angabe von Gründen", "Muster-Widerrufsformular", "within fourteen days without giving any reason", "Model withdrawal form"]) expect(widerruf).toContain(text);
      expect(widerruf).not.toMatch(/keine kostenpflichtigen Pläne|keine Zahlungsrückabwicklung|no paid plans|no payment reversal/);
      const datenschutz = page(app, "datenschutz");
      expect(datenschutz).toContain('en ? "Payment and subscription" : "Zahlung und Abo"');
      expect(datenschutz).toContain("Stripe Payments Europe, Ltd.");
      expect(datenschutz).not.toMatch(/Keine Zahlungen|No payments|Zahlungsdienstleister werden erst relevant|Payment service providers become relevant/);
      // Neither lifetime nor student discount are mentioned (decision #276, option A).
      for (const name of ["agb", "widerruf", "datenschutz"] as const) expect(page(app, name)).not.toMatch(/[Ll]ifetime|Studierende|Studienrabatt|[Ss]tudent/);
    }
  });

  test("the license page has the same sections and text in both apps", () => {
    const marketing = sections(page("marketing", "lizenz"));
    const app = sections(page("app", "lizenz"));
    expect([...app.keys()]).toEqual([...marketing.keys()]);
    for (const [title, block] of marketing) expect(app.get(title)).toBe(block);
  });

  test("the withdrawal page and the legal notice have the same sections and text in both apps", () => {
    for (const name of ["widerruf", "impressum"]) {
      const marketing = sections(page("marketing", name));
      const app = sections(page("app", name));
      expect(marketing.size).toBeGreaterThanOrEqual(5);
      expect([...app.keys()]).toEqual([...marketing.keys()]);
      for (const [title, block] of marketing) expect(app.get(title)).toBe(block);
    }
  });

  test("the retention and recipients sections of the privacy policy are the same in both apps", () => {
    for (const title of ['en ? "Retention and deletion" : "Speicherdauer und Löschung"', 'en ? "Recipients and processors" : "Empfänger und Auftragsverarbeiter"']) {
      const marketing = sections(page("marketing", "datenschutz")).get(title);
      expect(marketing).toBeDefined();
      expect(sections(page("app", "datenschutz")).get(title)).toBe(marketing as string);
    }
  });

  test("the trial sections of the privacy policy (reminders, abuse protection) are the same in both apps", () => {
    for (const title of ['en ? "Reminder emails during the trial period" : "Hinweis-E-Mails zum Testzeitraum"', 'en ? "Abuse protection for the trial account" : "Missbrauchsschutz Testaccount"']) {
      const marketing = sections(page("marketing", "datenschutz")).get(title);
      expect(marketing).toBeDefined();
      expect(sections(page("app", "datenschutz")).get(title)).toBe(marketing as string);
    }
  });

  test("the abuse protection section names the canonical address, purpose, legal basis and deletion with the account (#277)", () => {
    const block = sections(page("app", "datenschutz")).get('en ? "Abuse protection for the trial account" : "Missbrauchsschutz Testaccount"') ?? "";
    for (const text of ["kanonische Form", "Zweck: Schutz vor Missbrauch", "Art. 6 Abs. 1 lit. f DSGVO", "mit dem Konto gelöscht", "Punkte in diesem Teil entfernt"]) expect(block).toContain(text);
    for (const text of ["canonical form", "Purpose: protection against abuse", "Art. 6(1)(f) GDPR", "deleted together with the account", "the dots in that part are removed"]) expect(block).toContain(text);
  });

  test("both apps share the legal profile helpers", () => {
    const helper = (source: string) => source.match(/export function hasLegalValue[\s\S]*?\n}\n/)?.[0];
    expect(helper(read("apps/app/src/lib/legal.ts"))).toBeDefined();
    expect(helper(read("apps/app/src/lib/legal.ts"))).toBe(helper(read("apps/marketing/src/lib/legal.ts")));
  });

  test("terms, license and withdrawal no longer speak of M1, the beta or invited testers", () => {
    for (const app of ["app", "marketing"] as const) {
      for (const name of ["agb", "lizenz", "widerruf"]) {
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

  test("Stripe events: 180 days after processing, as in the code (#381)", () => {
    expect(maintenance).toContain('positiveDays("BLOOMMD_STRIPE_EVENT_RETENTION_DAYS", 180)');
    expect(maintenance).toMatch(/delete from bloom_stripe_events where processed_at < now\(\) - \(\$\{stripeEventDays\} \* interval '1 day'\)/);
    expect(retention).toContain("180 Tage nach der Verarbeitung");
    expect(retention).toContain("180 days after they were processed");
  });

  test("the privacy policy no longer speaks of M1", () => {
    for (const app of ["app", "marketing"] as const) expect(page(app, "datenschutz")).not.toMatch(/\bM1\b/);
  });

  test("the trial period named in the terms matches the trial code", () => {
    const trial = read("apps/app/src/lib/trial.ts");
    expect(trial).toContain("TRIAL_DAYS = 30;");
    expect(trial).toContain('TRIAL_REMINDER_DAYS: Record<TrialReminderKind, number> = { "15": 15, "23": 23 };');
    expect(trial).toContain('LEGACY_TRIAL_ENDS_AT = "2027-01-14T00:00:00.000Z";');
    expect(read("docs/TRIAL.md")).toContain("fest 14.01.2027 00:00 UTC (Zählung ab 15.11.2026, 60 Tage");
    for (const app of ["app", "marketing"] as const) {
      expect(page(app, "agb")).toContain("14.01.2027 um 00:00 Uhr UTC");
      expect(page(app, "lizenz")).toContain("14.01.2027");
      // Reminders of the existing accounts count back from the end: 30 Dec 2026 and 7 Jan 2027.
      for (const name of ["agb", "datenschutz"] as const) {
        expect(page(app, name)).toContain("30.12.2026");
        expect(page(app, name)).toContain("07.01.2027");
        expect(page(app, name)).toContain("December 30, 2026");
        expect(page(app, name)).toContain("January 7, 2027");
      }
      for (const name of ["agb", "datenschutz", "lizenz"] as const) {
        expect(page(app, name)).not.toMatch(/15\.12\.2026|December 15, 2026|30\.11\.2026|08\.12\.2026|November 30, 2026|December 8, 2026/);
      }
    }
  });

  test("the migration for the existing accounts moves exactly the old end to the end of the trial code (#364)", () => {
    const migration = read("apps/app/db/015_trial_legacy_60_days.sql");
    const legacyEnd = read("apps/app/src/lib/trial.ts").match(/LEGACY_TRIAL_ENDS_AT = "([^"]+)"/)![1]!;
    expect(migration).toContain(`set trial_ends_at = '${legacyEnd.replace(".000Z", "Z")}'`);
    expect(migration).toContain("where trial_legacy and trial_ends_at = '2026-12-15T00:00:00Z'");
    expect(migration).not.toMatch(/\b(delete|drop|truncate)\b/i);
  });
});
