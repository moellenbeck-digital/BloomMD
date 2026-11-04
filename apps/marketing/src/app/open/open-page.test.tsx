import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import OpenPage, { generateMetadata } from "./page";
import OpenDocumentPage from "./[doc]/page";

const render = async (element: Promise<React.ReactElement>) => renderToStaticMarkup(await element);

describe("/open fallback", () => {
  test("offers download and web app, in German by default and English on request", async () => {
    const de = await render(OpenPage({ searchParams: Promise.resolve({}) }));
    expect(de).toContain("BloomMD-App nicht installiert");
    expect(de).toContain('href="/download"');
    expect(de).toContain('href="/demo"');
    const en = await render(OpenPage({ searchParams: Promise.resolve({ lang: "en" }) }));
    expect(en).toContain("BloomMD app not installed");
    expect(en).toContain('href="/download?lang=en"');
    expect(en).toContain('href="/demo?lang=en"');
  });

  test("never renders unvalidated path or node values into the page", async () => {
    const payload = '"><script>alert(1)</script>.md';
    // A well-formed path may reach the app link, but only percent-encoded; it never becomes markup.
    const encoded = await render(OpenPage({ searchParams: Promise.resolve({ path: payload, node: payload }) }));
    expect(encoded).not.toContain("<script");
    expect(encoded).not.toContain("alert(1)");
    expect(encoded).toContain("path=%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E.md");
    expect(encoded).not.toContain("node=");
    for (const html of [
      await render(OpenPage({ searchParams: Promise.resolve({ path: "../Geheim/Plan.md", node: payload }) })),
      await render(OpenDocumentPage({ params: Promise.resolve({ doc: payload }), searchParams: Promise.resolve({ node: payload }) })),
    ]) {
      expect(html).not.toContain("script");
      expect(html).not.toContain("alert");
      expect(html).not.toContain("Geheim");
      expect(html).not.toContain("bloommd://");
    }
  });

  test("shows no document content: validated values appear only inside the re-encoded app link", async () => {
    const html = await render(OpenPage({ searchParams: Promise.resolve({ path: "Geheim/Plan.md", node: "knoten42" }) }));
    const withoutLink = html.replace(/<a href="bloommd:\/\/[^"]*"/, "<a");
    for (const secret of ["Geheim", "Plan.md", "knoten42"]) {
      expect(html).toContain(secret);
      expect(withoutLink).not.toContain(secret);
    }
  });

  test("offers the app link only for validated requests, re-encoded", async () => {
    const valid = await render(OpenPage({ searchParams: Promise.resolve({ path: "a b.md", node: "n1" }) }));
    expect(valid).toContain('href="bloommd://open?path=a%20b.md&amp;node=n1"');
    const invalid = await render(OpenPage({ searchParams: Promise.resolve({ path: "../x.md" }) }));
    expect(invalid).not.toContain("bloommd://");
    const doc = await render(OpenDocumentPage({ params: Promise.resolve({ doc: "Doc-1" }), searchParams: Promise.resolve({}) }));
    expect(doc).toContain('href="bloommd://open?doc=Doc-1"');
  });

  test("is noindex and its canonical URL carries no link parameters", async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ path: "Geheim.md" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe("/open");
  });
});
