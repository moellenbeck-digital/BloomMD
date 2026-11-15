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
        <p>{en ? "The following information applies if you are a consumer and book the paid plan “Cloud” (a contract for services)." : "Die folgende Belehrung gilt, wenn du Verbraucher bist und den bezahlten Tarif „Cloud“ (Dienstleistungsvertrag) buchst."}</p>
        <p><strong>{en ? "Right of withdrawal" : "Widerrufsrecht"}</strong></p>
        <p>{en ? "You have the right to withdraw from this contract within fourteen days without giving any reason. The withdrawal period is fourteen days from the day the contract was concluded." : "Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses."}</p>
        <p>{en ? <>To exercise your right of withdrawal, you must inform us ({legal.businessName}, {legal.street}, {legal.postalCity}, {legal.country}, email: {legal.email}) of your decision to withdraw from this contract by means of a clear statement (for example a letter sent by post or an email). You may use the model withdrawal form below, but it is not mandatory. To meet the withdrawal period, it is sufficient that you send the notice of exercising the right of withdrawal before the withdrawal period has expired.</> : <>Um dein Widerrufsrecht auszuüben, musst du uns ({legal.businessName}, {legal.street}, {legal.postalCity}, {legal.country}, E-Mail: {legal.email}) mittels einer eindeutigen Erklärung (zum Beispiel ein mit der Post versandter Brief oder eine E-Mail) über deinen Entschluss, diesen Vertrag zu widerrufen, informieren. Du kannst dafür das untenstehende Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.</>}</p>
        <p><strong>{en ? "Consequences of withdrawal" : "Folgen des Widerrufs"}</strong></p>
        <p>{en ? "If you withdraw from this contract, we must refund all payments we have received from you without undue delay and no later than fourteen days from the day on which we received the notice of your withdrawal. For this refund we use the same means of payment that you used for the original transaction, unless expressly agreed otherwise with you; in no case will you be charged any fees because of this refund." : "Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über deinen Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der ursprünglichen Transaktion eingesetzt hast, es sei denn, mit dir wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden dir wegen dieser Rückzahlung Entgelte berechnet."}</p>
        <p>{en ? "If you have requested that the services begin during the withdrawal period, you must pay us a reasonable amount corresponding to the proportion of the services already provided up to the time you inform us of the exercise of the right of withdrawal, compared with the total scope of the services provided for in the contract." : "Hast du verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so hast du uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem du uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichtest, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht."}</p>
        <p><strong>{en ? "Model withdrawal form" : "Muster-Widerrufsformular"}</strong></p>
        <p>{en ? "(If you want to withdraw from the contract, please fill in and return this form.)" : "(Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses Formular aus und sende es zurück.)"}</p>
        <p>{en ? <>To {legal.businessName}, {legal.street}, {legal.postalCity}, {legal.country}, email: {legal.email}:</> : <>An {legal.businessName}, {legal.street}, {legal.postalCity}, {legal.country}, E-Mail: {legal.email}:</>}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{en ? "I hereby withdraw from the contract I concluded for the provision of the following service: subscription “BloomMD Cloud”" : "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: Abonnement „BloomMD Cloud“"}</li>
          <li>{en ? "Ordered on (date)" : "Bestellt am (Datum)"}</li>
          <li>{en ? "Name of the consumer" : "Name des Verbrauchers"}</li>
          <li>{en ? "Address of the consumer" : "Anschrift des Verbrauchers"}</li>
          <li>{en ? "Signature of the consumer (only for notice on paper)" : "Unterschrift des Verbrauchers (nur bei Mitteilung auf Papier)"}</li>
          <li>{en ? "Date" : "Datum"}</li>
        </ul>
        <p><strong>{en ? "Free trial account" : "Kostenloser Testaccount"}</strong></p>
        <p>{en ? <>The free trial account costs nothing. If you no longer want to use it, you can delete your account at any time at <a href="https://bloommd.app/account">https://bloommd.app/account</a>. What is deleted is described in the <a href={`/datenschutz?lang=${locale}`}>privacy policy</a>, section “Retention and deletion”.</> : <>Der kostenlose Testaccount verursacht keine Kosten. Wenn du ihn nicht mehr nutzen möchtest, kannst du dein Konto jederzeit unter <a href="https://bloommd.app/account">https://bloommd.app/account</a> löschen. Was dabei gelöscht wird, beschreibt die <a href={`/datenschutz?lang=${locale}`}>Datenschutzerklärung</a> im Abschnitt „Speicherdauer und Löschung“.</>}</p>
        <p>{en ? "If you joined the ended waitlist, you can withdraw your consent at any time through the unsubscribe link in the invitation email or in earlier waitlist messages, without an account or sign-in." : "Wenn du dich in die beendete Warteliste eingetragen hast, kannst du deine Einwilligung jederzeit über den Abmeldelink in der Einladungs-E-Mail oder in früheren Wartelisten-Nachrichten widerrufen, ohne Konto und ohne Anmeldung."}</p>
      </LegalSection>

      <LegalSection title={en ? "Digital content and software" : "Digitale Inhalte und Software"}>
        <p>{en ? "Local desktop, Obsidian and CLI use operates on the user's files. Users remain responsible for local backups. There is no recovery promise for cloud content; export your content regularly." : "Lokale Desktop-, Obsidian- und CLI-Nutzung arbeitet auf Dateien des Nutzers. Nutzer bleiben für lokale Backups verantwortlich. Für Cloud-Inhalte gibt es keine Wiederherstellungszusage; exportiere deine Inhalte regelmäßig."}</p>
      </LegalSection>

      <LegalSection title={en ? "Refunds" : "Rückzahlungen"}>
        <p>{en ? <>After a valid withdrawal we refund the payments received as described under “Consequences of withdrawal”. We initiate the refund manually through Stripe, based on your withdrawal notice sent to {legal.email}; refunds are not made automatically, neither after a withdrawal nor after a cancellation or the deletion of your account. A cancellation takes effect at the end of the current billing period and does not by itself lead to a refund for the remaining term.</> : <>Nach einem wirksamen Widerruf erstatten wir die erhaltenen Zahlungen, wie unter „Folgen des Widerrufs“ beschrieben. Wir veranlassen die Erstattung manuell über Stripe, auf Grundlage deiner Widerrufserklärung an {legal.email}; Erstattungen erfolgen nicht automatisch, weder nach einem Widerruf noch nach einer Kündigung oder der Löschung deines Kontos. Eine Kündigung wirkt zum Ende der laufenden Abrechnungsperiode und führt für sich genommen nicht zu einer Erstattung der Restlaufzeit.</>}</p>
      </LegalSection>

      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
