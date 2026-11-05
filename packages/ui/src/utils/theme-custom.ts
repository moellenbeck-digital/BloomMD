/**
 * Custom colour themes on top of the light/dark base.
 *
 * Everything here is pure (no DOM, no storage) so that the contrast guard, the token derivation and
 * the presets can be tested directly. `useTheme` applies the result; `theme-boot.ts` carries an
 * ES5 copy of the derivation for the blocking first-paint script, and a test keeps both identical.
 */

export type ThemeBase = "light" | "dark";

export interface CustomTheme {
  name: string;
  base: ThemeBase;
  /** Becomes `--color-bloom`. */
  accent: string;
  /** Becomes `--color-surface`; the base default when omitted. */
  surface?: string;
  /** Becomes `--color-ink`; picked automatically when omitted. */
  ink?: string;
}

export const CUSTOM_THEME_STORAGE_KEY = "bloommd-theme-custom";
export const CUSTOM_THEME_NAME_MAX = 40;
/** WCAG 2.x AA for normal text. */
export const MIN_TEXT_CONTRAST = 4.5;
/** WCAG 2.x AA for UI components and graphical objects. */
export const MIN_ACCENT_CONTRAST = 3;

export const BASE_DEFAULTS: Record<ThemeBase, { surface: string; ink: string }> = {
  light: { surface: "#FAFAFA", ink: "#1A1A1A" },
  dark: { surface: "#111111", ink: "#E8E4DF" },
};

/** The tokens a custom theme sets inline on `<html>`; everything else keeps the base value. */
export const CUSTOM_TOKEN_NAMES = [
  "--color-bloom",
  "--color-bloom-end",
  "--color-bloom-light",
  "--color-bloom-muted",
  "--color-ink",
  "--color-ink-muted",
  "--color-ink-faint",
  "--color-surface",
  "--color-surface-raised",
  "--color-surface-sunken",
  "--color-border",
  "--color-border-strong",
] as const;

export type CustomTokenName = (typeof CUSTOM_TOKEN_NAMES)[number];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` and `#aabbcc` in any case become `#AABBCC`; anything else is `null`. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!HEX.test(text)) return null;
  const digits = text.slice(1).toUpperCase();
  return `#${digits.length === 3 ? digits.replace(/./g, "$&$&") : digits}`;
}

export function isHexColor(value: unknown): boolean {
  return normalizeHex(value) !== null;
}

function toRgb(hex: string): [number, number, number] {
  const normal = normalizeHex(hex);
  if (!normal) throw new RangeError(`Not a hex colour: ${String(hex)}`);
  return [1, 3, 5].map((start) => parseInt(normal.slice(start, start + 2), 16)) as [number, number, number];
}

function toHex(channels: number[]): string {
  return `#${channels.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21, symmetric in its arguments. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `from` moved `amount` (0..1) of the way towards `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const a = toRgb(from);
  const b = toRgb(to);
  return toHex(a.map((channel, index) => channel + (b[index] - channel) * amount));
}

/** The ink for a surface when the user did not pick one: the base default if readable, else black or white. */
function autoInk(base: ThemeBase, surface: string): string {
  const preferred = BASE_DEFAULTS[base].ink;
  if (contrastRatio(preferred, surface) >= MIN_TEXT_CONTRAST) return preferred;
  return contrastRatio("#000000", surface) >= contrastRatio("#FFFFFF", surface) ? "#000000" : "#FFFFFF";
}

/** Accent, surface and ink with defaults filled in. Expects a theme that passed `validateCustomTheme`. */
export function resolveCustomColors(theme: CustomTheme): { accent: string; surface: string; ink: string } {
  const surface = normalizeHex(theme.surface) ?? BASE_DEFAULTS[theme.base].surface;
  return {
    accent: normalizeHex(theme.accent) as string,
    surface,
    ink: normalizeHex(theme.ink) ?? autoInk(theme.base, surface),
  };
}

/** `ink` blended towards the surface as far as `maxAmount` allows while it stays AA on every layer. */
function softInk(ink: string, layers: string[], maxAmount: number): string {
  for (let step = Math.round(maxAmount * 20); step > 0; step -= 1) {
    const candidate = mixColors(ink, layers[0], step / 20);
    if (layers.every((layer) => contrastRatio(candidate, layer) >= MIN_TEXT_CONTRAST)) return candidate;
  }
  return ink;
}

/** All twelve tokens of a custom theme as CSS custom properties. */
export function deriveCustomTokens(theme: CustomTheme): Record<CustomTokenName, string> {
  const { accent, surface, ink } = resolveCustomColors(theme);
  const light = relativeLuminance(surface) >= 0.18;
  const raised = light ? mixColors(surface, "#FFFFFF", 0.7) : mixColors(surface, "#FFFFFF", 0.05);
  const sunken = light ? mixColors(surface, "#000000", 0.04) : mixColors(surface, "#000000", 0.4);
  const layers = [surface, raised, sunken];
  return {
    "--color-bloom": accent,
    "--color-bloom-end": mixColors(accent, "#FFFFFF", 0.35),
    "--color-bloom-light": mixColors(surface, accent, light ? 0.1 : 0.16),
    "--color-bloom-muted": mixColors(surface, accent, light ? 0.28 : 0.34),
    "--color-ink": ink,
    "--color-ink-muted": softInk(ink, layers, 0.3),
    "--color-ink-faint": softInk(ink, layers, 0.4),
    "--color-surface": surface,
    "--color-surface-raised": raised,
    "--color-surface-sunken": sunken,
    "--color-border": mixColors(surface, ink, 0.12),
    "--color-border-strong": mixColors(surface, ink, 0.22),
  };
}

export type CustomThemeError =
  | "name"
  | "base"
  | "accent-hex"
  | "surface-hex"
  | "ink-hex"
  | "ink-contrast"
  | "accent-contrast";

export type CustomThemeValidation =
  | { ok: true; theme: CustomTheme }
  | { ok: false; error: CustomThemeError; /** Measured ratio for the two contrast errors. */ ratio?: number };

function optionalHex(value: unknown): string | null | undefined {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return undefined;
  return normalizeHex(value);
}

/**
 * Checks shape, hex values and the contrast guard. Returns the normalised theme (trimmed name,
 * upper-case six-digit hex, empty optional colours dropped) so callers store exactly what was checked.
 */
export function validateCustomTheme(input: unknown): CustomThemeValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "name" };
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length === 0 || name.length > CUSTOM_THEME_NAME_MAX) return { ok: false, error: "name" };
  if (raw.base !== "light" && raw.base !== "dark") return { ok: false, error: "base" };
  const accent = normalizeHex(raw.accent);
  if (!accent) return { ok: false, error: "accent-hex" };
  const surface = optionalHex(raw.surface);
  if (surface === null) return { ok: false, error: "surface-hex" };
  const ink = optionalHex(raw.ink);
  if (ink === null) return { ok: false, error: "ink-hex" };

  const theme: CustomTheme = { name, base: raw.base, accent };
  if (surface) theme.surface = surface;
  if (ink) theme.ink = ink;

  const colors = resolveCustomColors(theme);
  const inkRatio = contrastRatio(colors.ink, colors.surface);
  if (inkRatio < MIN_TEXT_CONTRAST) return { ok: false, error: "ink-contrast", ratio: inkRatio };
  const accentRatio = contrastRatio(colors.accent, colors.surface);
  if (accentRatio < MIN_ACCENT_CONTRAST) return { ok: false, error: "accent-contrast", ratio: accentRatio };
  return { ok: true, theme };
}

/** Storage format: `v` leaves room for later changes without breaking old values. */
export function serializeCustomTheme(theme: CustomTheme): string {
  return JSON.stringify({ v: 1, ...theme });
}

/** The stored theme, or `null` for missing, broken or no longer valid values — the base theme then applies. */
export function parseStoredCustomTheme(raw: string | null | undefined): CustomTheme | null {
  if (!raw) return null;
  try {
    const result = validateCustomTheme(JSON.parse(raw));
    return result.ok ? result.theme : null;
  } catch {
    return null;
  }
}

export interface ThemePreset {
  id: string;
  theme: CustomTheme;
}

/** Ready-made themes. Every one passes the guard with room to spare; a test pins that. */
export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "ocean", theme: { name: "Ocean", base: "light", accent: "#0B5FA5", surface: "#F4F8FB", ink: "#12202B" } },
  { id: "forest", theme: { name: "Forest", base: "light", accent: "#2E6B34", surface: "#F5F8F3", ink: "#1B261C" } },
  { id: "sepia", theme: { name: "Sepia", base: "light", accent: "#9A3F12", surface: "#F6EFE3", ink: "#2B2118" } },
  { id: "midnight", theme: { name: "Midnight", base: "dark", accent: "#7AB2FF", surface: "#0F1626", ink: "#E6ECF7" } },
  { id: "graphite", theme: { name: "Graphite", base: "dark", accent: "#FF9F6B", surface: "#1C1C1E", ink: "#F2F2F2" } },
];

/** Minimal slice of `HTMLElement` the apply step needs, so it can run against a stub. */
export interface ThemeRoot {
  classList: { toggle(token: string, force?: boolean): boolean };
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): string;
    colorScheme?: string;
  };
}

/**
 * Puts the effective theme on `<html>`: the `dark` class follows the custom theme's base when there is
 * one, and the custom tokens are set inline (which beats the `html.dark` block in globals.css).
 * With `custom === null` all custom tokens are removed again.
 */
export function applyThemeToRoot(root: ThemeRoot, plain: ThemeBase, custom: CustomTheme | null): void {
  root.classList.toggle("dark", (custom ? custom.base : plain) === "dark");
  if (!custom) {
    for (const name of CUSTOM_TOKEN_NAMES) root.style.removeProperty(name);
    root.style.colorScheme = "";
    return;
  }
  const tokens = deriveCustomTokens(custom);
  for (const name of CUSTOM_TOKEN_NAMES) root.style.setProperty(name, tokens[name]);
  root.style.colorScheme = custom.base;
}
