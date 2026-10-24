import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { LEGAL_STATUS } from "../../lib/legal";
import { AnalyticsConsentSettings } from "./analytics-consent-settings";
import { getAppLocale, type AppLocale } from "../../lib/locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getAppLocale((await searchParams).lang) === "en" ? "Cookie settings" : "Cookie-Einstellungen"} | BloomMD`, robots: { index: true, follow: true } };
}

export default async function CookiesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale: AppLocale = getAppLocale((await searchParams).lang);
  const en = locale === "en";
  return (
    <LegalPage title={en ? "Cookie settings" : "Cookie-Einstellungen"} eyebrow="Cookies" locale={locale}>
      <LegalSection title={en ? "Technically necessary cookies" : "Technisch notwendige Cookies"}>
        <p>{en ? "BloomMD uses technically necessary session cookies so login, protected areas and account functions work." : "BloomMD nutzt technisch notwendige Session-Cookies, damit Login, geschützte Bereiche und Account-Funktionen funktionieren."}</p>
      </LegalSection>
      <LegalSection title={en ? "Analytics and product metrics" : "Analyse und Produktmetriken"}>
        <p>{en ? "Product analytics may be loaded only with data minimisation and the required consent. Markdown content, file names and complete document paths must not be transmitted as analytics events." : "Produktanalyse darf nur datensparsam und nach erforderlicher Zustimmung geladen werden. Markdown-Inhalte, Dateinamen und vollständige Dokumentpfade dürfen nicht als Analytics-Events übertragen werden."}</p>
        <AnalyticsConsentSettings locale={locale} />
      </LegalSection>
      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
