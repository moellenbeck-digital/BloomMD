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
        <p>{en ? "BloomMD processes account data such as email address, login and session data where required for registration, login and the free trial account." : "BloomMD verarbeitet Accountdaten wie E-Mail-Adresse, Login- und Sessiondaten, soweit diese für Registrierung, Login und den kostenlosen Testaccount erforderlich sind."}</p>
        <p>{en ? "Markdown files are processed locally by the local-first core. Data is transmitted to BloomMD only when an optional sync or cloud service is actively used." : "Markdown-Dateien werden im local-first Kern lokal verarbeitet. Eine Übertragung an BloomMD erfolgt nur, wenn ein optionaler Sync- oder Cloud-Dienst aktiv genutzt wird."}</p>
      </LegalSection>

      <LegalSection title={en ? "No payments in M1" : "Keine Zahlungen in M1"}>
        <p>{en ? "The free trial account in M1 offers no paid plans, collects no payment data and provides no checkout. Payment providers become relevant only if BloomMD explicitly offers paid features later." : "Beim kostenlosen Testaccount in M1 werden keine kostenpflichtigen Pläne angeboten, keine Zahlungsdaten erhoben und kein Checkout bereitgestellt. Zahlungsdienstleister werden erst relevant, wenn BloomMD später kostenpflichtige Funktionen ausdrücklich anbietet."}</p>
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

      <LegalSection title={en ? "BloomMD app for iPad, iPhone, Mac and Android" : "BloomMD-App für iPad, iPhone, Mac und Android"}>
        {en ? (
          <>
            <p><strong>Local files.</strong> The app edits Markdown files and drawings (SVG) either in its own folder on the device or in a folder you pick (iOS: Files app, Android: folder picker), such as your Obsidian vault in iCloud Drive. These files are not transmitted to us. Whether and where a folder is synced (e.g. iCloud Drive) is decided by the respective storage provider, whose privacy policy applies – for iCloud, Apple's. To reopen the chosen folder after a restart, the app stores a reference to it on the device. On Android, the operating system's backup may save the app's own folder with your notes to your Google account; the sign-in token is excluded from it.</p>
            <p><strong>No analytics, no tracking.</strong> The app contains no analytics, advertising or crash-reporting services and does not track you across apps and websites owned by other companies.</p>
            <p><strong>Optional sign-in with a BloomMD account.</strong> Only when you actively sign in with your BloomMD account does the app transmit data to our servers: the content of the maps you open and edit in your cloud workspaces and the data needed to sign in (email address, display name, access token and a device name such as "iPad" so you can recognise and revoke the access in your account). Signing in happens in the browser on our website; you never enter your password in the app. While editing together, other members of the workspace see your name and which node you have selected. Data is transmitted encrypted. The legal basis is performance of a contract (Art. 6(1)(b) GDPR). The access token is stored encrypted in the keychain (iOS) or the Android Keystore and is valid for one year; signing out revokes it on the server and deletes it on the device. If you sign in to a self-hosted BloomMD server, its operator is responsible. Content is kept until you delete it or your account; you can delete your account at https://bloommd.app/account (also reachable in the app under "Manage or delete account").</p>
            <p><strong>Content from the internet.</strong> If a note contains an image or a preview from another website, the app loads it directly from there. The provider of that website receives your IP address.</p>
            <p><strong>Sharing.</strong> The share sheet hands a map as Markdown, OPML, PDF, PNG or SVG to an app of your choice; what happens there is governed by that app.</p>
            <p><strong>Links into the app.</strong> Links like <code>bloommd://open</code> open a note in the folder that is already open. For links like <code>https://bloommd.io/open</code>, the system opens the app if it is installed; otherwise your browser loads a page of our website with the download and the web app, without any content of the note. The app itself transmits no data when opening a link.</p>
          </>
        ) : (
          <>
            <p><strong>Lokale Dateien.</strong> Die App bearbeitet Markdown-Dateien und Zeichnungen (SVG) entweder in ihrem eigenen Ordner auf dem Gerät oder in einem Ordner, den du auswählst (iOS: Dateien-App, Android: Ordnerauswahl), etwa deinem Obsidian-Vault in iCloud Drive. Diese Dateien werden nicht an uns übertragen. Ob und wohin ein Ordner synchronisiert wird (z. B. iCloud Drive), bestimmt der jeweilige Speicheranbieter; dafür gelten dessen Datenschutzbestimmungen, bei iCloud die von Apple. Damit der gewählte Ordner nach einem Neustart wieder geöffnet werden kann, speichert die App einen Verweis darauf auf dem Gerät. Auf Android kann die Datensicherung des Betriebssystems den App-eigenen Ordner mit deinen Notizen in dein Google-Konto sichern; das Zugangs-Token ist davon ausgenommen.</p>
            <p><strong>Keine Analyse, kein Tracking.</strong> Die App enthält keine Analyse-, Werbe- oder Absturzbericht-Dienste und verfolgt dich nicht über Apps und Websites anderer Anbieter hinweg.</p>
            <p><strong>Optionale Anmeldung mit einem BloomMD-Konto.</strong> Nur wenn du dich aktiv mit deinem BloomMD-Konto anmeldest, überträgt die App Daten an unsere Server: die Inhalte der Maps, die du in deinen Cloud-Workspaces öffnest und bearbeitest, sowie die zur Anmeldung nötigen Daten (E-Mail-Adresse, Anzeigename, Zugangs-Token und eine Gerätebezeichnung wie „iPad“, damit du den Zugang in deinem Konto erkennen und widerrufen kannst). Die Anmeldung selbst findet im Browser auf unserer Website statt; dein Passwort gibst du nicht in der App ein. Während der gemeinsamen Bearbeitung sehen andere Mitglieder des Workspaces deinen Namen und welchen Knoten du gerade ausgewählt hast. Die Übertragung erfolgt verschlüsselt. Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Das Zugangs-Token liegt verschlüsselt im Schlüsselbund (iOS) bzw. im Android Keystore und gilt ein Jahr; beim Abmelden wird es auf dem Server widerrufen und auf dem Gerät gelöscht. Meldest du dich bei einem selbst gehosteten BloomMD-Server an, ist dessen Betreiber verantwortlich. Inhalte bleiben gespeichert, bis du sie oder dein Konto löschst; das Konto kannst du unter https://bloommd.app/account löschen (in der App auch über „Konto verwalten oder löschen“ erreichbar).</p>
            <p><strong>Inhalte aus dem Internet.</strong> Enthält eine Notiz ein Bild oder eine Vorschau von einer fremden Website, lädt die App diese direkt von dort. Dabei erhält der jeweilige Anbieter deine IP-Adresse.</p>
            <p><strong>Teilen.</strong> Über das Teilen-Menü gibst du eine Map als Markdown, OPML, PDF, PNG oder SVG an eine App deiner Wahl weiter; was dort passiert, regelt diese App.</p>
            <p><strong>Links in die App.</strong> Links der Form <code>bloommd://open</code> öffnen eine Notiz des bereits geöffneten Ordners. Bei Links der Form <code>https://bloommd.io/open</code> öffnet das System die App, sofern sie installiert ist; andernfalls lädt dein Browser eine Seite unserer Website mit Download und Web-App, ohne Inhalt der Notiz. Die App selbst überträgt beim Öffnen eines Links keine Daten.</p>
          </>
        )}
      </LegalSection>

      <LegalSection title={en ? "Share links (read-only)" : "Share-Links (nur lesen)"}>
        <p>{en ? "In the web app you can create a link that lets people without a BloomMD account read a map. The link shows titles, visible text and task and decision details of the nodes. Frontmatter, Markdown comments and embedded files such as drawings are not shown. A link can expire (1 to 365 days) and can be revoked at any time. Anyone who knows the link can read the map." : "In der Web-App kannst du für eine Map einen Link erzeugen, mit dem Personen ohne BloomMD-Konto die Map lesen können. Der Link zeigt Titel, sichtbaren Text sowie Aufgaben- und Entscheidungsangaben der Knoten. Frontmatter, Kommentare im Markdown und eingebettete Dateien wie Zeichnungen werden nicht angezeigt. Ein Link kann ablaufen (1 bis 365 Tage) und jederzeit widerrufen werden. Wer den Link kennt, kann die Map lesen."}</p>
      </LegalSection>

      <LegalSection title={en ? "Workspace agents" : "Workspace-Agenten"}>
        <p>{en ? "Workspace agents (e.g. OpenClaw) run on a computer of your choice, not on our servers. An agent only receives tasks assigned to it in the workspace, and for a node task only that node. Its results are proposals that a workspace member has to accept. Which services the agent itself uses (such as a language model) is up to you when you set it up. The mobile app contains no agent features." : "Workspace-Agenten (z. B. OpenClaw) laufen auf einem Rechner deiner Wahl, nicht bei uns. Ein Agent erhält nur die Aufträge, die ihm im Workspace zugewiesen werden, und bei einem Knoten-Auftrag nur diesen Knoten. Seine Ergebnisse sind Vorschläge, die ein Mitglied des Workspaces übernehmen muss. Welche Dienste der Agent selbst nutzt (etwa ein Sprachmodell), entscheidest du bei seiner Einrichtung. Die Mobile-App enthält keine Agenten-Funktionen."}</p>
      </LegalSection>

      <LegalSection title={en ? "Cookies and sessions" : "Cookies und Sessions"}>
        <p>{en ? "BloomMD uses technically necessary session cookies so signed-in users can be recognised and protected areas can work." : "BloomMD setzt technisch notwendige Session-Cookies ein, damit angemeldete Nutzer erkannt werden und geschützte Bereiche genutzt werden können."}</p>
        <p>{en ? <>Only if a consent-required analytics service is enabled, the marketing app stores that choice in the browser under `bloommd:analytics-consent:v1`. Plausible itself does not require this choice because it is configured without cookies or persistent identifiers.</> : <>Nur wenn ein zustimmungspflichtiger Analysedienst aktiviert ist, speichert die Marketing-App die Auswahl im Browser unter `bloommd:analytics-consent:v1`. Plausible selbst benötigt diese Auswahl nicht, weil es ohne Cookies und persistente Identifikatoren konfiguriert ist.</>}</p>
      </LegalSection>

      <LegalSection title={en ? "Reminder emails during the trial period" : "Hinweis-E-Mails zum Testzeitraum"}>
        <p>{en ? "The free trial account is valid for 30 days from email confirmation. Before it ends, we send you a reminder email after 15 days and another after 23 days. Purpose: to remind you that the trial period is ending. After it ends, your account is read-only and export remains possible." : "Der kostenlose Testaccount gilt 30 Tage ab E-Mail-Bestätigung. Vor Ablauf senden wir dir eine Hinweis-E-Mail nach 15 Tagen und eine weitere nach 23 Tagen. Zweck: Erinnerung an das Ende des Testzeitraums. Nach Ablauf ist dein Konto nur noch lesbar, der Export bleibt möglich."}</p>
        <p>{en ? "Processed data: your email address and the time of your email confirmation, from which the sending times follow. For existing accounts, the trial period counts from November 15, 2026. The emails are sent through our email provider (see transactional email). Legal basis: Art. 6(1)(b) GDPR, performance of the user relationship for the account." : "Verarbeitete Daten: deine E-Mail-Adresse und der Zeitpunkt deiner E-Mail-Bestätigung, aus dem sich die Versandzeitpunkte ergeben. Bei bestehenden Konten zählt der Testzeitraum ab dem 15.11.2026. Der Versand erfolgt über unseren E-Mail-Dienstleister (siehe Transaktions-E-Mails). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Durchführung des Nutzungsverhältnisses zum Account)."}</p>
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
