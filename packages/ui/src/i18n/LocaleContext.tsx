"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { translations, type Locale, type Translations } from "./translations";

interface LocaleContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "de";
  const stored = localStorage.getItem("bloommd-locale");
  if (stored === "en" || stored === "de") return stored;
  // Auto-detect from browser
  const browserLang = navigator.language.slice(0, 2);
  return browserLang === "de" ? "de" : "en";
}

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? getInitialLocale());

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== "undefined") {
      localStorage.setItem("bloommd-locale", newLocale);
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "de" ? "en" : "de");
  }, [locale, setLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: translations[locale],
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback if no provider (e.g. in tests)
    return {
      locale: "de",
      t: translations.de,
      setLocale: () => {},
      toggleLocale: () => {},
    };
  }
  return ctx;
}
