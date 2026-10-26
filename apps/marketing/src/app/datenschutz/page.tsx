import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { getLegalProfile, LEGAL_STATUS } from "../../lib/legal";
import { getMarketingLocale, type MarketingLocale } from "../../lib/locale";
import { marketingMetadata } from "../../lib/metadata";
import { WAITLIST_PURGE_RETENTION_DAYS } from "../../lib/waitlist-retention";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: `${locale === "en" ? "Privacy policy" : "Datenschutzerklärung"} | BloomMD`,
    description: locale === "en" ? "BloomMD privacy policy." : "Datenschutzerklärung von BloomMD.",
    path: locale === "en" ? "/datenschutz?lang=en" : "/datenschutz",
    locale,
    robots: { index: true, follow: true },
  });
}

export const dynamic = "force-dynamic";

export default async function DatenschutzPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const legal = getLegalProfile();
  const locale: MarketingLocale = getMarketingLocale((await searchParams).lang);
  const en = locale === "en";

  return (
    <LegalPage title={en ? "Privacy policy" : "Datenschutzerklärung"} eyebrow={en ? "Privacy" : "Datenschutz"} locale={locale} path="/datenschutz">
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
        <p>{en ? "BloomMD processes account data such as email address, login and session data where required for registration, login and closed-beta access." : "BloomMD verarbeitet Accountdaten wie E-Mail-Adresse, Login- und Sessiondaten, soweit diese für Registrierung, Login und Freischaltung der geschlossenen Beta erforderlich sind."}</p>
        <p>{en ? "Markdown files are processed locally by the local-first core. Data is transmitted to BloomMD only when an optional sync or cloud service is actively used." : "Markdown-Dateien werden im local-first Kern lokal verarbeitet. Eine Übertragung an BloomMD erfolgt nur, wenn ein optionaler Sync- oder Cloud-Dienst aktiv genutzt wird."}</p>
      </LegalSection>

      <LegalSection title={en ? "No payments in M1" : "Keine Zahlungen in M1"}>
        <p>{en ? "The closed M1 beta offers no paid plans, collects no payment data and provides no checkout. Payment providers become relevant only if BloomMD explicitly offers paid features later." : "In der geschlossenen M1-Beta werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und kein Checkout bereitgestellt. Zahlungsdienstleister werden erst relevant, wenn BloomMD später kostenpflichtige Funktionen ausdrücklich anbietet."}</p>
      </LegalSection>

      <LegalSection title={en ? "Transactional email with Resend" : "Transaktions-E-Mails mit Resend"}>
        <p>{en ? "BloomMD may use Resend for account email such as email verification, password resets and important product notices. Markdown content is not sent to Resend as email content." : "BloomMD kann Resend für Account-E-Mails wie E-Mail-Verifikation, Passwort-Reset und wichtige produktbezogene Hinweise nutzen. Inhalte aus Markdown-Dateien werden nicht als E-Mail-Inhalt an Resend übertragen."}</p>
      </LegalSection>

      <LegalSection title={en ? "Error monitoring and product analytics" : "Fehlerüberwachung und Produktanalyse"}>
        <p>{en ? "Sentry may be used for error monitoring. Plausible loads when the direct configuration is present; it is configured without cookies or persistent identifiers. The optional PostHog integration is consent-gated separately. Autocapture, session recording and pageleave capture are disabled. Only page paths and allowlisted events are collected; Markdown content, file names, node titles, search terms, complete URLs and document paths are excluded." : <>Für die Fehlerüberwachung kann Sentry eingesetzt werden. Plausible wird geladen, wenn die
          Direktkonfiguration im Deployment gesetzt ist; es ist ohne Cookies und persistente
          Identifikatoren konfiguriert. Die optionale PostHog-Integration folgt einer separaten
          Einwilligungsregel.
          Autocapture, Session Recording und Pageleave-Capture sind deaktiviert. Erfasst werden nur
          Seitenpfade und allowlist-basierte Ereignisse. Markdown-Inhalte, Dateinamen, Node-Titel,
          Suchtexte, vollständige URLs und Dokumentpfade werden nicht als Analytics-Events übertragen.
        </>}</p>
      </LegalSection>

      <LegalSection title={en ? "Optional sync" : "Optionaler Sync"}>
        <p>{en ? "Realtime sync is initially optional and may be operated as a beta feature. Without sync enabled, Markdown files remain local. With sync enabled, the document structures required for collaboration are transmitted through the sync service." : "Realtime-Sync ist zunächst optional und kann als Beta betrieben werden. Ohne aktivierten Sync bleiben Markdown-Dateien lokal beim Nutzer. Bei aktiviertem Sync werden die zur Zusammenarbeit erforderlichen Dokumentstrukturen über den Sync-Dienst übertragen."}</p>
      </LegalSection>

      <LegalSection title={en ? "Cookies and sessions" : "Cookies und Sessions"}>
        <p>{en ? "BloomMD uses technically necessary session cookies so signed-in users can be recognised and protected areas can work." : "BloomMD setzt technisch notwendige Session-Cookies ein, damit angemeldete Nutzer erkannt werden und geschützte Bereiche genutzt werden können."}</p>
        <p>{en ? <>Only if a consent-required analytics service is enabled, the marketing app stores that choice in the browser under `bloommd:analytics-consent:v1`. Plausible itself does not require this choice because it is configured without cookies or persistent identifiers.</> : <>Nur wenn ein zustimmungspflichtiger Analysedienst aktiviert ist, speichert die Marketing-App die Auswahl im Browser unter `bloommd:analytics-consent:v1`. Plausible selbst benötigt diese Auswahl nicht, weil es ohne Cookies und persistente Identifikatoren konfiguriert ist.</>}</p>
      </LegalSection>

      <LegalSection title={en ? "Waitlist (ended)" : "Warteliste (beendet)"}>
        <p>{en ? `The waitlist has ended; nobody can join it any more. Anyone who joined earlier and confirmed the address receives a single email inviting them to register. Stored are the email address, the time of the entry, the source page and the status (confirmed, unsubscribed). The legal basis is the consent given when joining (Art. 6(1)(a) GDPR). Unconfirmed entries are not contacted.` : <>
          Die Warteliste ist beendet; neue Einträge sind nicht mehr möglich. Wer sich früher eingetragen und die Adresse bestätigt hat,
          bekommt einmalig eine E-Mail mit der Einladung, sich zu registrieren. Gespeichert sind E-Mail-Adresse, Zeitpunkt der Eintragung,
          Herkunftsseite und der Status (bestätigt, abgemeldet). Rechtsgrundlage ist die Einwilligung bei der Eintragung
          (Art. 6 Abs. 1 lit. a DSGVO). Unbestätigte Einträge werden nicht angeschrieben.
        </>}</p>
        <p>{en ? `All waitlist entries are deleted ${WAITLIST_PURGE_RETENTION_DAYS} days after that invitation email. Unsubscribing remains possible through the link in the invitation email and in earlier waitlist messages, without an account or sign-in; this withdraws consent at any time. After unsubscribing, the address is not contacted again and is removed with all other entries.` : <>
          Alle Wartelisten-Einträge werden {WAITLIST_PURGE_RETENTION_DAYS} Tage nach dieser Einladungs-E-Mail gelöscht. Die Abmeldung bleibt weiter möglich — über den Link
          in der Einladung und in früheren Wartelisten-Nachrichten, ohne Konto und ohne Anmeldung; damit kann die Einwilligung jederzeit widerrufen
          werden. Nach der Abmeldung wird die Adresse nicht mehr angeschrieben und mit allen übrigen Einträgen gelöscht.
        </>}</p>
      </LegalSection>

      <LegalSection title={en ? "Legal bases" : "Rechtsgrundlagen"}>
        <p>{en ? "Processing is based in particular on contract performance, pre-contractual measures, legal obligations and legitimate interests in secure operation." : <>
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
