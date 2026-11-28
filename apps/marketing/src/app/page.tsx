"use client";

import { useState } from "react";
import Link from "next/link";
import { parseFile } from "@bloommd/core/browser";
import { MindMapPreview } from "@bloommd/ui";
import { AvailabilityOverview } from "../components/availability-overview";
import { AgentWorkflowSection } from "../components/agent-workflow-section";
import { KnowledgeVisionSection } from "../components/knowledge-vision-section";
import { bmdFonts } from "../components/v2/fonts";
import headerStyles from "../components/v2/header.module.css";
import { HeroIntro } from "../components/v2/hero-intro";
import { HeroTrieb } from "../components/v2/hero-trieb";
import { SplitDemo } from "../components/v2/split-demo";
import { UseCaseTrieb } from "../components/v2/use-case-trieb";
import tokens from "../components/v2/tokens.module.css";
import { getBuildInfo } from "../lib/build-info";
import { publicAppUrl } from "../lib/deployment";
import { trackPlausibleEvent } from "../lib/plausible";
import {
  ArrowRight,
  Bot,
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
  X,
} from "lucide-react";

const headerNavItems = [
  { label: "Produkt", href: "#produkt" },
  { label: "Demo", href: "/demo" },
  { label: "Agenten", href: "#agenten" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Download", href: "/download" },
  { label: "Testaccount", href: "#beta" },
  { label: "Hilfe", href: "/docs" },
];

const secondaryNavItems = [
  { label: "Blog", href: "/blog" },
  { label: "News", href: "/news" },
  { label: "Templates", href: "/templates" },
  { label: "Obsidian", href: "/obsidian" },
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
const appSignupUrl = `${publicAppUrl()}/signup`;
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
      { label: "Desktop", href: "/download" },
      { label: "Obsidian", href: "/obsidian" },
      { label: "Agenten", href: "#agenten" },
      { label: "Wissensplattform", href: "#vision" },
    ],
  },
  {
    title: "Testaccount",
    links: [
      { label: "Registrierung", href: "#beta" },
      { label: "Login", href: appLoginUrl },
    ],
  },
  {
    title: "Recht",
    links: legalLinks,
  },
];

const markdownLines = [
  "# Produktstrategie",
  "## Leitbild",
  "- Visuell mit echten Dateien arbeiten",
  "- Offenes Markdown-Format",
  "",
  "## Initiativen",
  "### Lokaler Editor",
  "### Zusammenarbeit",
  "### Optionaler Sync",
];

const audiencePaths = [
  {
    icon: FileText,
    title: "Lokal ausprobieren",
    text: "Teste eine Markdown-Datei im Browser. Die Desktop-Beta gibt es für macOS und Omarchy/Linux.",
    href: "/demo",
    cta: "Demo ohne Konto testen",
  },
  {
    icon: MonitorSmartphone,
    title: "Web und Team nutzen",
    text: "Teste Web-Workspaces, Sync und Zusammenarbeit 30 Tage kostenlos ab E-Mail-Bestätigung.",
    href: "#beta",
    cta: "Testaccount erstellen",
  },
  {
    icon: GitBranch,
    title: "Richtung mitgestalten",
    text: "Sieh dir den Stand der Wissensplattform-Roadmap an und teile deine Idee.",
    href: "/roadmap",
    cta: "Roadmap ansehen",
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
    file: "strategie.md",
    heading: "Ziele, Initiativen und Risiken zusammenführen",
    text: "Verbinde Ziele, Entscheidungen und offene Fragen in einer Map, während die Strategie als lesbares Markdown-Dokument erhalten bleibt.",
    markdown: ["# Strategie", "## Ziele", "## Initiativen", "### Kundenbindung", "### Startrisiko"].join("\n"),
  },
  {
    id: "research",
    label: "Forschung",
    file: "literaturrecherche.md",
    heading: "Quellen und Argumente sichtbar machen",
    text: "Ordne Literatur, Beobachtungen und Hypothesen so, dass du Muster erkennst, ohne deine Notizen in ein geschlossenes System zu verschieben.",
    markdown: ["# Literaturrecherche", "## Quellen", "## Aussagen", "### Offene Fragen", "### Belege"].join("\n"),
  },
  {
    id: "architecture",
    label: "Softwarearchitektur",
    file: "architektur.md",
    heading: "Systeme, Constraints und Entscheidungen ordnen",
    text: "Halte ADRs, Module und Abhängigkeiten in Markdown fest und nutze die Map, um technische Zusammenhänge schneller zu prüfen.",
    markdown: ["# Architektur", "## Module", "## Entscheidungen", "### Sync", "### Speicherung"].join("\n"),
  },
  {
    id: "docs",
    label: "Dokumentation",
    file: "dokumentation.md",
    heading: "Dokumentationsstrukturen planen",
    text: "Baue Guides, Referenzen und Roadmaps visuell um, während die fertige Dokumentation weiter als Markdown bearbeitbar bleibt.",
    markdown: ["# Dokumentation", "## Anleitungen", "## Referenz", "### API", "### Beispiele"].join("\n"),
  },
];

const roadmapPreviewDocument = parseFile("roadmap.md", ["# Roadmap", "## Produktkern", "## Zusammenarbeit", "## Sync", "## Dokumentation"].join("\n"));

const templateCards = [
  {
    title: "Software-Architektur-Map",
    category: "Entwicklung",
    href: "/templates/software-architecture",
    text: "Systemziele, Frontend, Backend, Datenbank, Integrationen, Sicherheit und Roadmap in einer Map.",
  },
  {
    title: "Startup-Betriebssystem",
    category: "Geschäft",
    href: "/templates/startup-operating-system",
    text: "Vision, Produkt, Kunden, Positionierung, Marketing, Vertrieb, Metriken und Entscheidungen.",
  },
  {
    title: "Obsidian-Vault-Starter",
    category: "Wissensmanagement",
    href: "/templates/obsidian-vault-starter",
    text: "Posteingang, Projekte, Bereiche, Ressourcen, Personen, Treffen, Ideen und Archiv als Vault-Struktur.",
  },
  {
    title: "Forschungsprojekt-Map",
    category: "Forschung",
    href: "/templates/research-project",
    text: "Forschungsfrage, Hypothesen, Literatur, Methoden, Belege, Ergebnisse und nächste Schritte.",
  },
  {
    title: "Roman-Map",
    category: "Schreiben",
    href: "/templates/novel-writing",
    text: "Prämisse, Welt, Figuren, Handlung, Akte, Kapitel, Themen und offene Fragen.",
  },
  {
    title: "Content-Strategie-Map",
    category: "Marketing",
    href: "/templates/content-strategy",
    text: "Zielgruppe, Positionierung, Themen, Kanäle, Kampagnen, Produktion und Metriken.",
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
    title: "Vorlagenbibliothek",
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
    question: "Wie lange gilt der kostenlose Testaccount?",
    answer: "Der kostenlose Testaccount für BloomMD Web, Cloud, Sync und Zusammenarbeit gilt 30 Tage ab E-Mail-Bestätigung, ohne Einladung und ohne Warteliste. Nach 15 und 23 Tagen erinnern wir dich per E-Mail. Danach ist dein Konto nur noch lesbar, der Export bleibt möglich und nichts geht verloren. Für bestehende Konten zählt der Testzeitraum ab dem 15.11.2026 und dauert 60 Tage (bis 14.01.2027). Demo, Desktop-Builds für macOS und Omarchy/Linux sowie das Obsidian-Plugin (Beta) sind ohne Konto verfügbar. Preise und Leistungsumfang werden vor Einführung veröffentlicht.",
  },
  {
    question: "Ist Sync erforderlich?",
    answer: "Nein. Sync ist optional und wird separat als Add-on eingeordnet.",
  },
  {
    question: "Wie kann ich Beta-Feedback geben?",
    answer: "Angemeldete Tester melden Feedback direkt in der App mit Screenshot. Wenn Login oder App nicht erreichbar sind, schreibe an feedback@bloommd.io. GitHub ist nur unser internes Triage-Ziel.",
  },
  {
    question: "Wo werden Backups gespeichert?",
    answer: "BloomMD legt lokale Sicherungen im Arbeitsbereich an, bevor Dateien überschrieben werden.",
  },
];

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
    "@id": "https://bloommd.io/#software",
    url: "https://bloommd.io/",
  name: "BloomMD",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web, macOS, Linux, iOS, Android",
  description: "BloomMD verwandelt offene Markdown-Dateien in interaktive visuelle Maps, ohne ein neues Dateiformat einzuführen. Local-first, portabel und als Beta verfügbar.",
};

function Header() {
  const [open, setOpen] = useState(false);
  const language = (onClick?: () => void) => (
    <div className={headerStyles.lang} aria-label="Sprache">
      <span aria-current="page">DE</span>
      <Link href="/en" hrefLang="en" onClick={onClick} aria-label="Switch to English">
        EN
      </Link>
    </div>
  );

  return (
    <header className={`${tokens.ground} ${bmdFonts} ${headerStyles.header}`}>
      <div className={headerStyles.bar}>
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3" aria-label="BloomMD Startseite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="block h-8 w-[144px]">
            <img src="/logo.svg" alt="BloomMD" className="bloommd-logo-light h-8 w-auto" />
            <img src="/logo-dark.svg" alt="" aria-hidden="true" className="bloommd-logo-dark h-8 w-auto" />
          </span>
          <span className={headerStyles.claim}>Markdown Maps</span>
        </Link>
        <nav className={headerStyles.nav} aria-label="Hauptnavigation">
          {headerNavItems.map((item) => (
            <a key={item.href} href={item.href} className={headerStyles.link}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className={headerStyles.tools}>
          {language()}
          <a href={appLoginUrl} onClick={() => trackPlausibleEvent("login_click")} className={headerStyles.link}>
            Login
          </a>
          <a href={appSignupUrl} className={tokens.primary}>
            Jetzt registrieren
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={headerStyles.toggle}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Navigation schließen" : "Navigation öffnen"}
        >
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div id="mobile-navigation" className={headerStyles.menu}>
          <nav aria-label="Mobile Navigation">
            <div className={headerStyles.menuMain}>
              {headerNavItems.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              ))}
            </div>
            <div className={headerStyles.menuGroup}>
              <p className={headerStyles.menuHead}>Weitere Themen</p>
              <div className={headerStyles.menuTwo}>
                {secondaryNavItems.map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setOpen(false)} className={headerStyles.link}>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <div className={headerStyles.menuGroup}>
              {language(() => setOpen(false))}
              <a href={appLoginUrl} onClick={() => trackPlausibleEvent("login_click")} className={headerStyles.link}>
                Login
              </a>
              <a href={appSignupUrl} className={tokens.primary}>
                Jetzt registrieren
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function AudiencePathSection() {
  return (
    <section className="border-y border-[#E8E4DF] bg-[#FFFDFB]" data-testid="landing-paths">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:py-10">
        <div className="grid gap-3 md:grid-cols-3">
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
          <Link href="/docs/openclaw-agent" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#B94316] px-4 text-sm font-semibold text-white hover:bg-[#963311] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">Agenten-Anleitung <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/blog/openclaw-lokale-workspace-agenten" className="inline-flex h-10 items-center justify-center rounded-md border border-white/18 px-4 text-sm font-semibold text-white hover:bg-white/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20">Was daran neu ist</Link>
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

function TemplatesSection() {
  return (
    <section id="templates" className="bg-[#FFFDFB]">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Vorlagen</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">Nicht mit einer leeren Map starten.</h2>
            <p className="mt-4 text-lg leading-8 text-[#666666]">
              Jede Vorlage ist eine normale Markdown-Datei. Öffne sie als Map und ersetze die Beispielinhalte durch deine eigenen.
            </p>
          </div>
          <Link href="/templates" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white hover:bg-[#333333] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A1A1A]/20">
            Alle Templates
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templateCards.slice(0, 3).map((template) => (
            <article key={template.href} className="rounded-lg border border-[#E8E4DF] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-md border border-[#FFD4BF] bg-[#FFF4EE] px-2.5 py-1 text-xs font-semibold text-[#B64A1F]">{template.category}</span>
                <LayoutTemplate size={18} className="text-[#FF6B35]" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold">{template.title}</h3>
              <p className="mt-2 min-h-[72px] text-sm leading-6 text-[#666666]">{template.text}</p>
              <Link href={`/demo?template=${template.href.split("/").pop()}`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#A33D17] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#A33D17]">
                In der Demo öffnen <ArrowRight size={16} aria-hidden="true" />
              </Link>
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
            <Link href="/obsidian" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#B94316] px-4 text-sm font-semibold text-white hover:bg-[#963311] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25">
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
      text: "Die App arbeitet direkt auf einem Ordner auf deiner Platte. Kein Upload, kein Account, kein Netz — auch nicht im Hintergrund. Deine Dateien gehören dir: Alle Exporte (Markdown, OPML, PDF, PNG, SVG) sind für jeden frei.",
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
            <Link href="/download" className="inline-flex h-11 items-center justify-center rounded-md bg-[#B94316] px-5 text-sm font-semibold text-white hover:bg-[#963311]">
              Desktop-Builds herunterladen
            </Link>
            <a href={appSignupUrl} className="inline-flex h-11 items-center justify-center rounded-md border border-white/18 px-5 text-sm font-semibold text-white hover:bg-white/8">
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
          <p className="mt-5 text-sm leading-6 text-[#666666]">
            Unsere <Link href="/roadmap" className="font-semibold text-[#B94316] underline-offset-4 hover:underline">Wissensplattform-Roadmap</Link> zeigt die Richtung von Quellen und Sync über Rechte und belegte Suche bis zu Agenten-Workflows. Der Learnings-Pilot ist der erste interne Backend-Nutzungsfall; lokales Markdown bleibt der Kern.
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
      <HeroTrieb markdown={markdownLines.join("\n")} intro={<HeroIntro onDemo={() => trackPlausibleEvent("demo_click")} />} />

      <section id="produkt-demo">
        <SplitDemo />
      </section>

      <AgentWorkflowSection locale="de" />
      <KnowledgeVisionSection locale="de" />
      <AudiencePathSection />
      <UseCaseTrieb items={useCases} kicker="Anwendungsfälle" title="Für Wissen, das zu komplex für eine lineare Liste wird." />
      <TemplatesSection />
      <AvailabilityOverview locale="de" />
      <FAQSection />

      {/* Registration replaced the waitlist; the #beta anchor stays so old links and CTAs keep working. */}
      <section id="beta" className="scroll-mt-24 border-t border-[#E8E4DF] bg-[#FAF8F5]">
        <div className="mx-auto max-w-7xl px-5 py-14">
          <h2 className="text-3xl font-semibold text-[#1A1A1A]">Jetzt registrieren</h2>
          <p className="mt-3 max-w-2xl text-[#514C46]">
            Für BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit legst du dir einen kostenlosen Testaccount an,
            ohne Einladung und ohne Warteliste. Er gilt 30 Tage ab E-Mail-Bestätigung; nach Ablauf bleibt dein Konto
            lesbar und der Export möglich, nichts geht verloren. Demo, lokale Desktop-Builds und das Obsidian-Plugin
            brauchen kein Konto.
          </p>
          <div className="mt-6">
            <a
              href={appSignupUrl}
              data-testid="signup-cta"
              onClick={() => trackPlausibleEvent("signup_click")}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[#C94317] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(201,67,23,0.18)] transition hover:bg-[#A93612] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35"
            >
              Jetzt registrieren
              <ArrowRight size={17} aria-hidden="true" />
            </a>
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
                Beta · macOS + Omarchy/Linux
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
