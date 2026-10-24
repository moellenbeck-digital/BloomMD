import { ArrowLeft, ArrowRight, CalendarDays, Rss, Sparkles } from "lucide-react";
import Link from "next/link";
import { Markdown } from "fumadocs-core/content/md";
import type { MarketingLocale } from "../lib/locale";
import { marketingPostPath } from "../lib/posts";
import type { MarketingPost, MarketingPostKind } from "../lib/posts";

interface ContentCopy {
  eyebrow: string;
  title: string;
  description: string;
  blogLabel: string;
  newsLabel: string;
  feedLabel: string;
  homeLabel: string;
  docsLabel: string;
  demoLabel: string;
  downloadLabel: string;
  readMore: string;
  published: string;
  sourceLabel: string;
  backLabel: string;
}

function copyFor(kind: MarketingPostKind, locale: MarketingLocale): ContentCopy {
  if (locale === "en") {
    return kind === "blog"
      ? {
          eyebrow: "BloomMD journal",
          title: "Ideas for a clearer knowledge space.",
          description: "Longer notes on Markdown-first work, visual structure and the workflows around BloomMD.",
          blogLabel: "Blog",
          newsLabel: "News",
          feedLabel: "RSS feed",
          homeLabel: "Home",
          docsLabel: "Documentation",
          demoLabel: "Try the demo",
          downloadLabel: "Download desktop",
          readMore: "Read article",
          published: "Published",
          sourceLabel: "Source",
          backLabel: "Back to blog",
        }
      : {
          eyebrow: "BloomMD updates",
          title: "What is changing in BloomMD.",
          description: "Product updates, release notes and practical changes — kept short and easy to scan.",
          blogLabel: "Blog",
          newsLabel: "News",
          feedLabel: "RSS feed",
          homeLabel: "Home",
          docsLabel: "Documentation",
          demoLabel: "Try the demo",
          downloadLabel: "Download desktop",
          readMore: "Read update",
          published: "Published",
          sourceLabel: "Source",
          backLabel: "Back to news",
        };
  }

  return kind === "blog"
    ? {
        eyebrow: "BloomMD Journal",
        title: "Ideen für einen klareren Wissensraum.",
        description: "Längere Beiträge über Markdown-first, visuelle Struktur und die Workflows rund um BloomMD.",
        blogLabel: "Blog",
        newsLabel: "News",
        feedLabel: "RSS-Feed",
        homeLabel: "Startseite",
        docsLabel: "Dokumentation",
        demoLabel: "Demo testen",
        downloadLabel: "Desktop laden",
        readMore: "Beitrag lesen",
        published: "Veröffentlicht",
        sourceLabel: "Quelle",
        backLabel: "Zurück zum Blog",
      }
    : {
        eyebrow: "BloomMD Neuigkeiten",
        title: "Was sich in BloomMD verändert.",
        description: "Produkt-Updates, Release-Hinweise und praktische Änderungen — kurz und schnell erfassbar.",
        blogLabel: "Blog",
        newsLabel: "News",
        feedLabel: "RSS-Feed",
        homeLabel: "Startseite",
        docsLabel: "Dokumentation",
        demoLabel: "Demo testen",
        downloadLabel: "Desktop laden",
        readMore: "Update lesen",
        published: "Veröffentlicht",
        sourceLabel: "Quelle",
        backLabel: "Zurück zu den News",
      };
}

function dateLabel(date: string, locale: MarketingLocale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "de-DE", { dateStyle: "long" }).format(new Date(`${date}T12:00:00.000Z`));
}

function postDateLabel(post: MarketingPost, locale: MarketingLocale): string {
  const date = dateLabel(post.commitDate ?? post.date, locale);
  return post.commitDate ? `${locale === "en" ? "Commit" : "Commit"} · ${date}` : date;
}

function SiteHeader({ locale, kind, copy }: { locale: MarketingLocale; kind: MarketingPostKind; copy: ContentCopy }) {
  const homePath = locale === "en" ? "/en" : "/";
  const blogPath = locale === "en" ? "/en/blog" : "/blog";
  const newsPath = locale === "en" ? "/en/news" : "/news";
  const languagePath = locale === "en" ? (kind === "blog" ? "/blog" : "/news") : (kind === "blog" ? "/en/blog" : "/en/news");
  const demoPath = locale === "en" ? "/demo?lang=en" : "/demo";
  const downloadPath = locale === "en" ? "/download?lang=en" : "/download";
  return (
    <header className="border-b border-white/10 bg-[#171513] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap">
        <Link href={homePath} className="mr-auto inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40" aria-label="BloomMD">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.svg" alt="BloomMD" className="h-8 w-auto" />
        </Link>
        <nav className="order-3 flex w-full items-center gap-1 text-sm font-semibold text-white/68 sm:order-none sm:w-auto" aria-label={locale === "en" ? "Content navigation" : "Inhaltsnavigation"}>
          <Link href={blogPath} className={`rounded-md px-3 py-2 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40 ${kind === "blog" ? "bg-white/10 text-white" : ""}`}>{copy.blogLabel}</Link>
          <Link href={newsPath} className={`rounded-md px-3 py-2 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40 ${kind === "news" ? "bg-white/10 text-white" : ""}`}>{copy.newsLabel}</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm font-semibold">
          <Link href={demoPath} className="hidden rounded-md px-3 py-2 text-white/72 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40 md:inline-flex">
            {copy.demoLabel}
          </Link>
          <Link href={downloadPath} className="inline-flex rounded-md bg-[#FF6B35] px-3 py-2 text-white transition hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40">
            {copy.downloadLabel}
          </Link>
          <Link href={languagePath} hrefLang={locale === "en" ? "de" : "en"} className="rounded-md border border-white/15 px-3 py-2 text-white/68 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40">
            {locale === "en" ? "DE" : "EN"}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingContentIndex({ kind, locale, posts }: { kind: MarketingPostKind; locale: MarketingLocale; posts: MarketingPost[] }) {
  const copy = copyFor(kind, locale);
  const feedPath = locale === "en" ? "/en/news/feed.xml" : "/news/feed.xml";
  return (
    <main className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <SiteHeader locale={locale} kind={kind} copy={copy} />
      <section className="relative overflow-hidden bg-[#1A1A1A] text-white">
        <div className="absolute inset-0 opacity-30" aria-hidden="true" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,107,53,0.28), transparent 30%), linear-gradient(135deg, transparent 0 70%, rgba(255,255,255,0.04) 70% 70.5%, transparent 70.5%)" }} />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-11 sm:pb-16 sm:pt-16">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#FF8B5C]">{copy.eyebrow}</p>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/66 sm:text-xl sm:leading-8">{copy.description}</p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm font-semibold">
            <Link href={locale === "en" ? "/demo?lang=en" : "/demo"} className="inline-flex items-center gap-2 rounded-md bg-[#FF6B35] px-4 py-3 text-white transition hover:bg-[#E95F2F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/50">
              {copy.demoLabel}<ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href={locale === "en" ? "/download?lang=en" : "/download"} className="inline-flex items-center gap-2 rounded-md border border-white/18 px-4 py-3 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/50">
              {copy.downloadLabel}
            </Link>
            {kind === "news" && (
              <a href={feedPath} className="inline-flex items-center gap-2 rounded-md border border-white/18 px-4 py-3 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/50">
                <Rss size={16} aria-hidden="true" />{copy.feedLabel}
              </a>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16" aria-labelledby={`${kind}-list-title`}>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#B94316]">{kind === "blog" ? "01 / Journal" : "01 / Updates"}</p>
            <h2 id={`${kind}-list-title`} className="mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{kind === "blog" ? (locale === "en" ? "Read the latest thinking" : "Aktuelle Beiträge") : (locale === "en" ? "The latest changes" : "Die neuesten Änderungen")}</h2>
          </div>
          <Sparkles className="hidden text-[#FF6B35] sm:block" size={26} aria-hidden="true" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {posts.map((post, index) => (
            <article key={post.slug} className={`group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 shadow-[0_18px_50px_rgba(26,26,26,0.05)] transition hover:-translate-y-0.5 hover:border-[#FF6B35]/50 hover:shadow-[0_22px_60px_rgba(185,67,22,0.12)] ${index === 0 ? "lg:col-span-2 lg:p-8" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                <span className="inline-flex items-center gap-1.5 text-[#B94316]"><CalendarDays size={14} aria-hidden="true" />{postDateLabel(post, locale)}</span>
                {post.version && <span className="rounded-full border border-[var(--color-border)] px-2 py-1 font-mono normal-case tracking-normal">{kind === "news" && post.tags.some((tag) => tag.toLowerCase() === "desktop") ? (locale === "en" ? `Desktop ${post.version}` : `Desktop ${post.version}`) : `BloomMD ${post.version}`}</span>}
              </div>
              <h3 className={`mt-5 font-semibold tracking-[-0.025em] ${index === 0 ? "text-2xl sm:text-4xl" : "text-2xl"}`}>
                <Link href={marketingPostPath(kind, post.slug, locale)} className="rounded-sm transition hover:text-[#B94316] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">{post.title}</Link>
              </h3>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-ink-muted)]">{post.description}</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2" aria-label={locale === "en" ? "Tags" : "Tags"}>
                  {post.tags.map((tag) => <span key={tag} className="rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ink-muted)]">{tag}</span>)}
                </div>
                <Link href={marketingPostPath(kind, post.slug, locale)} className="inline-flex items-center gap-2 text-sm font-bold text-[#B94316] underline decoration-transparent underline-offset-4 transition group-hover:decoration-current focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20">{copy.readMore}<ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </article>
          ))}
        </div>
        {posts.length === 0 && <p className="rounded-xl border border-dashed border-[var(--color-border-strong)] p-8 text-[var(--color-ink-muted)]">{locale === "en" ? "No public posts yet." : "Noch keine öffentlichen Beiträge."}</p>}
      </section>
      <ContentFooter locale={locale} copy={copy} kind={kind} />
    </main>
  );
}

export function MarketingContentArticle({ kind, locale, post }: { kind: MarketingPostKind; locale: MarketingLocale; post: MarketingPost }) {
  const copy = copyFor(kind, locale);
  const indexPath = locale === "en" ? `/en/${kind}` : `/${kind}`;
  return (
    <main className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <SiteHeader locale={locale} kind={kind} copy={copy} />
      <article className="mx-auto max-w-4xl px-5 py-12 sm:py-20">
        <Link href={indexPath} className="inline-flex items-center gap-2 text-sm font-bold text-[#B94316] underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/20"><ArrowLeft size={16} aria-hidden="true" />{copy.backLabel}</Link>
        <header className="mt-10 border-b border-[var(--color-border)] pb-10">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#B94316]">{copy.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{post.title}</h1>
          <p className="mt-5 max-w-3xl text-xl leading-8 text-[var(--color-ink-muted)]">{post.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-[var(--color-ink-muted)]">
            <span className="inline-flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" />{post.commitDate ? `${copy.published} · ${locale === "en" ? "commit" : "Commit"} ${dateLabel(post.commitDate, locale)}` : `${copy.published} ${dateLabel(post.date, locale)}`}</span>
            {post.version && <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 font-mono text-xs">{kind === "news" && post.tags.some((tag) => tag.toLowerCase() === "desktop") ? `Desktop ${post.version}` : `BloomMD ${post.version}`}</span>}
            {post.tags.map((tag) => <span key={tag} className="rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-1 text-xs font-semibold">{tag}</span>)}
          </div>
        </header>
        <div className="prose-bloommd mt-10 max-w-3xl space-y-4 leading-7">
          <Markdown>{post.content}</Markdown>
        </div>
        {post.sourceUrl && <p className="mt-12 border-t border-[var(--color-border)] pt-5 text-sm text-[var(--color-ink-muted)]">{copy.sourceLabel}: <a href={post.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#B94316] underline">{post.sourceUrl}</a></p>}
      </article>
      <ContentFooter locale={locale} copy={copy} kind={kind} />
    </main>
  );
}

function ContentFooter({ locale, copy, kind }: { locale: MarketingLocale; copy: ContentCopy; kind: MarketingPostKind }) {
  const homePath = locale === "en" ? "/en" : "/";
  const docsPath = locale === "en" ? "/docs?lang=en" : "/docs";
  const demoPath = locale === "en" ? "/demo?lang=en" : "/demo";
  return (
    <footer className="border-t border-white/10 bg-[#171513] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.svg" alt="BloomMD" className="h-7 w-auto" />
          <span className="text-sm text-white/50">{kind === "blog" ? "Journal" : "News"}</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/65" aria-label={locale === "en" ? "Footer navigation" : "Footer-Navigation"}>
          <Link href={homePath} className="hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40">{copy.homeLabel}</Link>
          <Link href={docsPath} className="hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40">{copy.docsLabel}</Link>
          <Link href={demoPath} className="hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/40">{copy.demoLabel}</Link>
        </nav>
      </div>
    </footer>
  );
}
