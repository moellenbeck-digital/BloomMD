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
      <LegalSection title={en ? "Current status: free closed beta" : "Aktueller Stand: kostenlose geschlossene Beta"}>
        <p>{en ? "Closed beta applies to BloomMD Web, cloud workspaces, sync and collaboration; those require an account, and registration is open. The browser demo, templates, macOS and Omarchy/Linux desktop beta builds, and Obsidian plugin beta are available without an invitation or BloomMD account. All currently available beta functions are free. No paid plans, payment data or paid service contracts are currently offered." : "Die geschlossene Beta betrifft BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit; dafür brauchst du ein Konto, die Registrierung ist offen. Browser-Demo, Vorlagen, macOS- und Omarchy/Linux-Desktop-Builds sowie das Obsidian-Plugin sind als Beta ohne Einladung oder BloomMD-Konto verfügbar. Die derzeit verfügbaren Beta-Funktionen sind kostenlos. Es werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und keine Verträge über entgeltliche Leistungen geschlossen."}</p>
      </LegalSection>
      <LegalSection title={en ? "Beta scope" : "Leistungsumfang der Beta"}>
        <p>{en ? "The beta includes the local Markdown editor with mindmap view, import and export, templates, the Obsidian plugin and tools for OKF-compatible knowledge bundles. Optional cloud sync is available only within the granted Web access and may be limited or temporarily disabled." : "Die Beta umfasst den lokalen Markdown-Editor mit Mindmap-Ansicht, Import und Export, Vorlagen, das Obsidian-Plugin und Werkzeuge für OKF-kompatible Wissensbündel. Optionaler Cloud-Sync steht nur im Rahmen eines freigeschalteten Web-Zugangs bereit und kann eingeschränkt oder vorübergehend deaktiviert sein."}</p>
      </LegalSection>
      <LegalSection title={en ? "Future charges" : "Künftige Entgelte"}>
        <p>{en ? "After the beta, a free local tier and a paid tier for cloud and team features are planned. Pricing and scope will be published here before launch. Beta use is never charged retroactively. Paid use always requires separate, explicit consent." : "Nach Abschluss der Beta ist eine kostenlose Stufe für lokales Arbeiten sowie eine entgeltliche Stufe für Cloud- und Teamfunktionen vorgesehen. Preise und Leistungsumfang werden vor Einführung an dieser Stelle veröffentlicht. Eine rückwirkende Abrechnung der Beta-Nutzung findet nicht statt. Eine kostenpflichtige Nutzung setzt stets eine gesonderte, ausdrückliche Zustimmung voraus."}</p>
      </LegalSection>
      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{en ? "October 25, 2026" : "25. Oktober 2026"}</p>
      </LegalSection>
    </LegalPage>
  );
}
