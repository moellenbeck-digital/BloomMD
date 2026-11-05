import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import CookiesPage from "./cookies/page";
import DatenschutzPage from "./datenschutz/page";
import ImpressumPage from "./impressum/page";
import { hasLegalValue, LEGAL_STATUS } from "../lib/legal";

const LEGAL_ENV = {
  BLOOMMD_LEGAL_BUSINESS_NAME: "Beispiel Digital GmbH",
  BLOOMMD_LEGAL_OWNER_NAME: "Erika Beispiel",
  BLOOMMD_LEGAL_STREET: "Musterweg 1",
  BLOOMMD_LEGAL_POSTAL_CITY: "12345 Beispielstadt",
  BLOOMMD_LEGAL_COUNTRY: "Deutschland",
  BLOOMMD_LEGAL_EMAIL: "legal@example.test",
  BLOOMMD_LEGAL_PHONE: "+49 123 456789",
  BLOOMMD_LEGAL_REGISTER_COURT: "Amtsgericht Beispielstadt",
  BLOOMMD_LEGAL_REGISTER_NUMBER: "HRB 123456",
  BLOOMMD_LEGAL_VAT_ID: "DE123456789",
  BLOOMMD_LEGAL_RESPONSIBLE_CONTENT: "Erika Beispiel, Musterweg 1, 12345 Beispielstadt",
} as const;

const original = Object.fromEntries(Object.keys(LEGAL_ENV).map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const render = async (element: Promise<React.ReactElement>) => renderToStaticMarkup(await element);
const page = (lang?: string) => ({ searchParams: Promise.resolve(lang ? { lang } : {}) });

describe("Impressum", () => {
  test("renders every BLOOMMD_LEGAL_* value when they are set", async () => {
    Object.assign(process.env, LEGAL_ENV);
    for (const html of [await render(ImpressumPage(page())), await render(ImpressumPage(page("en")))]) {
      for (const value of Object.values(LEGAL_ENV)) expect(html).toContain(value);
      expect(html).not.toContain("Noch einzutragen");
      expect(html).not.toContain("Nicht angegeben");
    }
    expect(await render(ImpressumPage(page()))).toContain("Angaben gemäß § 5 DDG");
    expect(await render(ImpressumPage(page("en")))).toContain("Information according to § 5 DDG");
  });

  test("shows the placeholder instead of empty fields when a required value is missing", async () => {
    for (const key of Object.keys(LEGAL_ENV)) delete process.env[key];
    const html = await render(ImpressumPage(page()));
    expect(html).toContain("Noch einzutragen vor Live-Verkauf");
    expect(html).toContain("Nicht angegeben");
  });
});

describe("Impressum phone line", () => {
  test("is dropped when BLOOMMD_LEGAL_PHONE is unset, empty, a dash or \"Nicht angegeben\"", async () => {
    Object.assign(process.env, LEGAL_ENV);
    for (const phone of [undefined, "", "   ", "-", "–", "Nicht angegeben"]) {
      if (phone === undefined) delete process.env.BLOOMMD_LEGAL_PHONE;
      else process.env.BLOOMMD_LEGAL_PHONE = phone;
      for (const html of [await render(ImpressumPage(page())), await render(ImpressumPage(page("en")))]) {
        expect(html).not.toMatch(/Telefon|Phone/);
        expect(html).toContain(LEGAL_ENV.BLOOMMD_LEGAL_EMAIL);
      }
    }
  });

  test("is shown when a number is set", async () => {
    Object.assign(process.env, LEGAL_ENV);
    expect(await render(ImpressumPage(page()))).toContain("Telefon");
    expect(await render(ImpressumPage(page("en")))).toContain("Phone");
  });

  test("hasLegalValue treats empty, dash and the default as not filled in", () => {
    for (const value of ["", "  ", "-", "—", "Nicht angegeben", "nicht angegeben"]) expect(hasLegalValue(value)).toBe(false);
    for (const value of ["+49 123 456789", "0 12 3"]) expect(hasLegalValue(value)).toBe(true);
  });
});

describe("Datenschutzerklärung", () => {
  test("has the app section, share links and agents in German and English", async () => {
    Object.assign(process.env, LEGAL_ENV);
    const de = await render(DatenschutzPage(page()));
    expect(de).toContain("BloomMD-App für iPad, iPhone, Mac und Android");
    expect(de).toContain("Optionale Anmeldung mit einem BloomMD-Konto");
    expect(de).toContain("Keine Analyse, kein Tracking.");
    expect(de).toContain("Share-Links (nur lesen)");
    expect(de).toContain("Workspace-Agenten");
    expect(de).toContain(LEGAL_ENV.BLOOMMD_LEGAL_EMAIL);
    expect(de).toContain(LEGAL_STATUS);
    const en = await render(DatenschutzPage(page("en")));
    expect(en).toContain("BloomMD app for iPad, iPhone, Mac and Android");
    expect(en).toContain("Optional sign-in with a BloomMD account");
    expect(en).toContain("No analytics, no tracking.");
    expect(en).toContain("Share links (read-only)");
    expect(en).toContain("Workspace agents");
    expect(en).toContain(LEGAL_STATUS);
  });

  test("names retention, deletion and the processors in German and English", async () => {
    const de = await render(DatenschutzPage(page()));
    expect(de).toContain("Speicherdauer und Löschung");
    expect(de).toContain("Empfänger und Auftragsverarbeiter");
    expect(de).toContain("Ein abgelaufener Testaccount wird derzeit nicht automatisch gelöscht");
    for (const name of ["Resend", "Sentry", "Plausible", "GitHub"]) expect(de).toContain(name);
    const en = await render(DatenschutzPage(page("en")));
    expect(en).toContain("Retention and deletion");
    expect(en).toContain("Recipients and processors");
    expect(en).toContain("An expired trial account is currently not deleted automatically");
    for (const name of ["Resend", "Sentry", "Plausible", "GitHub"]) expect(en).toContain(name);
  });

  test("names the Plausible instance of Ops and the flow through the own domain, not the former host", async () => {
    for (const html of [await render(DatenschutzPage(page())), await render(DatenschutzPage(page("en")))]) {
      expect(html).toContain("plausible.ops.moellenbeck-digital.io");
      expect(html).toContain("bloommd.io/_plausible/");
      expect(html).not.toContain("plausible.moellenbeck-digital.io");
    }
    for (const html of [await render(CookiesPage(page())), await render(CookiesPage(page("en")))]) {
      expect(html).toContain("bloommd.io/_plausible/");
      expect(html).not.toMatch(/direct configuration|Direktkonfiguration/);
    }
  });

  test("does not leave placeholders for the owner in the public text", async () => {
    for (const html of [await render(DatenschutzPage(page())), await render(DatenschutzPage(page("en")))]) {
      expect(html).not.toMatch(/vom Owner|by the owner|zu bestätigen/);
    }
  });
});
