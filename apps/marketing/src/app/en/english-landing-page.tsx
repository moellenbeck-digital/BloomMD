"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@bloommd/core/browser";
import { MindMapPreview } from "@bloommd/ui";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Code2,
  FileCode2,
  FileText,
  FolderOpen,
  GitBranch,
  HardDrive,
  LayoutTemplate,
  Menu,
  MonitorSmartphone,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { WaitlistForm } from "../waitlist-form";
import { getBuildInfo } from "../../lib/build-info";
import { publicAppUrl } from "../../lib/deployment";
import { trackPlausibleEvent } from "../../lib/plausible";

const appLoginUrl = `${publicAppUrl()}/login?lang=en`;
const marketingBuildInfo = getBuildInfo("marketing", { publicOnly: true });

const headerNavItems = [
  { label: "Product", href: "#product" },
  { label: "Demo", href: "/demo?lang=en" },
  { label: "Desktop", href: "#desktop" },
  { label: "Downloads", href: "/download?lang=en" },
  { label: "Beta", href: "#beta" },
  { label: "News", href: "/en/news" },
  { label: "Help", href: "/docs?lang=en" },
] as const;

const secondaryNavItems = [
  { label: "Blog", href: "/en/blog" },
  { label: "News", href: "/en/news" },
  { label: "Templates", href: "/templates?lang=en" },
  { label: "Roadmap", href: "/en/roadmap" },
  { label: "FAQ", href: "#faq" },
  { label: "LLM Wiki", href: "#llm-wiki" },
  { label: "Obsidian", href: "#obsidian" },
  { label: "Local-first", href: "#local-first" },
] as const;

const legalLinks = [
  { label: "Legal notice", href: "/impressum?lang=en" },
  { label: "Privacy", href: "/datenschutz?lang=en" },
  { label: "Terms", href: "/agb?lang=en" },
  { label: "Withdrawal", href: "/widerruf?lang=en" },
  { label: "Cookies", href: "/cookies?lang=en" },
  { label: "License", href: "/lizenz?lang=en" },
  { label: "Services", href: "/leistungen?lang=en" },
] as const;

const audiencePaths = [
  {
    icon: FileText,
    title: "I already have Markdown files",
    text: "Try a real file in the browser or download the desktop beta for macOS and Omarchy/Linux.",
    href: "/demo?lang=en",
    cta: "Try the no-login demo",
  },
  {
    icon: RefreshCw,
    title: "I use Obsidian",
    text: "See local Obsidian notes rendered as BloomMD maps without moving the vault.",
    href: "#obsidian",
    cta: "Watch the Obsidian proof",
  },
  {
    icon: MonitorSmartphone,
    title: "I want team sync",
    text: "The private app with auth, sync and collaboration opens in small beta waves.",
    href: "#beta",
    cta: "Request beta access",
  },
  {
    icon: LayoutTemplate,
    title: "I need a starting point",
    text: "Use Markdown templates for strategy, architecture, research or knowledge bases.",
    href: "/templates?lang=en",
    cta: "Browse templates",
  },
] as const;

const problemItems = [
  {
    title: "Long documents hide their structure",
    text: "Headings, decisions and dependencies are in the text, but the spatial model stays invisible.",
  },
  {
    title: "Visual tools create new silos",
    text: "Most mindmap apps help with thinking, then separate the work from Git, editors and existing Markdown.",
  },
  {
    title: "Knowledge should not depend on a platform",
    text: "When the format is closed, switching tools becomes a migration project instead of normal work.",
  },
] as const;

const workflowSteps = [
  { icon: FolderOpen, title: "Open a file", text: "Select or drop a normal .md file.", detail: "strategy.md" },
  { icon: GitBranch, title: "See the map", text: "BloomMD turns headings and levels into a navigable structure.", detail: "# -> node" },
  { icon: PenLine, title: "Work visually", text: "Move nodes, inspect relationships and edit the underlying text.", detail: "Tab / Enter / Cmd-S" },
  { icon: FileCode2, title: "Keep Markdown", text: "Changes remain open and keep working in your existing tools.", detail: "Git / VS Code / Obsidian" },
] as const;

const useCases = [
  {
    label: "Product strategy",
    file: "strategy.md",
    heading: "Connect goals, initiatives and open risks",
    text: "Use the map to keep strategic work readable while the source stays a plain Markdown document.",
    markdown: [
      "# Product Strategy",
      "## Goals",
      "## Initiatives",
      "### Retention",
      "### Launch risk",
    ].join("\n"),
  },
  {
    label: "Research",
    file: "literature-review.md",
    heading: "Make sources and arguments visible",
    text: "Group literature, claims and findings without moving notes into a closed knowledge system.",
    markdown: [
      "# Literature Review",
      "## Sources",
      "## Claims",
      "### Questions",
      "### Evidence",
    ].join("\n"),
  },
  {
    label: "Software architecture",
    file: "architecture.md",
    heading: "Keep ADRs, modules and constraints together",
    text: "Review technical structure faster while architecture notes still live in Markdown and Git.",
    markdown: [
      "# Software Architecture",
      "## Modules",
      "## ADRs",
      "### Sync",
      "### Storage",
    ].join("\n"),
  },
] as const;

const englishHeroPreviewDocument = parseFile(
  "strategy.md",
  [
    "# Product Strategy",
    "## North Star",
    "- Visual thinking for real files",
    "- No locked workspace format",
    "",
    "## Initiatives",
    "### Local-first editor",
    "### Pro workflows",
    "### Optional sync",
  ].join("\n"),
);

const featureModules = [
  { icon: GitBranch, title: "Visual Markdown maps", text: "Headings become nodes, hierarchy becomes navigable space." },
  { icon: PenLine, title: "Bidirectional editing", text: "Shape structure visually and edit content without changing formats." },
  { icon: LayoutTemplate, title: "Template library", text: "Start from realistic Markdown examples instead of an empty canvas." },
  { icon: HardDrive, title: "Local-first files", text: "Your work remains portable and compatible with existing workflows." },
  { icon: ShieldCheck, title: "Backups before writes", text: "BloomMD keeps local safety copies before overwriting files." },
  { icon: Code2, title: "Open Knowledge Format", text: "OKF bundles stay deterministic, inspectable and review-first." },
] as const;

const faqItems = [
  {
    question: "Do my files stay normal Markdown?",
    answer: "Yes. BloomMD reads and writes open Markdown files. The map is a visual working layer, not a new file format.",
  },
  {
    question: "Do I need to upload my files?",
    answer: "No. Local work is the default. Cloud sync is optional and limited to invited beta testers.",
  },
  {
    question: "Does this work with Obsidian or VS Code?",
    answer: "Yes. Because the source remains Markdown, the same notes keep working in Git, VS Code, Obsidian and any text editor.",
  },
  {
    question: "What is included in the closed beta?",
    answer: "The browser demo and templates are public. The macOS and Omarchy/Linux desktop builds, private app, sync and collaboration are invited in small waves.",
  },
  {
    question: "Can I give feedback with screenshots?",
    answer: "Yes. Invited testers can send feedback from the app. Screenshots and videos are planned for the beta feedback workflow.",
  },
] as const;

function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 overflow-x-clip border-b border-[#E8E4DF]/70 bg-[#FFFDFB]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5">
        <Link href="/en" className="flex min-w-0 shrink-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25" aria-label="BloomMD English homepage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="block h-8 w-[144px]">
            <img src="/logo.svg" alt="BloomMD" className="bloommd-logo-light h-8 w-auto" />
            <img src="/logo-dark.svg" alt="" aria-hidden="true" className="bloommd-logo-dark h-8 w-auto" />
          </span>
          <span className="hidden border-l border-[#D4CFC8] pl-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#514C46] xl:inline">
            Markdown Maps
          </span>
        </Link>
        <nav className="hidden items-center rounded-md border border-[#E8E4DF] bg-white/82 p-1 shadow-[0_12px_40px_rgba(26,26,26,0.05)] xl:flex" aria-label="Primary navigation">
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
          <div className="flex h-9 items-center rounded-md border border-[#E8E4DF] bg-white p-0.5 text-xs font-semibold text-[#68615C]" aria-label="Language">
            <Link href="/" hrefLang="de" className="rounded px-2.5 py-1.5 hover:bg-[#FFF4EE] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20" aria-label="Zur deutschen Seite wechseln">
              DE
            </Link>
            <span className="rounded bg-[#1A1A1A] px-2.5 py-1.5 text-white" aria-current="page">EN</span>
          </div>
          <a href={appLoginUrl} onClick={() => trackPlausibleEvent("login_click")} className="rounded-md px-3 py-2 text-sm font-semibold text-[#68615C] transition hover:bg-[#F2F0ED] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
            Login
          </a>
          <a href="#beta" className="inline-flex h-11 items-center gap-2 rounded-md bg-[#C94317] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(201,67,23,0.18)] transition hover:bg-[#A93612] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
            Request beta access
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#E8E4DF] bg-white text-[#1A1A1A] transition hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25 xl:hidden"
          aria-expanded={open}
          aria-controls="english-mobile-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div id="english-mobile-navigation" className="border-t border-[#E8E4DF] bg-[#FFFDFB] px-5 py-5 shadow-[0_24px_60px_rgba(26,26,26,0.08)] xl:hidden">
          <nav className="grid gap-5" aria-label="Mobile navigation">
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
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#999999]">More topics</p>
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
              <div className="flex h-11 items-center rounded-md border border-[#E8E4DF] bg-white p-1 text-xs font-semibold text-[#68615C]" aria-label="Language">
                <Link href="/" hrefLang="de" onClick={() => setOpen(false)} className="flex-1 rounded px-3 py-2 text-center hover:bg-[#FFF4EE] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20" aria-label="Zur deutschen Seite wechseln">
                  DE
                </Link>
                <span className="flex-1 rounded bg-[#1A1A1A] px-3 py-2 text-center text-white" aria-current="page">EN</span>
              </div>
              <a href={appLoginUrl} onClick={() => trackPlausibleEvent("login_click")} className="rounded-md px-3 py-3 text-sm font-semibold text-[#68615C] hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
                Login
              </a>
              <a href="#beta" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#C94317] px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
                Request beta access
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function HeroMap() {
  return (
    <div id="product" className="overflow-hidden rounded-xl border border-[#E0D9D1] bg-white shadow-[0_30px_90px_rgba(26,26,26,0.12)]">
      <div className="flex h-12 items-center justify-between border-b border-[#E8E4DF] bg-[#FFFDFB] px-4">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B35]" />
          <span className="text-sm font-semibold">BloomMD Workspace</span>
          <span className="hidden text-xs text-[#777777] sm:inline">/ files / strategy.md</span>
        </div>
        <span className="hidden items-center gap-1 rounded-full border border-[#D8E7D3] bg-[#F4FAF1] px-2 py-1 text-xs text-[#467642] md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5EA552]" />
          saved locally
        </span>
      </div>
      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)_250px]">
        <div className="max-h-[136px] overflow-hidden border-b border-[#E8E4DF] bg-[#1F1D1B] p-4 text-white lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-semibold">strategy.md</span>
            <span className="rounded border border-white/12 px-2 py-0.5 text-white/54">Source</span>
          </div>
          <pre className="whitespace-pre-wrap font-[var(--font-mono)] text-[11px] leading-5 text-white/76">{`# Product Strategy
## North Star
- Visual thinking for real files
- No locked workspace format

## Initiatives
### Local-first editor
### Pro workflows
### Optional sync`}</pre>
        </div>
        <MindMapPreview
          document={englishHeroPreviewDocument}
          className="!min-h-[230px] !rounded-none !border-0 sm:!min-h-[320px] lg:!min-h-[360px]"
          ariaLabel="BloomMD Product Strategy Markdown mind map preview"
        />
        <aside className="hidden border-t border-[#E8E4DF] bg-white p-5 md:block lg:border-l lg:border-t-0">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#999999]">Inspector</div>
          <h3 className="text-base font-semibold">North Star</h3>
          <p className="mt-3 text-sm leading-6 text-[#666666]">
            The selected section stays editable while its place in the map remains visible.
          </p>
          <div className="mt-5 grid gap-2 text-sm text-[#555555]">
            {["Markdown stays the source", "Node is focused", "Change writes back"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check size={15} className="text-[#FF6B35]" aria-hidden="true" />
                {item}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function AudiencePaths() {
  return (
    <section className="border-y border-[#E8E4DF] bg-[#FFFDFB]" data-testid="english-landing-paths">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:py-10">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {audiencePaths.map((path) => {
            const Icon = path.icon;
            return (
              <a
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
              </a>
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
          <p className="text-sm font-semibold text-[#FFB899]">New: local OpenClaw agents</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Assign a node. Review a proposal. Keep Markdown under your control.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/68">The agent works only on an explicit assignment and only with the selected node's context. It proposes – you decide.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Link href="/docs/openclaw-agent?lang=en" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">Agent guide <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/en/blog/openclaw-local-workspace-agents" className="inline-flex h-10 items-center justify-center rounded-md border border-white/18 px-4 text-sm font-semibold text-white hover:bg-white/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20">What changed</Link>
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
          <h2 className="text-3xl font-semibold sm:text-4xl">From file to working map.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            No migration and no new workspace format. Open a file, see its structure and keep using it elsewhere.
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
                <div className="text-xs font-semibold uppercase tracking-wide text-[#999999]">Step {active + 1}</div>
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
  const [activeIndex, setActiveIndex] = useState(0);
  const active = useCases[activeIndex] ?? useCases[0]!;
  const previewDocument = useMemo(() => parseFile(active.file, active.markdown), [active.file, active.markdown]);

  return (
    <section className="border-y border-[#E8E4DF] bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Use cases</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">For knowledge that has outgrown a linear list.</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-[290px_1fr]">
          <div className="grid gap-2" role="tablist" aria-label="Use cases">
            {useCases.map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={activeIndex === index}
                onClick={() => setActiveIndex(index)}
                className={`rounded-md border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20 ${
                  activeIndex === index ? "border-[#FF6B35] bg-[#FFF4EE] text-[#1A1A1A]" : "border-[#E8E4DF] bg-[#FCFBFA] text-[#666666] hover:bg-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] p-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-md border border-[#E8E4DF] bg-[#1F1D1B] p-4 text-white">
              <div className="mb-3 text-sm font-semibold">{active.file}</div>
              <pre className="whitespace-pre-wrap font-[var(--font-mono)] text-sm leading-7 text-white/78">{active.markdown}</pre>
            </div>
            <div>
              <MindMapPreview
                document={previewDocument}
                className="min-h-[250px]"
                ariaLabel={`${active.label} Markdown mind map preview`}
              />
              <h3 className="mt-4 text-xl font-semibold">{active.heading}</h3>
              <p className="mt-2 leading-7 text-[#666666]">{active.text}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductProofSection() {
  return (
    <section className="border-y border-[#E8E4DF] bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Text becomes space</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Markdown turns into a navigable workspace.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            The M1 proof is intentionally concrete: real product recordings, local files and desktop beta builds for macOS and Omarchy/Linux, alongside private web access.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo?lang=en" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25">
              Open the demo
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/templates?lang=en" className="inline-flex h-11 items-center justify-center rounded-md border border-[#D4CFC8] px-4 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
              Browse templates
            </Link>
          </div>
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
            aria-label="Real BloomMD recording: a branch is moved and the Markdown structure updates."
            data-testid="english-branch-drag-demo-video"
          />
          <div className="mt-4 grid gap-3 text-sm text-[#666666] sm:grid-cols-3">
            {["Real recording", "Branch moved", "Markdown updated"].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-md border border-[#E8E4DF] bg-white px-3 py-2">
                <Check size={15} className="text-[#FF6B35]" aria-hidden="true" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureSection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
      <div className="mb-8 max-w-3xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Product surface</p>
        <h2 className="text-3xl font-semibold sm:text-4xl">A workspace for structure, not another drawing canvas.</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {featureModules.map((feature) => (
          <article key={feature.title} className="rounded-lg border border-[#E8E4DF] bg-white p-5 shadow-sm">
            <feature.icon size={24} className="mb-4 text-[#FF6B35]" aria-hidden="true" />
            <h3 className="text-lg font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#666666]">{feature.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ObsidianSection() {
  return (
    <section id="obsidian" className="border-y border-[#E8E4DF] bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Obsidian compatibility</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Check Obsidian notes as BloomMD maps.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            For M1, real product recordings show local Obsidian notes rendered as BloomMD maps. The full plugin beta distribution follows after this release.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/obsidian?lang=en" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25">
              Open German status page
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="https://github.com/moellenbeck-digital/bloommd-obsidian" className="inline-flex h-11 items-center justify-center rounded-md border border-[#D4CFC8] px-4 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
              Plugin repository
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
            aria-label="Real Obsidian desktop recording: a local Markdown note is rendered as a BloomMD map."
            data-testid="english-obsidian-note-map-demo-video"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {["Real recording", "Local Obsidian note", "BloomMD map"].map((item) => (
              <span key={item} className="rounded-md border border-[#E8E4DF] bg-[#FCFBFA] px-3 py-1 text-xs font-semibold text-[#666666]">{item}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DesktopSection() {
  return (
    <section id="desktop" className="border-y border-[#E8E4DF] bg-[#1F1D1B] text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#FFB899]">Desktop beta</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Real local work belongs on the computer.</h2>
          <p className="mt-4 text-lg leading-8 text-white/70">
            The browser demo is for trying the model. The desktop app opens local Markdown files and folders directly on macOS and Omarchy/Linux in the closed beta.
          </p>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {[
            { icon: HardDrive, title: "Your files, your machine", text: "Work directly on a local folder. No upload, no account and no hidden background sync." },
            { icon: RefreshCw, title: "External edits show up", text: "Changes from Obsidian, VS Code or Git can be reflected without copying files into a platform." },
            { icon: FileCode2, title: "Open Markdown directly", text: "The beta path includes opening .md files and folders as maps from the native app." },
          ].map((reason) => (
            <div key={reason.title} className="rounded-xl border border-white/12 bg-white/5 p-6">
              <reason.icon size={20} className="text-[#FF9E6E]" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">{reason.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">{reason.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-4 rounded-xl border border-white/12 bg-white/5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">macOS and Omarchy/Linux in the closed beta</p>
            <p className="mt-1 text-sm leading-6 text-white/70">
              macOS arm64 and Omarchy/Linux for x86_64 and aarch64 are available as local beta builds.
              Windows follows as a separate beta release.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link href="/download?lang=en" className="inline-flex h-11 items-center justify-center rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F]">
              Download desktop builds
            </Link>
            <a href="#beta" className="inline-flex h-11 items-center justify-center rounded-md border border-white/18 px-5 text-sm font-semibold text-white hover:bg-white/8">
              Request beta access
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function LocalFirstAndWikiSection() {
  return (
    <section id="local-first" className="border-y border-[#E8E4DF] bg-[#FFFDFB]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Local-first</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Your knowledge should remain yours.</h2>
          <p className="mt-4 text-lg leading-8 text-[#666666]">
            BloomMD starts with files you already control. Sync is optional, not the storage model, and Markdown keeps the escape hatch open.
          </p>
        </div>
        <div id="llm-wiki" className="rounded-xl border border-[#E8E4DF] bg-white p-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">LLM Wiki / OKF</p>
          <h3 className="text-2xl font-semibold">Agent-maintained knowledge still needs human approval.</h3>
          <p className="mt-4 leading-7 text-[#666666]">
            BloomMD reads and writes Open Knowledge Format bundles: Markdown pages, source hashes, trust signals and explicit approval before agent proposals are applied.
          </p>
          <p className="mt-4 text-sm leading-6 text-[#666666]">
            This works through BloomMD and OpenClaw without Bun, a terminal, or access to a source checkout.
          </p>
          <Link href="/docs/okf-wiki?lang=en" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#1F1D1B] px-4 text-sm font-semibold text-[#1F1D1B] transition hover:border-[#B64A1F] hover:text-[#B64A1F]">
            Learn about OKF and LLM Wiki <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <p className="mt-4 text-xs leading-5 text-[#666666]">
            Technical CLI and MCP tools are optional and intended for teams operating their own LLM Wiki.
          </p>
        </div>
      </div>
    </section>
  );
}

function BetaSection() {
  return (
    <section id="beta" className="scroll-mt-24 border-t border-[#E8E4DF] bg-[#FAF8F5]">
      <div className="mx-auto max-w-7xl px-5 py-14">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Closed beta</p>
          <h2 className="text-3xl font-semibold text-[#1A1A1A] sm:text-4xl">Free during beta, intentionally small.</h2>
          <p className="mt-3 text-[#514C46]">
            We invite testers in small groups so feedback can be answered. Join the waitlist and we will email you when a seat opens. Demo and templates do not need an invite.
          </p>
        </div>
        <div className="mt-6">
          <WaitlistForm source="landing-en" locale="en" />
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
        <h2 className="text-3xl font-semibold sm:text-4xl">Short answers about files, sync and beta access.</h2>
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

function Footer() {
  const footerSections = [
    {
      title: "Product",
      links: [
        { label: "Overview", href: "#product" },
        { label: "Demo", href: "/demo" },
        { label: "Downloads", href: "/download?lang=en" },
        { label: "Templates", href: "/templates" },
        { label: "Blog", href: "/en/blog" },
        { label: "News", href: "/en/news" },
        { label: "Roadmap", href: "/en/roadmap" },
        { label: "Help", href: "/docs" },
        { label: "FAQ", href: "#faq" },
      ],
    },
    {
      title: "Workflows",
      links: [
        { label: "Desktop", href: "#desktop" },
        { label: "Obsidian", href: "#obsidian" },
        { label: "LLM Wiki", href: "#llm-wiki" },
        { label: "Local-first", href: "#local-first" },
      ],
    },
    {
      title: "Beta",
      links: [
        { label: "Closed beta", href: "#beta" },
        { label: "Login", href: appLoginUrl },
      ],
    },
    {
      title: "Legal",
      links: legalLinks,
    },
  ] as const;

  return (
    <footer className="bg-[#171513] text-white">
      <div className="mx-auto max-w-7xl border-t border-white/10 px-5 py-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,2.1fr)]">
          <div className="max-w-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.svg" alt="BloomMD" className="h-8" />
            <p className="mt-4 text-sm leading-6 text-white/56">Markdown files. Visual maps.</p>
            <p className="mt-3 text-xs leading-5 text-white/48">
              BloomMD is provided by{" "}
              <a href="https://moellenbeck-digital.io/" className="font-semibold text-white/72 hover:text-white hover:underline">
                moellenbeck-digital.io
              </a>.
            </p>
            <p className="mt-5 inline-flex rounded-full border border-white/12 px-3 py-1 text-xs font-medium text-white/58">
              Closed beta / macOS + Omarchy/Linux
            </p>
          </div>
          <nav className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4" aria-label="Footer navigation">
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
                {section.title === "Legal" && (
                  <p className="mt-4 text-xs leading-5 text-white/48">
                    The German legal version applies during M1.
                  </p>
                )}
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-white/68 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © 2026 BloomMD. A product by{" "}
            <a href="https://moellenbeck-digital.io/" className="font-semibold text-white/72 hover:text-white hover:underline">
              moellenbeck-digital.io
            </a>.
          </p>
          <p>
            Marketing: bloommd.io / App: bloommd.app / <span data-testid="marketing-build-version">Marketing version: {marketingBuildInfo.version}{marketingBuildInfo.shortSha ? ` (${marketingBuildInfo.shortSha})` : ""}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

export function EnglishLandingPage() {
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BloomMD",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, macOS, Linux",
    description: "BloomMD turns open Markdown files into interactive visual maps without introducing a new file format. Local-first, portable and built for the closed beta.",
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F8F5F0] text-[#1A1A1A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <Header />
      <section className="relative bg-[#FFFDFB] motion-safe:animate-[sectionIn_.45s_ease-out_both]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#FFD4BF] bg-[#FFF4EE] px-3 py-1 text-sm font-semibold text-[#B64A1F]">
              <Sparkles size={15} aria-hidden="true" />
              Markdown files · visual maps
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-normal text-[#1A1A1A] sm:text-6xl">
              Markdown files. Visual maps.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#555555] sm:text-lg sm:leading-8">
              Open a Markdown file and see its structure immediately. BloomMD adds a visual layer — local, portable and without a new file format.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo?lang=en" onClick={() => trackPlausibleEvent("demo_click")} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white transition hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
                Try the no-login demo
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#beta" className="inline-flex h-12 items-center justify-center rounded-md border border-[#D4CFC8] bg-white px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">
                Request beta access
              </a>
            </div>
            <p className="mt-5 text-sm font-medium text-[#666666]">Normal Markdown / local files / macOS and Omarchy/Linux</p>
          </div>
          <HeroMap />
        </div>
      </section>

      <ProductProofSection />

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 motion-safe:animate-[sectionIn_.45s_ease-out_both] lg:grid-cols-[0.75fr_1.25fr] lg:py-20">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Positioning</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Markdown is open and durable. Large documents still become hard to scan.</h2>
          <p className="mt-5 text-lg leading-8 text-[#666666]">
            BloomMD keeps the open file and adds the spatial view that linear text cannot provide.
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

      <AudiencePaths />
      <WhatIsNewSection />
      <WorkflowSection />
      <UseCasesSection />
      <FeatureSection />
      <ObsidianSection />
      <DesktopSection />
      <LocalFirstAndWikiSection />
      <BetaSection />
      <FAQSection />

      <section className="border-t border-[#E8E4DF] bg-[#1F1D1B] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold">Your files are already there. BloomMD makes them visible.</h2>
            <p className="mt-3 text-white/68">Start with a template or try a real Markdown file in the browser.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/demo?lang=en" className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
              Open demo
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="/templates?lang=en" className="inline-flex h-12 items-center justify-center rounded-md border border-white/18 px-5 text-sm font-semibold text-white hover:bg-white/8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20">
              View templates
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
