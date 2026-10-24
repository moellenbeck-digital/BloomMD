import { describe, expect, test } from "bun:test";
import { translations, type Locale } from "./translations";

describe("locale translation contract", () => {
  test("German and English expose exactly the same keys", () => {
    const deKeys = Object.keys(translations.de).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(enKeys).toEqual(deKeys);
  });

  test("both locales contain non-empty UI copy", () => {
    for (const locale of ["de", "en"] as Locale[]) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  test("desktop-sensitive copy is not accidentally shared between locales", () => {
    const keys = [
      "language",
      "canvasModes",
      "nodeType",
      "readOnlyMessage",
      "workspaceMapEmpty",
      "feedbackDescription",
      "syncConnected",
    ] as const;
    for (const key of keys) {
      expect(translations.de[key], key).not.toBe(translations.en[key]);
    }
  });
});
