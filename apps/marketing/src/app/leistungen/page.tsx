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
      <LegalSection title={en ? "Current status: free trial account" : "Aktueller Stand: kostenloser Testaccount"}>
        <p>{en ? "The free trial account covers BloomMD Web, cloud workspaces, sync and collaboration; it requires an account, with no invitation and no waitlist. It is valid for 30 days from email confirmation, and we send reminder emails after 15 and 23 days. After it ends, your account is read-only and export remains possible; nothing is lost. For existing accounts, including former waitlist participants, the trial period counts from November 15, 2026 and lasts 60 days (until January 14, 2027), because of their beta participation. No paid plans, payment data or paid service contracts are currently offered." : "Der kostenlose Testaccount gilt für BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit; dafür brauchst du ein Konto, ohne Einladung und ohne Warteliste. Er gilt 30 Tage ab E-Mail-Bestätigung, vor Ablauf erinnern wir dich per E-Mail nach 15 und 23 Tagen. Nach Ablauf ist dein Konto nur noch lesbar, der Export bleibt möglich und nichts geht verloren. Für bestehende Konten, auch frühere Wartelisten-Teilnehmer, zählt der Testzeitraum wegen der Beta-Beteiligung ab dem 15. November 2026 und dauert 60 Tage (bis 14. Januar 2027). Es werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und keine Verträge über entgeltliche Leistungen geschlossen."}</p>
        <p>{en ? "The local software (browser demo, templates, macOS and Omarchy/Linux desktop builds, Obsidian plugin) is available as a beta, free of charge and without a BloomMD account." : "Die lokale Software (Browser-Demo, Vorlagen, macOS- und Omarchy/Linux-Desktop-Builds sowie das Obsidian-Plugin) ist als Beta kostenlos und ohne BloomMD-Konto verfügbar."}</p>
      </LegalSection>
      <LegalSection title={en ? "Scope of the free trial account" : "Leistungsumfang des Testaccounts"}>
        <p>{en ? "The free trial account and the local beta software include the local Markdown editor with mindmap view, import and export, templates, the Obsidian plugin and tools for OKF-compatible knowledge bundles. Optional cloud sync is available only within the trial account and may be limited or temporarily disabled." : "Der kostenlose Testaccount und die lokale Beta-Software umfassen den lokalen Markdown-Editor mit Mindmap-Ansicht, Import und Export, Vorlagen, das Obsidian-Plugin und Werkzeuge für OKF-kompatible Wissensbündel. Optionaler Cloud-Sync steht nur im Rahmen des Testaccounts bereit und kann eingeschränkt oder vorübergehend deaktiviert sein."}</p>
      </LegalSection>
      <LegalSection title={en ? "Future charges" : "Künftige Entgelte"}>
        <p>{en ? "After the trial period and beta, a free local tier and a paid tier for cloud and team features are planned. Pricing and scope will be published here before launch. Beta use is never charged retroactively. Paid use always requires separate, explicit consent." : "Nach Abschluss von Testzeitraum und Beta ist eine kostenlose Stufe für lokales Arbeiten sowie eine entgeltliche Stufe für Cloud- und Teamfunktionen vorgesehen. Preise und Leistungsumfang werden vor Einführung an dieser Stelle veröffentlicht. Eine rückwirkende Abrechnung der Beta-Nutzung findet nicht statt. Eine kostenpflichtige Nutzung setzt stets eine gesonderte, ausdrückliche Zustimmung voraus."}</p>
      </LegalSection>
      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{en ? "November 4, 2026" : "4. November 2026"}</p>
      </LegalSection>
    </LegalPage>
  );
}
