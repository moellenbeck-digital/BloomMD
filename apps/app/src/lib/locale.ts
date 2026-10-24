export type AppLocale = "de" | "en";

export function getAppLocale(value: string | null | undefined): AppLocale {
  return value?.toLowerCase() === "en" ? "en" : "de";
}

export function otherAppLocale(locale: AppLocale): AppLocale {
  return locale === "de" ? "en" : "de";
}

export function withAppLocale(path: string, locale: AppLocale) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=${locale}`;
}
