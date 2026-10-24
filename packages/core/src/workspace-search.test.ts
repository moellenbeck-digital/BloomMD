import { describe, expect, test } from "bun:test";
import { backlinksFor, searchWorkspace } from "./workspace-search";

const vault = [
  { path: "README.md", markdown: "# Übersicht\n\nEinstieg. Siehe [[Kapitel 1]].\n" },
  { path: "Buch/Kapitel 1.md", markdown: "# Kapitel 1\n\nDer Anfang mit [[Person]].\nEine zweite Zeile.\n" },
  { path: "Buch/Kapitel 2.md", markdown: "# Kapitel 2\n\nWeiter mit [[Person]] und [[Kapitel 1]].\n" },
  { path: "Personen/Person.md", markdown: "# Person\n\nOhne eigene Verweise.\n" },
  { path: "ohne-ueberschrift.md", markdown: "Nur ein Absatz über den Anfang.\n" },
];

describe("text search", () => {
  test("finds a title match and ranks it first", () => {
    const hits = searchWorkspace(vault, { text: "kapitel 1" });
    expect(hits[0]!.path).toBe("Buch/Kapitel 1.md");
    expect(hits[0]!.matchedOn).toContain("title");
  });

  test("finds a body match with its line and an excerpt", () => {
    const hits = searchWorkspace(vault, { text: "zweite zeile" });
    expect(hits[0]!.path).toBe("Buch/Kapitel 1.md");
    expect(hits[0]!.line).toBe(4);
    expect(hits[0]!.excerpt).toContain("zweite Zeile");
  });

  test("matches the path", () => {
    const hits = searchWorkspace(vault, { text: "personen/" });
    expect(hits.map((hit) => hit.path)).toEqual(["Personen/Person.md"]);
  });

  test("is case-insensitive", () => {
    expect(searchWorkspace(vault, { text: "ÜBERSICHT" })[0]!.path).toBe("README.md");
  });

  test("falls back to the filename when a document has no heading", () => {
    const hits = searchWorkspace(vault, { text: "ohne-ueberschrift" });
    expect(hits[0]!.title).toBe("ohne-ueberschrift");
  });

  test("a query matching nothing returns nothing", () => {
    expect(searchWorkspace(vault, { text: "zzz-nicht-vorhanden" })).toEqual([]);
  });

  test("respects a limit", () => {
    expect(searchWorkspace(vault, { text: "e", limit: 2 })).toHaveLength(2);
  });
});

describe("filters", () => {
  test("restricts to a folder", () => {
    const hits = searchWorkspace(vault, { folder: "Buch" });
    expect(hits.map((hit) => hit.path).sort()).toEqual(["Buch/Kapitel 1.md", "Buch/Kapitel 2.md"]);
  });

  test("a folder filter does not match a prefix of another folder name", () => {
    const tricky = [
      { path: "Buch/one.md", markdown: "# One" },
      { path: "Buchhaltung/two.md", markdown: "# Two" },
    ];
    expect(searchWorkspace(tricky, { folder: "Buch" }).map((hit) => hit.path)).toEqual(["Buch/one.md"]);
  });

  test("finds everything linking to a page", () => {
    const hits = searchWorkspace(vault, { linksTo: "Personen/Person.md" });
    expect(hits.map((hit) => hit.path).sort()).toEqual(["Buch/Kapitel 1.md", "Buch/Kapitel 2.md"]);
  });

  test("finds everything a page links to", () => {
    const hits = searchWorkspace(vault, { linkedFrom: "Buch/Kapitel 2.md" });
    expect(hits.map((hit) => hit.path).sort()).toEqual(["Buch/Kapitel 1.md", "Personen/Person.md"]);
  });

  test("combines a text query with a folder", () => {
    expect(searchWorkspace(vault, { text: "kapitel", folder: "Buch" })).toHaveLength(2);
    expect(searchWorkspace(vault, { text: "kapitel", folder: "Personen" })).toHaveLength(0);
  });

  test("an empty query returns every file", () => {
    expect(searchWorkspace(vault, {})).toHaveLength(vault.length);
  });
});

describe("backlinks", () => {
  test("lists who links to a page, with the line and the raw link", () => {
    const entries = backlinksFor(vault, "Personen/Person.md");
    expect(entries.map((entry) => entry.path)).toEqual(["Buch/Kapitel 1.md", "Buch/Kapitel 2.md"]);
    expect(entries[0]).toMatchObject({ line: 3, raw: "[[Person]]", title: "Kapitel 1" });
  });

  test("a page nobody links to has no backlinks", () => {
    expect(backlinksFor(vault, "README.md")).toEqual([]);
  });

  test("ordering is stable", () => {
    const first = backlinksFor(vault, "Buch/Kapitel 1.md").map((entry) => `${entry.path}:${entry.line}`);
    expect(backlinksFor(vault, "Buch/Kapitel 1.md").map((entry) => `${entry.path}:${entry.line}`)).toEqual(first);
  });
});
