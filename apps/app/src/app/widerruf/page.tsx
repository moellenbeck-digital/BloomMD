import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getAppLocale, type AppLocale } from "../../lib/locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getAppLocale((await searchParams).lang) === "en" ? "Right of withdrawal" : "Widerruf"} | BloomMD`, robots: { index: true, follow: true } };
}

export const dynamic = "force-dynamic";

export default async function WiderrufPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: AppLocale = getAppLocale((await searchParams).lang);
  const en = locale === "en";

  return (
    <LegalPage title={en ? "Right of withdrawal" : "Widerrufsbelehrung"} eyebrow={en ? "Withdrawal" : "Widerruf"} locale={locale}>
      <LegalSection title={en ? "Provider" : "Anbieter"}>
        <p>{legal.businessName}</p>
        <p>E-Mail: {legal.email}</p>
      </LegalSection>

      <LegalSection title={en ? "Right of withdrawal" : "Widerrufsrecht"}>
        <p>{en ? "The closed M1 beta sells no paid plans and collects no payment data. If a user no longer wants beta access, they can request account deletion or, if an entry of the ended waitlist still exists, remove it through the unsubscribe link." : "In der geschlossenen M1-Beta werden keine kostenpflichtigen Pläne verkauft und keine Zahlungsdaten erhoben. Soweit ein Nutzer den Beta-Zugang nicht mehr nutzen möchte, kann er die Account-Löschung verlangen oder einen noch bestehenden Eintrag der beendeten Warteliste über den Abmeldelink entfernen."}</p>
      </LegalSection>

      <LegalSection title={en ? "Digital content and software" : "Digitale Inhalte und Software"}>
        <p>{en ? "Local desktop, Obsidian and CLI use operates on the user's files. Users remain responsible for local backups. M1 provides no recovery promise for cloud content." : "Lokale Desktop-, Obsidian- und CLI-Nutzung arbeitet auf Dateien des Nutzers. Nutzer bleiben für lokale Backups verantwortlich. Für Cloud-Inhalte gibt es in M1 keine Wiederherstellungszusage."}</p>
      </LegalSection>

      <LegalSection title={en ? "Refunds" : "Rückzahlungen"}>
        <p>{en ? "Because M1 involves no payments, there is no payment reversal for beta use." : "Da in M1 keine Zahlungen stattfinden, gibt es keine Zahlungsrückabwicklung für die Beta-Nutzung."}</p>
      </LegalSection>

      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
