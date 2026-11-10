"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CUSTOM_THEME_STORAGE_KEY,
  applyThemeToRoot,
  parseStoredCustomTheme,
  serializeCustomTheme,
  validateCustomTheme,
  type CustomTheme,
  type CustomThemeValidation,
  type ThemeBase,
} from "../utils/theme-custom";

/** The light/dark base. A custom theme sits on top of it and does not change this type. */
export type Theme = ThemeBase;

const THEME_STORAGE_KEY = "bloommd-theme";
/** Lets every `useTheme` instance in the page follow a change made by another one. */
const THEME_CHANGE_EVENT = "bloommd-theme-change";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The stored custom theme, or `null` when there is none or it is broken or no longer passes the guard. */
function getInitialCustomTheme(): CustomTheme | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredCustomTheme(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function announceChange() {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function useTheme() {
  const [plainTheme, setPlainTheme] = useState<Theme>(getInitialTheme);
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(getInitialCustomTheme);
  // With a custom theme active, its base decides what "dark" means for logos, `dark:` styles and the toggle.
  const theme: Theme = customTheme ? customTheme.base : plainTheme;

  /** Picks light or dark. This drops an active custom theme: the user asked for the plain one. */
  const setTheme = useCallback((newTheme: Theme) => {
    setPlainTheme(newTheme);
    setCustomTheme(null);
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      try {
        localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
      } catch {
        /* Nothing stored is nothing to remove. */
      }
      applyThemeToRoot(document.documentElement, newTheme, null);
      announceChange();
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  /**
   * Stores and applies a custom theme — but only when it passes validation (hex values, text 4.5:1 and
   * accent 3:1 on the surface). Otherwise nothing changes and the reason comes back for the UI to show.
   */
  const saveCustomTheme = useCallback((input: unknown): CustomThemeValidation => {
    const result = validateCustomTheme(input);
    if (!result.ok) return result;
    setCustomTheme(result.theme);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, serializeCustomTheme(result.theme));
      } catch {
        /* Storage is full or blocked: the theme still applies for this session. */
      }
      announceChange();
    }
    return result;
  }, []);

  /** Deletes the stored custom theme; the plain light/dark choice applies again. */
  const resetCustomTheme = useCallback(() => {
    setCustomTheme(null);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
      } catch {
        /* Nothing stored is nothing to remove. */
      }
      announceChange();
    }
  }, []);

  // Apply on mount and on every change.
  useEffect(() => {
    applyThemeToRoot(document.documentElement, plainTheme, customTheme);
  }, [plainTheme, customTheme]);

  // Follow changes from other hook instances and from other tabs.
  useEffect(() => {
    const sync = () => {
      setPlainTheme(getInitialTheme());
      setCustomTheme(getInitialCustomTheme());
    };
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { theme, setTheme, toggleTheme, customTheme, saveCustomTheme, resetCustomTheme };
}
