import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getMarketingLocale, type MarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: `${locale === "en" ? "Legal notice" : "Impressum"} | BloomMD`,
    description: locale === "en" ? "Legal notice and contact details for BloomMD." : "Impressum und Kontaktdaten von BloomMD.",
    path: locale === "en" ? "/impressum?lang=en" : "/impressum",
    locale,
    robots: { index: true, follow: true },
  });
}

export const dynamic = "force-dynamic";

export default async function ImpressumPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: MarketingLocale = getMarketingLocale((await searchParams).lang);
  const en = locale === "en";

  return (
    <LegalPage title={en ? "Legal notice" : "Impressum"} eyebrow={en ? "Provider information" : "Anbieterkennzeichnung"} locale={locale} path="/impressum">
      <LegalSection title={en ? "Information according to § 5 DDG" : "Angaben gemäß § 5 DDG"}>
        <p>{legal.businessName}</p>
        <p>{legal.ownerName}</p>
        <p>{legal.street}</p>
        <p>
          {legal.postalCity}
          <br />
          {legal.country}
        </p>
      </LegalSection>

      <LegalSection title={en ? "Contact" : "Kontakt"}>
        <p>{en ? "Email" : "E-Mail"}: {legal.email}</p>
        <p>{en ? "Phone" : "Telefon"}: {legal.phone}</p>
      </LegalSection>

      <LegalSection title={en ? "Commercial register" : "Registereintrag"}>
        <p>{en ? "Register court" : "Registergericht"}: {legal.registerCourt}</p>
        <p>{en ? "Registration number" : "Registernummer"}: {legal.registerNumber}</p>
      </LegalSection>

      <LegalSection title={en ? "VAT" : "Umsatzsteuer"}>
        <p>{en ? "VAT ID" : "Umsatzsteuer-ID"}: {legal.vatId}</p>
      </LegalSection>

      <LegalSection title={en ? "Responsible for content" : "Verantwortlich für den Inhalt"}>
        <p>{legal.responsibleContent}</p>
      </LegalSection>

      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
