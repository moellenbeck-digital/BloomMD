import { VisionTrieb } from "./v2/vision-trieb";

type Locale = "de" | "en";

const content = {
  de: {
    eyebrow: "Wohin BloomMD wächst",
    title: "Aus Dateien wird überprüfbares Wissen.",
    intro: "Heute macht BloomMD Markdown als Map bearbeitbar. Im internen Learnings-Pilot prüfen wir, wie Quellen, Gültigkeit und Änderungen nachvollziehbar bleiben. Die folgenden Felder beschreiben eine Richtung, keine bereits ausgelieferten Funktionen.",
    today: "Heute nutzbar",
    todayText: "Markdown-Dateien als Map bearbeiten; im Web-Workspace Knotenaufträge an lokale OpenClaw-Agenten geben und Vorschläge freigeben.",
    pilot: "Interner Pilot · #116",
    pilotText: "Learnings als erster interner Nutzen der Backend-Plattform.",
    exploring: "In Prüfung",
    fields: [
      { number: "01 / 09", issues: [259, 267], title: "Quellen und Vertrauen", question: "Woher stammt Wissen, und wann gilt es?", detail: "Wissensmodell und Transparenz" },
      { number: "03 / 06", issues: [261, 264], title: "Verbinden und offline arbeiten", question: "Wie bleiben Dateien und Quellen nutzbar?", detail: "Sync, Offline und Konnektoren" },
      { number: "04 / 02", issues: [262, 260], title: "Rechte und belegte Suche", question: "Wer darf was sehen, und worauf stützt sich eine Antwort?", detail: "Identität, Zugriff und Suche" },
      { number: "07 / 08", issues: [265, 266], title: "Review und Aktionen", question: "Wie werden Änderungen geprüft, bevor etwas passiert?", detail: "Lebenszyklus und Agenten-Workflows" },
    ],
    foundation: "Governance und Betrieb (Themen 05 und 10) sind Voraussetzungen für diese Richtung.",
    roadmap: "Roadmap ansehen",
  },
  en: {
    eyebrow: "Where BloomMD is heading",
    title: "From files to verifiable knowledge.",
    intro: "Today, BloomMD makes Markdown editable as a map. In an internal learnings pilot, we are testing how sources, validity and changes remain traceable. The areas below describe a direction, not features already shipped.",
    today: "Available today",
    todayText: "Edit Markdown files as maps; in a web workspace, assign node tasks to local OpenClaw agents and approve proposals.",
    pilot: "Internal pilot · #116",
    pilotText: "Learnings as the first internal use of the backend platform.",
    exploring: "Exploring",
    fields: [
      { number: "01 / 09", issues: [259, 267], title: "Sources and trust", question: "Where does knowledge come from, and when is it valid?", detail: "Knowledge model and transparency" },
      { number: "03 / 06", issues: [261, 264], title: "Connected and offline", question: "How do files and sources stay useful?", detail: "Sync, offline use and connectors" },
      { number: "04 / 02", issues: [262, 260], title: "Access and cited search", question: "Who can see what, and what supports an answer?", detail: "Identity, permissions and search" },
      { number: "07 / 08", issues: [265, 266], title: "Review and actions", question: "How are changes checked before anything happens?", detail: "Lifecycle and agent workflows" },
    ],
    foundation: "Governance and operations (topics 05 and 10) are foundations for this direction.",
    roadmap: "Explore the roadmap",
  },
} as const;

export function KnowledgeVisionSection({ locale }: { locale: Locale }) {
  const copy = content[locale];
  const roadmapHref = locale === "de" ? "/roadmap" : "/en/roadmap";
  return <VisionTrieb copy={copy} roadmapHref={roadmapHref} />;
}
