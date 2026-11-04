import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getMarketingLocale, type MarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: `${locale === "en" ? "General Terms and Conditions" : "AGB"} | BloomMD`,
    description: locale === "en" ? "BloomMD terms and conditions." : "Allgemeine Geschäftsbedingungen von BloomMD.",
    path: locale === "en" ? "/agb?lang=en" : "/agb",
    locale,
    robots: { index: true, follow: true },
  });
}

export const dynamic = "force-dynamic";

export default async function AGBPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: MarketingLocale = getMarketingLocale((await searchParams).lang);
  const en = locale === "en";

  return (
    <LegalPage title={en ? "General Terms and Conditions" : "Allgemeine Geschäftsbedingungen"} eyebrow="AGB" locale={locale} path="/agb">
      <LegalSection title={en ? "Provider" : "Anbieter"}>
        <p>{legal.businessName}</p>
        <p>E-Mail: {legal.email}</p>
      </LegalSection>

      <LegalSection title={en ? "Service description" : "Leistungsbeschreibung"}>
        <p>{en ? "BloomMD is software for visually structuring open Markdown files. Cloud access is provided as a free trial account at no charge, valid for 30 days from email confirmation and available without an invitation or waitlist. After it ends, the account is read-only and export remains possible; nothing is lost. For existing accounts, including former waitlist participants, the trial period counts from November 15, 2026. Local desktop and Obsidian use remain the recommended way to do real work." : "BloomMD ist eine Software zur visuellen Strukturierung offener Markdown-Dateien. Der Cloud-Zugang wird als kostenloser Testaccount ohne Entgelt bereitgestellt. Er gilt 30 Tage ab E-Mail-Bestätigung und steht ohne Einladung und ohne Warteliste zur Verfügung. Nach Ablauf ist das Konto nur noch lesbar, der Export bleibt möglich, nichts geht verloren. Für bestehende Konten, auch frühere Wartelisten-Teilnehmer, zählt der Testzeitraum ab dem 15.11.2026. Lokale Desktop- und Obsidian-Nutzung bleiben der empfohlene Weg für echte Arbeit."}</p>
      </LegalSection>

      <LegalSection title={en ? "Account and access" : "Account und Zugang"}>
        <p>{en ? "Users are responsible for accurate account data and secure credentials. Access may be restricted where necessary for security or to prevent misuse." : "Nutzer sind für die Richtigkeit ihrer Accountdaten und die sichere Verwahrung ihrer Zugangsdaten verantwortlich. Der Zugang kann eingeschränkt werden, wenn dies aus Sicherheits- oder Missbrauchsgründen erforderlich ist."}</p>
      </LegalSection>

      <LegalSection title={en ? "Prices and payments" : "Preise und Zahlungen"}>
        <p>{en ? "M1 offers no paid plans, collects no payment data and does not charge beta use retroactively. Any later paid offering requires separate, explicit consent." : "In M1 werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und keine Beta-Nutzung rückwirkend abgerechnet. Spätere kostenpflichtige Angebote setzen eine gesonderte, ausdrückliche Zustimmung voraus."}</p>
      </LegalSection>

      <LegalSection title={en ? "Local-first and data" : "Local-first und Daten"}>
        <p>{en ? "BloomMD's local-first core works with open Markdown files. Users remain responsible for local files, backups and their own organisational obligations." : "Der lokale Kern von BloomMD arbeitet mit offenen Markdown-Dateien. Nutzer bleiben für lokale Dateien, Backups und die Einhaltung eigener Organisationspflichten verantwortlich."}</p>
      </LegalSection>

      <LegalSection title={en ? "Availability" : "Verfügbarkeit"}>
        <p>{en ? "BloomMD is operated with reasonable care. Maintenance, updates, technical incidents or third-party services may temporarily limit use." : "BloomMD wird mit angemessener Sorgfalt betrieben. Wartung, Updates, technische Störungen oder Dienste Dritter können die Nutzung zeitweise einschränken."}</p>
      </LegalSection>

      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
