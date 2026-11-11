import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getMarketingLocale, type MarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: `${locale === "en" ? "General Terms and Conditions" : "AGB"} | BloomMD`,
    description: locale === "en" ? "BloomMD terms and conditions." : "Allgemeine Geschäftsbedingungen von BloomMD.",
    path: locale === "en" ? "/agb?lang=en" : "/agb",
    locale,
    robots: { index: true, follow: true },
  });
}

export const dynamic = "force-dynamic";

export default async function AGBPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: MarketingLocale = getMarketingLocale((await searchParams).lang);
  const en = locale === "en";

  return (
    <LegalPage title={en ? "General Terms and Conditions" : "Allgemeine Geschäftsbedingungen"} eyebrow="AGB" locale={locale} path="/agb">
      <LegalSection title={en ? "Provider" : "Anbieter"}>
        <p>{legal.businessName}</p>
        <p>E-Mail: {legal.email}</p>
      </LegalSection>

      <LegalSection title={en ? "Subject matter and registration" : "Vertragsgegenstand und Registrierung"}>
        <p>{en ? <>BloomMD is software for visually structuring open Markdown files. These terms apply to the hosted cloud access (BloomMD Web and Cloud). The <a href={`/lizenz?lang=${locale}`}>license terms</a> govern the source code and local use.</> : <>BloomMD ist eine Software zur visuellen Strukturierung offener Markdown-Dateien. Diese Bedingungen gelten für den gehosteten Cloud-Zugang (BloomMD Web und Cloud). Für den Quellcode und die lokale Nutzung gelten die <a href={`/lizenz?lang=${locale}`}>Lizenzbedingungen</a>.</>}</p>
        <p>{en ? "Cloud access is provided as a free trial account at no charge and is available without an invitation or waitlist. You create an account with an email address and a password, agree to the privacy policy and these terms, and confirm your email address with the link in the confirmation email. An account whose address is not confirmed is deleted after 7 days." : "Der Cloud-Zugang wird als kostenloser Testaccount ohne Entgelt bereitgestellt und steht ohne Einladung und ohne Warteliste zur Verfügung. Du legst ein Konto mit E-Mail-Adresse und Passwort an, stimmst der Datenschutzerklärung und diesen Bedingungen zu und bestätigst deine E-Mail-Adresse über den Link in der Bestätigungs-E-Mail. Ein Konto, dessen Adresse nicht bestätigt wird, wird nach 7 Tagen gelöscht."}</p>
        <p>{en ? "The trial period ends 30 days after you confirm your email address. We remind you by email after 15 days and after 23 days. For existing accounts, including former waitlist participants, the trial period ends on January 14, 2027 at 00:00 UTC (60 days, counted from November 15, 2026); the reminders then arrive on December 30, 2026 and January 7, 2027." : "Der Testzeitraum endet 30 Tage nach der Bestätigung deiner E-Mail-Adresse. Wir erinnern dich per E-Mail nach 15 und nach 23 Tagen. Für bestehende Konten, auch frühere Wartelisten-Teilnehmer, endet der Testzeitraum am 14.01.2027 um 00:00 Uhr UTC (60 Tage, Zählung ab dem 15.11.2026); die Hinweise kommen dann am 30.12.2026 und am 07.01.2027."}</p>
      </LegalSection>

      <LegalSection title={en ? "End of the trial period" : "Ablauf des Testzeitraums"}>
        <p>{en ? <>When the trial period ends, the account is read-only: you can still open and read your content, but you can no longer change it or create new content. Exporting your data remains possible, and so does deleting your account. An expired account is currently not deleted automatically; its content stays stored until you delete the account. Details on retention and deletion are in the <a href={`/datenschutz?lang=${locale}`}>privacy policy</a>, section “Retention and deletion”.</> : <>Mit dem Ende des Testzeitraums ist das Konto nur noch lesbar: Du kannst deine Inhalte weiterhin öffnen und lesen, aber nichts mehr ändern oder neu anlegen. Der Export deiner Daten bleibt möglich, ebenso das Löschen des Kontos. Ein abgelaufenes Konto wird derzeit nicht automatisch gelöscht; seine Inhalte bleiben gespeichert, bis du das Konto löschst. Einzelheiten zu Speicherdauer und Löschung stehen in der <a href={`/datenschutz?lang=${locale}`}>Datenschutzerklärung</a> im Abschnitt „Speicherdauer und Löschung“.</>}</p>
      </LegalSection>

      <LegalSection title={en ? "Account and access" : "Account und Zugang"}>
        <p>{en ? "Users are responsible for accurate account data and secure credentials. Access may be restricted where necessary for security or to prevent misuse." : "Nutzer sind für die Richtigkeit ihrer Accountdaten und die sichere Verwahrung ihrer Zugangsdaten verantwortlich. Der Zugang kann eingeschränkt werden, wenn dies aus Sicherheits- oder Missbrauchsgründen erforderlich ist."}</p>
      </LegalSection>

      <LegalSection title={en ? "Deleting your account" : "Konto löschen"}>
        <p>{en ? <>You can delete your account at any time at <a href="https://bloommd.app/account">https://bloommd.app/account</a>, also after the trial period has ended. To confirm, you enter your email address and your password. What is deleted is described in the <a href={`/datenschutz?lang=${locale}`}>privacy policy</a>, section “Retention and deletion”.</> : <>Du kannst dein Konto jederzeit unter <a href="https://bloommd.app/account">https://bloommd.app/account</a> löschen, auch nach Ablauf des Testzeitraums. Zur Bestätigung gibst du deine E-Mail-Adresse und dein Passwort ein. Was dabei gelöscht wird, beschreibt die <a href={`/datenschutz?lang=${locale}`}>Datenschutzerklärung</a> im Abschnitt „Speicherdauer und Löschung“.</>}</p>
      </LegalSection>

      <LegalSection title={en ? "Acceptable use and misuse" : "Zulässige Nutzung und Missbrauch"}>
        <p>{en ? "You use BloomMD within the law and in a way that does not impair the service or other users. In particular, it is not permitted to create accounts in bulk or by automated means, to trigger confirmation, invitation or other emails of the service in bulk, to bypass technical safeguards and limits, or to access other people's accounts and data." : "Du nutzt BloomMD im Rahmen der Gesetze und so, dass der Dienst und andere Nutzer nicht beeinträchtigt werden. Nicht zulässig ist insbesondere, Konten massenhaft oder automatisiert anzulegen, Bestätigungs-, Einladungs- oder andere E-Mails des Dienstes massenhaft auszulösen, technische Schutzmaßnahmen und Begrenzungen zu umgehen oder auf Konten und Daten anderer zuzugreifen."}</p>
        <p>{en ? "To protect against misuse, BloomMD limits requests per source address and per account as well as the total number of account emails sent. Requests above these limits are rejected. In case of misuse, access may be restricted as described under “Account and access”." : "Zum Schutz vor Missbrauch begrenzt BloomMD Anfragen je Quelladresse und je Konto sowie den Versand von Konto-E-Mails insgesamt. Anfragen oberhalb dieser Grenzen werden abgelehnt. Bei Missbrauch kann der Zugang eingeschränkt werden, wie unter „Account und Zugang“ beschrieben."}</p>
      </LegalSection>

      <LegalSection title={en ? "Responsibility for your own content" : "Verantwortung für eigene Inhalte"}>
        <p>{en ? "You are responsible for the content you store in BloomMD, share or contribute to workspaces. You make sure that you are allowed to use it and that it does not violate laws or the rights of third parties. Anyone who knows a share link can read the shared map; you decide who receives it and can revoke it at any time. Export your content regularly to keep your own copy." : "Du bist für die Inhalte verantwortlich, die du in BloomMD speicherst, teilst oder in Workspaces einbringst. Du stellst sicher, dass du sie verwenden darfst und dass sie nicht gegen Gesetze oder Rechte Dritter verstoßen. Wer einen Share-Link kennt, kann die geteilte Map lesen; du entscheidest, wem du ihn gibst, und kannst ihn jederzeit widerrufen. Exportiere deine Inhalte regelmäßig, um eine eigene Kopie zu behalten."}</p>
      </LegalSection>

      <LegalSection title={en ? "Prices and payments" : "Preise und Zahlungen"}>
        <p>{en ? "The trial account is free of charge. BloomMD currently offers no paid plans, collects no payment data and does not charge use retroactively. Any later paid offering requires separate, explicit consent." : "Der Testaccount ist kostenlos. BloomMD bietet derzeit keine kostenpflichtigen Pläne an, erhebt keine Zahlungsdaten und rechnet die Nutzung nicht nachträglich ab. Spätere kostenpflichtige Angebote setzen eine gesonderte, ausdrückliche Zustimmung voraus."}</p>
      </LegalSection>

      <LegalSection title={en ? "Local-first and data" : "Local-first und Daten"}>
        <p>{en ? "BloomMD's local-first core works with open Markdown files. Users remain responsible for local files, backups and their own organisational obligations." : "Der lokale Kern von BloomMD arbeitet mit offenen Markdown-Dateien. Nutzer bleiben für lokale Dateien, Backups und die Einhaltung eigener Organisationspflichten verantwortlich."}</p>
      </LegalSection>

      <LegalSection title={en ? "Availability" : "Verfügbarkeit"}>
        <p>{en ? "BloomMD is operated with reasonable care. Maintenance, updates, technical incidents or third-party services may temporarily limit use." : "BloomMD wird mit angemessener Sorgfalt betrieben. Wartung, Updates, technische Störungen oder Dienste Dritter können die Nutzung zeitweise einschränken."}</p>
      </LegalSection>

      <LegalSection title={en ? "Liability" : "Haftung"}>
        <p>{en ? "Liability is not limited in cases of intent and gross negligence, for injury to life, body or health, and under the Product Liability Act (Produkthaftungsgesetz). Otherwise, the statutory provisions apply." : "Die Haftung ist nicht beschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz. Im Übrigen gelten die gesetzlichen Vorschriften."}</p>
      </LegalSection>

      <LegalSection title={en ? "Changes to these terms" : "Änderung der Bedingungen"}>
        <p>{en ? "We may change these terms for the future. The version in force is shown on this page, with its date at the bottom. We inform you in advance about material changes. You can delete your account at any time." : "Wir können diese Bedingungen für die Zukunft ändern. Die jeweils gültige Fassung steht auf dieser Seite, ihr Stand am Ende der Seite. Über wesentliche Änderungen informieren wir dich vorab. Du kannst dein Konto jederzeit löschen."}</p>
      </LegalSection>

      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
