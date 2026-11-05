import { describe, expect, test } from "bun:test";
import { THEME_BOOT_SCRIPT } from "./theme-boot";
import {
  CUSTOM_THEME_STORAGE_KEY,
  CUSTOM_TOKEN_NAMES,
  THEME_PRESETS,
  applyThemeToRoot,
  parseStoredCustomTheme,
  serializeCustomTheme,
  type CustomTheme,
} from "./theme-custom";

/** Runs the boot script against a stub `document`, `localStorage` and `matchMedia`. */
function runBoot(stored: Record<string, string>, systemDark = false, storageThrows = false) {
  const classes = new Set<string>();
  const props = new Map<string, string>();
  const style = {
    colorScheme: "",
    setProperty: (name: string, value: string) => void props.set(name, value),
    removeProperty: (name: string) => { const old = props.get(name) ?? ""; props.delete(name); return old; },
  };
  const document = {
    documentElement: {
      style,
      classList: {
        toggle(token: string, force?: boolean) {
          const on = force ?? !classes.has(token);
          if (on) classes.add(token); else classes.delete(token);
          return on;
        },
      },
    },
  };
  const localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error("denied");
      return key in stored ? stored[key] : null;
    },
  };
  const matchMedia = () => ({ matches: systemDark });
  new Function("document", "localStorage", "matchMedia", THEME_BOOT_SCRIPT)(document, localStorage, matchMedia);
  return { dark: classes.has("dark"), props: Object.fromEntries(props), colorScheme: style.colorScheme };
}

/** What `useTheme` does with the same stored values. */
function runHook(stored: Record<string, string>, systemDark = false) {
  const classes = new Set<string>();
  const props = new Map<string, string>();
  const root = {
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
  const plain = stored["bloommd-theme"];
  const plainTheme = plain === "dark" || plain === "light" ? plain : systemDark ? "dark" : "light";
  applyThemeToRoot(root, plainTheme, parseStoredCustomTheme(stored[CUSTOM_THEME_STORAGE_KEY]));
  return { dark: classes.has("dark"), props: Object.fromEntries(props), colorScheme: root.style.colorScheme };
}

const themes: CustomTheme[] = [
  ...THEME_PRESETS.map((preset) => preset.theme),
  { name: "Accent only light", base: "light", accent: "#0B5FA5" },
  { name: "Accent only dark", base: "dark", accent: "#7AB2FF" },
  { name: "Surface only", base: "dark", accent: "#FF9F6B", surface: "#FFFFFF" },
  { name: "Mid grey", base: "light", accent: "#000000", surface: "#808080" },
  { name: "Three digits", base: "light", accent: "#036", surface: "#FFF", ink: "#222" },
  { name: "Odd base", base: "dark", accent: "#1E3A8A", surface: "#FDE68A", ink: "#1E1B0F" },
];

describe("boot script", () => {
  test("is ES5 text without anything that could end the script element", () => {
    expect(THEME_BOOT_SCRIPT).not.toMatch(/<\/script/i);
    expect(THEME_BOOT_SCRIPT).not.toMatch(/=>|`|\blet\b|\bconst\b/);
  });

  test("applies exactly what the hook applies, for presets and edge cases", () => {
    for (const theme of themes) {
      for (const plain of ["light", "dark"]) {
        const stored = { "bloommd-theme": plain, [CUSTOM_THEME_STORAGE_KEY]: serializeCustomTheme(theme) };
        expect(runBoot(stored)).toEqual(runHook(stored));
      }
    }
  });

  test("sets all tokens inline for a valid custom theme", () => {
    const result = runBoot({ [CUSTOM_THEME_STORAGE_KEY]: serializeCustomTheme(THEME_PRESETS[3].theme) });
    expect(Object.keys(result.props)).toEqual([...CUSTOM_TOKEN_NAMES]);
    expect(result.dark).toBe(true);
    expect(result.colorScheme).toBe("dark");
  });

  test("keeps the previous behaviour without a custom theme", () => {
    expect(runBoot({ "bloommd-theme": "dark" })).toEqual({ dark: true, props: {}, colorScheme: "" });
    expect(runBoot({ "bloommd-theme": "light" }, true)).toEqual({ dark: false, props: {}, colorScheme: "" });
    expect(runBoot({}, true).dark).toBe(true);
    expect(runBoot({}, false).dark).toBe(false);
    expect(runBoot({ "bloommd-theme": "neon" }, true).dark).toBe(true);
  });

  test("ignores a broken or invalid custom value and keeps the base theme", () => {
    const valid = THEME_PRESETS[3].theme;
    const bad = [
      "{", "null", "[]", "42", '{"name":"x"}',
      JSON.stringify({ ...valid, accent: "url(x)" }),
      JSON.stringify({ ...valid, surface: "#0F1626", ink: "#0F1626" }),
      JSON.stringify({ ...valid, base: "neon" }),
      JSON.stringify({ ...valid, name: "" }),
    ];
    for (const raw of bad) {
      const stored = { "bloommd-theme": "light", [CUSTOM_THEME_STORAGE_KEY]: raw };
      const result = runBoot(stored);
      expect(result).toEqual({ dark: false, props: {}, colorScheme: "" });
      expect(result).toEqual(runHook(stored));
    }
  });

  test("does not throw when storage is unavailable", () => {
    expect(() => runBoot({}, false, true)).not.toThrow();
  });
});
