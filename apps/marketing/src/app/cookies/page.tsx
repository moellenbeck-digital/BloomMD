import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { LEGAL_STATUS } from "../../lib/legal";
import { AnalyticsConsentSettings } from "./analytics-consent-settings";
import { getMarketingLocale, type MarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: `${locale === "en" ? "Cookie settings" : "Cookie-Einstellungen"} | BloomMD`,
    description: locale === "en" ? "Cookie and analytics settings for BloomMD." : "Cookie- und Analyse-Einstellungen für BloomMD.",
    path: locale === "en" ? "/cookies?lang=en" : "/cookies",
    locale,
    robots: { index: true, follow: true },
  });
}

export default async function CookiesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale: MarketingLocale = getMarketingLocale((await searchParams).lang);
  const en = locale === "en";
  return (
    <LegalPage title={en ? "Cookie settings" : "Cookie-Einstellungen"} eyebrow="Cookies" locale={locale} path="/cookies">
      <LegalSection title={en ? "Technically necessary cookies" : "Technisch notwendige Cookies"}>
        <p>{en ? "BloomMD uses technically necessary session cookies so login, protected areas and account functions work." : "BloomMD nutzt technisch notwendige Session-Cookies, damit Login, geschützte Bereiche und Account-Funktionen funktionieren."}</p>
      </LegalSection>
      <LegalSection title={en ? "Analytics and product metrics" : "Analyse und Produktmetriken"}>
        <p>{en ? "Plausible is a cookieless, aggregate analytics service. When the direct configuration is present, it loads without a consent dialog and does not store cookies or persistent identifiers. If a consent-required service such as PostHog is enabled later, BloomMD will show a separate choice for that service." : "Plausible ist eine cookielose, aggregierte Analyse. Wenn die Direktkonfiguration vorhanden ist, lädt Plausible ohne Einwilligungsdialog und speichert keine Cookies oder persistenten Identifikatoren. Falls später ein zustimmungspflichtiger Dienst wie PostHog aktiviert wird, zeigt BloomMD dafür eine separate Auswahl."}</p>
        <p>{en ? "Only documented, content-free marketing events are allowed: page paths and demo interactions such as template selection, view changes, file loading or download clicks. Markdown content, file names, node titles, search terms, complete URLs and document paths are not transmitted as analytics events." : "Erlaubt sind nur die dokumentierten, inhaltsfreien Ereignisse aus der Marketing-App: Seitenaufrufe mit Pfad sowie Demo-Interaktionen wie Template-Auswahl, Ansichtwechsel, Datei geladen oder Download geklickt. Markdown-Inhalte, Dateinamen, Node-Titel, Suchtexte, vollständige URLs und Dokumentpfade werden nicht als Analytics-Events übertragen."}</p>
        <AnalyticsConsentSettings locale={locale} />
      </LegalSection>
      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
