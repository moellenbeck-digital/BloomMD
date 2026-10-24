import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getAppLocale, type AppLocale } from "../../lib/locale";

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
        <p>{en ? "BloomMD processes account data such as email address, login and session data where required for registration, login and access to the closed beta." : "BloomMD verarbeitet Accountdaten wie E-Mail-Adresse, Login- und Sessiondaten, soweit diese für Registrierung, Login und Freischaltung der geschlossenen Beta erforderlich sind."}</p>
        <p>{en ? "Markdown files are processed locally by the local-first core. Data is transmitted to BloomMD only when an optional sync or cloud service is actively used." : "Markdown-Dateien werden im local-first Kern lokal verarbeitet. Eine Übertragung an BloomMD erfolgt nur, wenn ein optionaler Sync- oder Cloud-Dienst aktiv genutzt wird."}</p>
      </LegalSection>

      <LegalSection title={en ? "No payments in M1" : "Keine Zahlungen in M1"}>
        <p>{en ? "The closed M1 beta offers no paid plans, collects no payment data and provides no checkout. Payment providers become relevant only if BloomMD explicitly offers paid features later." : "In der geschlossenen M1-Beta werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und kein Checkout bereitgestellt. Zahlungsdienstleister werden erst relevant, wenn BloomMD später kostenpflichtige Funktionen ausdrücklich anbietet."}</p>
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

      <LegalSection title={en ? "Waitlist" : "Warteliste"}>
        <p>{en ? "Anyone joining the waitlist leaves an email address, the time of registration and the page from which they joined. The address is stored and used only after confirmation through a double-opt-in link; unconfirmed entries are not contacted. The legal basis is consent (Art. 6(1)(a) GDPR)." : <>
          Wer sich in die Warteliste einträgt, hinterlässt eine E-Mail-Adresse, den Zeitpunkt und die Seite, von der die Eintragung kam.
          Die Adresse wird erst gespeichert und genutzt, wenn sie über einen Bestätigungslink bestätigt wurde (Double-Opt-in);
          unbestätigte Einträge werden nicht angeschrieben. Rechtsgrundlage ist die Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).
        </>}</p>
        <p>{en ? "The address is used only to notify people about an available beta place — no newsletter and no advertising. Consent can be withdrawn at any time through the unsubscribe link in each message, without an account or sign-in. After unsubscribing, only a suppression record remains so the address is not contacted accidentally. Entries are deleted no later than the end of the closed beta." : <>
          Die Adresse wird ausschließlich verwendet, um über einen freien Beta-Platz zu informieren — kein Newsletter, keine Werbung.
          Die Einwilligung kann jederzeit über den Abmeldelink in jeder Nachricht widerrufen werden, ohne Konto und ohne Anmeldung.
          Nach der Abmeldung bleibt lediglich ein Vermerk bestehen, damit die Adresse nicht versehentlich erneut angeschrieben wird.
          Spätestens mit dem Ende der geschlossenen Beta werden die Einträge gelöscht.
        </>}</p>
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
