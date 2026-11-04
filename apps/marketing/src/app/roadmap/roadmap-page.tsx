"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Filter, GitPullRequestArrow, Languages, Map, ShieldCheck } from "lucide-react";
import type { RoadmapData, RoadmapIssue, RoadmapStatus, RoadmapTag } from "../../lib/roadmap";
import { roadmapFilters, roadmapStatuses } from "../../lib/roadmap";

type RoadmapLocale = "de" | "en";

type RoadmapCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  languageLabel: string;
  switchLabel: string;
  switchHref: string;
  all: string;
  filteredEmpty: string;
  fallback: string;
  live: string;
  githubLink: string;
  cardLabel: string;
  privacyTitle: string;
  privacyText: string;
  visionTitle: string;
  visionIntro: string;
  visionThemes: string;
  visionPhaseLabels: [string, string, string, string];
  visionPhases: [string, string, string, string];
  visionNote: string;
  visionLink: string;
  statusText: Record<RoadmapStatus, string>;
  tagText: Record<RoadmapTag, string>;
};

const copy: Record<RoadmapLocale, RoadmapCopy> = {
  de: {
    eyebrow: "Öffentliche Roadmap",
    title: "Was gerade aus Beta-Feedback entsteht.",
    intro:
      "Diese Seite zeigt kuratierte BloomMD-Tickets. Die verlinkten GitHub-Issues sind öffentlich, einschließlich ihrer Kommentare und Anhänge.",
    languageLabel: "Sprache",
    switchLabel: "EN",
    switchHref: "/en/roadmap",
    all: "Alle",
    filteredEmpty: "Für diesen Filter sind aktuell keine öffentlichen Tickets freigegeben.",
    fallback: "GitHub-Daten sind gerade nicht verfügbar. Du siehst eine gecachte, reduzierte Roadmap.",
    live: "Live aus freigegebenen GitHub-Tickets",
    githubLink: "Issue öffnen",
    cardLabel: "Öffentliches Roadmap-Ticket",
    privacyTitle: "Bewusst kuratiert",
    privacyText:
      "Ein Ticket erscheint hier nur mit dem Label public-roadmap. Ticket-Titel bleiben in der Originalsprache, UI und Orientierung sind Deutsch und Englisch gepflegt.",
    visionTitle: "Vom Markdown-Workspace zur offenen Wissensplattform",
    visionIntro: "BloomMD bleibt lokal mit eigenen Markdown-Dateien nutzbar. Der interne Learnings-Pilot ist der erste Backend-Nutzungsfall. Die folgenden Themen sind eine Richtung für überprüfbare Ausbauschritte, keine bereits verfügbaren Funktionen.",
    visionThemes: "Wissensmodell und Provenienz · belegte Suche · Sync und Offline · Identität und Delegation · Sicherheit und Governance · Konnektoren · Wissenslebenszyklus · Agenten-Workflows · Transparenz · Betrieb",
    visionPhaseLabels: ["W0 · Jetzt prüfen", "W1 · Danach eingrenzen", "W2 · Vor breiter Suche", "W3 · Nach Nachweis"],
    visionPhases: ["Learnings-Pilot und portable Quellen-/Trust-Felder", "Konfliktfester Sync und eine begrenzte lesende Quelle", "Widerrufbare Rechte, Audit und Suche mit Belegen", "Lebenszyklus, Agentenaktionen, Governance und Betrieb"],
    visionNote: "Die Meilensteine bündeln Scope-Entscheidungen ohne Termin oder Funktionszusage. Die macOS-Beta hat Vorrang.",
    visionLink: "Vollständige Roadmap und offene Fragen auf GitHub",
    statusText: {
      Feedback: "Feedback",
      Planned: "Geplant",
      "In progress": "In Arbeit",
      "In review": "In Prüfung",
    },
    tagText: {
      Mac: "Mac",
      Windows: "Windows",
      Linux: "Linux",
      Web: "Web",
      Obsidian: "Obsidian",
      Sync: "Sync",
      Dokumentation: "Dokumentation",
      Feedback: "Feedback",
      Editor: "Editor",
      Dateien: "Dateien",
      Ressourcen: "Ressourcen",
      Workspace: "Workspace",
      Beta: "Beta",
      "Local-first": "Local-first",
      Collaboration: "Collaboration",
      "Post-M1": "Post-M1",
    },
  },
  en: {
    eyebrow: "Public roadmap",
    title: "What beta feedback is turning into.",
    intro:
      "This page shows curated BloomMD tickets. Linked GitHub issues are public, including their comments and attachments.",
    languageLabel: "Language",
    switchLabel: "DE",
    switchHref: "/roadmap",
    all: "All",
    filteredEmpty: "No public tickets are approved for this filter right now.",
    fallback: "GitHub data is unavailable right now. You are seeing a cached, reduced roadmap.",
    live: "Live from approved GitHub tickets",
    githubLink: "Open issue",
    cardLabel: "Public roadmap ticket",
    privacyTitle: "Deliberately curated",
    privacyText:
      "A ticket appears here only with the public-roadmap label. Ticket titles keep their original language; interface and orientation are maintained in German and English.",
    visionTitle: "From Markdown workspace to open knowledge platform",
    visionIntro: "BloomMD remains usable locally with your own Markdown files. The internal learnings pilot is the first backend use case. The themes below guide verifiable steps; they do not describe features already available.",
    visionThemes: "Knowledge model and provenance · cited search · sync and offline · identity and delegation · security and governance · connectors · knowledge lifecycle · agent workflows · transparency · operations",
    visionPhaseLabels: ["W0 · Validate now", "W1 · Scope next", "W2 · Before broader search", "W3 · After evidence"],
    visionPhases: ["Learnings pilot and portable source/trust fields", "Conflict-safe sync and one limited read-only source", "Revocable rights, audit, and cited search", "Lifecycle, agent actions, governance, and operations"],
    visionNote: "These milestones group scope decisions without dates or feature commitments. The macOS beta remains the priority.",
    visionLink: "Full roadmap and open questions on GitHub",
    statusText: {
      Feedback: "Feedback",
      Planned: "Planned",
      "In progress": "In progress",
      "In review": "In review",
    },
    tagText: {
      Mac: "Mac",
      Windows: "Windows",
      Linux: "Linux",
      Web: "Web",
      Obsidian: "Obsidian",
      Sync: "Sync",
      Dokumentation: "Documentation",
      Feedback: "Feedback",
      Editor: "Editor",
      Dateien: "Files",
      Ressourcen: "Resources",
      Workspace: "Workspace",
      Beta: "Beta",
      "Local-first": "Local-first",
      Collaboration: "Collaboration",
      "Post-M1": "Post-M1",
    },
  },
};

export function RoadmapPage({ data, locale }: { data: RoadmapData; locale: RoadmapLocale }) {
  const text = copy[locale];
  const [activeFilter, setActiveFilter] = useState<RoadmapTag | "all">("all");

  const filteredIssues = useMemo(() => {
    if (activeFilter === "all") {
      return data.issues;
    }

    return data.issues.filter((issue) => issue.tags.includes(activeFilter));
  }, [activeFilter, data.issues]);

  const groupedIssues = useMemo(() => {
    return roadmapStatuses.map((status) => ({
      status,
      issues: filteredIssues.filter((issue) => issue.status === status),
    }));
  }, [filteredIssues]);

  const totalVisible = filteredIssues.length;

  return (
    <main className="min-h-screen overflow-x-clip bg-[#FAFAFA] text-[#1A1A1A]">
      <header className="border-b border-[#E8E4DF] bg-[#FFFDFB]/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-5">
          <Link href={locale === "de" ? "/" : "/en"} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25" aria-label="BloomMD">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="block h-8 w-[144px]">
              <img src="/logo.svg" alt="BloomMD" className="bloommd-logo-light h-8 w-auto" />
              <img src="/logo-dark.svg" alt="" aria-hidden="true" className="bloommd-logo-dark h-8 w-auto" />
            </span>
            <span className="hidden border-l border-[#D4CFC8] pl-3 text-sm font-semibold text-[#68615C] sm:inline">
              Roadmap
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-[#777777] sm:inline">{text.languageLabel}</span>
            <Link href={text.switchHref} hrefLang={locale === "de" ? "en" : "de"} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E4DF] bg-white px-3 text-sm font-bold text-[#1A1A1A] transition hover:bg-[#FFF4EE] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
              <Languages size={16} aria-hidden="true" />
              {text.switchLabel}
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-[#E8E4DF] bg-[#1A1A1A] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:py-18">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/68">
              <Map size={14} aria-hidden="true" />
              {text.eyebrow}
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[0.98] tracking-normal text-white sm:text-6xl lg:text-7xl">
              {text.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">{text.intro}</p>
          </div>

          <aside className="self-end border-l border-[#FF6B35] bg-white/[0.035] p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 shrink-0 text-[#FF8A50]" size={22} aria-hidden="true" />
              <div>
                <h2 className="text-lg font-bold text-white">{text.privacyTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-white/62">{text.privacyText}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="border-b border-[#E8E4DF] bg-white" aria-labelledby="knowledge-vision-title">
        <div className="mx-auto max-w-7xl px-5 py-12 lg:py-16">
          <h2 id="knowledge-vision-title" className="max-w-4xl text-3xl font-black leading-tight sm:text-4xl">{text.visionTitle}</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68615C]">{text.visionIntro}</p>
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {text.visionPhases.map((phase, index) => (
              <div key={phase} className="border-t-4 border-[#FF6B35] bg-[#F7F5F2] p-5">
                <h3 className="text-sm font-black uppercase tracking-wide text-[#9A3412]">{text.visionPhaseLabels[index]}</h3>
                <p className="mt-3 text-sm leading-6 text-[#1A1A1A]">{phase}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-5xl text-sm leading-7 text-[#68615C]">{text.visionThemes}</p>
          <p className="mt-3 text-sm leading-6 text-[#68615C]">{text.visionNote}</p>
          <a href="https://github.com/moellenbeck-digital/BloomMD/blob/main/docs/WISSENSPLATTFORM-ROADMAP.md" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#B94316] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
            {text.visionLink}<ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="border-b border-[#E8E4DF] bg-[#FFFDFB]">
        <div className="mx-auto max-w-7xl px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#68615C]">
              <GitPullRequestArrow size={18} className="text-[#B94316]" aria-hidden="true" />
              {data.source === "github" ? text.live : text.fallback}
            </div>
            <div className="flex flex-wrap items-center gap-2" aria-label="Roadmap filter">
              <Filter size={16} className="text-[#777777]" aria-hidden="true" />
              <FilterButton active={activeFilter === "all"} onClick={() => setActiveFilter("all")}>
                {text.all}
              </FilterButton>
              {roadmapFilters.map((filter) => (
                <FilterButton key={filter} active={activeFilter === filter} onClick={() => setActiveFilter(filter)}>
                  {text.tagText[filter]}
                </FilterButton>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 lg:py-12">
        {totalVisible === 0 ? (
          <div className="mb-4 border border-dashed border-[#D4CFC8] bg-white p-5 text-center text-sm font-semibold text-[#68615C]">
            {text.filteredEmpty}
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-4">
          {groupedIssues.map((group) => (
            <RoadmapColumn
              key={group.status}
              status={group.status}
              issues={group.issues}
              text={text}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-md border px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20 ${
        active
          ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
          : "border-[#E8E4DF] bg-white text-[#68615C] hover:border-[#FFD4BF] hover:bg-[#FFF4EE] hover:text-[#1A1A1A]"
      }`}
    >
      {children}
    </button>
  );
}

function RoadmapColumn({ status, issues, text }: { status: RoadmapStatus; issues: RoadmapIssue[]; text: RoadmapCopy }) {
  return (
    <section className="min-h-[150px] border-t-4 border-[#FF6B35] bg-[#F7F5F2] p-3 lg:min-h-[260px]">
      <div className="flex items-center justify-between gap-3 px-1 py-2">
        <h2 className="text-sm font-black uppercase tracking-[0.12em] text-[#1A1A1A]">{text.statusText[status]}</h2>
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-xs font-black text-[#68615C]">
          {issues.length}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {issues.map((issue) => (
          <article key={issue.number} className="border border-[#E8E4DF] bg-white p-4 shadow-[0_10px_24px_rgba(26,26,26,0.04)]" aria-label={`${text.cardLabel} #${issue.number}`}>
            <div className="flex flex-wrap gap-1.5">
              {issue.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-[#FFD4BF] bg-[#FFF4EE] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A3412]">
                  {text.tagText[tag]}
                </span>
              ))}
            </div>
            <h3 className="mt-3 text-lg font-black leading-tight text-[#1A1A1A]">{issue.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#68615C]">{issue.description}</p>
            <a href={issue.url} className="mt-4 inline-flex items-center gap-2 rounded-md text-sm font-bold text-[#B94316] hover:text-[#7C2D12] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
              #{issue.number} {text.githubLink}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
