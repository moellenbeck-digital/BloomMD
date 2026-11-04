import { parseConflictCopy } from "@bloommd/core/browser";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";

export interface ConflictCopyBannerProps {
  /** Path of the open note. The banner renders nothing unless it is a conflict copy. */
  filename: string;
  /**
   * The listed note the copy was made from (`findConflictCopyOriginal`), or null when it no longer
   * exists. Only the host knows its note list, so it decides.
   */
  originalFilename: string | null;
  /** Without it the banner names the original but offers no way to open it. */
  onOpenOriginal?: (filename: string) => void;
}

/** Shown above an open conflict copy: what it is, and where the note it came from is. */
export function ConflictCopyBanner({ filename, originalFilename, onOpenOriginal }: ConflictCopyBannerProps) {
  const { t } = useLocale();
  const info = parseConflictCopy(filename);
  if (!info) return null;
  return (
    <div
      role="status"
      data-testid="conflict-copy-banner"
      className="flex items-start gap-3 border-b border-[#F2B8A0] bg-[#FFF1EA] px-4 py-2.5 text-[#7A3413]"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm leading-5">
        <p className="font-semibold">{t.conflictCopyBannerTitle}</p>
        <p className="text-xs leading-5">{t.conflictCopyBannerBody}</p>
        <p className="mt-1 text-xs leading-5" data-testid="conflict-copy-original">
          {originalFilename
            ? t.conflictCopyOriginal.replace("%filename%", originalFilename)
            : t.conflictCopyOriginalMissing.replace("%filename%", info.originalPath)}
        </p>
      </div>
      {originalFilename && onOpenOriginal && (
        <button
          type="button"
          data-testid="conflict-copy-open-original"
          onClick={() => onOpenOriginal(originalFilename)}
          className="shrink-0 rounded-md border border-[#E39B7B] bg-white px-3 py-1.5 text-xs font-semibold text-[#7A3413] hover:bg-[#FFF8F4]"
        >
          {t.conflictCopyOpenOriginal}
        </button>
      )}
    </div>
  );
}
