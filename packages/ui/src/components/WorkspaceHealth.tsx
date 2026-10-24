import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { lintWorkspace, type LintFinding, type LintSeverity, type WorkspaceFileInput } from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";

export interface WorkspaceHealthProps {
  files: WorkspaceFileInput[];
  onOpenFile?: (path: string) => void;
  onClose?: () => void;
}

const ICON: Record<LintSeverity, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE: Record<LintSeverity, string> = {
  error: "text-[#B84218]",
  warning: "text-amber-600",
  info: "text-[var(--color-ink-faint)]",
};

/**
 * The same checks the CLI runs, inside the app.
 *
 * Deliberately the identical function rather than a second implementation: a rule that disagrees
 * between the terminal and the window is worse than having only one of the two, because a green
 * panel would then be an argument against a red pipeline.
 *
 * The round-trip check is opt-in here for the same reason it is a separate CLI command — it parses
 * and re-serialises every file, which is fine for a click and wrong for every keystroke.
 */
export function WorkspaceHealth({ files, onOpenFile, onClose }: WorkspaceHealthProps) {
  const { t } = useLocale();
  const [withRoundtrip, setWithRoundtrip] = useState(false);
  const [withOrphans, setWithOrphans] = useState(false);

  const result = useMemo(
    () => lintWorkspace(files, { checkRoundtrip: withRoundtrip, reportOrphans: withOrphans }),
    [files, withRoundtrip, withOrphans],
  );

  const grouped = useMemo(() => {
    const byPath = new Map<string, LintFinding[]>();
    for (const finding of result.findings) {
      const bucket = byPath.get(finding.path);
      if (bucket) bucket.push(finding);
      else byPath.set(finding.path, [finding]);
    }
    return [...byPath.entries()];
  }, [result.findings]);

  const labels: Record<LintSeverity, string> = { error: t.healthErrorSingular, warning: t.healthWarningSingular, info: t.healthInfo };
  return (
    <section
      data-testid="workspace-health"
      className="flex h-full min-h-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-raised)]"
    >
      <header className="flex items-start gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">{t.healthTitle}</h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
            {result.summary.filesChecked} {result.summary.filesChecked === 1 ? t.healthFileSingular : t.healthFilesPlural} ·{" "}
            {result.summary.errors} {result.summary.errors === 1 ? t.healthErrorSingular : t.healthErrorsPlural} ·{" "}
            {result.summary.warnings} {result.summary.warnings === 1 ? t.healthWarningSingular : t.healthWarningsPlural}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t.healthClose} className="rounded p-1 hover:bg-[var(--color-surface-sunken)]">
            <X size={16} />
          </button>
        )}
      </header>

      <div className="flex flex-wrap gap-3 border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-ink-muted)]">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            data-testid="health-roundtrip"
            checked={withRoundtrip}
            onChange={(event) => setWithRoundtrip(event.target.checked)}
          />
          {t.healthRoundtrip}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            data-testid="health-orphans"
            checked={withOrphans}
            onChange={(event) => setWithOrphans(event.target.checked)}
          />
          {t.healthOrphans}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {grouped.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">{t.healthNothingFound}</p>
        ) : (
          grouped.map(([path, findings]) => (
            <div key={path} className="mb-4">
              <button
                type="button"
                onClick={() => onOpenFile?.(path)}
                className="block w-full truncate text-left font-mono text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline"
                title={path}
              >
                {path}
              </button>
              <ul className="mt-1 space-y-1.5">
                {findings.map((finding, index) => {
                  const Icon = ICON[finding.severity];
                  return (
                    <li key={`${finding.code}-${index}`} className="flex gap-2 text-sm">
                      <Icon size={14} className={`mt-0.5 shrink-0 ${TONE[finding.severity]}`} aria-label={labels[finding.severity]} />
                      <div className="min-w-0">
                        <p className="text-[var(--color-ink)]">
                          {finding.message}
                          {finding.line !== null && (
                            <span className="ml-1 text-[var(--color-ink-faint)]">{t.healthLine} {finding.line}</span>
                          )}
                        </p>
                        {finding.detail && (
                          <pre className="mt-0.5 whitespace-pre-wrap font-mono text-xs text-[var(--color-ink-faint)]">{finding.detail}</pre>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <footer className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-ink-faint)]">
        {t.healthCliNote} <code className="font-mono">bloommd lint .</code>
      </footer>
    </section>
  );
}
