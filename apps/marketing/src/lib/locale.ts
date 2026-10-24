export type MarketingLocale = "de" | "en";

export function getMarketingLocale(value: string | null | undefined): MarketingLocale {
  return value?.toLowerCase() === "en" ? "en" : "de";
}

export function otherMarketingLocale(locale: MarketingLocale): MarketingLocale {
  return locale === "de" ? "en" : "de";
}

export function languageLabel(locale: MarketingLocale) {
  return locale === "de" ? "Deutsch" : "English";
}

export function withMarketingLocale(path: string, locale: MarketingLocale) {
  if (locale === "de") return path;
  const hashIndex = path.indexOf("#");
  const pathname = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}lang=${locale}${hash}`;
}
