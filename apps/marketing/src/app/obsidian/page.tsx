import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, FileText, FolderTree, GitBranch, ShieldCheck } from "lucide-react";
import { getMarketingLocale, withMarketingLocale } from "@/lib/locale";
import { marketingMetadata } from "@/lib/metadata";

export default async function ObsidianPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = getMarketingLocale((await searchParams).lang);
  const copy = locale === "de"
    ? { title: "Deine Obsidian-Notizen als BloomMD-Mindmaps.", intro: "Für M1 zeigen wir die Kompatibilität mit echten lokalen Notizen. Die allgemeine Plugin-Beta-Verteilung über BRAT oder Release-Artefakte folgt nach dem Closed-Beta-Start.", repo: "Repository ansehen", example: "Beispiel ansehen", compatibility: "Obsidian-Kompatibilität", local: "Lokal und dateibasiert", localText: "BloomMD arbeitet auf normalen Markdown-Dateien. Vault-Inhalte, Dateinamen oder Notizen werden nicht ungefragt übertragen; lokale Arbeit bleibt der empfohlene M1-Weg.", demo: "Demo öffnen", language: "EN", steps: [["M1-Demo nachweisen", "Für M1 wird eine echte Obsidian-Notiz als BloomMD-Map aufgenommen und auf der Landingpage referenziert."], ["Aktuelle Note visualisieren", "Markdown bleibt Quelle der Wahrheit; die Note wird lokal als interaktive Map dargestellt."], ["Ordner als Map öffnen", "Dateien und Unterordner werden als lokale Struktur sichtbar. Die vollständige Plugin-Beta-Verteilung folgt in M2."]] as const }
    : { title: "Your Obsidian notes as BloomMD maps.", intro: "For M1 we demonstrate compatibility with real local notes. General plugin beta distribution through BRAT or release artifacts follows after the closed-beta start.", repo: "View repository", example: "View example", compatibility: "Obsidian compatibility", local: "Local and file-based", localText: "BloomMD works on normal Markdown files. Vault content, filenames, and notes are never transferred without permission; local work remains the recommended M1 path.", demo: "Open demo", language: "DE", steps: [["Prove the M1 demo", "Capture a real Obsidian note as a BloomMD map and reference it on the landing page."], ["Visualize the current note", "Markdown remains the source of truth; the note is rendered locally as an interactive map."], ["Open a folder as a map", "Files and subfolders become visible as local structure. Full plugin beta distribution follows in M2."]] as const };
  const icons = [GitBranch, FileText, FolderTree];

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-[#E8E4DF] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href={locale === "de" ? "/" : "/en"} className="text-lg font-semibold tracking-tight">BloomMD</Link>
          <div className="flex items-center gap-4"><Link href={withMarketingLocale("/obsidian", locale === "de" ? "en" : "de")} className="text-xs font-semibold text-[#C94D20]">{copy.language}</Link><Link href={withMarketingLocale("/demo", locale)} className="text-sm font-semibold text-[#C94D20] hover:underline">{copy.demo}</Link></div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">{copy.compatibility}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">{copy.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#666]">{copy.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="https://github.com/moellenbeck-digital/bloommd-obsidian" className="inline-flex h-11 items-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F]">{copy.repo} <ExternalLink size={16} /></a><Link href={withMarketingLocale("/demo?template=obsidian-vault-starter", locale)} className="inline-flex h-11 items-center gap-2 rounded-md border border-[#D4CFC8] px-4 text-sm font-semibold hover:bg-[#F2F0ED]">{copy.example} <ArrowRight size={16} /></Link></div>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">{copy.steps.map(([title, text], index) => { const Icon = icons[index]!; return <article key={title} className="border border-[#E8E4DF] bg-white p-5"><div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold text-[#C94D20]">0{index + 1}</span><Icon size={20} className="text-[#FF6B35]" /></div><h2 className="mt-8 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#666]">{text}</p></article>; })}</div>
        <section className="mt-12 border-y border-[#E8E4DF] py-10"><div className="flex items-start gap-3"><ShieldCheck size={22} className="mt-1 shrink-0 text-[#FF6B35]" /><div><h2 className="text-xl font-semibold">{copy.local}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#666]">{copy.localText}</p></div></div></section>
      </section>
    </main>
  );
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = getMarketingLocale((await searchParams).lang);
  return marketingMetadata({
    title: locale === "en" ? "Obsidian compatibility | BloomMD" : "Obsidian-Kompatibilität | BloomMD",
    description: locale === "en"
      ? "Status and demo: visualize Obsidian notes locally as interactive BloomMD mind maps."
      : "Status und Demo: Obsidian-Notizen lokal als interaktive BloomMD-Mindmaps visualisieren.",
    path: locale === "en" ? "/obsidian?lang=en" : "/obsidian",
    locale,
  });
}
