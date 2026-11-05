import { describe, expect, test } from "bun:test";
import {
  BASE_DEFAULTS,
  CUSTOM_TOKEN_NAMES,
  THEME_PRESETS,
  applyThemeToRoot,
  contrastRatio,
  deriveCustomTokens,
  isHexColor,
  mixColors,
  normalizeHex,
  parseStoredCustomTheme,
  relativeLuminance,
  serializeCustomTheme,
  validateCustomTheme,
  type CustomTheme,
} from "./theme-custom";

describe("hex validation", () => {
  test("accepts three and six digit hex in any case and normalises it", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex(" #b94316 ")).toBe("#B94316");
    expect(isHexColor("#FFFFFF")).toBe(true);
  });

  test("rejects everything that is not a plain hex colour", () => {
    for (const bad of ["", "b94316", "#b9431", "#b943160", "#GGGGGG", "red", "rgb(1,2,3)", "#fff; background:url(x)", "url(javascript:1)", null, undefined, 12, {}]) {
      expect(isHexColor(bad)).toBe(false);
    }
  });
});

describe("contrast", () => {
  test("matches the WCAG reference values", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 10);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 10);
    // #767676 on white is the well-known smallest grey that still reaches 4.5:1.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(4.5);
  });

  test("is symmetric and rejects invalid colours", () => {
    expect(contrastRatio("#B94316", "#FAFAFA")).toBeCloseTo(contrastRatio("#FAFAFA", "#B94316"), 10);
    expect(() => contrastRatio("nope", "#FFFFFF")).toThrow(RangeError);
  });

  test("mixing hits the end points and the middle", () => {
    expect(mixColors("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mixColors("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(mixColors("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});

describe("validateCustomTheme", () => {
  const ok: CustomTheme = { name: "Mine", base: "light", accent: "#0B5FA5" };

  test("accepts a theme with only an accent and normalises it", () => {
    const result = validateCustomTheme({ ...ok, name: "  Mine ", accent: "#0b5fa5", surface: "", ink: "" });
    expect(result).toEqual({ ok: true, theme: { name: "Mine", base: "light", accent: "#0B5FA5" } });
  });

  test("refuses text below 4.5:1 on the surface and reports the ratio", () => {
    const result = validateCustomTheme({ ...ok, surface: "#FFFFFF", ink: "#777777" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("ink-contrast");
      expect(result.ratio).toBeLessThan(4.5);
    }
    expect(validateCustomTheme({ ...ok, surface: "#FFFFFF", ink: "#767676" }).ok).toBe(true);
  });

  test("refuses an accent below 3:1 on the surface", () => {
    const result = validateCustomTheme({ ...ok, accent: "#EEEEEE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("accent-contrast");
    // 3:1 is enough for the accent, unlike for text.
    expect(validateCustomTheme({ ...ok, surface: "#FFFFFF", accent: "#949494" }).ok).toBe(true);
    expect(validateCustomTheme({ ...ok, surface: "#FFFFFF", accent: "#9A9A9A" }).ok).toBe(false);
  });

  test("picks a readable ink on its own when only the surface is changed", () => {
    for (const surface of ["#000000", "#808080", "#FFFFFF", "#7F7F7F", "#1E3A8A", "#FDE68A"]) {
      for (const base of ["light", "dark"] as const) {
        const result = validateCustomTheme({ name: "x", base, accent: "#FFFFFF", surface });
        // The accent may fail on a light surface, but never because of the auto-picked ink.
        if (!result.ok) expect(result.error).toBe("accent-contrast");
      }
    }
    const dark = validateCustomTheme({ name: "x", base: "dark", accent: "#9A3F12", surface: "#FFFFFF" });
    expect(dark.ok).toBe(true);
    if (dark.ok) {
      expect(contrastRatio(deriveCustomTokens(dark.theme)["--color-ink"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("names the first problem for bad input", () => {
    expect(validateCustomTheme(null)).toEqual({ ok: false, error: "name" });
    expect(validateCustomTheme([])).toEqual({ ok: false, error: "name" });
    expect(validateCustomTheme({ ...ok, name: "   " })).toEqual({ ok: false, error: "name" });
    expect(validateCustomTheme({ ...ok, name: "x".repeat(41) })).toEqual({ ok: false, error: "name" });
    expect(validateCustomTheme({ ...ok, base: "sepia" })).toEqual({ ok: false, error: "base" });
    expect(validateCustomTheme({ ...ok, accent: "orange" })).toEqual({ ok: false, error: "accent-hex" });
    expect(validateCustomTheme({ ...ok, surface: "white" })).toEqual({ ok: false, error: "surface-hex" });
    expect(validateCustomTheme({ ...ok, ink: "#12" })).toEqual({ ok: false, error: "ink-hex" });
  });
});

describe("storage", () => {
  const theme: CustomTheme = { name: "Mine", base: "dark", accent: "#7AB2FF", surface: "#0F1626", ink: "#E6ECF7" };

  test("round-trips through the stored JSON", () => {
    expect(parseStoredCustomTheme(serializeCustomTheme(theme))).toEqual(theme);
  });

  test("ignores missing, broken, hostile and no longer valid values", () => {
    for (const raw of [null, undefined, "", "{", "null", "[]", "42", '"dark"', '{"name":"x"}', JSON.stringify({ ...theme, accent: "url(x)" }),
      JSON.stringify({ ...theme, ink: "#0F1626" }), JSON.stringify({ ...theme, base: "neon" })]) {
      expect(parseStoredCustomTheme(raw)).toBeNull();
    }
  });
});

describe("derived tokens", () => {
  test("sets every token with a plain hex value", () => {
    for (const { theme } of THEME_PRESETS) {
      const tokens = deriveCustomTokens(theme);
      expect(Object.keys(tokens)).toEqual([...CUSTOM_TOKEN_NAMES]);
      for (const value of Object.values(tokens)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  test("takes the picked colours as they are", () => {
    const tokens = deriveCustomTokens({ name: "x", base: "light", accent: "#0B5FA5", surface: "#F4F8FB", ink: "#12202B" });
    expect(tokens["--color-bloom"]).toBe("#0B5FA5");
    expect(tokens["--color-surface"]).toBe("#F4F8FB");
    expect(tokens["--color-ink"]).toBe("#12202B");
  });

  test("falls back to the base defaults", () => {
    expect(deriveCustomTokens({ name: "x", base: "light", accent: "#0B5FA5" })["--color-surface"]).toBe(BASE_DEFAULTS.light.surface);
    expect(deriveCustomTokens({ name: "x", base: "dark", accent: "#7AB2FF" })["--color-ink"]).toBe(BASE_DEFAULTS.dark.ink);
  });

  test("layers keep their order: raised is lighter than sunken on light, the reverse stays distinct on dark", () => {
    const light = deriveCustomTokens({ name: "x", base: "light", accent: "#0B5FA5" });
    expect(relativeLuminance(light["--color-surface-raised"])).toBeGreaterThan(relativeLuminance(light["--color-surface"]));
    expect(relativeLuminance(light["--color-surface-sunken"])).toBeLessThan(relativeLuminance(light["--color-surface"]));
    const dark = deriveCustomTokens({ name: "x", base: "dark", accent: "#7AB2FF" });
    expect(relativeLuminance(dark["--color-surface-raised"])).toBeGreaterThan(relativeLuminance(dark["--color-surface"]));
    expect(relativeLuminance(dark["--color-surface-sunken"])).toBeLessThan(relativeLuminance(dark["--color-surface"]));
  });
});

describe("presets", () => {
  test("there are at least three and each is a valid, unchanged theme", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(THEME_PRESETS.map((preset) => preset.id)).size).toBe(THEME_PRESETS.length);
    for (const { theme } of THEME_PRESETS) {
      expect(validateCustomTheme(theme)).toEqual({ ok: true, theme });
    }
  });

  test("offer both bases", () => {
    expect(new Set(THEME_PRESETS.map((preset) => preset.theme.base))).toEqual(new Set(["light", "dark"]));
  });

  test("meet WCAG AA in the states that matter: text, muted text, faint text, accent and links on every layer", () => {
    for (const { id, theme } of THEME_PRESETS) {
      const tokens = deriveCustomTokens(theme);
      for (const layer of ["--color-surface", "--color-surface-raised", "--color-surface-sunken"] as const) {
        for (const text of ["--color-ink", "--color-ink-muted", "--color-ink-faint"] as const) {
          expect([id, layer, text, contrastRatio(tokens[text], tokens[layer]) >= 4.5]).toEqual([id, layer, text, true]);
        }
        // The accent is used as text and as an icon colour; presets are held to the stricter text threshold.
        expect([id, layer, "accent", contrastRatio(tokens["--color-bloom"], tokens[layer]) >= 4.5]).toEqual([id, layer, "accent", true]);
      }
    }
  });

  test("borders stay distinguishable from the surface", () => {
    for (const { theme } of THEME_PRESETS) {
      const tokens = deriveCustomTokens(theme);
      expect(tokens["--color-border"]).not.toBe(tokens["--color-surface"]);
      expect(contrastRatio(tokens["--color-border-strong"], tokens["--color-surface"])).toBeGreaterThan(
        contrastRatio(tokens["--color-border"], tokens["--color-surface"]),
      );
    }
  });
});

describe("applyThemeToRoot", () => {
  function fakeRoot() {
    const classes = new Set<string>();
    const props = new Map<string, string>();
    return {
      classes,
      props,
      classList: {
        toggle(token: string, force?: boolean) {
          const on = force ?? !classes.has(token);
          if (on) classes.add(token); else classes.delete(token);
          return on;
        },
      },
      style: {
        colorScheme: "",
        setProperty: (name: string, value: string) => void props.set(name, value),
        removeProperty: (name: string) => { const old = props.get(name) ?? ""; props.delete(name); return old; },
      },
    };
  }

  test("sets the tokens and the base class of the custom theme, whatever the plain theme is", () => {
    const root = fakeRoot();
    const midnight = THEME_PRESETS.find((preset) => preset.id === "midnight")!.theme;
    applyThemeToRoot(root, "light", midnight);
    expect(root.classes.has("dark")).toBe(true);
    expect(root.props.get("--color-surface")).toBe("#0F1626");
    expect(root.props.size).toBe(CUSTOM_TOKEN_NAMES.length);
    expect(root.style.colorScheme).toBe("dark");
  });

  test("removes every custom token again and falls back to the plain theme", () => {
    const root = fakeRoot();
    applyThemeToRoot(root, "light", THEME_PRESETS[3].theme);
    applyThemeToRoot(root, "light", null);
    expect(root.props.size).toBe(0);
    expect(root.classes.has("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("");
    applyThemeToRoot(root, "dark", null);
    expect(root.classes.has("dark")).toBe(true);
  });
});
