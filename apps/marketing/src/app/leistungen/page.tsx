import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { LEGAL_STATUS } from "../../lib/legal";
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
        <p>{en ? "BloomMD is in a closed beta. All functions are available at no charge. Cloud access is invitation-only; the public demo and template library are open. Obsidian compatibility is shown in M1 as a demo with real local notes; full plugin beta distribution follows later. No paid plans, payment data or paid service contracts are currently offered." : "BloomMD befindet sich in einer geschlossenen Beta. Sämtliche Funktionen stehen ohne Entgelt zur Verfügung. Der Zugang zur Cloud-Anwendung erfolgt ausschließlich auf Einladung; die öffentliche Demo und die Vorlagenbibliothek sind frei zugänglich. Die Obsidian-Kompatibilität wird in M1 als Demo mit echten lokalen Notizen gezeigt; die vollständige Plugin-Beta-Verteilung folgt danach. Es werden derzeit keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und keine Verträge über entgeltliche Leistungen geschlossen."}</p>
      </LegalSection>
      <LegalSection title={en ? "Beta scope" : "Leistungsumfang der Beta"}>
        <p>{en ? "The beta includes, within the granted access scope, the local Markdown editor with mindmap view, import and export, the template library, Obsidian compatibility evidence and tools for OKF-compatible knowledge bundles. Optional cloud sync is a beta feature and may be limited or temporarily disabled." : "Enthalten sind — im Rahmen des jeweils gewährten Zugangs — der lokale Markdown-Editor mit Mindmap-Ansicht, Import und Export, die Vorlagenbibliothek, Obsidian-Kompatibilitätsnachweise sowie die Werkzeuge für OKF-kompatible Wissensbündel. Optionaler Cloud-Sync wird als Beta-Funktion bereitgestellt und kann eingeschränkt oder vorübergehend deaktiviert sein."}</p>
      </LegalSection>
      <LegalSection title={en ? "Future charges" : "Künftige Entgelte"}>
        <p>{en ? "After the beta, a free local tier and a paid tier for cloud and team features are planned. Pricing and scope will be published here before launch. Beta use is never charged retroactively. Paid use always requires separate, explicit consent." : "Nach Abschluss der Beta ist eine kostenlose Stufe für lokales Arbeiten sowie eine entgeltliche Stufe für Cloud- und Teamfunktionen vorgesehen. Preise und Leistungsumfang werden vor Einführung an dieser Stelle veröffentlicht. Eine rückwirkende Abrechnung der Beta-Nutzung findet nicht statt. Eine kostenpflichtige Nutzung setzt stets eine gesonderte, ausdrückliche Zustimmung voraus."}</p>
      </LegalSection>
      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
