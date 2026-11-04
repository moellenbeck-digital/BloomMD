import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Locale = "de" | "en";

const content = {
  de: {
    eyebrow: "Wohin BloomMD wächst",
    title: "Aus Dateien wird überprüfbares Wissen.",
    intro: "Heute macht BloomMD Markdown als Map bearbeitbar. Im internen Learnings-Pilot prüfen wir, wie Quellen, Gültigkeit und Änderungen nachvollziehbar bleiben. Die folgenden Felder beschreiben eine Richtung, keine bereits ausgelieferten Funktionen.",
    today: "Heute nutzbar",
    todayText: "Markdown-Dateien lokal öffnen, als Map erkunden und bearbeiten.",
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
    todayText: "Open local Markdown files, explore their structure as a map and edit them.",
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
  return (
    <section id="vision" aria-labelledby="vision-title" className="scroll-mt-24 border-y border-[#302B27] bg-[#1A1A1A] text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-[#FFAD88]">{copy.eyebrow}</p>
            <h2 id="vision-title" className="mt-4 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">{copy.title}</h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#E4DDD7]">{copy.intro}</p>
            <Link href={roadmapHref} className="mt-7 inline-flex min-h-11 items-center gap-2 border-b-2 border-[#FF9869] text-sm font-semibold text-white hover:text-[#FFB899] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
              {copy.roadmap}<ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 self-end sm:grid-cols-2 lg:grid-cols-1">
            <div className="border-l-2 border-[#FF9869] bg-white/6 px-5 py-4">
              <p className="text-sm font-bold text-[#FFB899]">{copy.today}</p>
              <p className="mt-2 text-sm leading-6 text-[#E4DDD7]">{copy.todayText}</p>
            </div>
            <div className="border-l-2 border-[#B5A89D] bg-white/6 px-5 py-4">
              <p className="text-sm font-bold text-white">{copy.pilot}</p>
              <p className="mt-2 text-sm leading-6 text-[#E4DDD7]">{copy.pilotText}</p>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-white/20 pt-8">
          <p className="text-sm font-semibold text-[#FFB899]">{copy.exploring}</p>
          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            {copy.fields.map((field) => (
              <div key={field.number} className="border-t border-white/20 py-5">
                <p className="font-[var(--font-mono)] text-xs text-[#FFB899]">{field.number}</p>
                <h3 className="mt-2 text-xl font-semibold">{field.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#E4DDD7]">{field.question}</p>
                <p className="mt-2 text-xs text-[#C4B9AF]">{field.detail}</p>
                <div className="mt-3 flex gap-4">
                  {field.issues.map((issue) => (
                    <a key={issue} href={`https://github.com/moellenbeck-digital/BloomMD/issues/${issue}`} aria-label={`${field.title}: Issue ${issue}`} className="inline-flex min-h-11 items-center text-xs font-semibold text-[#FFB899] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                      #{issue}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#D7CDC4]">{copy.foundation}</p>
        </div>
      </div>
    </section>
  );
}
