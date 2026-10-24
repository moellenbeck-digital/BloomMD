import type { Metadata } from "next";
import Link from "next/link";
import { publicMarketingUrl } from "../../lib/deployment";
import { getAppLocale, withAppLocale, type AppLocale } from "../../lib/locale";

const SUPPORT_EMAIL = "feedback@bloommd.io";
const ACCENT_TEXT = "text-[#9A3412]";
const ACCENT_HOVER = "hover:text-[#7C2D12]";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getAppLocale((await searchParams).lang);
  return {
    title: `${locale === "en" ? "Beta program" : "Beta-Programm"} | BloomMD`,
    description: locale === "en" ? "Scope, limits and feedback path for the closed BloomMD beta." : "Umfang, Grenzen und Feedback-Weg der geschlossenen BloomMD-Beta.",
    robots: { index: false, follow: false },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#E8E4DF] py-8">
      <h2 className="text-xl font-semibold text-[#1A1A1A]">{title}</h2>
      <div className="mt-3 grid gap-3 text-[15px] leading-7 text-[#555555]">{children}</div>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#FF6B35]" />
      <span>{children}</span>
    </li>
  );
}

function platformRows(locale: AppLocale) {
  return locale === "en"
    ? [
        { system: "macOS", status: "M1 Closed Beta", firstStart: <>Right-click the app → <em>Open</em> → <em>Open</em> again</> },
        { system: "Windows", status: "After M1", firstStart: "Separate Windows beta release after platform testing" },
        { system: "Linux", status: "After M1", firstStart: "Separate Linux beta release after platform testing" },
      ]
    : [
        { system: "macOS", status: "M1 Closed Beta", firstStart: <>Rechtsklick auf die App → <em>Öffnen</em> → nochmal <em>Öffnen</em></> },
        { system: "Windows", status: "Nach M1", firstStart: "Eigener Windows Beta Release nach Plattformtests" },
        { system: "Linux", status: "Nach M1", firstStart: "Eigener Linux Beta Release nach Plattformtests" },
      ];
}

export default async function BetaPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = getAppLocale((await searchParams).lang);
  const en = locale === "en";
  const marketing = publicMarketingUrl();
  const demoUrl = `${marketing}/demo${en ? "?lang=en" : ""}`;
  const desktopDocsUrl = `${marketing}/docs/desktop${en ? "?lang=en" : ""}`;
  const collaborationDocsUrl = `${marketing}/docs/collaboration${en ? "?lang=en" : ""}`;
  const downloadUrl = `${marketing}/download${en ? "?lang=en" : ""}`;
  const commandToolsUrl = `${marketing}/docs/command-line-tools${en ? "?lang=en" : ""}`;
  const englishUrl = en ? withAppLocale("/beta", "de") : withAppLocale("/beta", "en");
  const templatesUrl = `${marketing}/templates${en ? "?lang=en" : ""}`;
  const rows = platformRows(locale);
  const wikiStep = en
    ? <><strong className="font-semibold text-[#1A1A1A]">4. Try a knowledge bundle.</strong> Install the optional <a href={commandToolsUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>BloomMD command-line tool</a> locally; it works without a model or network. <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">bloommd-wiki init ./wiki</code> creates an OKF-v0.2 bundle. <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">status</code> and <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">lint</code> show drift and trust levels.</>
    : <><strong className="font-semibold text-[#1A1A1A]">4. Wissensbündel ausprobieren.</strong> Installiere das optionale <a href={commandToolsUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>BloomMD-Kommandozeilen-Tool</a> lokal; es funktioniert ohne Modell und ohne Netzwerk. <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">bloommd-wiki init ./wiki</code> legt ein OKF-v0.2-Bündel an. <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">status</code> und <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">lint</code> zeigen Drift und Vertrauensstufen.</>;

  const copy = en
    ? {
        // @ts-expect-error The compact locale records intentionally share the desktop label key.
        eyebrow: "Closed beta", title: "Thanks for testing BloomMD.", intro: "BloomMD is not finished yet. This page explains what to expect, what is intentionally missing and how to reach us. It is more honest than a feature list — that is the point of a beta.", language: "Beta help in English, feedback in English or German", languageLink: "Deutsche Übersicht", desktop: "The desktop app is the primary path", desktopText: <>BloomMD starts in M1 as a macOS desktop beta. It works directly on a folder on your disk — <strong className="font-semibold text-[#1A1A1A]">without an account, cloud or network</strong>. This is the path we recommend for the beta: no invitation is needed and your files stay on your computer.</>, system: "System", status: "Status", firstStart: "First launch", warning: "Why the warning appears:", warningText: "The macOS build is ad-hoc signed, but not yet Developer ID-signed or notarized. The final Apple signature is waiting for the Apple Developer account approval. If the Gatekeeper workaround is inconvenient, use the browser demo.", download: "Download macOS app", installation: "Read installation guide", firstResult: "Get your first result in 3 minutes", step1: <> <strong className="font-semibold text-[#1A1A1A]">1. Start without an account.</strong> Open the <a href={demoUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>demo</a>, paste your Markdown and view the map. Nothing is saved or uploaded.</>, step2: <> <strong className="font-semibold text-[#1A1A1A]">2. Start from a template.</strong> The <a href={templatesUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>templates</a> are real Markdown files: software architecture, research, startup operations and content strategy.</>, step3: <> <strong className="font-semibold text-[#1A1A1A]">3. Work with your own files.</strong> The desktop app opens a folder on your disk. Change the structure, save it and continue in Git or Obsidian — all locally, with no account.</>, step4: <> <strong className="font-semibold text-[#1A1A1A]">4. Try a knowledge bundle.</strong> Locally, without a model or network: <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">bun run wiki -- init ./wiki</code> creates an OKF-v0.2 bundle. <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">status</code> and <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">lint</code> show drift and trust levels.</>, included: "What is included", missing: "What is intentionally missing", desktop: "Desktop app", desktopIncluded: "the recommended path. Runs locally on your files, detects external changes and opens .md files by double-click.", web: "Web app", webIncluded: "the same interface in the browser, for invited cloud beta testers.", wiki: "OKF / LLM Wiki", wikiIncluded: "bundles in Open Knowledge Format v0.2 with trust signals and the suggest → approve → apply workflow.", obsidian: "Obsidian compatibility", obsidianIncluded: "real local notes are visualized as a map; full plugin beta distribution follows after M1.", collaboration: "Collaboration", collaborationIncluded: "available to invited cloud testers. The two-person and WebApp + MacApp guide is in the ", collaborationLink: "collaboration documentation", mobile: "Mobile Obsidian.", mobileText: "The touch matrix on real devices has not run. The plugin is intentionally marked desktop-only.", paid: "Paid plans.", paidText: "No prices and no payment data. Checkout is closed server-side.", public: "Public access.", publicText: "The cloud app is invitation-only. Demo and templates are open.", agents: "Autonomous agents.", agentsText: "The wiki workflow requires review. Nothing is written without named approval.", dontUpload: "Please do not upload", dontUploadText: <>The beta runs on an early private instance. Local sync load tests have run and platform restore and target-environment smoke checks are documented, but M1 is intentionally released cautiously. <strong className="font-semibold text-[#1A1A1A]">There is no recovery guarantee.</strong></>, noCredentials: "No credentials, keys or tokens.", noPersonal: "No personal data belonging to third parties.", noLoss: "Nothing whose loss would cause a problem.", localWork: "For real work: use the desktop app locally. It needs no cloud access and uploads nothing.", feedback: "Feedback", feedbackText: "Report bugs and requests after login through the feedback button in the app. A screenshot is required so we can triage UI, folder and sync problems faster.", helpful: "Helpful in a report: what you expected, what happened, your browser or Obsidian version, a screenshot and — if a file was rendered incorrectly — a minimal Markdown example. ", noReal: "Please do not upload real content, credentials or third-party data", reduced: "; a reduced example is always enough.", unavailable: "If the app itself is unreachable, reply to your beta invitation email or write to ", github: "GitHub is our internal triage target, not a normal feedback channel for testers.", app: "Open app", email: "Report by email", known: "Already known", knownIntro: "You do not need to report these points — they are already on the list:", knownItems: ["New files from other participants appear only after a reload.", "The desktop app's auto-reconnect to the remote server is unreliable.", "The first invitation wave remains manually gated until legal approval, the tester group and the delivery log are complete.", "There is not yet a diff view for resolving conflicts."], beta: "Beta overview"
      }
    : {
        // @ts-expect-error The compact locale records intentionally share the desktop label key.
        eyebrow: "Geschlossene Beta", title: "Danke, dass du BloomMD testest.", intro: "BloomMD ist noch nicht fertig. Diese Seite sagt dir, was du erwarten kannst, was bewusst fehlt und wie du uns erreichst. Sie ist ehrlicher als eine Feature-Liste — genau das ist der Zweck einer Beta.", language: "Sprache: Beta-Hilfe auf Deutsch, Feedback auf Deutsch oder Englisch", languageLink: "English overview", desktop: "Die Desktop-App ist der Hauptweg", desktopText: <>BloomMD startet in M1 als macOS-Desktop-Beta. Sie arbeitet direkt auf einem Ordner auf deiner Platte — <strong className="font-semibold text-[#1A1A1A]">ohne Account, ohne Cloud, ohne Netz</strong>. Das ist der Weg, den wir in der Beta empfehlen: Du brauchst keine Einladung dafür, und deine Dateien verlassen den Rechner nicht.</>, system: "System", status: "Stand", firstStart: "Beim ersten Start", warning: "Warum die Warnung kommt:", warningText: "Der macOS-Build ist ad-hoc signiert, aber noch nicht Developer-ID-signiert oder notarisiert. Die finale Apple-Signatur wartet auf die Freigabe des Apple Developer Accounts. Wenn dir der Gatekeeper-Umweg zu unbequem ist, nimm die Browser-Demo.", download: "macOS-App laden", installation: "Installation lesen", firstResult: "In 3 Minuten zum ersten Ergebnis", step1: <> <strong className="font-semibold text-[#1A1A1A]">1. Ohne Account anfangen.</strong> Öffne die <a href={demoUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>Demo</a>, füge eigenes Markdown ein und sieh dir die Map an. Nichts wird gespeichert oder hochgeladen.</>, step2: <> <strong className="font-semibold text-[#1A1A1A]">2. Von einer Vorlage starten.</strong> Die <a href={templatesUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>Templates</a> sind echte Markdown-Dateien. Software-Architektur, Recherche, Startup-Betrieb, Content-Strategie.</>, step3: <> <strong className="font-semibold text-[#1A1A1A]">3. Mit eigenen Dateien arbeiten.</strong> Die Desktop-App öffnet einen Ordner auf deiner Platte. Struktur ändern, speichern, in Git oder Obsidian weiterarbeiten — alles lokal, kein Account nötig.</>, step4: <> <strong className="font-semibold text-[#1A1A1A]">4. Wissensbündel ausprobieren.</strong> Lokal, ohne Modell und ohne Netzwerk: <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">bun run wiki -- init ./wiki</code> legt ein OKF-v0.2-Bündel an. <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">status</code> und <code className="rounded bg-[#F2F0ED] px-1.5 py-0.5 text-[0.9em]">lint</code> zeigen Drift und Vertrauensstufen.</>, included: "Was enthalten ist", missing: "Was ausdrücklich fehlt", desktop: "Desktop-App", desktopIncluded: "der empfohlene Weg. Läuft lokal auf deinen Dateien, erkennt Änderungen von außen, öffnet .md-Dateien per Doppelklick.", web: "Web-App", webIncluded: "dieselbe Oberfläche im Browser, für die Cloud-Beta auf Einladung.", wiki: "OKF / LLM-Wiki", wikiIncluded: "Bündel im Open Knowledge Format v0.2 mit Vertrauenssignalen und dem Ablauf Vorschlag → Freigabe → Anwenden.", obsidian: "Obsidian-Kompatibilität", obsidianIncluded: "echte lokale Notizen werden als Map visualisiert; die vollständige Plugin-Beta-Verteilung folgt nach M1.", collaboration: "Kollaboration", collaborationIncluded: "vorhanden für eingeladene Cloud-Tester. Die Anleitung für zwei Personen und WebApp + MacApp steht in der ", collaborationLink: "Zusammenarbeits-Doku", mobile: "Mobile Obsidian.", mobileText: "Die Touch-Matrix auf echten Geräten ist nicht gelaufen. Das Plugin ist bewusst als Desktop-only markiert.", paid: "Bezahlte Pläne.", paidText: "Keine Preise, keine Zahlungsdaten. Der Checkout ist serverseitig geschlossen.", public: "Öffentlicher Zugang.", publicText: "Die Cloud-App läuft auf Einladung. Demo und Templates sind offen.", agents: "Autonome Agenten.", agentsText: "Der Wiki-Workflow ist review-pflichtig. Nichts schreibt ohne namentliche Freigabe.", dontUpload: "Bitte nicht hochladen", dontUploadText: <>Die Beta läuft auf einer frühen privaten Instanz. Lokale Sync-Lasttests sind gelaufen, Plattform-Restore und Zielumgebungs-Smokes sind belegt, trotzdem ist M1 bewusst vorsichtig freigegeben. <strong className="font-semibold text-[#1A1A1A]">Es gibt keine Wiederherstellungszusage.</strong></>, noCredentials: "Keine Zugangsdaten, Schlüssel oder Tokens.", noPersonal: "Keine personenbezogenen Daten Dritter.", noLoss: "Nichts, dessen Verlust ein Problem wäre.", localWork: "Für echte Arbeit: lokal mit der Desktop-App. Sie braucht keinen Cloud-Zugang und lädt nichts hoch.", feedback: "Feedback", feedbackText: "Fehler und Wünsche gehen nach dem Login direkt über den Feedback-Button in der App. Ein Screenshot ist Pflicht, weil wir UI-, Ordner- und Sync-Probleme so schneller triagieren.", helpful: "Hilfreich in einem Bericht: was du erwartet hast, was passiert ist, dein Browser oder deine Obsidian-Version, ein Screenshot und — falls eine Datei falsch dargestellt wurde — ein minimales Beispiel des Markdowns. ", noReal: "Bitte keine echten Inhalte, Zugangsdaten oder Daten Dritter hochladen", reduced: "; ein reduziertes Beispiel reicht immer.", unavailable: "Wenn die App selbst nicht erreichbar ist, antworte auf deine Beta-Einladungs-Mail oder schreibe an ", github: "GitHub ist unser internes Triage-Ziel, aber kein normaler Feedbackkanal für Tester.", app: "Zur App", email: "Per E-Mail melden", known: "Bereits bekannt", knownIntro: "Diese Punkte musst du nicht melden — sie stehen auf der Liste:", knownItems: ["Neue Dateien anderer Teilnehmer erscheinen erst nach einem Reload.", "Der Auto-Reconnect der Desktop-App zum Remote-Server ist unzuverlässig.", "Die erste Einladungswelle bleibt manuell gegatet, bis Rechtsfreigabe, Testergruppe und Versandprotokoll abgeschlossen sind.", "Bei einem Konflikt gibt es noch keine Diff-Ansicht zum Auflösen."], beta: "Geschlossene Beta"
      };

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#1A1A1A]">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className={`font-mono text-xs uppercase tracking-[0.12em] ${ACCENT_TEXT}`}>{copy.eyebrow}</p>
        <h1 className="mt-2 text-4xl font-semibold">{copy.title}</h1>
        <p className="mt-4 text-lg leading-8 text-[#555555]">{copy.intro}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#555555]">
          <span className="rounded-full border border-[#E8E4DF] bg-white px-3 py-1.5">{copy.language}</span>
          <a href={englishUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>{copy.languageLink}</a>
        </div>

        <Section title={en ? "The desktop app is the primary path" : "Die Desktop-App ist der Hauptweg"}>
          <p>{copy.desktopText}</p>
          <div className="mt-2 grid gap-3 md:hidden">
            {rows.map((row) => <div key={row.system} className="border-t border-[#E8E4DF] py-3 text-sm"><div className="font-semibold text-[#1A1A1A]">{row.system}</div><div className="mt-1 text-[#555555]">{row.status}</div><div className="mt-1 text-[#555555]">{row.firstStart}</div></div>)}
          </div>
          <div className="mt-2 hidden md:block">
            <table className="w-full border-collapse text-sm"><thead><tr className="border-b border-[#E8E4DF] text-left"><th className="py-2 pr-4 font-semibold">{copy.system}</th><th className="py-2 pr-4 font-semibold">{copy.status}</th><th className="py-2 font-semibold">{copy.firstStart}</th></tr></thead><tbody className="text-[#555555]">{rows.map((row, index) => <tr key={row.system} className={index < rows.length - 1 ? "border-b border-[#F0EDE9]" : undefined}><td className="py-2.5 pr-4 font-medium text-[#1A1A1A]">{row.system}</td><td className="py-2.5 pr-4">{row.status}</td><td className="py-2.5">{row.firstStart}</td></tr>)}</tbody></table>
          </div>
          <p><strong className="font-semibold text-[#1A1A1A]">{copy.warning}</strong> {copy.warningText}</p>
          <div className="mt-2 flex flex-wrap gap-3"><a href={downloadUrl} className="inline-flex h-11 items-center justify-center rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F]">{copy.download}</a><a href={desktopDocsUrl} className="inline-flex h-11 items-center justify-center rounded-md border border-[#D4CFC8] bg-white px-5 text-sm font-semibold hover:bg-[#F2F0ED]">{copy.installation}</a></div>
        </Section>

        <Section title={copy.firstResult}><ol className="grid gap-3"><li>{copy.step1}</li><li>{copy.step2}</li><li>{copy.step3}</li><li>{wikiStep}</li></ol></Section>

        <Section title={copy.included}><ul className="grid gap-2"><Item><strong className="font-semibold text-[#1A1A1A]">{copy.desktop}</strong> — {copy.desktopIncluded}</Item><Item><strong className="font-semibold text-[#1A1A1A]">{copy.web}</strong> — {copy.webIncluded}</Item><Item><strong className="font-semibold text-[#1A1A1A]">{copy.wiki}</strong> — {copy.wikiIncluded}</Item><Item><strong className="font-semibold text-[#1A1A1A]">{copy.obsidian}</strong> — {copy.obsidianIncluded}</Item><Item><strong className="font-semibold text-[#1A1A1A]">{copy.collaboration}</strong> — {copy.collaborationIncluded}<a href={collaborationDocsUrl} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>{copy.collaborationLink}</a>.</Item></ul></Section>

        <Section title={copy.missing}><ul className="grid gap-2"><Item><strong className="font-semibold text-[#1A1A1A]">{copy.mobile}</strong> {copy.mobileText}</Item><Item><strong className="font-semibold text-[#1A1A1A]">{copy.paid}</strong> {copy.paidText}</Item><Item><strong className="font-semibold text-[#1A1A1A]">{copy.public}</strong> {copy.publicText}</Item><Item><strong className="font-semibold text-[#1A1A1A]">{copy.agents}</strong> {copy.agentsText}</Item></ul></Section>

        <Section title={copy.dontUpload}><p>{copy.dontUploadText}</p><ul className="grid gap-2"><Item>{copy.noCredentials}</Item><Item>{copy.noPersonal}</Item><Item>{copy.noLoss}</Item></ul><p>{copy.localWork}</p></Section>

        <Section title={copy.feedback}><p>{copy.feedbackText}</p><p>{copy.helpful}<strong className="font-semibold text-[#1A1A1A]">{copy.noReal}</strong>{copy.reduced}</p><p>{copy.unavailable}<a href={`mailto:${SUPPORT_EMAIL}`} className={`font-semibold ${ACCENT_TEXT} ${ACCENT_HOVER} hover:underline`}>{SUPPORT_EMAIL}</a>. {copy.github}</p><div className="mt-2 flex flex-wrap gap-3"><Link href={withAppLocale("/app", locale)} className="inline-flex h-11 items-center justify-center rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F]">{copy.app}</Link><a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex h-11 items-center justify-center rounded-md border border-[#D4CFC8] bg-white px-5 text-sm font-semibold hover:bg-[#F2F0ED]">{copy.email}</a></div></Section>

        <Section title={copy.known}><p>{copy.knownIntro}</p><ul className="grid gap-2">{copy.knownItems.map((item) => <Item key={item}>{item}</Item>)}</ul></Section>
      </div>
    </main>
  );
}
