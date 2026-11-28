"use client";

import { useState } from "react";
import Link from "next/link";
import { parseFile } from "@bloommd/core/browser";
import { MindMapPreview } from "@bloommd/ui";
import { AgentWorkflowSection } from "../../components/agent-workflow-section";
import { KnowledgeVisionSection } from "../../components/knowledge-vision-section";
import {
  ArrowRight,
  Bot,
  Check,
  Code2,
  FileCode2,
  FileText,
  FolderOpen,
  GitBranch,
  HardDrive,
  LayoutTemplate,
  MonitorSmartphone,
  PenLine,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "../../components/v2/site-header";
import { HeroIntro } from "../../components/v2/hero-intro";
import { HeroTrieb } from "../../components/v2/hero-trieb";
import { SplitDemo } from "../../components/v2/split-demo";
import { LandingPaths } from "../../components/v2/landing-paths";
import { UseCaseTrieb } from "../../components/v2/use-case-trieb";
import { TemplatesTrieb } from "../../components/v2/templates-trieb";
import { AgentHull } from "../../components/v2/agent-hull";
import { AvailabilityTrieb } from "../../components/v2/availability-trieb";
import { RegisterTrieb } from "../../components/v2/register-trieb";
import { FaqTrieb } from "../../components/v2/faq-trieb";
import { FooterTrieb } from "../../components/v2/footer-trieb";
import { getBuildInfo } from "../../lib/build-info";
import { publicAppUrl } from "../../lib/deployment";
import { trackPlausibleEvent } from "../../lib/plausible";

const appLoginUrl = `${publicAppUrl()}/login?lang=en`;
const appSignupUrl = `${publicAppUrl()}/signup?lang=en`;
const marketingBuildInfo = getBuildInfo("marketing", { publicOnly: true });

const headerNavItems = [
  { label: "Product", href: "#product" },
  { label: "Demo", href: "/demo?lang=en" },
  { label: "Agents", href: "#agenten" },
  { label: "Roadmap", href: "/en/roadmap" },
  { label: "Download", href: "/download?lang=en" },
  { label: "Free trial", href: "#beta" },
  { label: "Help", href: "/docs?lang=en" },
] as const;

const secondaryNavItems = [
  { label: "Blog", href: "/en/blog" },
  { label: "News", href: "/en/news" },
  { label: "Templates", href: "/templates?lang=en" },
  { label: "FAQ", href: "#faq" },
  { label: "Obsidian", href: "/obsidian?lang=en" },
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
    title: "Try it locally",
    text: "Try a Markdown file in the browser. The desktop beta is available for macOS and Omarchy/Linux.",
    href: "/demo?lang=en",
    cta: "Try the no-login demo",
  },
  {
    icon: MonitorSmartphone,
    title: "Use web and team",
    text: "Try web workspaces, sync and collaboration free for 30 days from email confirmation.",
    href: "#beta",
    cta: "Create a free trial account",
  },
  {
    icon: GitBranch,
    title: "Shape the direction",
    text: "See the knowledge platform roadmap and share your idea.",
    href: "/en/roadmap",
    cta: "Explore the roadmap",
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
    id: "strategy",
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
    id: "research",
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
    id: "architecture",
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
];

const heroMarkdown = [
  "# Product Strategy",
  "## North Star",
  "- Visual thinking for real files",
  "- No locked workspace format",
  "",
  "## Initiatives",
  "### Local-first editor",
  "### Pro workflows",
  "### Optional sync",
].join("\n");

const headerCopy = {
  locale: "en",
  homeHref: "/en",
  homeLabel: "BloomMD English homepage",
  navLabel: "Primary navigation",
  mobileNavLabel: "Mobile navigation",
  menuId: "english-mobile-navigation",
  more: "More topics",
  open: "Open navigation",
  close: "Close navigation",
  signup: "Register now",
  languageLabel: "Language",
  otherLabel: "Zur deutschen Seite wechseln",
} as const;

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
    answer: "No. Local work is the default. Cloud sync is optional and needs an account.",
  },
  {
    question: "Does this work with Obsidian or VS Code?",
    answer: "Yes. Because the source remains Markdown, the same notes keep working in Git, VS Code, Obsidian and any text editor.",
  },
  {
    question: "What is included in the free trial account and the beta?",
    answer: "The free trial account for BloomMD Web, cloud workspaces, sync and collaboration is valid for 30 days from email confirmation, with no invitation and no waitlist. We remind you by email after 15 and 23 days. After it ends, your account is read-only, export remains possible and nothing is lost. For existing accounts the trial period counts from November 15, 2026 and lasts 60 days (until January 14, 2027). The browser demo, macOS and Omarchy/Linux desktop builds, and the Obsidian plugin (beta) are available without an account. Pricing and scope will be published before launch.",
  },
  {
    question: "Can I give feedback with screenshots?",
    answer: "Yes. Signed-in testers can send feedback from the app. Screenshots and videos are planned for the beta feedback workflow.",
  },
] as const;

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
          <Link href="/docs/openclaw-agent?lang=en" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#B94316] px-4 text-sm font-semibold text-white hover:bg-[#963311] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">Agent guide <ArrowRight size={16} aria-hidden="true" /></Link>
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

const templateHighlights = [
  { title: "Software Architecture Map", category: "Development", slug: "software-architecture", text: "Plan components, integrations, security and the roadmap in one Markdown map." },
  { title: "Startup Operating System", category: "Business", slug: "startup-operating-system", text: "Connect vision, customers, decisions and metrics in one editable file." },
  { title: "Obsidian Vault Starter", category: "Knowledge", slug: "obsidian-vault-starter", text: "Start with a Markdown structure for projects, resources and notes." },
] as const;

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
            The plugin beta is available for Obsidian on desktop, iPad, iPhone and Android via BRAT or GitHub releases. The recording shows a real local note.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/obsidian?lang=en" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#B94316] px-4 text-sm font-semibold text-white hover:bg-[#963311] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/25">
              View plugin status
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
            The browser demo is for trying the model. Download the desktop beta for macOS or Omarchy/Linux without an invitation and work directly with local Markdown files.
          </p>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {[
            { icon: HardDrive, title: "Your files, your machine", text: "Work directly on a local folder. No upload, no account and no hidden background sync. Your files belong to you: every export (Markdown, OPML, PDF, PNG, SVG) is free for everyone." },
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
            <p className="font-semibold">macOS and Omarchy/Linux: local beta without an invitation</p>
            <p className="mt-1 text-sm leading-6 text-white/70">
              macOS arm64 and Omarchy/Linux for x86_64 and aarch64 are available as local beta builds.
              Windows follows as a separate beta release.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link href="/download?lang=en" className="inline-flex h-11 items-center justify-center rounded-md bg-[#B94316] px-5 text-sm font-semibold text-white hover:bg-[#963311]">
              Download desktop builds
            </Link>
            <a href={appSignupUrl} className="inline-flex h-11 items-center justify-center rounded-md border border-white/18 px-5 text-sm font-semibold text-white hover:bg-white/8">
              Request cloud access
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
            Our <Link href="/en/roadmap" className="font-semibold text-[#B94316] underline-offset-4 hover:underline">knowledge platform roadmap</Link> outlines sources and sync, rights and cited search, and later agent workflows. The learnings pilot is the first internal backend use case; local Markdown remains the core.
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
      { label: "Help", href: "/docs?lang=en" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Workflows",
    links: [
      { label: "Desktop", href: "/download?lang=en" },
      { label: "Obsidian", href: "/obsidian?lang=en" },
      { label: "Agents", href: "#agenten" },
      { label: "Knowledge platform", href: "#vision" },
    ],
  },
  {
    title: "Free trial account",
    links: [
      { label: "Registration", href: "#beta" },
      { label: "Login", href: appLoginUrl },
    ],
  },
  {
    title: "Legal",
    links: legalLinks,
    note: "The German legal version applies during M1.",
  },
] as const;

export function EnglishLandingPage() {
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://bloommd.io/#software",
    url: "https://bloommd.io/",
    name: "BloomMD",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, macOS, Linux, iOS, Android",
    description: "BloomMD turns open Markdown files into interactive visual maps without introducing a new file format. Local-first, portable and available as a beta.",
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F8F5F0] text-[#1A1A1A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <SiteHeader
        navItems={headerNavItems}
        secondaryItems={secondaryNavItems}
        loginUrl={appLoginUrl}
        signupUrl={appSignupUrl}
        copy={headerCopy}
      />
      <HeroTrieb locale="en" markdown={heroMarkdown} intro={<HeroIntro locale="en" onDemo={() => trackPlausibleEvent("demo_click")} />} />

      <SplitDemo locale="en" />
      <AgentHull>
        <AgentWorkflowSection locale="en" />
      </AgentHull>
      <KnowledgeVisionSection locale="en" />

      <LandingPaths items={audiencePaths} testId="english-landing-paths" />
      <UseCaseTrieb items={useCases} kicker="Use cases" title="For knowledge that has outgrown a linear list." />
      <TemplatesTrieb locale="en" items={templateHighlights.map((item) => ({ ...item, href: `/templates/${item.slug}` }))} />
      <AvailabilityTrieb locale="en" />
      <RegisterTrieb
        kicker="Free trial account"
        title="Register now"
        text="For BloomMD Web, cloud workspaces, sync and collaboration you create a free trial account, with no invitation and no waitlist. It is valid for 30 days from email confirmation; after that your account stays readable and export remains possible, nothing is lost. The demo, local desktop builds and Obsidian plugin need no account."
        action="Register now"
        href={appSignupUrl}
        onSignup={() => trackPlausibleEvent("signup_click")}
      />
      <FaqTrieb items={faqItems} kicker="FAQ" title="Short answers about files, sync and your trial account." />

      <FooterTrieb
        claim="Markdown files. Visual maps."
        providedBy={["BloomMD is provided by ", "."]}
        beta="Beta / macOS + Omarchy/Linux"
        navLabel="Footer navigation"
        columns={footerSections}
        copyright="© 2026 BloomMD. A product by "
        domains={<>Marketing: bloommd.io / App: bloommd.app / <span data-testid="marketing-build-version">Marketing version: {marketingBuildInfo.version}{marketingBuildInfo.shortSha ? ` (${marketingBuildInfo.shortSha})` : ""}</span></>}
      />
    </main>
  );
}
