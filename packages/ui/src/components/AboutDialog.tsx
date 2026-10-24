"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { ExternalLink, Info, RefreshCw, X } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";

export interface AboutBuildInfo {
  product: string;
  package: string;
  deployment: string;
  version: string;
  sha: string;
  shortSha: string;
  tag: string;
  buildTime: string;
  channel: string;
  displayVersion: string;
}

export interface AboutUpdateInfo {
  currentVersion: string;
  availableVersion?: string;
  updateAvailable: boolean;
  updateReady: boolean;
  status?: string;
  message?: string;
  error?: string;
  progress?: number;
}

export type AboutDialogPlatform = "desktop" | "web";

export interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  buildInfo?: AboutBuildInfo | null;
  update?: AboutUpdateInfo | null;
  platform?: AboutDialogPlatform;
  onOpenLink?: (url: string) => void;
  onCheckForUpdate?: () => void;
  onDownloadUpdate?: () => void;
  onApplyUpdate?: () => void;
}

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "summary",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function BloomLogo() {
  return (
    <svg
      aria-hidden="true"
      className="h-10 w-[180px] shrink-0 sm:h-11 sm:w-[198px]"
      viewBox="0 0 360 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="bloom-about-logo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="100%" stopColor="#F7931E" />
        </linearGradient>
      </defs>
      <g transform="translate(8, 12)">
        <rect x="14" y="2" width="6" height="50" rx="3" fill="var(--color-ink)" />
        <rect x="30" y="2" width="6" height="50" rx="3" fill="var(--color-ink)" />
        <rect x="2" y="14" width="46" height="6" rx="3" fill="url(#bloom-about-logo)" />
        <rect x="2" y="32" width="46" height="6" rx="3" fill="url(#bloom-about-logo)" />
        <circle cx="48" cy="5" r="4" fill="url(#bloom-about-logo)" opacity="0.85" />
      </g>
      <text x="72" y="52" fontFamily="'Outfit', 'Helvetica Neue', 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', sans-serif" fontSize="38" fontWeight="700" fill="var(--color-ink)" letterSpacing="-0.5">
        Bloom<tspan fontWeight="400" fill="var(--color-ink-muted)">MD</tspan>
      </text>
    </svg>
  );
}

function ExternalResourceLink({
  href,
  label,
  onOpenLink,
}: {
  href: string;
  label: string;
  onOpenLink?: (url: string) => void;
}) {
  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!onOpenLink) return;
    event.preventDefault();
    onOpenLink(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-[var(--color-bloom)] underline decoration-[var(--color-bloom-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-bloom)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface-raised)]"
    >
      <span>{label}</span>
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

export function AboutDialog({
  open,
  onClose,
  buildInfo,
  update,
  platform = "desktop",
  onOpenLink,
  onCheckForUpdate,
  onDownloadUpdate,
  onApplyUpdate,
}: AboutDialogProps) {
  const { t, locale } = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
      if (!focusableElements || focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusableElements.item(0);
      const last = focusableElements.item(focusableElements.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousActiveElementRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const localizedMarketingUrl = (path: string) => `https://bloommd.io${path}${locale === "en" ? "?lang=en" : ""}`;
  const versionLabel = buildInfo?.displayVersion || t.aboutVersionLoading;
  const isWeb = platform === "web";
  const localFirstLabel = isWeb ? t.aboutWebLocalFirst : t.aboutLocalFirst;
  const updateNote = isWeb ? t.aboutWebUpdateNote : t.aboutUpdateNote;
  const technologies = isWeb
    ? locale === "de"
      ? [
          "Next.js · App Router · gehostete Web-Anwendung",
          "React · TypeScript · interaktive App-Oberfläche",
          "React Flow + dagre · Mindmap-Canvas und Layout",
          "unified · remark · gray-matter · Markdown-Verarbeitung",
          "Zustand · Yjs · Sync und kollaboratives Dokumentmodell",
          "Tailwind CSS · Lucide React · UI-Grundlage",
        ]
      : [
          "Next.js · App Router · hosted web application",
          "React · TypeScript · interactive app surface",
          "React Flow + dagre · mindmap canvas and layout",
          "unified · remark · gray-matter · Markdown processing",
          "Zustand · Yjs · sync and collaborative document model",
          "Tailwind CSS · Lucide React · UI foundation",
        ]
    : locale === "de"
      ? [
          "Electrobun · nativer macOS-Rahmen und RPC",
          "Bun · Runtime und Package-Tooling",
          "React · TypeScript · Vite · Renderer",
          "React Flow + dagre · Mindmap-Canvas und Layout",
          "unified · remark · gray-matter · Markdown-Parsing",
          "Yjs · kollaboratives Dokumentmodell",
          "Tailwind CSS · Lucide React · UI-Grundlage",
        ]
      : [
          "Electrobun · native macOS shell and RPC",
          "Bun · runtime and package tooling",
          "React · TypeScript · Vite · renderer",
          "React Flow + dagre · mindmap canvas and layout",
          "unified · remark · gray-matter · Markdown parsing",
          "Yjs · collaborative document model",
          "Tailwind CSS · Lucide React · UI foundation",
        ];
  const betaStatuses = isWeb
    ? [t.aboutBetaWeb, t.aboutBetaCollaboration, t.aboutBetaMobile, t.aboutBetaObsidian]
    : [t.aboutBetaMac, t.aboutBetaMobile, t.aboutBetaCollaboration, t.aboutBetaObsidian];

  const closeOnBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCloseRef.current();
  };
  const showUpdates = !isWeb && (Boolean(update) || Boolean(onCheckForUpdate));
  const updateBusy = [
    "checking",
    "download-starting",
    "checking-local-tar",
    "local-tar-found",
    "local-tar-missing",
    "fetching-patch",
    "patch-found",
    "patch-not-found",
    "downloading-patch",
    "applying-patch",
    "patch-applied",
    "extracting-version",
    "patch-chain-complete",
    "downloading-full-bundle",
    "download-progress",
    "decompressing",
    "applying",
    "extracting",
    "replacing-app",
    "launching-new-version",
  ].includes(update?.status ?? "");
  const updateMessage = update?.error
    ? t.aboutUpdateError
    : update?.updateReady
      ? t.aboutUpdateReady
      : update?.updateAvailable
        ? t.aboutUpdateAvailable
        : updateBusy
          ? t.aboutUpdateChecking
          : t.aboutUpdateNone;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      data-testid="about-dialog-backdrop"
      onMouseDown={closeOnBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        aria-describedby="about-dialog-description"
        tabIndex={-1}
        data-testid="about-dialog"
        data-platform={platform}
        className="flex max-h-[min(780px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-2xl shadow-black/30 focus-visible:outline-none sm:max-h-[calc(100vh-3rem)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] bg-[linear-gradient(135deg,var(--color-surface-raised),var(--color-bloom-light))] px-5 py-5 sm:px-7 sm:py-6">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <BloomLogo />
              <span className="rounded-full border border-[var(--color-bloom-muted)] bg-[var(--color-bloom-light)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-bloom)]">
                {t.aboutBetaBadge}
              </span>
            </div>
            <h2 id="about-dialog-title" className="font-[var(--font-display,Outfit,sans-serif)] text-2xl font-semibold tracking-tight sm:text-3xl">
              {t.aboutTitle}
            </h2>
            <p id="about-dialog-description" className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)] sm:text-base">
              {t.aboutTagline}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-bloom)]">
              {localFirstLabel}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label={t.aboutClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-bloom)]"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-[var(--color-bloom-light)] p-2 text-[var(--color-bloom)]">
                  <Info size={18} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-ink)]">{t.aboutPositioning}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">{t.aboutTagline}</p>
                </div>
              </div>
            </section>
            <section className="rounded-xl border border-[var(--color-bloom-muted)] bg-[var(--color-bloom-light)] p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-bloom)]">BloomMD</p>
              <p data-testid="about-display-version" className="mt-2 font-[var(--font-mono,monospace)] text-lg font-medium text-[var(--color-ink)]">
                {versionLabel}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--color-ink-muted)]">{updateNote}</p>
            </section>
          </div>

          {showUpdates && (
            <section data-testid="about-updates" className="mt-5 rounded-xl border border-[var(--color-bloom-muted)] bg-[var(--color-bloom-light)] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-ink)]">{t.aboutUpdates}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">{updateMessage}</p>
                  {update?.message && updateBusy && <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{update.message}</p>}
                  {update?.availableVersion && update.updateAvailable && <p className="mt-2 font-[var(--font-mono,monospace)] text-xs text-[var(--color-ink-muted)]">{update.currentVersion} → {update.availableVersion}</p>}
                </div>
                <RefreshCw size={20} aria-hidden="true" className={updateBusy ? "animate-spin text-[var(--color-bloom)]" : "text-[var(--color-bloom)]"} />
              </div>
              {typeof update?.progress === "number" && update.progress >= 0 && update.progress <= 100 && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-[var(--color-ink-muted)]"><span>{t.aboutUpdateProgress}</span><span>{Math.round(update.progress)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-raised)]"><div className="h-full rounded-full bg-[var(--color-bloom)] transition-[width]" style={{ width: `${update.progress}%` }} /></div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {update?.updateReady ? (
                  <button type="button" onClick={onApplyUpdate} disabled={updateBusy} className="rounded-lg bg-[var(--color-bloom)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{t.aboutInstallUpdate}</button>
                ) : update?.updateAvailable ? (
                  <button type="button" onClick={onDownloadUpdate} disabled={updateBusy} className="rounded-lg bg-[var(--color-bloom)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{t.aboutDownloadUpdate}</button>
                ) : (
                  <button type="button" onClick={onCheckForUpdate} disabled={updateBusy} className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-bloom-muted)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-bloom)] disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" />{t.aboutCheckForUpdates}</button>
                )}
              </div>
            </section>
          )}

          <div className="mt-5 space-y-3">
            <details data-testid="about-technologies" className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-[var(--color-ink)] outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-bloom)] sm:px-5">
                <span className="flex items-center justify-between gap-4">
                  <span>{t.aboutTechnologies}</span>
                  <span aria-hidden="true" className="text-lg leading-none text-[var(--color-bloom)] transition-transform group-open:rotate-45">+</span>
                </span>
              </summary>
              <div className="border-t border-[var(--color-border)] px-4 pb-5 pt-4 sm:px-5">
                <p className="mb-3 text-sm text-[var(--color-ink-muted)]">{isWeb ? t.aboutWebTechnologiesDescription : t.aboutTechnologiesDescription}</p>
                <ul className="grid gap-2 text-sm leading-6 text-[var(--color-ink-muted)] sm:grid-cols-2">
                  {technologies.map((technology) => <li key={technology} className="rounded-lg bg-[var(--color-surface-raised)] px-3 py-2">{technology}</li>)}
                </ul>
              </div>
            </details>

            <details data-testid="about-beta-status" open className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-[var(--color-ink)] outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-bloom)] sm:px-5">
                <span className="flex items-center justify-between gap-4">
                  <span>{t.aboutBetaStatus}</span>
                  <span aria-hidden="true" className="text-lg leading-none text-[var(--color-bloom)] transition-transform group-open:rotate-45">+</span>
                </span>
              </summary>
              <div className="border-t border-[var(--color-border)] px-4 pb-5 pt-4 sm:px-5">
                <p className="mb-3 text-sm leading-6 text-[var(--color-ink-muted)]">{t.aboutBetaStatusDescription}</p>
                <ul className="space-y-2 text-sm leading-6 text-[var(--color-ink-muted)]">
                  {betaStatuses.map((status) => <li key={status} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-bloom)]" />{status}</li>)}
                </ul>
              </div>
            </details>

            <details data-testid="about-build-details" className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-[var(--color-ink)] outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-bloom)] sm:px-5">
                <span className="flex items-center justify-between gap-4">
                  <span>{t.aboutBuildDetails}</span>
                  <span aria-hidden="true" className="text-lg leading-none text-[var(--color-bloom)] transition-transform group-open:rotate-45">+</span>
                </span>
              </summary>
              <div className="border-t border-[var(--color-border)] px-4 pb-5 pt-4 sm:px-5">
                {buildInfo ? (
                  <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
                    {[
                      [t.aboutBuildTag, buildInfo.tag],
                      [t.aboutBuildSha, buildInfo.sha],
                      [t.aboutBuildTime, buildInfo.buildTime],
                      [t.aboutBuildChannel, buildInfo.channel],
                      [t.aboutBuildPackage, buildInfo.package],
                      [t.aboutBuildDeployment, buildInfo.deployment],
                    ].map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</dt><dd className="mt-1 break-all font-[var(--font-mono,monospace)] text-[var(--color-ink-muted)]">{value}</dd></div>)}
                  </dl>
                ) : <p className="text-sm text-[var(--color-ink-muted)]">{t.aboutVersionLoading}</p>}
              </div>
            </details>

            <section data-testid="about-legal" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 sm:px-5">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">{t.aboutLegal}</h3>
              <nav aria-label={t.aboutLegal} className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                <ExternalResourceLink href={localizedMarketingUrl("/impressum")} label={t.aboutImprint} onOpenLink={onOpenLink} />
                <ExternalResourceLink href={localizedMarketingUrl("/datenschutz")} label={t.aboutPrivacy} onOpenLink={onOpenLink} />
                <ExternalResourceLink href={localizedMarketingUrl("/lizenz")} label={t.aboutLicenses} onOpenLink={onOpenLink} />
                <ExternalResourceLink href={localizedMarketingUrl("/docs")} label={t.aboutDocumentation} onOpenLink={onOpenLink} />
                <ExternalResourceLink href={localizedMarketingUrl("/download")} label={t.aboutSupport} onOpenLink={onOpenLink} />
              </nav>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
