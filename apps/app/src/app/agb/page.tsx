import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getAppLocale, type AppLocale } from "../../lib/locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getAppLocale((await searchParams).lang) === "en" ? "General Terms and Conditions" : "AGB"} | BloomMD`, robots: { index: true, follow: true } };
}

export const dynamic = "force-dynamic";

export default async function AGBPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: AppLocale = getAppLocale((await searchParams).lang);
  const copy = locale === "en" ? {
    title: "General Terms and Conditions", provider: "Provider", description: "Service description", access: "Account and access", prices: "Prices and payments", local: "Local-first and data", availability: "Availability", status: "As of",
    descriptionText: "BloomMD is software for visually structuring open Markdown files. During the closed M1 beta, cloud access is provided to invited testers at no charge. Local desktop and Obsidian use remain the recommended way to do real work.",
    accessText: "Users are responsible for the accuracy of their account data and for keeping their access credentials secure. Access may be restricted where necessary for security or to prevent misuse.",
    pricesText: "M1 offers no paid plans, collects no payment data and does not charge beta use retroactively. Any later paid offering requires separate, explicit consent.",
    localText: "BloomMD's local-first core works with open Markdown files. Users remain responsible for local files, backups and their own organisational obligations.",
    availabilityText: "BloomMD is operated with reasonable care. Maintenance, updates, technical incidents or third-party services may temporarily limit use.",
  } : {
    title: "Allgemeine Geschäftsbedingungen", provider: "Anbieter", description: "Leistungsbeschreibung", access: "Account und Zugang", prices: "Preise und Zahlungen", local: "Local-first und Daten", availability: "Verfügbarkeit", status: "Stand",
    descriptionText: "BloomMD ist eine Software zur visuellen Strukturierung offener Markdown-Dateien. In der geschlossenen M1-Beta wird der Cloud-Zugang ausschließlich eingeladenen Testern und ohne Entgelt bereitgestellt. Lokale Desktop- und Obsidian-Nutzung bleiben der empfohlene Weg für echte Arbeit.",
    accessText: "Nutzer sind für die Richtigkeit ihrer Accountdaten und die sichere Verwahrung ihrer Zugangsdaten verantwortlich. Der Zugang kann eingeschränkt werden, wenn dies aus Sicherheits- oder Missbrauchsgründen erforderlich ist.",
    pricesText: "In M1 werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und keine Beta-Nutzung rückwirkend abgerechnet. Spätere kostenpflichtige Angebote setzen eine gesonderte, ausdrückliche Zustimmung voraus.",
    localText: "Der lokale Kern von BloomMD arbeitet mit offenen Markdown-Dateien. Nutzer bleiben für lokale Dateien, Backups und die Einhaltung eigener Organisationspflichten verantwortlich.",
    availabilityText: "BloomMD wird mit angemessener Sorgfalt betrieben. Wartung, Updates, technische Störungen oder Dienste Dritter können die Nutzung zeitweise einschränken.",
  };

  return (
    <LegalPage title={copy.title} eyebrow="AGB" locale={locale}>
      <LegalSection title={copy.provider}>
        <p>{legal.businessName}</p>
        <p>E-Mail: {legal.email}</p>
      </LegalSection>

      <LegalSection title={copy.description}>
        <p>{copy.descriptionText}</p>
      </LegalSection>

      <LegalSection title={copy.access}>
        <p>{copy.accessText}</p>
      </LegalSection>

      <LegalSection title={copy.prices}>
        <p>{copy.pricesText}</p>
      </LegalSection>

      <LegalSection title={copy.local}>
        <p>{copy.localText}</p>
      </LegalSection>

      <LegalSection title={copy.availability}>
        <p>{copy.availabilityText}</p>
      </LegalSection>

      <LegalSection title={copy.status}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
