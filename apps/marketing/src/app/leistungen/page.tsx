import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getMarketingLocale, type MarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: `${locale === "en" ? "Pricing and service description" : "Preis- und Leistungsbeschreibung"} | BloomMD`,
    description: locale === "en" ? "BloomMD pricing and service description." : "Preis- und Leistungsbeschreibung von BloomMD.",
    path: locale === "en" ? "/leistungen?lang=en" : "/leistungen",
    locale,
    robots: { index: true, follow: true },
  });
}

export default async function LeistungenPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale: MarketingLocale = getMarketingLocale((await searchParams).lang);
  const en = locale === "en";
  return (
    <LegalPage title={en ? "Pricing and service description" : "Preis- und Leistungsbeschreibung"} eyebrow={en ? "Services" : "Leistungen"} locale={locale} path="/leistungen">
      <LegalSection title={en ? "Current status: free trial account and the Cloud plan" : "Aktueller Stand: kostenloser Testaccount und Tarif Cloud"}>
        <p>{en ? "The free trial account covers BloomMD Web, cloud workspaces, sync and collaboration; it requires an account, with no invitation and no waitlist. It is valid for 30 days from email confirmation, and we send reminder emails after 15 and 23 days. After it ends, your account is read-only and export remains possible; nothing is lost. For existing accounts, including former waitlist participants, the trial period counts from November 15, 2026 and lasts 60 days (until January 14, 2027), because of their beta participation." : "Der kostenlose Testaccount gilt für BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit; dafür brauchst du ein Konto, ohne Einladung und ohne Warteliste. Er gilt 30 Tage ab E-Mail-Bestätigung, vor Ablauf erinnern wir dich per E-Mail nach 15 und 23 Tagen. Nach Ablauf ist dein Konto nur noch lesbar, der Export bleibt möglich und nichts geht verloren. Für bestehende Konten, auch frühere Wartelisten-Teilnehmer, zählt der Testzeitraum wegen der Beta-Beteiligung ab dem 15. November 2026 und dauert 60 Tage (bis 14. Januar 2027)."}</p>
        <p>{en ? <>The paid plan “Cloud” is a subscription for cloud access (BloomMD Web and Cloud) beyond the trial period: 6 EUR per month or 60 EUR per year, paid through Stripe, with 100 MB of storage per account. With an active plan your account stays writable after the trial period. You can book the plan as soon as it is offered in your account. The trial account stays free of charge, and nothing is billed retroactively. Details are in the <a href={`/agb?lang=${locale}`}>terms</a> and the <a href={`/widerruf?lang=${locale}`}>withdrawal information</a>.</> : <>Der bezahlte Tarif „Cloud“ ist ein Abonnement für den Cloud-Zugang (BloomMD Web und Cloud) über den Testzeitraum hinaus: 6 EUR pro Monat oder 60 EUR pro Jahr, bezahlt über Stripe, mit 100 MB Speicher je Konto. Mit aktivem Tarif bleibt dein Konto auch nach dem Testzeitraum schreibbar. Buchen kannst du den Tarif, sobald er in deinem Konto angeboten wird. Der Testaccount bleibt kostenlos, und es wird nichts rückwirkend abgerechnet. Einzelheiten stehen in den <a href={`/agb?lang=${locale}`}>AGB</a> und in der <a href={`/widerruf?lang=${locale}`}>Widerrufsbelehrung</a>.</>}</p>
        <p>{en ? "The local software (browser demo, templates, macOS and Omarchy/Linux desktop builds, Obsidian plugin) is available as a beta, free of charge and without a BloomMD account." : "Die lokale Software (Browser-Demo, Vorlagen, macOS- und Omarchy/Linux-Desktop-Builds sowie das Obsidian-Plugin) ist als Beta kostenlos und ohne BloomMD-Konto verfügbar."}</p>
      </LegalSection>
      <LegalSection title={en ? "Scope of the free trial account" : "Leistungsumfang des Testaccounts"}>
        <p>{en ? "The free trial account and the local beta software include the local Markdown editor with mindmap view, import and export, templates, the Obsidian plugin and tools for OKF-compatible knowledge bundles. Optional cloud sync is available within the trial account and the Cloud plan and may be limited or temporarily disabled." : "Der kostenlose Testaccount und die lokale Beta-Software umfassen den lokalen Markdown-Editor mit Mindmap-Ansicht, Import und Export, Vorlagen, das Obsidian-Plugin und Werkzeuge für OKF-kompatible Wissensbündel. Optionaler Cloud-Sync steht im Rahmen des Testaccounts und des Tarifs Cloud bereit und kann eingeschränkt oder vorübergehend deaktiviert sein."}</p>
      </LegalSection>
      <LegalSection title={en ? "Prices and charges" : "Preise und Entgelte"}>
        <p>{en ? "The plan “Cloud” costs 6 EUR per month (monthly billing) or 60 EUR per year (annual billing). Payment is processed by Stripe; value-added tax, where it applies, is shown in the checkout before you complete the booking. Every account has 100 MB of storage; once the limit is reached nothing is deleted, and reading, exporting, deleting and reducing content remain possible. You can cancel at any time, effective at the end of the current billing period. The trial account stays free of charge, and use during the trial period is not billed retroactively. A fee arises only if you book the plan yourself in the checkout." : "Der Tarif „Cloud“ kostet 6 EUR pro Monat (monatliche Abrechnung) oder 60 EUR pro Jahr (jährliche Abrechnung). Die Bezahlung läuft über Stripe; die Umsatzsteuer, soweit sie anfällt, weist der Checkout vor Abschluss der Buchung aus. Jedes Konto hat 100 MB Speicher; ist die Grenze erreicht, wird nichts gelöscht, und Lesen, Export, Löschen und Verkleinern bleiben möglich. Du kannst jederzeit kündigen, mit Wirkung zum Ende der laufenden Abrechnungsperiode. Der Testaccount bleibt kostenlos, und die Nutzung im Testzeitraum wird nicht rückwirkend abgerechnet. Ein Entgelt entsteht nur, wenn du den Tarif im Checkout selbst buchst."}</p>
      </LegalSection>
      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{en ? "November 4, 2026" : "4. November 2026"}</p>
      </LegalSection>
    </LegalPage>
  );
}
