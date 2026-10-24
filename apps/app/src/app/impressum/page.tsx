import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getAppLocale, type AppLocale } from "../../lib/locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getAppLocale((await searchParams).lang) === "en" ? "Legal notice" : "Impressum"} | BloomMD`, robots: { index: true, follow: true } };
}

export const dynamic = "force-dynamic";

export default async function ImpressumPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: AppLocale = getAppLocale((await searchParams).lang);
  const en = locale === "en";

  return (
    <LegalPage title={en ? "Legal notice" : "Impressum"} eyebrow={en ? "Provider information" : "Anbieterkennzeichnung"} locale={locale}>
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
