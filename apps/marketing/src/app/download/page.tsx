import type { Metadata } from "next";
import { ArrowRight, Bot, Download, Laptop, Terminal } from "lucide-react";
import Link from "next/link";
import { AvailabilityOverview } from "@/components/availability-overview";
import { appUrl } from "@/lib/deployment";
import { getDesktopUpdateManifest } from "@/lib/desktop-update-proxy";
import { getMarketingLocale, withMarketingLocale } from "@/lib/locale";
import { marketingMetadata } from "@/lib/metadata";

const SUPPORT_EMAIL = "feedback@bloommd.io";
const FIRST_PARTY_DESKTOP_DMG_URL =
  "https://bloommd.io/_desktop-updates/stable-macos-arm64-BloomMD.dmg";
const FIRST_PARTY_LINUX_X86_64_URL =
  "https://bloommd.io/_desktop-updates/stable-linux-x86_64.pacman";
const FIRST_PARTY_LINUX_AARCH64_URL =
  "https://bloommd.io/_desktop-updates/stable-linux-aarch64.pacman";
const OPENCLAW_PLUGIN_DOWNLOAD_URL = "/openclaw-plugin/latest.tgz";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title:
      locale === "en"
        ? "Download the desktop app · BloomMD"
        : "Desktop-App herunterladen · BloomMD",
    description:
      locale === "en"
        ? "Download the macOS and Omarchy/Linux desktop beta without an invitation. See what is public and what needs an account."
        : "macOS- und Omarchy/Linux-Desktop-Beta ohne Einladung herunterladen. Sieh, was öffentlich ist und wofür du ein Konto brauchst.",
    path: locale === "en" ? "/download?lang=en" : "/download",
    locale,
  });
}

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const locale = getMarketingLocale((await searchParams).lang);
  const betaUrl = `${appUrl()}/beta${locale === "en" ? "?lang=en" : ""}`;
  const desktopManifest = await getDesktopUpdateManifest();
  const desktopVersion =
    desktopManifest?.version ??
    (locale === "de" ? "wird live ermittelt" : "resolved live");
  const desktopHash = desktopManifest?.hash;
  const directDownloadUrl =
    process.env.NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL?.trim() ||
    FIRST_PARTY_DESKTOP_DMG_URL;
  const copy =
    locale === "de"
      ? {
          eyebrow: "BloomMD Desktop",
          title: "Desktop-Apps herunterladen",
          intro:
            "Wähle macOS oder Omarchy/Linux. Die lokalen Beta-Builds sind ohne Einladung und ohne BloomMD-Konto herunterladbar.",
          status: "Lokale Desktop-Beta",
          version: "Desktop-Version",
          choose: "1. Plattform wählen",
          chooseIntro: "Nimm den Build, der zu deinem Rechner passt.",
          mac: {
            title: "macOS",
            detail: "Apple Silicon · arm64",
            description:
              "Für Macs mit Apple-Chip. Öffnet Markdown-Dateien und Ordner direkt auf deinem Rechner.",
            action: "DMG herunterladen",
            install: "Nach dem Download",
            installText:
              "DMG öffnen und BloomMD in den Programme-Ordner ziehen.",
            firstLaunch: "BloomMD aus Programme per Doppelklick starten. Ab Version 0.5.7 mit Developer ID signiert und von Apple notarisiert.",
          },
          linux: {
            title: "Omarchy / Linux",
            detail: "Arch Linux · x86_64 oder aarch64",
            description:
              "Für Omarchy 4 und andere Arch-basierte Systeme. Wähle die Architektur deines Rechners.",
            actionX86: "x86_64 · Intel/AMD",
            actionArm: "aarch64 · ARM64",
            architecture: "Unsicher? `uname -m` zeigt deine Architektur.",
            install: "Nach dem Download",
            installText: "Installiere das Paket mit:",
            startText: "Danach startet BloomMD mit:",
            filenameNote:
              "Der Download enthält bereits den richtigen Versions- und Architektur-Namen.",
          },
          next: "2. Danach starten",
          nextIntro:
            "Öffne eine Markdown-Datei oder einen Ordner direkt in BloomMD.",
          nextSteps: [
            "Markdown-Datei öffnen",
            "Ordner als Workspace öffnen",
            "Direkt loslegen",
          ],
          beta: "Web- und Cloud-Beta-Zugang",
          docs: "Vollständige Anleitung",
          agent: "Optional: lokaler OpenClaw-Agent",
          agentDescription:
            "Du nutzt OpenClaw bereits? Installiere das BloomMD-Plugin und lasse lokale Agenten nur auf explizite Knotenaufträge reagieren.",
          agentDocs: "Agenten-Anleitung öffnen",
          agentDownload: "Plugin herunterladen",
          tools: "Optional: Automatisierungs-Tools",
          toolsDescription:
            "Für lokale Wiki-Checks, CI oder kontrollierte Integrationen gibt es getrennte native Binaries. Der normale OpenClaw-Agent benötigt sie nicht.",
          toolsDocs: "Tools dokumentiert einsetzen",
          support:
            "Fehlt dir ein Link oder funktioniert der Download nicht? Schreib an",
          uri: "Dateien und Ordner können außerdem über dieses URI-Schema geöffnet werden:",
          language: "EN",
        }
      : {
          eyebrow: "BloomMD Desktop",
          title: "Download desktop apps",
          intro:
            "Choose macOS or Omarchy/Linux. Download the local beta builds without an invitation or BloomMD account.",
          status: "Local desktop beta",
          version: "Desktop version",
          choose: "1. Choose your platform",
          chooseIntro: "Pick the build that matches your computer.",
          mac: {
            title: "macOS",
            detail: "Apple Silicon · arm64",
            description:
              "For Macs with an Apple chip. Open Markdown files and folders directly on your computer.",
            action: "Download DMG",
            install: "After downloading",
            installText:
              "Open the DMG and move BloomMD to the Applications folder.",
            firstLaunch: "Double-click BloomMD in Applications. Version 0.5.7 and later are Developer ID signed and notarized by Apple.",
          },
          linux: {
            title: "Omarchy / Linux",
            detail: "Arch Linux · x86_64 or aarch64",
            description:
              "For Omarchy 4 and other Arch-based systems. Choose your computer's architecture.",
            actionX86: "x86_64 · Intel/AMD",
            actionArm: "aarch64 · ARM64",
            architecture: "Not sure? `uname -m` shows your architecture.",
            install: "After downloading",
            installText: "Install the package with:",
            startText: "Then start BloomMD with:",
            filenameNote:
              "The download already contains the correct version and architecture in its filename.",
          },
          next: "2. Start BloomMD",
          nextIntro: "Open a Markdown file or folder directly in BloomMD.",
          nextSteps: [
            "Open a Markdown file",
            "Open a folder as a workspace",
            "Start working",
          ],
          beta: "Web and cloud beta access",
          docs: "Full installation guide",
          agent: "Optional: local OpenClaw agent",
          agentDescription:
            "Already using OpenClaw? Install the BloomMD plugin and let local agents react only to explicit node instructions.",
          agentDocs: "Open agent guide",
          agentDownload: "Download plugin",
          tools: "Optional: automation tools",
          toolsDescription:
            "Separate native binaries are available for local Wiki checks, CI and controlled integrations. A normal OpenClaw agent does not need them.",
          toolsDocs: "Use the documented tools",
          support:
            "If a link is missing or the download does not work, contact",
          uri: "You can also open files and folders with this URI scheme:",
          language: "DE",
        };

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#1A1A1A]">
      <section className="mx-auto grid max-w-5xl gap-10 px-5 py-12 sm:px-8 sm:py-16">
        <header className="grid gap-5">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#9A3412]">
              {copy.eyebrow}
            </p>
            <Link
              href={withMarketingLocale(
                "/download",
                locale === "de" ? "en" : "de",
              )}
              className="rounded px-2 py-1 text-xs font-semibold text-[#9A3412] hover:bg-[#FFF4EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316]"
            >
              {copy.language}
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
                {copy.title}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-[#555555]">
                {copy.intro}
              </p>
            </div>
              <div className="hidden items-center gap-3 rounded-full border border-[#E8E4DF] bg-white px-4 py-2 text-sm text-[#555555] shadow-sm sm:flex">
              <span
                className="h-2 w-2 rounded-full bg-[#2E9B62]"
                aria-hidden="true"
              />
              <span>{copy.status}</span>
              <span className="text-[#B8B0A8]" aria-hidden="true">
                ·
              </span>
              <span>
                {copy.version} {desktopVersion}
              </span>
            </div>
          </div>
        </header>

        <AvailabilityOverview locale={locale} embedded />

        <section className="grid gap-5" aria-labelledby="platform-heading">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#9A3412]">
              {copy.choose}
            </p>
            <h2
              id="platform-heading"
              className="mt-2 text-2xl font-semibold tracking-[-0.015em]"
            >
              {copy.chooseIntro}
            </h2>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <article className="grid content-start gap-6 rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-[0_12px_32px_rgba(26,26,26,0.05)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#FFF4EE] text-[#B94316]"
                  aria-hidden="true"
                >
                  <Laptop size={24} strokeWidth={1.8} />
                </div>
                <span className="rounded-full bg-[#F2F0ED] px-3 py-1 text-xs font-semibold text-[#555555]">
                  {copy.mac.detail}
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-semibold">{copy.mac.title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-7 text-[#555555]">
                  {copy.mac.description}
                </p>
              </div>
              <div className="grid gap-3">
                {directDownloadUrl ? (
                  <a
                    href={directDownloadUrl}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316] focus-visible:ring-offset-2"
                  >
                    {copy.mac.action}
                    <Download size={17} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="inline-flex h-12 items-center justify-center rounded-md border border-[#D4CFC8] bg-[#F2F0ED] px-5 text-sm font-semibold text-[#666666]">
                    {locale === "de"
                      ? "macOS-Download nicht konfiguriert"
                      : "macOS download not configured"}
                  </span>
                )}
                <div className="grid gap-2 border-t border-[#F0EDE9] pt-5 text-sm leading-6 text-[#555555]">
                  <p className="font-semibold text-[#1A1A1A]">
                    {copy.mac.install}
                  </p>
                  <p>{copy.mac.installText}</p>
                  <p>{copy.mac.firstLaunch}</p>
                </div>
              </div>
            </article>

            <article className="grid content-start gap-6 rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-[0_12px_32px_rgba(26,26,26,0.05)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#FFF4EE] text-[#B94316]"
                  aria-hidden="true"
                >
                  <Terminal size={24} strokeWidth={1.8} />
                </div>
                <span className="rounded-full bg-[#FFF4EE] px-3 py-1 text-xs font-semibold text-[#9A3412]">
                  {copy.linux.detail}
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-semibold">{copy.linux.title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-7 text-[#555555]">
                  {copy.linux.description}
                </p>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <a
                    href={FIRST_PARTY_LINUX_X86_64_URL}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-center text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316] focus-visible:ring-offset-2"
                  >
                    {copy.linux.actionX86}
                    <Download size={16} aria-hidden="true" />
                  </a>
                  <a
                    href={FIRST_PARTY_LINUX_AARCH64_URL}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#D4CFC8] bg-white px-4 text-center text-sm font-semibold hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316] focus-visible:ring-offset-2"
                  >
                    {copy.linux.actionArm}
                    <Download size={16} aria-hidden="true" />
                  </a>
                </div>
                <p className="text-sm leading-6 text-[#666666]">
                  {copy.linux.architecture}
                </p>
              </div>
              <div className="grid gap-3 border-t border-[#F0EDE9] pt-5 text-sm leading-6 text-[#555555]">
                <p className="font-semibold text-[#1A1A1A]">
                  {copy.linux.install}
                </p>
                <p>{copy.linux.installText}</p>
                <code className="block overflow-x-auto rounded-md bg-[#1A1A1A] px-4 py-3 font-mono text-xs text-white">
                  sudo pacman -U
                  ./bloommd-desktop-&lt;version&gt;-&lt;arch&gt;.pacman
                </code>
                <p>{copy.linux.filenameNote}</p>
                <p>{copy.linux.startText}</p>
                <code className="block overflow-x-auto rounded-md bg-[#1A1A1A] px-4 py-3 font-mono text-xs text-white">
                  bloommd-desktop
                </code>
              </div>
            </article>
          </div>
        </section>

        <section
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]"
          aria-labelledby="next-heading"
        >
          <div className="grid gap-4 rounded-xl border border-[#E8E4DF] bg-white p-6 sm:p-7">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#9A3412]">
                {copy.next}
              </p>
              <h2 id="next-heading" className="mt-2 text-2xl font-semibold">
                {copy.nextIntro}
              </h2>
            </div>
            <div className="grid gap-3 text-[15px] leading-7 text-[#555555] sm:grid-cols-3">
              {copy.nextSteps.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF4EE] text-sm font-semibold text-[#9A3412]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <p className="text-[15px] leading-7 text-[#555555]">{copy.uri}</p>
            <code className="block overflow-x-auto rounded-md bg-[#1A1A1A] px-4 py-3 font-mono text-xs text-white">
              bloommd://open?path=/home/&lt;user&gt;/notes.md
            </code>
          </div>

          <aside className="grid content-start gap-4 rounded-xl border border-[#E8E4DF] bg-[#F2F0ED] p-6 sm:p-7">
            <h2 className="text-lg font-semibold">
              {locale === "de" ? "Weitere Informationen" : "More information"}
            </h2>
            <div className="grid gap-2">
              <a
                href={betaUrl}
                className="inline-flex h-11 items-center justify-between gap-3 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316]"
              >
                {copy.beta}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <Link
                href={withMarketingLocale("/docs/desktop", locale)}
                className="inline-flex h-11 items-center justify-between gap-3 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316]"
              >
                {copy.docs}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="text-sm leading-6 text-[#666666]">
              {copy.support}{" "}
              <a
                className="font-semibold text-[#9A3412] hover:underline"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </aside>
        </section>

        <section
          className="rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-[0_12px_32px_rgba(26,26,26,0.05)] sm:p-7"
          aria-labelledby="tools-heading"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F2F0ED] text-[#555555]"
                aria-hidden="true"
              >
                <Terminal size={24} strokeWidth={1.8} />
              </span>
              <div>
                <h2 id="tools-heading" className="text-xl font-semibold">
                  {copy.tools}
                </h2>
                <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#555555]">
                  {copy.toolsDescription}
                </p>
              </div>
            </div>
            <Link
              href={withMarketingLocale("/docs/command-line-tools", locale)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316]"
            >
              {copy.toolsDocs}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section
          className="rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-[0_12px_32px_rgba(26,26,26,0.05)] sm:p-7"
          aria-labelledby="agent-heading"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#FFF4EE] text-[#B94316]"
                aria-hidden="true"
              >
                <Bot size={24} strokeWidth={1.8} />
              </span>
              <div>
                <h2 id="agent-heading" className="text-xl font-semibold">
                  {copy.agent}
                </h2>
                <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#555555]">
                  {copy.agentDescription}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={withMarketingLocale("/docs/openclaw-agent", locale)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#F2F0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316]"
              >
                {copy.agentDocs}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a
                href={OPENCLAW_PLUGIN_DOWNLOAD_URL}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B94316] focus-visible:ring-offset-2"
              >
                {copy.agentDownload}
                <Download size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <p className="font-mono text-xs leading-6 text-[#666666]">
          {locale === "de" ? "Aktueller macOS-Build" : "Current macOS build"}:
          stable-macos-arm64-BloomMD.dmg · {copy.version} {desktopVersion}
          {desktopHash ? ` · Update-Hash ${desktopHash}` : ""}
        </p>
      </section>
    </main>
  );
}
