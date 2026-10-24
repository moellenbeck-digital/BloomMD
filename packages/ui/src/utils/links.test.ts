import { describe, expect, test } from "bun:test";
import { extractLinksFromMarkdown, extractMapLinksFromMarkdown, resolveMapLinkInDocument } from "./links";

describe("resource link extraction", () => {
  test("classifies web, image, video, audio, PDF and local file references", () => {
    const resources = extractLinksFromMarkdown(`
[Docs](https://example.com/docs)
![Diagram](https://cdn.example.com/diagram.png)
[Recording](media/demo.mp4)
[Podcast](audio/intro.mp3)
[Specification](docs/spec.pdf)
[Attachment](assets/data.csv)
    `);

    expect(resources.map((resource) => resource.kind)).toEqual([
      "web",
      "image",
      "video",
      "audio",
      "pdf",
      "file",
    ]);
    expect(resources[1]).toMatchObject({ label: "Diagram", host: "cdn.example.com", kind: "image" });
  });

  test("does not duplicate a Markdown URL as a plain URL", () => {
    expect(extractLinksFromMarkdown("[Docs](https://example.com/docs) https://example.com/docs")).toHaveLength(1);
  });
});

describe("map link resolution", () => {
  const nodes = [
    { id: "root", title: "Testvault" },
    { id: "chapter-1", title: "Kapitel 1" },
    { id: "graph-theory", title: "Graphentheorie" },
    { id: "duplicate-a", title: "Mehrdeutig" },
    { id: "duplicate-b", title: "Mehrdeutig" },
  ];

  test("resolves same-document wiki links by unique node title", () => {
    const [link] = extractMapLinksFromMarkdown("[[Kapitel 1]]");

    expect(resolveMapLinkInDocument(link!, "README.md", nodes)).toEqual({
      status: "resolved",
      nodeId: "chapter-1",
      nodeTitle: "Kapitel 1",
    });
  });

  test("embedded drawings and images are attachments, not map links", () => {
    const links = extractMapLinksFromMarkdown("Siehe [[Kapitel 1]].\n\n![[Physik ink.svg]]\n![[Foto.png|200]]\n![[Andere Notiz]]");
    expect(links.map((link) => link.raw)).toEqual(["Kapitel 1", "Andere Notiz"]);
  });

  test("resolves explicit node id links before title matching", () => {
    const [link] = extractMapLinksFromMarkdown("[[#graph-theory]]");

    expect(resolveMapLinkInDocument(link!, "README.md", nodes)).toEqual({
      status: "resolved",
      nodeId: "graph-theory",
      nodeTitle: "Graphentheorie",
    });
  });

  test("keeps external map links separate from current-document navigation", () => {
    const [link] = extractMapLinksFromMarkdown("[[Other.md#chapter-1]]");

    expect(resolveMapLinkInDocument(link!, "README.md", nodes)).toEqual({ status: "external" });
  });

  test("reports missing and ambiguous title targets", () => {
    const [missing] = extractMapLinksFromMarkdown("[[Nicht vorhanden]]");
    const [ambiguous] = extractMapLinksFromMarkdown("[[Mehrdeutig]]");

    expect(resolveMapLinkInDocument(missing!, "README.md", nodes)).toEqual({ status: "missing" });
    expect(resolveMapLinkInDocument(ambiguous!, "README.md", nodes)).toMatchObject({
      status: "ambiguous",
      matches: [{ id: "duplicate-a" }, { id: "duplicate-b" }],
    });
  });

  test("prefers semantic heading nodes over duplicate workspace file nodes", () => {
    const [link] = extractMapLinksFromMarkdown("[[Kapitel 1]]");
    const workspaceNodes = [
      { id: "file:Buch/Teil-1/Kapitel 1.md", title: "Kapitel 1", metadata: { kind: "file" } },
      { id: "heading:Buch_2FTeil-1_2FKapitel_201.md:0-kapitel-1", title: "Kapitel 1" },
    ];

    expect(resolveMapLinkInDocument(link!, "Workspace", workspaceNodes)).toEqual({
      status: "resolved",
      nodeId: "heading:Buch_2FTeil-1_2FKapitel_201.md:0-kapitel-1",
      nodeTitle: "Kapitel 1",
    });
  });
});
