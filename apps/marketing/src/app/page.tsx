"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@bloommd/core/browser";
import { MindMapPreview } from "@bloommd/ui";
import { AvailabilityOverview } from "../components/availability-overview";
import { WaitlistForm } from "./waitlist-form";
import { getBuildInfo } from "../lib/build-info";
import { publicAppUrl } from "../lib/deployment";
import { trackPlausibleEvent } from "../lib/plausible";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CloudOff,
  Code2,
  FileCode2,
  FileText,
  FolderOpen,
  GitBranch,
  HardDrive,
  Keyboard,
  Layers3,
  LayoutTemplate,
  Menu,
  MonitorSmartphone,
  MoveRight,
  PenLine,
  Presentation,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

const headerNavItems = [
  { label: "Produkt", href: "#produkt" },
  { label: "Demo", href: "/demo" },
  { label: "Desktop", href: "#desktop" },
  { label: "Downloads", href: "/download" },
  { label: "Beta", href: "#beta" },
  { label: "News", href: "/news" },
  { label: "Hilfe", href: "/docs" },
];

const secondaryNavItems = [
  { label: "Blog", href: "/blog" },
  { label: "News", href: "/news" },
  { label: "Templates", href: "/templates" },
  { label: "LLM Wiki", href: "#llm-wiki" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Workflow", href: "#workflow" },
  { label: "Obsidian", href: "/obsidian" },
  { label: "Local-first", href: "#local-first" },
  { label: "FAQ", href: "#faq" },
];

const legalLinks = [
  { label: "Impressum", href: "/impressum" },
  { label: "Datenschutz", href: "/datenschutz" },
  { label: "AGB", href: "/agb" },
  { label: "Widerruf", href: "/widerruf" },
  { label: "Cookies", href: "/cookies" },
  { label: "Lizenz", href: "/lizenz" },
  { label: "Leistungen", href: "/leistungen" },
];

const appLoginUrl = `${publicAppUrl()}/login`;
const marketingBuildInfo = getBuildInfo("marketing", { publicOnly: true });

const footerSections = [
  {
    title: "Produkt",
    links: [
      { label: "Überblick", href: "#produkt" },
      { label: "Demo", href: "/demo" },
      { label: "Downloads", href: "/download" },
      { label: "Templates", href: "/templates" },
      { label: "Blog", href: "/blog" },
      { label: "News", href: "/news" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Hilfe", href: "/docs" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Arbeiten",
    links: [
      { label: "Desktop", href: "#desktop" },
      { label: "Obsidian", href: "/obsidian" },
      { label: "LLM Wiki", href: "#llm-wiki" },
      { label: "Workflow", href: "#workflow" },
      { label: "Local-first", href: "#local-first" },
    ],
  },
  {
    title: "Beta",
    links: [
      { label: "Closed Beta", href: "#beta" },
      { label: "Login", href: appLoginUrl },
    ],
  },
  {
    title: "Recht",
    links: legalLinks,
  },
];

const markdownLines = [
  "# Product Strategy",
  "## North Star",
  "- Visual thinking for real files",
  "- No locked workspace format",
  "",
  "## Initiatives",
  "### Local-first editor",
  "### Pro workflows",
  "### Optional sync",
];

const audiencePaths = [
  {
    icon: FileText,
    title: "Ich habe Markdown-Dateien",
    text: "Teste eine echte Datei im Browser oder lade die Desktop-Beta für macOS und Omarchy/Linux herunter.",
    href: "/demo",
    cta: "Demo ohne Account testen",
  },
  {
    icon: RefreshCw,
    title: "Ich nutze Obsidian",
    text: "Sieh dir an, wie lokale Obsidian-Notizen als BloomMD-Map sichtbar werden.",
    href: "/obsidian",
    cta: "Obsidian-Status ansehen",
  },
  {
    icon: MonitorSmartphone,
    title: "Ich will Team/Cloud testen",
    text: "Die private App mit Auth, Sync und Collaboration startet in kleinen Beta-Wellen.",
    href: "#beta",
    cta: "Beta-Zugang anfragen",
  },
  {
    icon: LayoutTemplate,
    title: "Ich will Vorlagen",
    text: "Starte mit Markdown-Templates für Strategie, Architektur, Research oder Obsidian.",
    href: "/templates",
    cta: "Templates ansehen",
  },
];

const problemItems = [
  {
    title: "Lange Dokumente verlieren Übersicht",
    text: "Headings, Entscheidungen und Abhängigkeiten liegen im Text, aber die räumliche Struktur bleibt verborgen.",
  },
  {
    title: "Visuelle Tools erzeugen neue Silos",
    text: "Viele Mindmap-Apps helfen beim Denken, trennen die Arbeit aber von Git, Editor und bestehendem Markdown.",
  },
  {
    title: "Wissen wandert zu Plattformen",
    text: "Wenn das Format geschlossen ist, wird ein Toolwechsel schnell zu Migration statt zu normaler Weiterarbeit.",
  },
];

const workflowSteps = [
  {
    title: "Datei öffnen",
    text: "Normale .md-Datei auswählen oder hineinziehen.",
    detail: "strategy.md",
    icon: FolderOpen,
  },
  {
    title: "Struktur sehen",
    text: "BloomMD bildet Überschriften und Ebenen als Map ab.",
    detail: "# → Node",
    icon: GitBranch,
  },
  {
    title: "Visuell arbeiten",
    text: "Nodes verschieben, Beziehungen erkennen und Inhalte bearbeiten.",
    detail: "Tab · Enter · ⌘S",
    icon: PenLine,
  },
  {
    title: "Offen weiternutzen",
    text: "Änderungen bleiben in Markdown und funktionieren weiter in bestehenden Tools.",
    detail: "Git · VS Code · Obsidian",
    icon: FileCode2,
  },
];

const useCases = [
  {
    id: "strategy",
    label: "Produktstrategie",
    file: "strategy.md",
    heading: "Ziele, Initiativen und Risiken zusammenführen",
    text: "Verbinde Ziele, Entscheidungen und offene Fragen in einer Map, während die Strategie als lesbares Markdown-Dokument erhalten bleibt.",
    markdown: ["# Strategy", "## Goals", "## Initiatives", "### Retention", "### Launch risk"].join("\n"),
  },
  {
    id: "research",
    label: "Forschung",
    file: "literature-review.md",
    heading: "Quellen und Argumente sichtbar machen",
    text: "Ordne Literatur, Beobachtungen und Hypothesen so, dass du Muster erkennst, ohne deine Notizen in ein geschlossenes System zu verschieben.",
    markdown: ["# Literature Review", "## Sources", "## Claims", "### Open questions", "### Evidence"].join("\n"),
  },
  {
    id: "architecture",
    label: "Softwarearchitektur",
    file: "architecture.md",
    heading: "Systeme, Constraints und Entscheidungen ordnen",
    text: "Halte ADRs, Module und Abhängigkeiten in Markdown fest und nutze die Map, um technische Zusammenhänge schneller zu prüfen.",
    markdown: ["# Architecture", "## Modules", "## ADRs", "### Sync", "### Storage"].join("\n"),
  },
  {
    id: "docs",
    label: "Dokumentation",
    file: "docs-outline.md",
    heading: "Dokumentationsstrukturen planen",
    text: "Baue Guides, Referenzen und Roadmaps visuell um, während die fertige Dokumentation weiter als Markdown bearbeitbar bleibt.",
    markdown: ["# Docs", "## Guides", "## Reference", "### API", "### Tutorials"].join("\n"),
  },
];

const heroPreviewDocument = parseFile("strategy.md", markdownLines.join("\n"));
const roadmapPreviewDocument = parseFile("roadmap.md", ["# Roadmap", "## MVP", "## Pro", "## Sync", "## Docs"].join("\n"));

const templateCards = [
  {
    title: "Software Architecture Map",
    category: "Development",
    href: "/templates/software-architecture",
    text: "Systemziele, Frontend, Backend, Datenbank, Integrationen, Security und Roadmap in einer Map.",
  },
  {
    title: "Startup Operating System",
    category: "Business",
    href: "/templates/startup-operating-system",
    text: "Vision, Produkt, Kunden, Positionierung, Marketing, Sales, Metriken, Entscheidungen und Risiken.",
  },
  {
    title: "Obsidian Vault Starter",
    category: "Knowledge Management",
    href: "/templates/obsidian-vault-starter",
    text: "Inbox, Projekte, Areas, Ressourcen, Personen, Meetings, Ideen und Archiv als startbare Vault-Struktur.",
  },
  {
    title: "Research Project Map",
    category: "Research",
    href: "/templates/research-project",
    text: "Research Question, Hypothesen, Literatur, Methoden, Evidenz, Findings, Quellen und nächste Schritte.",
  },
  {
    title: "Novel Writing Map",
    category: "Writing",
    href: "/templates/novel-writing",
    text: "Premise, Worldbuilding, Characters, Plot, Acts, Chapters, Themes, Conflicts und offene Fragen.",
  },
  {
    title: "Content Strategy Map",
    category: "Marketing",
    href: "/templates/content-strategy",
    text: "Audience, Positioning, Content Pillars, Channels, Campaigns, Produktion, Distribution und Metrics.",
  },
];

const featureModules = [
  {
    title: "Visuelle Markdown-Map",
    text: "Überschriften und Ebenen werden zu einer navigierbaren Struktur, die auch große Dokumente greifbar macht.",
    className: "lg:col-span-2 lg:row-span-2",
    icon: GitBranch,
  },
  {
    title: "Bidirektionales Bearbeiten",
    text: "Struktur visuell formen und Inhalte im Editor präzise bearbeiten.",
    className: "lg:col-span-2",
    icon: PenLine,
  },
  {
    title: "Template Library",
    text: "Mit realistischen Markdown-Vorlagen starten, statt vor einer leeren Fläche zu stehen.",
    className: "",
    icon: LayoutTemplate,
  },
  {
    title: "Local-first-Dateien",
    text: "Markdown bleibt portabel und funktioniert mit deinen bestehenden Workflows.",
    className: "",
    icon: HardDrive,
  },
  {
    title: "Lokale Backups",
    text: "Vor Überschreibungen werden Sicherungen angelegt.",
    className: "",
    icon: ShieldCheck,
  },
  {
    title: "Keyboard-first Workflow",
    text: "Shortcuts für Struktur, Navigation, Speichern und Hilfe.",
    className: "",
    icon: Keyboard,
  },
  {
    title: "No-login Demo",
    text: "Templates und eigene Markdown-Dateien ohne Account direkt im Browser ausprobieren.",
    className: "",
    icon: Presentation,
  },
  {
    title: "Obsidian Companion",
    text: "Obsidian-Notizen als Map visualisieren und bei Bedarf in BloomMD öffnen.",
    className: "",
    icon: RefreshCw,
  },
];

const faqItems = [
  {
    question: "Bleiben meine Dateien normales Markdown?",
    answer: "Ja. BloomMD arbeitet mit offenen Markdown-Dateien und schreibt Änderungen wieder in dieses Format zurück.",
  },
  {
    question: "Muss ich meine Dateien zu BloomMD hochladen?",
    answer: "Nein. Der Kern ist local-first. Cloud-Sync ist als optionales Zusatzmodul gedacht, nicht als Voraussetzung.",
  },
  {
    question: "Funktioniert BloomMD mit Obsidian oder VS Code?",
    answer: "Ja, weil die Dateien weiterhin Markdown bleiben. Du kannst sie auch in Git, VS Code, Obsidian oder jedem Texteditor verwenden.",
  },
  {
    question: "Was passiert, wenn ich BloomMD nicht mehr verwende?",
    answer: "Deine Inhalte bleiben als Markdown-Dateien erhalten. Du verlierst nicht den Zugriff auf dein Wissen, nur weil du das Tool wechselst.",
  },
  {
    question: "Wie lange läuft die Beta?",
    answer: "Demo, Desktop-Builds für macOS und Omarchy/Linux sowie das Obsidian-Plugin sind ohne Einladung verfügbar. Geschlossen ist der Zugang zu BloomMD Web, Cloud, Sync und Zusammenarbeit: Dafür laden wir Tester von der Warteliste ein. Preise veröffentlichen wir erst nach der Beta.",
  },
  {
    question: "Ist Sync erforderlich?",
    answer: "Nein. Sync ist optional und wird separat als Add-on eingeordnet.",
  },
  {
    question: "Wie kann ich Beta-Feedback geben?",
    answer: "Eingeladene Tester melden Feedback nach dem Login direkt in der App mit Screenshot. Wenn Login oder App nicht erreichbar sind, antworte auf deine Beta-Einladung oder schreibe an feedback@bloommd.io. GitHub ist nur unser internes Triage-Ziel.",
  },
  {
    question: "Wo werden Backups gespeichert?",
    answer: "BloomMD legt lokale Sicherungen im Arbeitsbereich an, bevor Dateien überschrieben werden.",
  },
];

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "BloomMD",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web, macOS, Linux",
  description: "BloomMD verwandelt offene Markdown-Dateien in interaktive visuelle Maps. Local-first, portabel und ohne neues Dateiformat.",
};

function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 overflow-x-clip border-b border-[#E8E4DF]/70 bg-[#FFFDFB]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25" aria-label="BloomMD Startseite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="block h-8 w-[144px]">
            <img src="/logo.svg" alt="BloomMD" className="bloommd-logo-light h-8 w-auto" />
            <img src="/logo-dark.svg" alt="" aria-hidden="true" className="bloommd-logo-dark h-8 w-auto" />
          </span>
          <span className="hidden border-l border-[#D4CFC8] pl-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#514C46] xl:inline">
            Markdown Maps
          </span>
        </Link>
        <nav className="hidden items-center rounded-md border border-[#E8E4DF] bg-white/82 p-1 shadow-[0_12px_40px_rgba(26,26,26,0.05)] xl:flex" aria-label="Hauptnavigation">
          {headerNavItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-semibold text-[#68615C] transition hover:bg-[#FFF4EE] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20 xl:px-4"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="hidden shrink-0 items-center gap-3 xl:flex">
          <div className="flex h-9 items-center rounded-md border border-[#E8E4DF] bg-white p-0.5 text-xs font-semibold text-[#68615C]" aria-label="Sprache">
            <span className="rounded bg-[#1A1A1A] px-2.5 py-1.5 text-white" aria-current="page">DE</span>
            <Link href="/en" hrefLang="en" className="rounded px-2.5 py-1.5 hover:bg-[#FFF4EE] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20" aria-label="Switch to English">
              EN
            </Link>
          </div>
          <a href={appLoginUrl} onClick={() => trackPlausibleEvent("login_click")} className="rounded-md px-3 py-2 text-sm font-semibold text-[#68615C] transition hover:bg-[#F2F0ED] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
            Login
          </a>
          <a href="#beta" className="inline-flex h-11 items-center gap-2 rounded-md bg-[#C94317] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(201,67,23,0.18)] transition hover:bg-[#A93612] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
            Beta-Zugang anfragen
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#E8E4DF] bg-white text-[#1A1A1A] transition hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25 xl:hidden"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Navigation schließen" : "Navigation öffnen"}
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div id="mobile-navigation" className="border-t border-[#E8E4DF] bg-[#FFFDFB] px-5 py-5 shadow-[0_24px_60px_rgba(26,26,26,0.08)] xl:hidden">
          <nav className="grid gap-5" aria-label="Mobile Navigation">
            <div className="grid grid-cols-2 gap-2">
              {headerNavItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-[#E8E4DF] bg-white px-3 py-3 text-sm font-semibold text-[#1A1A1A] hover:bg-[#FFF4EE] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="grid gap-2 border-t border-[#E8E4DF] pt-4">
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#999999]">Weitere Themen</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {secondaryNavItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-semibold text-[#68615C] hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <div className="grid gap-2 border-t border-[#E8E4DF] pt-4">
              <div className="flex h-11 items-center rounded-md border border-[#E8E4DF] bg-white p-1 text-xs font-semibold text-[#68615C]" aria-label="Sprache">
                <span className="flex-1 rounded bg-[#1A1A1A] px-3 py-2 text-center text-white" aria-current="page">DE</span>
                <Link href="/en" hrefLang="en" onClick={() => setOpen(false)} className="flex-1 rounded px-3 py-2 text-center hover:bg-[#FFF4EE] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20" aria-label="Switch to English">
                  EN
                </Link>
              </div>
              <a href={appLoginUrl} onClick={() => trackPlausibleEvent("login_click")} className="rounded-md px-3 py-3 text-sm font-semibold text-[#68615C] hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
                Login
              </a>
              <a href="#beta" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#C94317] px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
                Beta-Zugang anfragen
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function HeroProduct() {
  return (
    <div className="relative" id="produkt">
      <div className="overflow-hidden rounded-xl border border-[#E0D9D1] bg-white shadow-[0_30px_90px_rgba(26,26,26,0.12)]">
        <div className="flex h-12 items-center justify-between border-b border-[#E8E4DF] bg-[#FFFDFB] px-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B35]" />
            <span className="text-sm font-semibold">BloomMD Workspace</span>
            <span className="hidden text-xs text-[#777777] sm:inline">/ files / strategy.md</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#777777]">
            <span className="rounded border border-[#E8E4DF] px-2 py-1">?</span>
            <span className="hidden rounded border border-[#E8E4DF] px-2 py-1 sm:inline">⌘S</span>
            <span className="hidden items-center gap-1 rounded-full border border-[#D8E7D3] bg-[#F4FAF1] px-2 py-1 text-[#467642] md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5EA552]" />
              lokal gespeichert
            </span>
          </div>
        </div>
        <div className="grid lg:grid-cols-[190px_minmax(0,1fr)_250px]">
          <div className="max-h-[136px] overflow-hidden border-b border-[#E8E4DF] bg-[#1F1D1B] p-4 text-white lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold">strategy.md</span>
              <span className="rounded border border-white/12 px-2 py-0.5 text-white/54">Quelle</span>
            </div>
            <pre className="whitespace-pre-wrap font-[var(--font-mono)] text-[11px] leading-5 text-white/76">
              {markdownLines.join("\n")}
            </pre>
          </div>
          <MindMapPreview
            document={heroPreviewDocument}
            className="!min-h-[230px] !rounded-none !border-0 sm:!min-h-[320px] lg:!min-h-[360px]"
            ariaLabel="BloomMD Product Strategy Markdown mind map preview"
          />
          <aside className="hidden border-t border-[#E8E4DF] bg-white p-5 md:block lg:border-l lg:border-t-0">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#999999]">Inspector</div>
            <h3 className="text-base font-semibold">North Star</h3>
            <p className="mt-3 text-sm leading-6 text-[#666666]">
              Der ausgewählte Abschnitt bleibt editierbar, während seine Position in der Map sichtbar ist.
            </p>
            <div className="mt-5 grid gap-2 text-sm text-[#555555]">
              {["Markdown bleibt Quelle", "Node ist fokussiert", "Änderung speichert zurück"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <Check size={15} className="text-[#FF6B35]" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AudiencePathSection() {
  return (
    <section className="border-y border-[#E8E4DF] bg-[#FFFDFB]" data-testid="landing-paths">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:py-10">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {audiencePaths.map((path) => {
            const Icon = path.icon;
            return (
              <Link
                key={path.title}
                href={path.href}
                className="group grid min-h-[178px] gap-4 rounded-lg border border-[#E8E4DF] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#FFD4BF] hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#FFF4EE] text-[#B64A1F]">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <h2 className="text-base font-semibold text-[#1A1A1A]">{path.title}</h2>
                </div>
                <p className="text-sm leading-6 text-[#666666]">{path.text}</p>
                <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-[#B64A1F]">
                  {path.cta}
                  <ArrowRight size={15} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WhatIsNewSection() {
  return (
    <section className="border-y border-[#E8E4DF] bg-[#1F1D1B] text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-9 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#FF6B35]/15 text-[#FF9E6E]" aria-hidden="true">
          <Bot size={24} />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#FFB899]">Neu: lokale OpenClaw-Agenten</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Knoten beauftragen. Vorschläge prüfen. Markdown bleibt unter deiner Kontrolle.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/68">Der Agent arbeitet nur auf ausdrücklichen Auftrag und nur mit dem Kontext des gewählten Knotens. Er schlägt vor – du entscheidest.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Link href="/docs/openclaw-agent" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">Agenten-Anleitung <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/blog/openclaw-lokale-workspace-agenten" className="inline-flex h-10 items-center justify-center rounded-md border border-white/18 px-4 text-sm font-semibold text-white hover:bg-white/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20">Was daran neu ist</Link>
        </div>
      </div>
    </section>
  );
}

function SplitDemo() {
  return (
    <section className="border-y border-[#E8E4DF] bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Aus Text wird Raum</p>
          <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">Aus Markdown wird ein navigierbarer Wissensraum.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            Markdown bleibt die Quelle. BloomMD ist die visuelle Ebene, in der du Struktur erkennst und ohne Formatwechsel weiterarbeitest.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-[#E8E4DF] bg-[#1F1D1B] p-5 text-white shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3 text-sm">
              <span className="font-semibold">research-plan.md</span>
              <span className="rounded border border-white/10 px-2 py-1 text-xs text-white/60">Markdown</span>
            </div>
            <pre className="whitespace-pre-wrap font-[var(--font-mono)] text-sm leading-7 text-white/78">
{`# Research Plan

## Core Question
How do local-first tools help writers keep control?

## Sources
- Interviews
- Product notes
- Architecture decisions

## Findings
### Portability
Open files reduce migration pressure.

### Structure
Visual maps reveal relationships faster.`}
            </pre>
          </div>
          <div className="rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] p-4 shadow-sm">
            <video
              className="aspect-video w-full rounded-md border border-[#E8E4DF] bg-white object-cover"
              src="/demo-branch-drag-markdown.webm"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Echte BloomMD-Aufnahme: ein Branch wird gezogen und die Markdown-Struktur aktualisiert sich."
              data-testid="branch-drag-demo-video"
            />
            <div className="mt-4 grid gap-3 text-sm text-[#666666] sm:grid-cols-3">
              {["Echte Aufnahme", "Branch gezogen", "Markdown aktualisiert"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-[#E8E4DF] bg-white px-3 py-2">
                  <Check size={15} className="text-[#FF6B35]" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const [active, setActive] = useState(0);
  const step = workflowSteps[active] ?? workflowSteps[0]!;
  const Icon = step.icon;

  return (
    <section id="workflow" className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
      <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Workflow</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Von der Datei zur arbeitsfähigen Map.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            Keine Migration, kein neues Arbeitsformat. Du öffnest eine Datei, siehst ihre Struktur und nutzt sie weiter.
          </p>
        </div>
        <div>
          <div className="grid gap-3 md:grid-cols-4">
            {workflowSteps.map((item, index) => {
              const StepIcon = item.icon;
              const selected = active === index;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setActive(index)}
                  className={`rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20 ${
                    selected ? "border-[#FF6B35] bg-[#FFF4EE]" : "border-[#E8E4DF] bg-white hover:bg-[#FCFBFA]"
                  }`}
                  aria-pressed={selected}
                >
                  <StepIcon size={20} className="mb-3 text-[#FF6B35]" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[#666666]">{item.text}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg border border-[#E8E4DF] bg-white p-5">
            <div className="flex flex-col gap-5 md:flex-row md:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[#FFD4BF] bg-[#FFF4EE] text-[#FF6B35]">
                <Icon size={28} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#999999]">Schritt {active + 1}</div>
                <h3 className="mt-1 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 leading-7 text-[#666666]">{step.text}</p>
              </div>
              <div className="rounded-md border border-[#E8E4DF] bg-[#FCFBFA] px-4 py-3 font-[var(--font-mono)] text-sm text-[#555555]">
                {step.detail}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function UseCasesSection() {
  const [activeId, setActiveId] = useState(useCases[0]!.id);
  const active = useCases.find((item) => item.id === activeId) ?? useCases[0]!;
  const previewDocument = useMemo(() => parseFile(active.file, active.markdown), [active.file, active.markdown]);

  return (
    <section className="border-y border-[#E8E4DF] bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Use Cases</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Für Wissen, das zu komplex für eine lineare Liste wird.</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-[290px_1fr]">
          <div className="grid gap-2" role="tablist" aria-label="Anwendungsfälle">
            {useCases.map((item) => (
              <button
                key={item.id}
                id={`usecase-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={active.id === item.id}
                aria-controls={`usecase-panel-${item.id}`}
                onClick={() => setActiveId(item.id)}
                className={`rounded-md border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20 ${
                  active.id === item.id ? "border-[#FF6B35] bg-[#FFF4EE] text-[#1A1A1A]" : "border-[#E8E4DF] bg-[#FCFBFA] text-[#666666] hover:bg-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            id={`usecase-panel-${active.id}`}
            role="tabpanel"
            aria-labelledby={`usecase-tab-${active.id}`}
            className="grid gap-4 rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] p-4 lg:grid-cols-[0.8fr_1.2fr]"
          >
            <div className="rounded-md border border-[#E8E4DF] bg-[#1F1D1B] p-4 text-white">
              <div className="mb-3 text-sm font-semibold">{active.file}</div>
              <pre className="whitespace-pre-wrap font-[var(--font-mono)] text-sm leading-7 text-white/78">{active.markdown}</pre>
            </div>
            <div>
              <MindMapPreview document={previewDocument} className="min-h-[250px]" ariaLabel={`${active.label} Markdown mind map preview`} />
              <h3 className="mt-4 text-xl font-semibold">{active.heading}</h3>
              <p className="mt-2 leading-7 text-[#666666]">{active.text}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TemplatesSection() {
  return (
    <section id="templates" className="bg-[#FFFDFB]">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Template Library</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">Nicht mit einer leeren Map starten.</h2>
            <p className="mt-4 text-lg leading-8 text-[#666666]">
              Die ersten Templates sind echte Markdown-Dateien mit Beispielinhalten. Sie funktionieren als Onboarding, Demo, SEO-Seiten und Startpunkte für eigene Dateien.
            </p>
          </div>
          <Link href="/templates" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white hover:bg-[#333333] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A1A1A]/20">
            Alle Templates
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templateCards.map((template) => (
            <article key={template.href} className="rounded-lg border border-[#E8E4DF] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-md border border-[#FFD4BF] bg-[#FFF4EE] px-2.5 py-1 text-xs font-semibold text-[#B64A1F]">{template.category}</span>
                <LayoutTemplate size={18} className="text-[#FF6B35]" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold">{template.title}</h3>
              <p className="mt-2 min-h-[72px] text-sm leading-6 text-[#666666]">{template.text}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/demo?template=${template.href.split("/").pop()}`} className="inline-flex h-9 items-center justify-center rounded-md bg-[#FF6B35] px-3 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25">
                  Open in BloomMD
                </Link>
                <Link href={template.href} className="inline-flex h-9 items-center justify-center rounded-md border border-[#D4CFC8] px-3 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
                  Vorschau
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ObsidianSection() {
  return (
    <section id="obsidian" className="border-y border-[#E8E4DF] bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Obsidian-Kompatibilität</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Obsidian-Notizen als BloomMD-Maps prüfen.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            Das Plugin ist für Obsidian auf Desktop, iPad, iPhone und Android als Beta über BRAT oder GitHub-Releases verfügbar. Die Aufnahme zeigt eine echte lokale Notiz.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/obsidian" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25">
              Status ansehen
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="https://github.com/moellenbeck-digital/bloommd-obsidian" className="inline-flex h-11 items-center justify-center rounded-md border border-[#D4CFC8] px-4 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
              Plugin-Repository
            </a>
          </div>
        </div>
        <div>
          <video
            className="aspect-video w-full rounded-md border border-[#E8E4DF] bg-[#1F1D1B] object-cover"
            src="/demo-obsidian-note-map.webm"
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            aria-label="Echte Obsidian-Desktop-Aufnahme: eine lokale Markdown-Notiz wird als BloomMD-Map visualisiert."
            data-testid="obsidian-note-map-demo-video"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {["Echte Aufnahme", "Lokale Obsidian-Notiz", "BloomMD-Map"].map((item) => (
              <span key={item} className="rounded-md border border-[#E8E4DF] bg-[#FCFBFA] px-3 py-1 text-xs font-semibold text-[#666666]">{item}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LocalFirstSection() {
  return (
    <section id="local-first" className="bg-[#1F1D1B] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#FFB088]">Local-first</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Dein Wissen gehört nicht in eine Plattform. Es gehört dir.</h2>
          <p className="mt-5 text-lg leading-8 text-white/72">
            BloomMD startet bei deinen Dateien. Lokales Arbeiten ist der Standard, Sync bleibt optional, und offenes Markdown verhindert unnötige Abhängigkeit.
          </p>
        </div>
        <div className="rounded-xl border border-white/12 bg-white/[0.04] p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            {[
              { icon: FileText, title: "Lokale .md-Datei", text: "unter deiner Kontrolle" },
              { icon: Layers3, title: "BloomMD Workspace", text: "visuelle Ebene" },
              { icon: MonitorSmartphone, title: "Kompatible Tools", text: "Git, VS Code, Obsidian" },
            ].map((item, index) => (
              <div key={item.title} className="rounded-lg border border-white/12 bg-[#2A2724] p-4">
                <item.icon size={24} className="mb-4 text-[#FF8A5C]" aria-hidden="true" />
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-white/60">{item.text}</p>
                {index === 1 && <p className="mt-3 rounded-md bg-white/6 px-3 py-2 text-xs text-white/68">Optionaler Sync kann später ergänzt werden.</p>}
              </div>
            )).flatMap((node, index, arr) => (index < arr.length - 1 ? [node, <MoveRight key={`arrow-${index}`} className="hidden text-white/30 md:block" aria-hidden="true" />] : [node]))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureBento() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
      <div className="mb-8 max-w-3xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Feature-Architektur</p>
        <h2 className="text-3xl font-semibold sm:text-4xl">Ein Workspace für Struktur, nicht nur eine weitere Zeichenfläche.</h2>
      </div>
      <div className="grid auto-rows-fr gap-4 lg:grid-cols-4">
        {featureModules.map((feature) => (
          <article key={feature.title} className={`rounded-lg border border-[#E8E4DF] bg-white p-5 shadow-sm ${feature.className}`}>
            <feature.icon size={24} className="mb-4 text-[#FF6B35]" aria-hidden="true" />
            <h3 className="text-lg font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#666666]">{feature.text}</p>
            {feature.title === "Visuelle Markdown-Map" && (
              <div className="mt-6">
                <MindMapPreview document={roadmapPreviewDocument} className="min-h-[250px]" ariaLabel="Roadmap Markdown mind map preview" />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DesktopSection() {
  const reasons = [
    {
      icon: HardDrive,
      title: "Deine Dateien, dein Rechner",
      text: "Die App arbeitet direkt auf einem Ordner auf deiner Platte. Kein Upload, kein Account, kein Netz — auch nicht im Hintergrund.",
    },
    {
      icon: RefreshCw,
      title: "Änderungen von außen kommen an",
      text: "Bearbeitest du dieselbe Datei in Obsidian, VS Code oder per Git-Pull, sieht die App das sofort. Der Browser kann das nicht.",
    },
    {
      icon: FileCode2,
      title: "Markdown-Dateien direkt öffnen",
      text: "Doppelklick auf eine .md-Datei öffnet sie als Map. BloomMD registriert sich als Editor für Markdown.",
    },
  ];

  return (
    <section id="desktop" className="border-y border-[#E8E4DF] bg-[#1F1D1B] text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#FFB899]">Desktop-Beta</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Für echte Arbeit gehört BloomMD auf den Rechner.</h2>
          <p className="mt-4 text-lg leading-8 text-white/70">
            Die Browser-Demo ist zum Anschauen da. Wer mit eigenen Notizen arbeitet, lädt die Desktop-App —
            für macOS oder Omarchy/Linux — und arbeitet direkt auf den eigenen Dateien statt auf Kopien.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {reasons.map((reason) => (
            <div key={reason.title} className="rounded-xl border border-white/12 bg-white/5 p-6">
              <reason.icon size={20} className="text-[#FF9E6E]" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">{reason.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">{reason.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-xl border border-white/12 bg-white/5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">macOS und Omarchy/Linux: lokale Beta ohne Einladung</p>
            <p className="mt-1 text-sm leading-6 text-white/70">
              macOS arm64 sowie Omarchy/Linux für x86_64 und aarch64 sind als lokale Beta-Builds verfügbar.
              Windows folgt als eigener Beta-Release.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link href="/download" className="inline-flex h-11 items-center justify-center rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F]">
              Desktop-Builds herunterladen
            </Link>
            <a href="#beta" className="inline-flex h-11 items-center justify-center rounded-md border border-white/18 px-5 text-sm font-semibold text-white hover:bg-white/8">
              Cloud-Zugang anfragen
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function WikiSection() {
  const layers = [
    {
      icon: FolderOpen,
      title: "Quellen",
      text: "Originale bleiben unverändert liegen — Notizen, PDFs, Webseiten, Exporte. BloomMD merkt sich einen Hash pro Quelle.",
    },
    {
      icon: GitBranch,
      title: "Wiki",
      text: "Daraus entstehen verlinkte Markdown-Konzeptseiten. Genau das ist die Ebene, die du als Map siehst und bearbeitest.",
    },
    {
      icon: ShieldCheck,
      title: "Schema",
      text: "Deine Konventionen bestimmen, was ein Agent überhaupt anfassen darf. Jede Änderung ist ein Markdown-Diff mit Freigabe.",
    },
  ];

  return (
    <section id="llm-wiki" className="border-y border-[#E8E4DF] bg-[#FFFDFB]">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">LLM Wiki · Open Knowledge Format</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Wissen, das ein Agent pflegen darf — aber nur mit deiner Freigabe.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            BloomMD schreibt und liest das <strong className="font-semibold text-[#1A1A1A]">Open Knowledge Format</strong> (OKF v0.2),
            Googles offene Markdown-Spezifikation für Agenten-Wissen. Kein proprietärer Index, keine versteckte Modell-Erinnerung:
            eine Ordnerstruktur aus Markdown-Dateien, die du selbst verwaltest und jederzeit in deinen gewohnten Werkzeugen öffnest.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {layers.map((layer, index) => (
            <div key={layer.title} className="rounded-xl border border-[#E8E4DF] bg-white p-6">
              <div className="flex items-center gap-3">
                <layer.icon size={20} className="text-[#FF6B35]" aria-hidden="true" />
                <span className="font-mono text-xs text-[#666666]">0{index + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{layer.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#666666]">{layer.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-xl border border-[#E8E4DF] bg-white p-6">
            <h3 className="text-lg font-semibold">Jede Seite sagt, wie sehr du ihr trauen kannst</h3>
            <p className="mt-2 text-sm leading-6 text-[#666666]">
              OKF v0.2 bringt Vertrauenssignale direkt ins Frontmatter. BloomMD wertet sie aus und zeigt sie an,
              statt sie zu verstecken.
            </p>
            <ul className="mt-5 grid gap-3 text-sm leading-6 text-[#666666]">
              {[
                ["Woher", "sources mit Ressource, Autor und Quell-Hash"],
                ["Von wem", "generated (Agent) und verified (Mensch)"],
                ["Noch gültig?", "status und stale_after je Seite"],
                ["Abgedriftet?", "Quell-Hash-Vergleich meldet veraltete Seiten"],
              ].map(([label, value]) => (
                <li key={label} className="flex flex-col gap-0.5 border-l-2 border-[#FFD4BF] pl-4 sm:flex-row sm:gap-3">
                  <span className="w-28 shrink-0 font-semibold text-[#1A1A1A]">{label}</span>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[#1F1D1B] bg-[#1F1D1B] p-6 text-white">
            <p className="text-sm font-semibold text-[#FFB08E]">Für jeden BloomMD-Workspace</p>
            <h3 className="mt-2 text-lg font-semibold">Vorschlag statt direkter Änderung</h3>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Ein Agent schlägt vor. BloomMD prüft die Quell-Hashes, rendert den Markdown-Diff und schreibt erst nach
              namentlicher Freigabe — mit Eintrag im Audit-Log.
            </p>
            <p className="mt-4 text-sm leading-6 text-white/70">
              Das funktioniert über BloomMD und OpenClaw ohne Bun, Terminal oder Zugriff auf einen Quellcode-Checkout.
            </p>
            <Link href="/docs/okf-wiki" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/25 px-4 text-sm font-semibold text-white transition hover:border-[#FF8B5C] hover:text-[#FFB08E]">
              Mehr über OKF und LLM-Wiki <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <p className="mt-4 text-xs leading-5 text-white/50">
              Technische CLI- und MCP-Werkzeuge sind optional und richten sich an Teams, die eine eigene LLM-Wiki betreiben.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BetaProgramSection() {
  return (
    <section id="pricing" className="border-y border-[#E8E4DF] bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Geschlossene Beta</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Kostenlos — und bewusst noch klein.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            Demo und Templates kannst du sofort ausprobieren. Desktop-Builds und das Obsidian-Plugin
            kannst du ohne Einladung laden. Nur BloomMD Web mit Cloud-Workspaces, Sync und Zusammenarbeit
            geben wir in kleinen Gruppen frei, damit wir Rückmeldungen beantworten können.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {[
            {
              icon: Check,
              title: "Was du bekommst",
              items: [
                "Voller Funktionsumfang ohne Limits",
                "Demo und Templates ohne Einladung",
                "Web, macOS-, Omarchy/Linux-Desktop und Obsidian-Kompatibilität",
                "LLM-Wiki-Werkzeuge und OKF-Bundles",
                "Direkter Draht zu uns bei Bugs und Wünschen",
              ],
            },
            {
              icon: ShieldCheck,
              title: "Was wir zusagen",
              items: [
                "Deine Dateien bleiben normales Markdown",
                "Kein Verkauf oder Training mit deinen Inhalten",
                "Export und Löschung jederzeit möglich",
                "Preise kündigen wir vorher an, nicht rückwirkend",
              ],
            },
            {
              icon: RefreshCw,
              title: "Was noch fehlt",
              items: [
                "Cloud-Zugang nur auf Einladung",
                "Die eigenständige Mobile-App und Windows-Desktop sind noch nicht öffentlich verfügbar",
                "Der Agent-Workflow ist bewusst review-pflichtig",
                "Rechne mit Bugs — und melde sie uns",
              ],
            },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-[#E8E4DF] bg-[#FCFBFA] p-6">
              <card.icon size={20} className="text-[#B64A1F]" />
              <h3 className="mt-4 text-lg font-semibold">{card.title}</h3>
              <ul className="mt-4 grid gap-2.5 text-sm leading-6 text-[#666666]">
                {card.items.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#FF6B35]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-3xl text-sm leading-6 text-[#666666]">
          Nach der Beta wird es eine kostenlose Stufe für lokales Arbeiten geben und eine bezahlte für Cloud- und
          Team-Funktionen. Beta-Teilnehmer informieren wir vorher und rechnen nichts rückwirkend ab. Wenn du
          zur geschlossenen Beta dazu willst, melde dich — wir laden in kleinen Gruppen ein.
        </p>
      </div>
    </section>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="mx-auto max-w-4xl px-5 py-16 lg:py-20">
      <div className="mb-8 text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">FAQ</p>
        <h2 className="text-3xl font-semibold sm:text-4xl">Kurze Antworten zu Dateien, Sync und Lizenz.</h2>
      </div>
      <div className="divide-y divide-[#E8E4DF] rounded-xl border border-[#E8E4DF] bg-white">
        {faqItems.map((item, index) => {
          const open = openIndex === index;
          return (
            <div key={item.question}>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? -1 : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#FF6B35]/20"
                aria-expanded={open}
              >
                {item.question}
                <ChevronDown className={`shrink-0 text-[#999999] transition ${open ? "rotate-180" : ""}`} size={18} aria-hidden="true" />
              </button>
              {open && <p className="px-5 pb-5 leading-7 text-[#666666]">{item.answer}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F8F5F0] text-[#1A1A1A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <Header />
      <section className="relative bg-[#FFFDFB] motion-safe:animate-[sectionIn_.45s_ease-out_both]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#FFD4BF] bg-[#FFF4EE] px-3 py-1 text-sm font-semibold text-[#B64A1F]">
              <Sparkles size={15} aria-hidden="true" />
              Markdown-Dateien · visuelle Maps
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-normal text-[#1A1A1A] sm:text-6xl">
              Markdown-Dateien. Als visuelle Maps.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#555555] sm:text-lg sm:leading-8">
              Öffne eine Markdown-Datei und erkenne ihre Struktur sofort. BloomMD ergänzt eine visuelle
              Ebene — lokal, portabel und ohne neues Dateiformat.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" onClick={() => trackPlausibleEvent("demo_click")} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white transition hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
                Demo ohne Account testen
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#beta" className="inline-flex h-12 items-center justify-center rounded-md border border-[#D4CFC8] bg-white px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
                Beta-Zugang anfragen
              </a>
            </div>
            <p className="mt-5 text-sm font-medium text-[#666666]">Normales Markdown · lokale Dateien · macOS und Omarchy/Linux</p>
          </div>
          <HeroProduct />
        </div>
      </section>

      <section id="produkt-demo">
        <SplitDemo />
      </section>

      <AudiencePathSection />
      <WhatIsNewSection />

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 motion-safe:animate-[sectionIn_.45s_ease-out_both] lg:grid-cols-[0.75fr_1.25fr] lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Positionierung</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Markdown ist offen und langlebig. Aber große Dokumente sind schwer zu überblicken.</h2>
          <p className="mt-5 text-lg leading-8 text-[#666666]">
            BloomMD behält die offene Datei und ergänzt genau die räumliche Sicht, die linearem Text fehlt.
          </p>
        </div>
        <div className="grid gap-4">
          {problemItems.map((item, index) => (
            <article key={item.title} className="grid gap-4 rounded-lg border border-[#E8E4DF] bg-white p-5 shadow-sm sm:grid-cols-[44px_1fr]">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4EE] text-sm font-semibold text-[#B64A1F]">{index + 1}</div>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#666666]">{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <WorkflowSection />
      <UseCasesSection />
      <TemplatesSection />
      <ObsidianSection />
      <DesktopSection />
      <LocalFirstSection />
      <WikiSection />
      <FeatureBento />
      <BetaProgramSection />
      <AvailabilityOverview locale="de" />

      <section className="border-y border-[#E8E4DF] bg-[#FFFDFB]">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-10 md:grid-cols-4">
          {[
            { icon: FileText, label: "Offene Markdown-Dateien" },
            { icon: HardDrive, label: "Lokale Speicherung" },
            { icon: Code2, label: "Git- und Editor-kompatibel" },
            { icon: ShieldCheck, label: "Lokale Backups" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-lg border border-[#E8E4DF] bg-white p-4">
              <item.icon size={20} className="text-[#FF6B35]" aria-hidden="true" />
              <span className="text-sm font-semibold">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[#E8E4DF] bg-[#FFF4EE]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-14 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Jetzt testen</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">Demo sofort. Beta auf Einladung.</h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[#666666]">Demo, macOS- und Omarchy/Linux-Desktop sowie das Obsidian-Plugin kannst du ohne Einladung nutzen. Die geschlossene Beta betrifft BloomMD Web, Cloud, Sync und Zusammenarbeit.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link href="/demo" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F]">Demo testen <ArrowRight size={16} /></Link>
            <Link href="/download" className="inline-flex h-11 items-center justify-center rounded-md border border-[#D4CFC8] bg-white px-5 text-sm font-semibold hover:bg-[#F2F0ED]">Desktop herunterladen</Link>
            <Link href="/obsidian" className="inline-flex h-11 items-center justify-center rounded-md border border-[#D4CFC8] bg-white px-5 text-sm font-semibold hover:bg-[#F2F0ED]">Obsidian-Status</Link>
          </div>
        </div>
      </section>
      <FAQSection />

      {/* Waitlist: the cloud app is invitation only, so the honest ask is an address, not a signup. */}
      <section id="beta" className="scroll-mt-24 border-t border-[#E8E4DF] bg-[#FAF8F5]">
        <div className="mx-auto max-w-7xl px-5 py-14">
          <h2 className="text-3xl font-semibold text-[#1A1A1A]">Die Cloud-App läuft als geschlossene Beta</h2>
          <p className="mt-3 max-w-2xl text-[#514C46]">
            Nur für BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit laden wir in kleinen Gruppen ein.
            Trag dich ein; die Warteliste ist noch kein Konto. Demo, lokale Desktop-Builds und das
            Obsidian-Plugin sind ohne Einladung nutzbar.
          </p>
          <div className="mt-6">
            <WaitlistForm source="landing" />
          </div>
        </div>
      </section>

      <section className="border-t border-[#E8E4DF] bg-[#1F1D1B] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold">Deine Dateien sind bereits da. BloomMD macht sie sichtbar.</h2>
            <p className="mt-3 text-white/68">Starte mit einem Template oder teste eine echte Markdown-Datei direkt im Browser.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
              Demo öffnen
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="/templates" className="inline-flex h-12 items-center justify-center rounded-md border border-white/18 px-5 text-sm font-semibold text-white hover:bg-white/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20">
              Templates ansehen
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#171513] text-white">
        <div className="mx-auto max-w-7xl border-t border-white/10 px-5 py-10">
          <div className="grid gap-10 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,2.1fr)]">
            <div className="max-w-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-dark.svg" alt="BloomMD" className="h-8" />
              <p className="mt-4 text-sm leading-6 text-white/56">Markdown-Dateien. Als visuelle Maps.</p>
              <p className="mt-3 text-xs leading-5 text-white/48">
                BloomMD wird von{" "}
                <a href="https://moellenbeck-digital.io/" className="font-semibold text-white/72 hover:text-white hover:underline">
                  moellenbeck-digital.io
                </a>{" "}
                zur Verfügung gestellt.
              </p>
              <p className="mt-5 inline-flex rounded-full border border-white/12 px-3 py-1 text-xs font-medium text-white/58">
                Closed Beta · macOS + Omarchy/Linux
              </p>
            </div>

            <nav className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4" aria-label="Footer Navigation">
              {footerSections.map((section) => (
                <div key={section.title}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/72">{section.title}</h2>
                  <ul className="mt-4 space-y-2.5">
                    {section.links.map((item) => {
                      const className = "inline-flex rounded py-0.5 text-sm text-white/66 transition hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20";
                      if (item.href.startsWith("http")) {
                        return (
                          <li key={item.href}>
                            <a href={item.href} className={className}>
                              {item.label}
                            </a>
                          </li>
                        );
                      }
                      if (item.href.startsWith("#")) {
                        return (
                          <li key={item.href}>
                            <a href={item.href} className={className}>
                              {item.label}
                            </a>
                          </li>
                        );
                      }
                      return (
                        <li key={item.href}>
                          <Link href={item.href} className={className}>
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-white/68 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © 2026 BloomMD. Ein Produkt von{" "}
              <a href="https://moellenbeck-digital.io/" className="font-semibold text-white/72 hover:text-white hover:underline">
                moellenbeck-digital.io
              </a>.
            </p>
            <p>
              Marketing: bloommd.io · App: bloommd.app · <span data-testid="marketing-build-version">Marketing-Version: {marketingBuildInfo.version}{marketingBuildInfo.shortSha ? ` (${marketingBuildInfo.shortSha})` : ""}</span>
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
