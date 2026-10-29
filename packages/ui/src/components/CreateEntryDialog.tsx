import { useEffect, useMemo, useState } from "react";
import { FilePlus2, FolderPlus, X } from "lucide-react";
import {
  listNoteTemplates,
  renderNoteTemplate,
  titleFromPath,
  type CustomNoteTemplate,
} from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";

export type CreateEntryKind = "folder" | "file";

export interface CreateEntryDialogProps {
  kind: CreateEntryKind;
  /** Existing folders, offered as a destination for a new file. */
  folders: string[];
  /**
   * Reads the user's own templates (the `.md` files in the workspace's template folder) when a file
   * dialog opens. A workspace without that folder resolves with an empty list.
   */
  loadCustomTemplates?: () => Promise<CustomNoteTemplate[]>;
  /**
   * Resolves with the created path, or rejects with a message to show. `content` is the rendered
   * template, and is left out when the file starts blank.
   */
  onCreate: (path: string, content?: string) => Promise<string>;
  onClose: () => void;
}

/**
 * Creates a folder or a Markdown file.
 *
 * The name is validated as the user types rather than on submit, because the rules are worth
 * knowing before pressing a button: a path may nest, but no segment may be `..`, and control
 * characters are refused. Those rules exist to keep a workspace inside its own directory, so they
 * are stated rather than silently applied.
 *
 * A new file can start from a template: blank (the default), one of the built-in templates in the UI
 * language, or one of the user's own. The dialog fills in the template and hands the content to
 * `onCreate`.
 */
export function CreateEntryDialog({ kind, folders, loadCustomTemplates, onCreate, onClose }: CreateEntryDialogProps) {
  const { t, locale } = useLocale();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [customTemplates, setCustomTemplates] = useState<CustomNoteTemplate[]>([]);
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    setName("");
    setParent("");
    setError(null);
    setTemplateId("");
  }, [kind]);

  useEffect(() => {
    setCustomTemplates([]);
    setTemplateError(null);
    if (kind !== "file" || !loadCustomTemplates) return;
    let cancelled = false;
    loadCustomTemplates().then(
      (loaded) => {
        if (!cancelled) setCustomTemplates(loaded);
      },
      (loadError: unknown) => {
        console.error("BloomMD could not load the custom templates", loadError);
        if (!cancelled) setTemplateError(loadError instanceof Error ? loadError.message : String(loadError));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, loadCustomTemplates]);

  const templates = useMemo(() => listNoteTemplates(locale, customTemplates), [locale, customTemplates]);
  const builtInTemplates = templates.filter((template) => template.builtIn);
  const ownTemplates = templates.filter((template) => !template.builtIn);

  const problem = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (/[\\:*?"<>|]/.test(trimmed)) return t.createEntryInvalidChars;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(trimmed)) return t.createEntryControlChars;
    if (trimmed.split("/").some((segment) => segment === "." || segment === "..")) {
      return t.createEntryPathEscape;
    }
    if (trimmed.startsWith("/")) return t.createEntryRelativePath;
    return null;
  }, [name, t]);

  const fullPath = useMemo(() => {
    const trimmed = name.trim().replace(/^\/+/, "");
    if (!trimmed) return "";
    const withParent = parent ? `${parent}/${trimmed}` : trimmed;
    return kind === "file" && !/\.(md|markdown)$/i.test(withParent) ? `${withParent}.md` : withParent;
  }, [kind, name, parent]);

  const submit = async () => {
    if (!fullPath || problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const template = kind === "file" ? templates.find((candidate) => candidate.id === templateId) : undefined;
      const content = template ? renderNoteTemplate(template.content, { title: titleFromPath(fullPath) }) : undefined;
      await onCreate(fullPath, content);
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
      setBusy(false);
    }
  };

  const Icon = kind === "folder" ? FolderPlus : FilePlus2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={kind === "folder" ? t.newFolder : t.newMindmap}
        data-testid="create-entry-dialog"
        className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
          <Icon size={18} className="text-[#FF6B35]" aria-hidden />
          <h2 className="flex-1 text-base font-semibold text-[var(--color-ink)]">
            {kind === "folder" ? t.newFolder : t.newMindmap}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded p-1 hover:bg-[var(--color-surface-sunken)]">
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {kind === "file" && folders.length > 0 && (
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-ink-muted)]">{t.folder}</span>
              <select
                value={parent}
                data-testid="create-entry-parent"
                onChange={(event) => setParent(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
              >
                <option value="">{t.rootDirectory}</option>
                {folders.map((folder) => (
                  <option key={folder} value={folder}>{folder}</option>
                ))}
              </select>
            </label>
          )}

          {kind === "file" && (
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-ink-muted)]">{t.createEntryTemplate}</span>
              <select
                value={templateId}
                data-testid="create-entry-template"
                onChange={(event) => setTemplateId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
              >
                <option value="">{t.createEntryTemplateBlank}</option>
                <optgroup label={t.createEntryTemplateBuiltIn}>
                  {builtInTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.title}</option>
                  ))}
                </optgroup>
                {ownTemplates.length > 0 && (
                  <optgroup label={t.createEntryTemplateCustom}>
                    {ownTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.title}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          )}
          {templateError && (
            <p data-testid="create-entry-template-error" className="text-xs text-[#B84218]">
              {t.createEntryTemplateLoadFailed} {templateError}
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-[var(--color-ink-muted)]">{t.name}</span>
            <input
              autoFocus
              value={name}
              data-testid="create-entry-name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
                if (event.key === "Escape") onClose();
              }}
              placeholder={kind === "folder" ? t.createEntryFolderPlaceholder : t.createEntryFilePlaceholder}
              className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] outline-none focus:border-[#FF6B35]"
            />
          </label>

          {fullPath && !problem && (
            <p className="text-xs text-[var(--color-ink-muted)]">
              {t.createdAs} <code className="font-mono text-[var(--color-ink)]">{fullPath}</code>
            </p>
          )}
          {problem && <p data-testid="create-entry-problem" className="text-xs text-[#B84218]">{problem}</p>}
          {error && <p data-testid="create-entry-error" className="text-xs text-[#B84218]">{error}</p>}

          <p className="text-xs text-[var(--color-ink-faint)]">
            {kind === "folder"
              ? t.createEntryFolderDescription
              : t.createEntryFileDescription}
          </p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-[var(--color-border-strong)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            data-testid="create-entry-submit"
            disabled={!fullPath || Boolean(problem) || busy}
            onClick={() => void submit()}
            className="h-9 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t.createEntryBusy : t.create}
          </button>
        </footer>
      </section>
    </div>
  );
}
