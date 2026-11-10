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
        <p>{en ? "The free trial account costs nothing. BloomMD currently sells no paid plans and collects no payment data." : "Der kostenlose Testaccount verursacht keine Kosten. BloomMD verkauft derzeit keine kostenpflichtigen Pläne und erhebt keine Zahlungsdaten."}</p>
        <p>{en ? <>If you no longer want to use the trial account, you can delete your account at any time at <a href="https://bloommd.app/account">https://bloommd.app/account</a>. What is deleted is described in the <a href={`/datenschutz?lang=${locale}`}>privacy policy</a>, section “Retention and deletion”.</> : <>Wenn du den Testaccount nicht mehr nutzen möchtest, kannst du dein Konto jederzeit unter <a href="https://bloommd.app/account">https://bloommd.app/account</a> löschen. Was dabei gelöscht wird, beschreibt die <a href={`/datenschutz?lang=${locale}`}>Datenschutzerklärung</a> im Abschnitt „Speicherdauer und Löschung“.</>}</p>
        <p>{en ? "If you joined the ended waitlist, you can withdraw your consent at any time through the unsubscribe link in the invitation email or in earlier waitlist messages, without an account or sign-in." : "Wenn du dich in die beendete Warteliste eingetragen hast, kannst du deine Einwilligung jederzeit über den Abmeldelink in der Einladungs-E-Mail oder in früheren Wartelisten-Nachrichten widerrufen, ohne Konto und ohne Anmeldung."}</p>
      </LegalSection>

      <LegalSection title={en ? "Digital content and software" : "Digitale Inhalte und Software"}>
        <p>{en ? "Local desktop, Obsidian and CLI use operates on the user's files. Users remain responsible for local backups. There is no recovery promise for cloud content; export your content regularly." : "Lokale Desktop-, Obsidian- und CLI-Nutzung arbeitet auf Dateien des Nutzers. Nutzer bleiben für lokale Backups verantwortlich. Für Cloud-Inhalte gibt es keine Wiederherstellungszusage; exportiere deine Inhalte regelmäßig."}</p>
      </LegalSection>

      <LegalSection title={en ? "Refunds" : "Rückzahlungen"}>
        <p>{en ? "Because no payments take place, there is no payment reversal." : "Da keine Zahlungen stattfinden, gibt es keine Zahlungsrückabwicklung."}</p>
      </LegalSection>

      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
