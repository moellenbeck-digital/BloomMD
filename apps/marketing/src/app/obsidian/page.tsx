import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download, ExternalLink, ShieldCheck } from "lucide-react";
import { getMarketingLocale, withMarketingLocale } from "@/lib/locale";
import { marketingMetadata } from "@/lib/metadata";

const MIRROR_URL = "https://github.com/moellenbeck-digital/bloommd-obsidian";
const RELEASE_URL = `${MIRROR_URL}/releases/latest`;

export default async function ObsidianPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = getMarketingLocale((await searchParams).lang);
  const copy = locale === "de"
    ? {
        title: "BloomMD in Obsidian installieren",
        intro: "Das BloomMD-Plugin ist für Obsidian auf Desktop, iPad, iPhone und Android als Beta verfügbar. Du brauchst dafür kein BloomMD-Konto und keine Einladung.",
        eyebrow: "Obsidian-Plugin",
        install: "Jetzt installieren",
        installIntro: "Das Plugin wird derzeit über BRAT oder die Dateien im GitHub-Release verteilt. Es ist noch kein Eintrag im Obsidian-Plugin-Verzeichnis.",
        steps: [
          "Installiere in Obsidian das Community-Plugin Obsidian42 – BRAT.",
          "Wähle in BRAT „Add Beta Plugin“ und gib moellenbeck-digital/bloommd-obsidian ein.",
          "Aktiviere BloomMD unter Community-Plugins in deinem Vault.",
        ],
        release: "Aktuellen Plugin-Release öffnen",
        guide: "Installationsanleitung lesen",
        closed: "Was bedeutet Closed Beta hier?",
        closedText: "Nur BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit erfordern eine Einladung. Das lokale Obsidian-Plugin kannst du sofort installieren. Die eigenständige BloomMD-App für iPad und iPhone ist ein anderes Produkt und noch nicht öffentlich im App Store verfügbar.",
        demo: "Browser-Demo öffnen",
        local: "Deine Notizen bleiben im Vault",
        localText: "BloomMD arbeitet mit normalen Markdown-Dateien. Vault-Inhalte, Dateinamen oder Notizen werden nicht ungefragt an BloomMD übertragen.",
        language: "EN",
      }
    : {
        title: "Install BloomMD in Obsidian",
        intro: "The BloomMD plugin beta is available for Obsidian on desktop, iPad, iPhone and Android. You need no BloomMD account or invitation.",
        eyebrow: "Obsidian plugin",
        install: "Install it now",
        installIntro: "The plugin is currently distributed through BRAT or the files in its GitHub release. It is not yet listed in Obsidian's community plugin directory.",
        steps: [
          "Install the Obsidian42 – BRAT community plugin in Obsidian.",
          "Choose Add Beta Plugin in BRAT and enter moellenbeck-digital/bloommd-obsidian.",
          "Enable BloomMD under Community plugins in your vault.",
        ],
        release: "Open latest plugin release",
        guide: "Read installation guide",
        closed: "What does closed beta mean here?",
        closedText: "Only BloomMD Web, cloud workspaces, sync and collaboration require an invitation. You can install the local Obsidian plugin now. The standalone BloomMD app for iPad and iPhone is a separate product and is not publicly available in the App Store yet.",
        demo: "Open browser demo",
        local: "Your notes stay in the vault",
        localText: "BloomMD works with normal Markdown files. Vault content, file names and notes are not sent to BloomMD without your permission.",
        language: "DE",
      };

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#1A1A1A]">
      <header className="border-b border-[#E8E4DF] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href={locale === "de" ? "/" : "/en"} className="text-lg font-semibold tracking-tight">BloomMD</Link>
          <div className="flex items-center gap-4">
            <Link href={withMarketingLocale("/obsidian", locale === "de" ? "en" : "de")} className="text-xs font-semibold text-[#C94D20]">{copy.language}</Link>
            <Link href={withMarketingLocale("/demo", locale)} className="text-sm font-semibold text-[#C94D20] hover:underline">{copy.demo}</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">{copy.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">{copy.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#555555]">{copy.intro}</p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section aria-labelledby="obsidian-install-heading" className="rounded-xl border border-[#E8E4DF] bg-white p-6 sm:p-8">
            <h2 id="obsidian-install-heading" className="text-2xl font-semibold">{copy.install}</h2>
            <p className="mt-3 text-sm leading-6 text-[#555555]">{copy.installIntro}</p>
            <ol className="mt-6 grid gap-4">
              {copy.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-6 text-[#333333]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF4EE] font-semibold text-[#B64A1F]">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={RELEASE_URL} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F]">
                {copy.release} <Download size={16} aria-hidden="true" />
              </a>
              <a href={`${MIRROR_URL}#beta-via-brat`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#D4CFC8] px-4 text-sm font-semibold hover:bg-[#F2F0ED]">
                {copy.guide} <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
          </section>

          <section aria-labelledby="obsidian-beta-heading" className="rounded-xl border border-[#E8E4DF] bg-[#FFF8F3] p-6 sm:p-8">
            <h2 id="obsidian-beta-heading" className="text-2xl font-semibold">{copy.closed}</h2>
            <p className="mt-4 text-sm leading-7 text-[#514C46]">{copy.closedText}</p>
            <Link href={locale === "de" ? "/#availability" : "/en#availability"} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#B94316] underline">
              {locale === "de" ? "Alle verfügbaren Wege ansehen" : "See all available options"} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        </div>

        <section className="mt-10 flex gap-4 border-y border-[#E8E4DF] py-8">
          <ShieldCheck size={22} className="mt-1 shrink-0 text-[#FF6B35]" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-semibold">{copy.local}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#555555]">{copy.localText}</p>
            <a href={MIRROR_URL} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#B94316] underline">
              {locale === "de" ? "Plugin-Repository" : "Plugin repository"} <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: locale === "en" ? "Install BloomMD for Obsidian | BloomMD" : "BloomMD für Obsidian installieren | BloomMD",
    description: locale === "en"
      ? "Install the BloomMD Obsidian plugin beta on desktop, iPad, iPhone or Android through BRAT or a GitHub release, without a BloomMD account."
      : "BloomMD-Obsidian-Plugin auf Desktop, iPad, iPhone oder Android über BRAT oder GitHub-Release installieren, ohne BloomMD-Konto.",
    path: locale === "en" ? "/obsidian?lang=en" : "/obsidian",
    locale,
  });
}
