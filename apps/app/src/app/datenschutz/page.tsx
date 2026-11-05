import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getAppLocale, type AppLocale } from "../../lib/locale";

/**
 * Days after the one-time invitation mail until all waitlist entries are deleted. Must equal
 * WAITLIST_PURGE_RETENTION_DAYS in apps/marketing (the app cannot import from the marketing app);
 * scripts/qa/waitlist-retention-consistency.test.ts keeps both in step.
 */
const WAITLIST_PURGE_RETENTION_DAYS = 90;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getAppLocale((await searchParams).lang) === "en" ? "Privacy Policy" : "Datenschutzerklärung"} | BloomMD`, robots: { index: true, follow: true } };
}

export const dynamic = "force-dynamic";

export default async function DatenschutzPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: AppLocale = getAppLocale((await searchParams).lang);
  const en = locale === "en";

  return (
    <LegalPage title={en ? "Privacy Policy" : "Datenschutzerklärung"} eyebrow={en ? "Privacy" : "Datenschutz"} locale={locale}>
      <LegalSection title={en ? "Controller" : "Verantwortlicher"}>
        <p>{legal.businessName}</p>
        <p>
          {legal.street}
          <br />
          {legal.postalCity}
          <br />
          {legal.country}
        </p>
        <p>E-Mail: {legal.email}</p>
      </LegalSection>

      <LegalSection title={en ? "What data does BloomMD process?" : "Welche Daten verarbeitet BloomMD?"}>
        <p>{en ? "BloomMD processes account data such as email address, login and session data where required for registration, login and the free trial account." : "BloomMD verarbeitet Accountdaten wie E-Mail-Adresse, Login- und Sessiondaten, soweit diese für Registrierung, Login und den kostenlosen Testaccount erforderlich sind."}</p>
        <p>{en ? "Markdown files are processed locally by the local-first core. Data is transmitted to BloomMD only when an optional sync or cloud service is actively used." : "Markdown-Dateien werden im local-first Kern lokal verarbeitet. Eine Übertragung an BloomMD erfolgt nur, wenn ein optionaler Sync- oder Cloud-Dienst aktiv genutzt wird."}</p>
      </LegalSection>

      <LegalSection title={en ? "No payments" : "Keine Zahlungen"}>
        <p>{en ? "The free trial account offers no paid plans, collects no payment data and provides no checkout. Payment providers become relevant only if BloomMD explicitly offers paid features later." : "Beim kostenlosen Testaccount werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und kein Checkout bereitgestellt. Zahlungsdienstleister werden erst relevant, wenn BloomMD später kostenpflichtige Funktionen ausdrücklich anbietet."}</p>
      </LegalSection>

      <LegalSection title={en ? "Transactional email with Resend" : "Transaktions-E-Mails mit Resend"}>
        <p>{en ? "BloomMD may use Resend for account email such as email verification, password resets and important product notices. Content from Markdown files is not sent to Resend as email content." : "BloomMD kann Resend für Account-E-Mails wie E-Mail-Verifikation, Passwort-Reset und wichtige produktbezogene Hinweise nutzen. Inhalte aus Markdown-Dateien werden nicht als E-Mail-Inhalt an Resend übertragen."}</p>
      </LegalSection>

      <LegalSection title={en ? "Error monitoring and product analytics" : "Fehlerüberwachung und Produktanalyse"}>
        <p>{en ? "Sentry may be used for error monitoring. PostHog is disabled by default and is loaded only when the deployment provides NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST and the browser analytics consent has been granted. PostHog autocapture, session recording and pageleave capture are disabled. Only page paths and allowlisted events are collected. Markdown content, file names, node titles, search terms, complete URLs and document paths are not sent as analytics events." : <>Für die Fehlerüberwachung kann Sentry eingesetzt werden. PostHog ist standardmäßig
          deaktiviert und wird nur geladen, wenn im Deployment `NEXT_PUBLIC_POSTHOG_KEY` und
          `NEXT_PUBLIC_POSTHOG_HOST` gesetzt sind und die Analyse-Einwilligung im Browser akzeptiert
          wurde. PostHog-Autocapture, Session Recording und Pageleave-Capture sind deaktiviert.
          Erfasst werden nur Seitenpfade und allowlist-basierte Ereignisse. Markdown-Inhalte,
          Dateinamen, Node-Titel, Suchtexte, vollständige URLs und Dokumentpfade werden nicht als
          Analytics-Events übertragen.
        </>}</p>
      </LegalSection>

      <LegalSection title={en ? "Optional sync" : "Optionaler Sync"}>
        <p>{en ? "Realtime sync is initially optional and may be operated as a beta feature. Without sync enabled, Markdown files remain local. With sync enabled, the document structures required for collaboration are transmitted through the sync service." : "Realtime-Sync ist zunächst optional und kann als Beta betrieben werden. Ohne aktivierten Sync bleiben Markdown-Dateien lokal beim Nutzer. Bei aktiviertem Sync werden die zur Zusammenarbeit erforderlichen Dokumentstrukturen über den Sync-Dienst übertragen."}</p>
      </LegalSection>

      <LegalSection title={en ? "Cookies and sessions" : "Cookies und Sessions"}>
        <p>{en ? "BloomMD uses technically necessary session cookies to recognise signed-in users and provide protected areas." : "BloomMD setzt technisch notwendige Session-Cookies ein, damit angemeldete Nutzer erkannt werden und geschützte Bereiche genutzt werden können."}</p>
        <p>{en ? <>Optional analytics consent is stored in the browser under `bloommd:analytics-consent:v1`.</> : <>Die optionale Analyse-Einwilligung wird im Browser unter `bloommd:analytics-consent:v1` gespeichert.</>}</p>
      </LegalSection>

      <LegalSection title={en ? "Reminder emails during the trial period" : "Hinweis-E-Mails zum Testzeitraum"}>
        <p>{en ? "The free trial account is valid for 30 days from email confirmation. Before it ends, we send you a reminder email after 15 days and another after 23 days. Purpose: to remind you that the trial period is ending. After it ends, your account is read-only and export remains possible." : "Der kostenlose Testaccount gilt 30 Tage ab E-Mail-Bestätigung. Vor Ablauf senden wir dir eine Hinweis-E-Mail nach 15 Tagen und eine weitere nach 23 Tagen. Zweck: Erinnerung an das Ende des Testzeitraums. Nach Ablauf ist dein Konto nur noch lesbar, der Export bleibt möglich."}</p>
        <p>{en ? "Processed data: your email address, the time of your email confirmation, from which the sending times follow, the language of your signup (for the language of the email) and the time each reminder was sent (so that each one is sent only once). For existing accounts, the trial period ends on December 15, 2026 (counted from November 15, 2026); the reminders are then sent on November 30, 2026 and December 8, 2026. The emails are sent through our email provider (see transactional email). Legal basis: Art. 6(1)(b) GDPR, performance of the user relationship for the account." : "Verarbeitete Daten: deine E-Mail-Adresse, der Zeitpunkt deiner E-Mail-Bestätigung, aus dem sich die Versandzeitpunkte ergeben, die Sprache deiner Registrierung (für die Sprache der E-Mail) und der Versandzeitpunkt jedes Hinweises (damit jeder nur einmal kommt). Bei bestehenden Konten endet der Testzeitraum am 15.12.2026 (Zählung ab dem 15.11.2026); die Hinweise gehen dann am 30.11.2026 und am 08.12.2026 raus. Der Versand erfolgt über unseren E-Mail-Dienstleister (siehe Transaktions-E-Mails). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Durchführung des Nutzungsverhältnisses zum Account)."}</p>
      </LegalSection>

      <LegalSection title={en ? "Abuse protection for the trial account" : "Missbrauchsschutz Testaccount"}>
        <p>{en ? "So that one person cannot obtain several free trial periods with different spellings of the same mailbox, BloomMD derives a canonical form from your email address and compares it with other accounts. In it, upper case is lowercased, a +tag in the part before the @ is removed (for example name+shop@example.com becomes name@example.com), and for Gmail addresses (gmail.com, googlemail.com) the dots in that part are removed and googlemail.com is read as gmail.com. If another account with the same canonical form has already confirmed its address, no new account is created or, at confirmation, the new account receives no trial period and is not confirmed; nobody is excluded permanently by this, and you can keep using the existing account." : "Damit eine Person mit verschiedenen Schreibweisen desselben Postfachs nicht mehrere kostenlose Testzeiträume erhält, leitet BloomMD aus deiner E-Mail-Adresse eine kanonische Form ab und vergleicht sie mit anderen Konten. Dabei werden Großbuchstaben in Kleinbuchstaben umgewandelt, ein +Zusatz im Teil vor dem @ entfernt (zum Beispiel wird name+shop@example.com zu name@example.com) und bei Gmail-Adressen (gmail.com, googlemail.com) zusätzlich die Punkte in diesem Teil entfernt und googlemail.com als gmail.com gelesen. Hat ein anderes Konto mit derselben kanonischen Form seine Adresse bereits bestätigt, wird kein neues Konto angelegt oder, bei der Bestätigung, erhält das neue Konto keinen Testzeitraum und wird nicht bestätigt; niemand wird dadurch dauerhaft ausgeschlossen, du kannst das bestehende Konto weiter nutzen."}</p>
        <p>{en ? "Processed data: the canonical form of your email address. Purpose: protection against abuse of the free trial account. Legal basis: Art. 6(1)(f) GDPR (legitimate interest in preventing multiple trial periods for one person). The canonical form is stored only in your account, next to your email address, and is deleted together with the account. For signups, a counter limits attempts per canonical address; it is stored only as a hash and deleted as described under “Retention and deletion”. No further data sources are used." : "Verarbeitete Daten: die kanonische Form deiner E-Mail-Adresse. Zweck: Schutz vor Missbrauch des kostenlosen Testaccounts. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Verhinderung mehrfacher Testzeiträume für eine Person). Die kanonische Form wird nur in deinem Konto neben deiner E-Mail-Adresse gespeichert und mit dem Konto gelöscht. Bei der Registrierung begrenzt ein Zähler die Versuche je kanonischer Adresse; er wird nur als Hash gespeichert und wie unter „Speicherdauer und Löschung“ beschrieben gelöscht. Weitere Datenquellen werden nicht verwendet."}</p>
      </LegalSection>

      <LegalSection title={en ? "Waitlist (ended)" : "Warteliste (beendet)"}>
        <p>{en ? `The waitlist has ended; nobody can join it any more. Anyone who joined earlier and confirmed the address receives a single email inviting them to register. Stored are the email address, the time of the entry, the source page and the status (confirmed, unsubscribed). The legal basis is the consent given when joining (Art. 6(1)(a) GDPR). Unconfirmed entries are not contacted.` : <>
          Die Warteliste ist beendet; neue Einträge sind nicht mehr möglich. Wer sich früher eingetragen und die Adresse bestätigt hat,
          bekommt einmalig eine E-Mail mit der Einladung, sich zu registrieren. Gespeichert sind E-Mail-Adresse, Zeitpunkt der Eintragung,
          Herkunftsseite und der Status (bestätigt, abgemeldet). Rechtsgrundlage ist die Einwilligung bei der Eintragung
          (Art. 6 Abs. 1 lit. a DSGVO). Unbestätigte Einträge werden nicht angeschrieben.
        </>}</p>
        <p>{en ? `All waitlist entries are deleted ${WAITLIST_PURGE_RETENTION_DAYS} days after that invitation email. Unsubscribing remains possible through the link in the invitation email and in earlier waitlist messages, without an account or sign-in; this withdraws consent at any time. After unsubscribing, the address is not contacted again and is removed with all other entries. For confirmed entries we also prepare an account that is not active yet, under the same address; the invitation email carries the link to activate it. Nobody can sign in before the person confirms the address, chooses a password and agrees to the privacy policy and the terms through that link. An account that is not activated is deleted ${WAITLIST_PURGE_RETENTION_DAYS} days after that email.` : <>
          Alle Wartelisten-Einträge werden {WAITLIST_PURGE_RETENTION_DAYS} Tage nach dieser Einladungs-E-Mail gelöscht. Die Abmeldung bleibt weiter möglich — über den Link
          in der Einladung und in früheren Wartelisten-Nachrichten, ohne Konto und ohne Anmeldung; damit kann die Einwilligung jederzeit widerrufen
          werden. Nach der Abmeldung wird die Adresse nicht mehr angeschrieben und mit allen übrigen Einträgen gelöscht. Für bestätigte Einträge
          bereiten wir zusätzlich einen noch nicht aktiven Account mit derselben Adresse vor; die Einladungs-E-Mail enthält den Link, ihn zu aktivieren.
          Vor der Bestätigung der Adresse, der Wahl eines Passworts und der Zustimmung zu Datenschutzerklärung und AGB über diesen Link kann sich
          niemand anmelden. Ein nicht aktivierter Account wird {WAITLIST_PURGE_RETENTION_DAYS} Tage nach dieser E-Mail gelöscht.
        </>}</p>
      </LegalSection>

      <LegalSection title={en ? "Recipients and processors" : "Empfänger und Auftragsverarbeiter"}>
        <p>{en ? "These service providers receive data from BloomMD for the purposes named here:" : "Diese Dienstleister erhalten Daten von BloomMD für die hier genannten Zwecke:"}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{en ? "Email delivery (Resend): for account emails such as email confirmation, password reset and the reminder emails of the trial period, Resend receives the recipient address and the subject and content of the email. Content of your Markdown files is not part of these emails." : "E-Mail-Versand (Resend): Für Konto-E-Mails wie E-Mail-Bestätigung, Passwort-Zurücksetzen und die Hinweis-E-Mails zum Testzeitraum erhält Resend die Empfängeradresse sowie Betreff und Inhalt der E-Mail. Inhalte deiner Markdown-Dateien sind nicht Teil dieser E-Mails."}</li>
          <li>{en ? "Error monitoring (Sentry): if error monitoring is set up in the deployment, Sentry receives technical error reports. BloomMD does not send personal default data (sendDefaultPii is off) and cleans the events before they are sent." : "Fehlerüberwachung (Sentry): Ist die Fehlerüberwachung im Deployment eingerichtet, erhält Sentry technische Fehlermeldungen. BloomMD überträgt dabei keine personenbezogenen Standarddaten (sendDefaultPii ist aus) und bereinigt die Ereignisse vor dem Versand."}</li>
          <li>{en ? "Web analytics (Plausible, PostHog): Plausible runs on our own infrastructure and is reached through our own domain (bloommd.app, path /_plausible), so your browser contacts no third-party host. It is used only on bloommd.app, without cookies or persistent identifiers. Only page views (as a route pattern, without ids, parameters or fragment) and a fixed list of usage events are counted; your IP address is used only to determine country and device. Installations run by others do not send browser statistics to us. PostHog is optional and only loaded after consent. What is collected is described under “Error monitoring and product analytics”." : "Reichweitenmessung (Plausible, PostHog): Plausible läuft auf unserer eigenen Infrastruktur und wird über unsere eigene Domain (bloommd.app, Pfad /_plausible) angesprochen, dein Browser kontaktiert also keinen fremden Host. Es wird nur auf bloommd.app eingesetzt, ohne Cookies und persistente Identifikatoren. Gezählt werden nur Seitenaufrufe (als Routenmuster, ohne Kennungen, Parameter und Fragment) und eine feste Liste von Nutzungsereignissen; deine IP-Adresse dient nur der Bestimmung von Land und Gerät. Installationen anderer Betreiber senden keine Browser-Statistik an uns. PostHog ist optional und wird nur nach Einwilligung geladen. Was erfasst wird, steht unter „Fehlerüberwachung und Produktanalyse“."}</li>
          <li>{en ? "Feedback (GitHub, object storage): if the feedback function is set up, a ticket is created at GitHub from your feedback. It contains your message, your email address and account ID, a contact address if you gave one, the page you were on, and browser and version details. Attachments (screenshot, video) are stored in an object storage and linked from the ticket." : "Feedback (GitHub, Objektspeicher): Ist die Feedback-Funktion eingerichtet, wird aus deinem Feedback ein Ticket bei GitHub angelegt. Es enthält deine Nachricht, deine E-Mail-Adresse und Konto-ID, eine Kontaktadresse, falls du eine angegeben hast, die aufgerufene Seite sowie Browser- und Versionsangaben. Anhänge (Screenshot, Video) werden in einem Objektspeicher abgelegt und im Ticket verlinkt."}</li>
          <li>{en ? "Members of your workspaces and everyone who knows a share link you created see the content you share there (see “Share links (read-only)”)." : "Mitglieder deiner Workspaces und alle, die einen von dir erzeugten Share-Link kennen, sehen die Inhalte, die du dort teilst (siehe „Share-Links (nur lesen)“)."}</li>
        </ul>
        <p>{en ? "Payment service providers become relevant only if BloomMD offers paid features (see “No payments”)." : "Zahlungsdienstleister werden erst relevant, wenn BloomMD kostenpflichtige Funktionen anbietet (siehe „Keine Zahlungen“)."}</p>
      </LegalSection>

      <LegalSection title={en ? "Retention and deletion" : "Speicherdauer und Löschung"}>
        <p>{en ? "BloomMD deletes the following data after these periods:" : "BloomMD löscht die folgenden Daten nach diesen Fristen:"}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{en ? "Accounts whose email address was never confirmed: 7 days after registration, together with their one-time tokens." : "Konten, deren E-Mail-Adresse nie bestätigt wurde: 7 Tage nach der Registrierung, samt ihrer Einmal-Tokens."}</li>
          <li>{en ? "One-time tokens (email confirmation, password reset, activation of a prepared waitlist account): 7 days after they expire or are used." : "Einmal-Tokens (E-Mail-Bestätigung, Passwort-Zurücksetzen, Aktivierung eines vorbereiteten Wartelisten-Kontos): 7 Tage nach Ablauf oder Verwendung."}</li>
          <li>{en ? "Sessions (sign-in in the browser): 7 days after they expire or are revoked." : "Sitzungen (Anmeldung im Browser): 7 Tage nach Ablauf oder Widerruf."}</li>
          <li>{en ? "Access tokens (for example for the mobile app): 30 days after they expire or are revoked." : "Zugriffstoken (zum Beispiel für die Mobile-App): 30 Tage nach Ablauf oder Widerruf."}</li>
          <li>{en ? "Deleted documents: permanently removed 30 days after deletion." : "Gelöschte Dokumente: 30 Tage nach dem Löschen endgültig entfernt."}</li>
          <li>{en ? "Security log (audit events with time, type, outcome and affected object, linked to the account that triggered the action): 365 days after the event." : "Sicherheitsprotokoll (Audit-Ereignisse mit Zeitpunkt, Art, Ergebnis und betroffenem Objekt, verknüpft mit dem Konto, das die Aktion ausgelöst hat): 365 Tage nach dem Ereignis."}</li>
          <li>{en ? "Counters that limit requests (stored only as a hash): 7 days after their last update." : "Zähler zur Begrenzung von Anfragen (nur als Hash gespeichert): 7 Tage nach der letzten Aktualisierung."}</li>
          <li>{en ? <>Accounts prepared from the waitlist that were never activated, and waitlist entries: {WAITLIST_PURGE_RETENTION_DAYS} days after the invitation email (see “Waitlist (ended)”).</> : <>Nicht aktivierte, aus der Warteliste vorbereitete Konten und Wartelisten-Einträge: {WAITLIST_PURGE_RETENTION_DAYS} Tage nach der Einladungs-E-Mail (siehe „Warteliste (beendet)“).</>}</li>
        </ul>
        <p>{en ? "An expired trial account is currently not deleted automatically. It is read-only and export remains possible. The account and its content stay stored until you delete the account." : "Ein abgelaufener Testaccount wird derzeit nicht automatisch gelöscht. Er ist nur noch lesbar, der Export bleibt möglich. Konto und Inhalte bleiben gespeichert, bis du das Konto löschst."}</p>
        <p>{en ? <>You can delete your account at any time at <a href="https://bloommd.app/account">https://bloommd.app/account</a> (confirmation with your email address and password), also after the trial period has ended. Deleting removes at once: your account with email address and display name, your sessions, one-time tokens and access tokens, your permissions and workspace memberships, your saved views, the records of the reminder emails sent to you, your personal workspace with all its documents and share links, and the workspace agents and agent tasks you created and the workspace invitations you sent. For team workspaces you own: without other members, the workspace is deleted with all its documents. With other members, one of them becomes the owner (preferably an owner, otherwise an editor, otherwise the longest-standing member) and the workspace with its documents stays available to them. Documents you created in workspaces that remain stay there; your name is removed as their author.</> : <>Du kannst dein Konto jederzeit unter <a href="https://bloommd.app/account">https://bloommd.app/account</a> löschen (Bestätigung mit E-Mail-Adresse und Passwort), auch nach Ablauf des Testzeitraums. Beim Löschen werden sofort entfernt: dein Konto mit E-Mail-Adresse und Anzeigename, deine Sitzungen, Einmal-Tokens und Zugriffstoken, deine Berechtigungen und Workspace-Mitgliedschaften, deine gespeicherten Ansichten, die Protokolle der an dich gesendeten Hinweis-E-Mails, dein persönlicher Workspace mit allen Dokumenten und Share-Links sowie die von dir angelegten Workspace-Agenten und Agenten-Aufträge und die von dir verschickten Workspace-Einladungen. Für Team-Workspaces, die du besitzt, gilt: Ohne weitere Mitglieder wird der Workspace mit allen Dokumenten gelöscht. Mit weiteren Mitgliedern wird eines davon Eigentümer (bevorzugt ein Eigentümer, sonst ein Bearbeiter, sonst das am längsten beigetretene Mitglied), und der Workspace mit seinen Dokumenten bleibt für sie bestehen. Dokumente, die du in bestehen bleibenden Workspaces angelegt hast, bleiben dort; dein Name wird als Autor entfernt.</>}</p>
        <p>{en ? "Not removed when you delete your account: security log entries (they lose the link to your account and are deleted 365 days after the event); payment records, if any exist (their raw data is redacted and the link to your account is removed; running subscriptions are cancelled beforehand); messages sent through the feedback function (they lose the link to your account, the email address you entered stays in the entry); and an earlier waitlist entry, which is deleted as described under “Waitlist (ended)”." : "Beim Löschen des Kontos nicht entfernt werden: Einträge des Sicherheitsprotokolls (sie verlieren den Bezug zu deinem Konto und werden 365 Tage nach dem Ereignis gelöscht); Zahlungsdatensätze, falls solche existieren (ihre Rohdaten werden geschwärzt und der Bezug zu deinem Konto entfällt; laufende Abonnements werden vorher gekündigt); Nachrichten, die über die Feedback-Funktion gesendet wurden (sie verlieren den Bezug zu deinem Konto, die angegebene E-Mail-Adresse bleibt im Eintrag); sowie ein früherer Wartelisten-Eintrag, der wie unter „Warteliste (beendet)“ beschrieben gelöscht wird."}</p>
      </LegalSection>

      <LegalSection title={en ? "Legal bases" : "Rechtsgrundlagen"}>
        <p>{en ? "Processing is based in particular on contract performance, pre-contractual measures, legal obligations and legitimate interests in operating the application securely." : <>
          Die Verarbeitung erfolgt insbesondere zur Vertragserfüllung, zur Durchführung vorvertraglicher Maßnahmen, zur Erfüllung rechtlicher
          Pflichten und auf Grundlage berechtigter Interessen am sicheren Betrieb der Anwendung.
        </>}</p>
      </LegalSection>

      <LegalSection title={en ? "Data subject rights" : "Betroffenenrechte"}>
        <p>{en ? "Users may request access, rectification, erasure, restriction of processing, data portability and objection where the statutory requirements are met." : <>
          Nutzer können Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch verlangen,
          soweit die gesetzlichen Voraussetzungen erfüllt sind.
        </>}</p>
      </LegalSection>

      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
