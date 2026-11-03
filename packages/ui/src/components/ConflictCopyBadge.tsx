import { parseConflictCopy } from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";

/**
 * Marks a note in a list as a conflict copy (see `parseConflictCopy` in core for the naming scheme).
 * Renders nothing for every other note, so lists can put it next to every entry.
 */
export function ConflictCopyBadge({ filename, className = "" }: { filename: string; className?: string }) {
  const { t } = useLocale();
  if (!parseConflictCopy(filename)) return null;
  return (
    <span
      data-testid="conflict-copy-badge"
      title={t.conflictCopyTooltip}
      className={`inline-flex shrink-0 items-center rounded border border-[#F2B8A0] bg-[#FFF1EA] px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide text-[#B04A1B] ${className}`}
    >
      {t.conflictCopyBadge}
    </span>
  );
}
