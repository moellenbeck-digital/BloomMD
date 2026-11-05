"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Palette, X } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";
import {
  BASE_DEFAULTS,
  MIN_ACCENT_CONTRAST,
  MIN_TEXT_CONTRAST,
  THEME_PRESETS,
  contrastRatio,
  normalizeHex,
  resolveCustomColors,
  type CustomTheme,
  type CustomThemeError,
  type CustomThemeValidation,
  type ThemeBase,
} from "../utils/theme-custom";

export interface ThemeCustomDialogProps {
  open: boolean;
  /** The active custom theme; the form starts from it. */
  current: CustomTheme | null;
  /** Base of the theme in effect, used as the starting base for a new custom theme. */
  base: ThemeBase;
  /** Validates and stores; a failed result keeps the dialog open and is explained to the user. */
  onSave: (input: CustomTheme) => CustomThemeValidation;
  onReset: () => void;
  onClose: () => void;
}

interface Draft {
  name: string;
  base: ThemeBase;
  accent: string;
  surface: string;
  ink: string;
}

type Field = "name" | "accent" | "surface" | "ink";

const DEFAULT_ACCENT = "#B94316";

const FIELD_OF_ERROR: Record<CustomThemeError, Field | null> = {
  name: "name",
  base: null,
  "accent-hex": "accent",
  "surface-hex": "surface",
  "ink-hex": "ink",
  "ink-contrast": "ink",
  "accent-contrast": "accent",
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function toDraft(theme: CustomTheme | null, base: ThemeBase, fallbackName: string): Draft {
  return {
    name: theme?.name ?? fallbackName,
    base: theme?.base ?? base,
    accent: theme?.accent ?? DEFAULT_ACCENT,
    surface: theme?.surface ?? "",
    ink: theme?.ink ?? "",
  };
}

export function ThemeCustomDialog(props: ThemeCustomDialogProps) {
  if (!props.open) return null;
  return <ThemeCustomDialogBody {...props} />;
}

function ThemeCustomDialogBody({ current, base, onSave, onReset, onClose }: ThemeCustomDialogProps) {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState<Draft>(() => toDraft(current, base, t.themeCustomTitle));
  const [error, setError] = useState<{ field: Field | null; message: string } | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const firstPresetRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the dialog and returns to where it came from (the help menu button) on close.
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement | null;
    firstPresetRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const update = (patch: Partial<Draft>) => {
    setDraft((value) => ({ ...value, ...patch }));
    setError(null);
  };

  const formatRatio = (ratio: number) => {
    const text = (Math.floor(ratio * 10) / 10).toFixed(1);
    return locale === "de" ? text.replace(".", ",") : text;
  };

  const messageFor = (result: Extract<CustomThemeValidation, { ok: false }>) => {
    switch (result.error) {
      case "name":
      case "base":
        return t.themeErrorName;
      case "accent-hex":
      case "surface-hex":
      case "ink-hex":
        return t.themeErrorHex;
      case "ink-contrast":
        return t.themeErrorInk.replace("%ratio%", formatRatio(result.ratio ?? 1));
      case "accent-contrast":
        return t.themeErrorAccent.replace("%ratio%", formatRatio(result.ratio ?? 1));
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = onSave({
      name: draft.name,
      base: draft.base,
      accent: draft.accent,
      surface: draft.surface,
      ink: draft.ink,
    });
    if (result.ok) {
      onClose();
      return;
    }
    setError({ field: FIELD_OF_ERROR[result.error], message: messageFor(result) });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = globalThis.document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Live read-out of the two guarded ratios, once the colours parse.
  const accent = normalizeHex(draft.accent);
  const surface = draft.surface.trim() === "" ? BASE_DEFAULTS[draft.base].surface : normalizeHex(draft.surface);
  const ink = draft.ink.trim() === "" ? null : normalizeHex(draft.ink);
  const resolved = accent && surface && (draft.ink.trim() === "" || ink)
    ? resolveCustomColors({ name: "x", base: draft.base, accent, surface, ink: ink ?? undefined })
    : null;
  const inkRatio = resolved ? contrastRatio(resolved.ink, resolved.surface) : null;
  const accentRatio = resolved ? contrastRatio(resolved.accent, resolved.surface) : null;

  const fieldClass = "h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-bloom)] focus:ring-2 focus:ring-[var(--color-bloom)]/30 aria-[invalid=true]:border-[var(--color-danger)]";
  const buttonClass = "h-10 rounded-md border border-[var(--color-border-strong)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-bloom)]";

  const colorField = (field: "accent" | "surface" | "ink", label: string, optional: boolean) => {
    const value = draft[field];
    const picker = normalizeHex(value) ?? (field === "accent" ? DEFAULT_ACCENT : BASE_DEFAULTS[draft.base][field]);
    const invalid = error?.field === field;
    return (
      <div>
        <label htmlFor={`theme-custom-${field}`} className="text-xs font-medium text-[var(--color-ink-muted)]">{label}</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id={`theme-custom-${field}`}
            data-testid={`theme-custom-${field}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            value={value}
            placeholder={optional ? t.themeAuto : DEFAULT_ACCENT}
            aria-invalid={invalid}
            aria-describedby={invalid ? "theme-custom-error" : optional ? "theme-custom-hint" : undefined}
            onChange={(event) => update({ [field]: event.target.value } as Partial<Draft>)}
            className={fieldClass}
          />
          <input
            type="color"
            data-testid={`theme-custom-${field}-picker`}
            aria-label={`${label}: ${t.themePickColor}`}
            value={picker.toLowerCase()}
            onChange={(event) => update({ [field]: event.target.value.toUpperCase() } as Partial<Draft>)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1"
          />
        </div>
      </div>
    );
  };

  const nameInvalid = error?.field === "name";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-custom-title"
        aria-describedby="theme-custom-description"
        data-testid="theme-custom-dialog"
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <Palette size={19} className="shrink-0 text-[var(--color-bloom)]" aria-hidden="true" />
          <h2 id="theme-custom-title" className="flex-1 text-base font-semibold">{t.themeCustomTitle}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-5 overflow-y-auto px-5 py-5">
            <p id="theme-custom-description" className="text-sm leading-5 text-[var(--color-ink-muted)]">{t.themeCustomDescription}</p>

            <fieldset>
              <legend className="text-xs font-medium text-[var(--color-ink-muted)]">{t.themePresets}</legend>
              <div data-testid="theme-custom-presets" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {THEME_PRESETS.map((preset, index) => {
                  const selected = draft.name === preset.theme.name && draft.accent === preset.theme.accent && draft.surface === preset.theme.surface && draft.ink === preset.theme.ink && draft.base === preset.theme.base;
                  return (
                    <button
                      key={preset.id}
                      ref={index === 0 ? firstPresetRef : undefined}
                      type="button"
                      data-testid={`theme-custom-preset-${preset.id}`}
                      aria-pressed={selected}
                      onClick={() => update({
                        name: preset.theme.name,
                        base: preset.theme.base,
                        accent: preset.theme.accent,
                        surface: preset.theme.surface ?? "",
                        ink: preset.theme.ink ?? "",
                      })}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-bloom)] ${selected ? "border-[var(--color-bloom)] ring-2 ring-[var(--color-bloom)]/30" : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-sunken)]"}`}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-9 shrink-0 items-center justify-center rounded border border-[var(--color-border-strong)] text-xs font-bold"
                        style={{ backgroundColor: preset.theme.surface, color: preset.theme.accent }}
                      >Aa</span>
                      <span>{preset.theme.name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="theme-custom-name" className="text-xs font-medium text-[var(--color-ink-muted)]">{t.themeName}</label>
              <input
                id="theme-custom-name"
                data-testid="theme-custom-name"
                type="text"
                maxLength={40}
                autoComplete="off"
                value={draft.name}
                aria-invalid={nameInvalid}
                aria-describedby={nameInvalid ? "theme-custom-error" : undefined}
                onChange={(event) => update({ name: event.target.value })}
                className={`mt-1 ${fieldClass} font-sans`}
              />
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-[var(--color-ink-muted)]">{t.themeBase}</legend>
              <div className="mt-1 flex gap-4">
                {(["light", "dark"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="theme-custom-base"
                      data-testid={`theme-custom-base-${value}`}
                      checked={draft.base === value}
                      onChange={() => update({ base: value })}
                      className="h-4 w-4 accent-[var(--color-bloom)]"
                    />
                    {value === "light" ? t.lightMode : t.darkMode}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-3">
              {colorField("accent", t.themeAccent, false)}
              {colorField("surface", t.themeSurface, true)}
              {colorField("ink", t.themeInk, true)}
            </div>
            <p id="theme-custom-hint" className="-mt-3 text-xs text-[var(--color-ink-muted)]">{t.themeOptionalHint}</p>

            {inkRatio !== null && accentRatio !== null && (
              <ul data-testid="theme-custom-contrast" className="space-y-1 text-xs text-[var(--color-ink-muted)]">
                <li data-ok={inkRatio >= MIN_TEXT_CONTRAST}>{inkRatio >= MIN_TEXT_CONTRAST ? "✓ " : "✗ "}{t.themeContrastInk.replace("%ratio%", formatRatio(inkRatio))}</li>
                <li data-ok={accentRatio >= MIN_ACCENT_CONTRAST}>{accentRatio >= MIN_ACCENT_CONTRAST ? "✓ " : "✗ "}{t.themeContrastAccent.replace("%ratio%", formatRatio(accentRatio))}</li>
              </ul>
            )}

            {error && (
              <p id="theme-custom-error" role="alert" data-testid="theme-custom-error" className="rounded-md border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">{error.message}</p>
            )}
          </div>

          <footer className="flex flex-wrap justify-between gap-2 border-t border-[var(--color-border)] px-5 py-4">
            <button type="button" data-testid="theme-custom-reset" onClick={() => { onReset(); onClose(); }} className={buttonClass}>{t.themeReset}</button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={buttonClass}>{t.cancel}</button>
              <button
                type="submit"
                data-testid="theme-custom-save"
                className="h-10 rounded-md bg-[var(--color-ink)] px-4 text-sm font-semibold text-[var(--color-surface)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-bloom)]"
              >{t.themeSave}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>,
    globalThis.document.body,
  );
}
