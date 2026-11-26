import { describe, expect, test } from "bun:test";
import { generateMetadata as demoMetadata } from "./demo/page";
import { generateMetadata as templatesMetadata } from "./templates/page";
import { generateMetadata as templateMetadata } from "./templates/[slug]/page";
import { templateSlugs } from "@/lib/templates";

describe.each([
  ["/demo", demoMetadata],
  ["/templates", templatesMetadata],
])("language alternates of %s", (path, generateMetadata) => {
  const languages = { de: path, en: `${path}?lang=en`, "x-default": path };

  test.each([
    ["German", undefined, path],
    ["English", "en", `${path}?lang=en`],
  ])("the %s variant links de, en and x-default and is its own canonical", async (_name, lang, canonical) => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ lang }) });
    expect(metadata.alternates).toEqual({ canonical, languages });
  });
});

describe("language alternates of template pages", () => {
  test.each(templateSlugs())("%s links de, en and x-default in both variants", async (slug) => {
    const path = `/templates/${slug}`;
    const languages = { de: path, en: `${path}?lang=en`, "x-default": path };
    for (const [lang, canonical] of [[undefined, path], ["en", `${path}?lang=en`]] as const) {
      const metadata = await templateMetadata({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ lang }) });
      expect(metadata.alternates).toEqual({ canonical, languages });
    }
  });
});
