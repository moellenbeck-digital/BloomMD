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
        <p>{en ? "Cloud access starts with a free trial account at no charge and is available without an invitation or waitlist. You create an account with an email address and a password, agree to the privacy policy and these terms, and confirm your email address with the link in the confirmation email. An account whose address is not confirmed is deleted after 7 days." : "Der Cloud-Zugang beginnt mit einem kostenlosen Testaccount ohne Entgelt und steht ohne Einladung und ohne Warteliste zur Verfügung. Du legst ein Konto mit E-Mail-Adresse und Passwort an, stimmst der Datenschutzerklärung und diesen Bedingungen zu und bestätigst deine E-Mail-Adresse über den Link in der Bestätigungs-E-Mail. Ein Konto, dessen Adresse nicht bestätigt wird, wird nach 7 Tagen gelöscht."}</p>
        <p>{en ? "The trial period ends 30 days after you confirm your email address. We remind you by email after 15 days and after 23 days. For existing accounts, including former waitlist participants, the trial period ends on January 14, 2027 at 00:00 UTC (60 days, counted from November 15, 2026); the reminders then arrive on December 30, 2026 and January 7, 2027." : "Der Testzeitraum endet 30 Tage nach der Bestätigung deiner E-Mail-Adresse. Wir erinnern dich per E-Mail nach 15 und nach 23 Tagen. Für bestehende Konten, auch frühere Wartelisten-Teilnehmer, endet der Testzeitraum am 14.01.2027 um 00:00 Uhr UTC (60 Tage, Zählung ab dem 15.11.2026); die Hinweise kommen dann am 30.12.2026 und am 07.01.2027."}</p>
      </LegalSection>

      <LegalSection title={en ? "End of the trial period" : "Ablauf des Testzeitraums"}>
        <p>{en ? <>When the trial period ends, the account is read-only: you can still open and read your content, but you can no longer change it or create new content. Exporting your data remains possible, and so does deleting your account. With the paid plan “Cloud”, the account stays writable after the trial period for as long as the plan is active. An expired account is currently not deleted automatically; its content stays stored until you delete the account. Details on retention and deletion are in the <a href={`/datenschutz?lang=${locale}`}>privacy policy</a>, section “Retention and deletion”.</> : <>Mit dem Ende des Testzeitraums ist das Konto nur noch lesbar: Du kannst deine Inhalte weiterhin öffnen und lesen, aber nichts mehr ändern oder neu anlegen. Der Export deiner Daten bleibt möglich, ebenso das Löschen des Kontos. Mit dem bezahlten Tarif „Cloud“ bleibt das Konto auch nach dem Testzeitraum schreibbar, solange der Tarif aktiv ist. Ein abgelaufenes Konto wird derzeit nicht automatisch gelöscht; seine Inhalte bleiben gespeichert, bis du das Konto löschst. Einzelheiten zu Speicherdauer und Löschung stehen in der <a href={`/datenschutz?lang=${locale}`}>Datenschutzerklärung</a> im Abschnitt „Speicherdauer und Löschung“.</>}</p>
      </LegalSection>

      <LegalSection title={en ? "Account and access" : "Account und Zugang"}>
        <p>{en ? "Users are responsible for accurate account data and secure credentials. Access may be restricted where necessary for security or to prevent misuse." : "Nutzer sind für die Richtigkeit ihrer Accountdaten und die sichere Verwahrung ihrer Zugangsdaten verantwortlich. Der Zugang kann eingeschränkt werden, wenn dies aus Sicherheits- oder Missbrauchsgründen erforderlich ist."}</p>
      </LegalSection>

      <LegalSection title={en ? "Deleting your account" : "Konto löschen"}>
        <p>{en ? <>You can delete your account at any time at <a href="https://bloommd.app/account">https://bloommd.app/account</a>, also after the trial period has ended. To confirm, you enter your email address and your password. What is deleted is described in the <a href={`/datenschutz?lang=${locale}`}>privacy policy</a>, section “Retention and deletion”.</> : <>Du kannst dein Konto jederzeit unter <a href="https://bloommd.app/account">https://bloommd.app/account</a> löschen, auch nach Ablauf des Testzeitraums. Zur Bestätigung gibst du deine E-Mail-Adresse und dein Passwort ein. Was dabei gelöscht wird, beschreibt die <a href={`/datenschutz?lang=${locale}`}>Datenschutzerklärung</a> im Abschnitt „Speicherdauer und Löschung“.</>}</p>
        <p>{en ? "A running subscription is ended at Stripe beforehand; if that fails, the account is not deleted. Deleting the account does not by itself lead to a refund; refunds are governed by the withdrawal information." : "Ein laufendes Abonnement wird dabei vorher bei Stripe beendet; gelingt das nicht, wird das Konto nicht gelöscht. Das Löschen des Kontos führt nicht von selbst zu einer Erstattung; für Erstattungen gilt die Widerrufsbelehrung."}</p>
      </LegalSection>

      <LegalSection title={en ? "Acceptable use and misuse" : "Zulässige Nutzung und Missbrauch"}>
        <p>{en ? "You use BloomMD within the law and in a way that does not impair the service or other users. In particular, it is not permitted to create accounts in bulk or by automated means, to trigger confirmation, invitation or other emails of the service in bulk, to bypass technical safeguards and limits, or to access other people's accounts and data." : "Du nutzt BloomMD im Rahmen der Gesetze und so, dass der Dienst und andere Nutzer nicht beeinträchtigt werden. Nicht zulässig ist insbesondere, Konten massenhaft oder automatisiert anzulegen, Bestätigungs-, Einladungs- oder andere E-Mails des Dienstes massenhaft auszulösen, technische Schutzmaßnahmen und Begrenzungen zu umgehen oder auf Konten und Daten anderer zuzugreifen."}</p>
        <p>{en ? "To protect against misuse, BloomMD limits requests per source address and per account as well as the total number of account emails sent. Requests above these limits are rejected. In case of misuse, access may be restricted as described under “Account and access”." : "Zum Schutz vor Missbrauch begrenzt BloomMD Anfragen je Quelladresse und je Konto sowie den Versand von Konto-E-Mails insgesamt. Anfragen oberhalb dieser Grenzen werden abgelehnt. Bei Missbrauch kann der Zugang eingeschränkt werden, wie unter „Account und Zugang“ beschrieben."}</p>
      </LegalSection>

      <LegalSection title={en ? "Responsibility for your own content" : "Verantwortung für eigene Inhalte"}>
        <p>{en ? "You are responsible for the content you store in BloomMD, share or contribute to workspaces. You make sure that you are allowed to use it and that it does not violate laws or the rights of third parties. Anyone who knows a share link can read the shared map; you decide who receives it and can revoke it at any time. Export your content regularly to keep your own copy." : "Du bist für die Inhalte verantwortlich, die du in BloomMD speicherst, teilst oder in Workspaces einbringst. Du stellst sicher, dass du sie verwenden darfst und dass sie nicht gegen Gesetze oder Rechte Dritter verstoßen. Wer einen Share-Link kennt, kann die geteilte Map lesen; du entscheidest, wem du ihn gibst, und kannst ihn jederzeit widerrufen. Exportiere deine Inhalte regelmäßig, um eine eigene Kopie zu behalten."}</p>
      </LegalSection>

      <LegalSection title={en ? "Prices and payments" : "Preise und Zahlungen"}>
        <p>{en ? "The trial account is free of charge and is not billed retroactively. In addition, BloomMD offers the paid plan “Cloud” as a subscription: 6 EUR per month (monthly billing) or 60 EUR per year (annual billing). A fee arises only if you book the plan yourself in the checkout; you can book it as soon as it is offered in your account. Value-added tax, where it applies, is calculated by Stripe Tax and shown in the checkout before you complete the booking; the total amount shown there applies." : "Der Testaccount ist kostenlos und wird nicht rückwirkend abgerechnet. Darüber hinaus bietet BloomMD den bezahlten Tarif „Cloud“ als Abonnement an: 6 EUR pro Monat (monatliche Abrechnung) oder 60 EUR pro Jahr (jährliche Abrechnung). Ein Entgelt entsteht nur, wenn du den Tarif im Checkout selbst buchst; buchen kannst du ihn, sobald er in deinem Konto angeboten wird. Die Umsatzsteuer, soweit sie anfällt, berechnet Stripe Tax und weist sie im Checkout vor Abschluss der Buchung aus; maßgeblich ist der dort angezeigte Gesamtbetrag."}</p>
        <p>{en ? <>Payment is processed by Stripe (Stripe Payments Europe, Ltd., Ireland). In the checkout you enter your billing address (mandatory) and, if you wish, your VAT ID; Stripe collects the payment method. BloomMD does not store card data. More in the <a href={`/datenschutz?lang=${locale}`}>privacy policy</a>, section “Payment and subscription”.</> : <>Die Zahlung wird über Stripe abgewickelt (Stripe Payments Europe, Ltd., Irland). Im Checkout gibst du deine Rechnungsadresse (Pflichtangabe) und, wenn du möchtest, deine USt-IdNr. an; das Zahlungsmittel erfasst Stripe. BloomMD speichert keine Kartendaten. Mehr steht in der <a href={`/datenschutz?lang=${locale}`}>Datenschutzerklärung</a> im Abschnitt „Zahlung und Abo“.</>}</p>
        <p>{en ? "Term and billing: the subscription starts when the booking is completed and runs for the booked billing period (one month or one year). It renews automatically for the same period until you cancel it. Stripe bills each period; you can view your invoices and manage the subscription in the Stripe customer portal." : "Laufzeit und Abrechnung: Das Abonnement beginnt mit dem Abschluss der Buchung und läuft für die gebuchte Abrechnungsperiode (einen Monat oder ein Jahr). Es verlängert sich automatisch um dieselbe Periode, bis du es kündigst. Stripe rechnet jede Periode ab; deine Rechnungen kannst du im Stripe-Kundenportal einsehen und das Abonnement dort verwalten."}</p>
        <p>{en ? "Cancellation: you can cancel at any time. In your account, “Manage invoices and subscription” opens the Stripe customer portal, where you end the subscription. The cancellation takes effect at the end of the current billing period; until then you can keep using the plan and your account stays writable. After that the plan ends and the account behaves as after the end of the trial period (see “End of the trial period”). If the subscription is no longer active at Stripe, for example because a payment failed, the plan is no longer available. A cancellation does not automatically lead to a refund for the remaining term; see the withdrawal information, section “Refunds”." : "Kündigung: Du kannst jederzeit kündigen. In deinem Konto öffnet „Rechnungen und Abo verwalten“ das Stripe-Kundenportal; dort beendest du das Abonnement. Die Kündigung wirkt zum Ende der laufenden Abrechnungsperiode; bis dahin kannst du den Tarif weiter nutzen und dein Konto bleibt schreibbar. Danach endet der Tarif, und das Konto verhält sich wie nach dem Ende des Testzeitraums (siehe „Ablauf des Testzeitraums“). Ist das Abonnement bei Stripe nicht mehr aktiv, etwa weil eine Zahlung fehlgeschlagen ist, steht der Tarif nicht mehr zur Verfügung. Eine Kündigung führt nicht automatisch zu einer Erstattung für die Restlaufzeit; siehe die Widerrufsbelehrung, Abschnitt „Rückzahlungen“."}</p>
        <p>{en ? "Storage: every account has 100 MB of storage for the content of its documents (the Markdown text of all non-deleted documents in the workspaces the account owns). Once the limit is reached, nothing can be saved that increases the storage used. Nothing is ever deleted automatically. Reading, exporting, deleting and reducing content remain possible at any time, and saving works again once you are below the limit." : "Speicher: Jedes Konto hat 100 MB Speicher für die Inhalte seiner Dokumente (der Markdown-Text aller nicht gelöschten Dokumente in den Workspaces, die dem Konto gehören). Ist die Grenze erreicht, lässt sich nichts mehr speichern, das den belegten Speicher vergrößert. Es wird nie automatisch etwas gelöscht. Lesen, Export, Löschen und Verkleinern bleiben jederzeit möglich; unterhalb der Grenze funktioniert das Speichern wieder."}</p>
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
