import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TEMPLATE_FOLDER,
  builtInNoteTemplates,
  customTemplateTitle,
  isoDate,
  listNoteTemplates,
  normalizeTemplateFolder,
  renderNoteTemplate,
  selectTemplatePaths,
  titleFromPath,
  type NoteTemplateLocale,
} from "./note-templates";
import { parseHeadingTree } from "./obsidian-markdown";
import { parseFile } from "./parser";

const LOCALES: NoteTemplateLocale[] = ["de", "en"];

const EXPECTED_SECTIONS: Record<string, Record<NoteTemplateLocale, string[]>> = {
  lecture: {
    de: ["Datum", "Thema", "Leitfragen", "Kernaussagen", "Beispiele", "Offene Fragen", "Aufgaben"],
    en: ["Date", "Topic", "Guiding questions", "Key points", "Examples", "Open questions", "Tasks"],
  },
  cornell: {
    de: ["Stichwörter", "Notizen", "Zusammenfassung"],
    en: ["Cues", "Notes", "Summary"],
  },
  literature: {
    de: ["Quelle", "Kernthese", "Argumente", "Zitate", "Eigene Gedanken", "Verknüpfungen"],
    en: ["Source", "Main claim", "Arguments", "Quotes", "Own thoughts", "Links"],
  },
  exam: {
    de: ["Prüfung & Termin", "Themenliste", "Lernplan", "Übungsfragen", "Lücken"],
    en: ["Exam & date", "Topic list", "Study plan", "Practice questions", "Gaps"],
  },
  project: {
    de: ["Ziel", "Umfang", "Meilensteine", "Aufgaben", "Risiken", "Entscheidungen"],
    en: ["Goal", "Scope", "Milestones", "Tasks", "Risks", "Decisions"],
  },
};

describe("built-in templates", () => {
  test("there are five, in a fixed order, in both languages", () => {
    for (const locale of LOCALES) {
      expect(builtInNoteTemplates(locale).map((template) => template.id)).toEqual([
        "lecture",
        "cornell",
        "literature",
        "exam",
        "project",
      ]);
    }
  });

  test("titles follow the language", () => {
    expect(builtInNoteTemplates("de").map((template) => template.title)).toEqual([
      "Vorlesung",
      "Cornell",
      "Literaturnotiz",
      "Prüfungsvorbereitung",
      "Projekt",
    ]);
    expect(builtInNoteTemplates("en").map((template) => template.title)).toEqual([
      "Lecture",
      "Cornell",
      "Literature note",
      "Exam prep",
      "Project",
    ]);
  });

  for (const locale of LOCALES) {
    for (const template of builtInNoteTemplates(locale)) {
      describe(`${template.id} (${locale})`, () => {
        test("starts with the title placeholder as the only top-level heading", () => {
          expect(template.content.startsWith("# {{title}}\n")).toBe(true);
          const roots = parseHeadingTree(renderNoteTemplate(template.content, { title: "Demo", date: "2026-10-29" }));
          expect(roots).toHaveLength(1);
          expect(roots[0]?.title).toBe("Demo");
        });

        test("contains the required sections as child nodes, in order", () => {
          const root = parseHeadingTree(template.content)[0]!;
          expect(root.children.map((child) => child.title)).toEqual(EXPECTED_SECTIONS[template.id]![locale]);
        });

        test("has no heading level jump", () => {
          const levels = [...template.content.matchAll(/^(#{1,6}) /gm)].map((match) => match[1]!.length);
          levels.forEach((level, index) => {
            expect(level - (levels[index - 1] ?? 0)).toBeLessThanOrEqual(1);
          });
        });

        test("opens as a map without errors", () => {
          const markdown = renderNoteTemplate(template.content, { title: "Demo", date: "2026-10-29" });
          const doc = parseFile("Demo.md", markdown);
          expect(doc.nodes.get(doc.rootId)?.title).toBe("Demo");
          expect(doc.nodes.size).toBe(1 + EXPECTED_SECTIONS[template.id]![locale].length);
        });

        test("uses no placeholder other than title and date", () => {
          const rest = template.content.replace(/\{\{(title|date)\}\}/g, "");
          expect(rest).not.toContain("{{");
        });
      });
    }
  }

  test("the lecture template carries today's date", () => {
    const lecture = builtInNoteTemplates("en")[0]!;
    expect(renderNoteTemplate(lecture.content, { title: "Physics", date: "2026-10-29" })).toContain("## Date\n\n2026-10-29\n");
  });
});

describe("renderNoteTemplate", () => {
  test("replaces every {{title}} and {{date}}", () => {
    expect(renderNoteTemplate("# {{title}}\n{{date}} {{title}} {{date}}", { title: "Abc", date: "2026-01-02" })).toBe(
      "# Abc\n2026-01-02 Abc 2026-01-02",
    );
  });

  test("leaves unknown placeholders and near-misses untouched", () => {
    const text = "{{author}} {{ title }} {{Title}} {{date }} {title} {{{x}}}";
    expect(renderNoteTemplate(text, { title: "T", date: "2026-01-02" })).toBe(text);
  });

  test("does not substitute inside substituted values", () => {
    expect(renderNoteTemplate("{{title}}|{{date}}", { title: "{{date}}", date: "2026-01-02" })).toBe("{{date}}|2026-01-02");
  });

  test("keeps `$` sequences in the title literal", () => {
    expect(renderNoteTemplate("# {{title}}", { title: "Cost $& $1 $$" })).toBe("# Cost $& $1 $$");
  });

  test("defaults the date to today as YYYY-MM-DD", () => {
    expect(renderNoteTemplate("{{date}}", { title: "x" })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(renderNoteTemplate("{{date}}", { title: "x" })).toBe(isoDate());
  });
});

describe("isoDate", () => {
  test("uses local calendar fields with zero padding", () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(isoDate(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });
});

describe("titleFromPath", () => {
  test("is the file name without folder and extension", () => {
    expect(titleFromPath("Uni/Physik/Notiz.md")).toBe("Notiz");
    expect(titleFromPath("Notiz.markdown")).toBe("Notiz");
    expect(titleFromPath("Notiz")).toBe("Notiz");
  });
});

describe("custom templates", () => {
  const files = [
    "Vorlagen/Wochenplan.md",
    "Vorlagen/Brief.md",
    "Vorlagen/Notizen.txt",
    "Vorlagen/Archiv/Alt.md",
    "Vorlagen/.md",
    "Vorlagen",
    "Vorlagen2/Falsch.md",
    "Uni/Vorlagen/Falsch.md",
    "Normal.md",
  ];

  test("selects only .md files directly inside the folder, sorted by title", () => {
    expect(selectTemplatePaths(files)).toEqual(["Vorlagen/Brief.md", "Vorlagen/Wochenplan.md"]);
  });

  test("a missing folder yields nothing", () => {
    expect(selectTemplatePaths(["Normal.md", "Uni/Notiz.md"])).toEqual([]);
    expect(selectTemplatePaths([])).toEqual([]);
  });

  test("honours a configured folder name", () => {
    expect(selectTemplatePaths(["Templates/A.md", "Vorlagen/B.md"], "Templates")).toEqual(["Templates/A.md"]);
    expect(selectTemplatePaths(["Templates/A.md"], "/Templates/")).toEqual(["Templates/A.md"]);
  });

  test("an empty folder name falls back to the default", () => {
    expect(normalizeTemplateFolder("  ")).toBe(DEFAULT_TEMPLATE_FOLDER);
    expect(normalizeTemplateFolder("//")).toBe(DEFAULT_TEMPLATE_FOLDER);
    expect(selectTemplatePaths(["Vorlagen/A.md"], "")).toEqual(["Vorlagen/A.md"]);
  });

  test("file extension is matched case-insensitively", () => {
    expect(selectTemplatePaths(["Vorlagen/A.MD"])).toEqual(["Vorlagen/A.MD"]);
    expect(customTemplateTitle("Vorlagen/A.MD")).toBe("A");
  });

  test("custom templates follow the built-in ones and use the file name as title", () => {
    const list = listNoteTemplates("de", [
      { path: "Vorlagen/Brief.md", content: "# {{title}}\nHallo {{name}}" },
    ]);
    expect(list).toHaveLength(6);
    expect(list.slice(0, 5).every((template) => template.builtIn)).toBe(true);
    const custom = list[5]!;
    expect(custom).toEqual({ id: "custom:Vorlagen/Brief.md", title: "Brief", content: "# {{title}}\nHallo {{name}}", builtIn: false });
    expect(renderNoteTemplate(custom.content, { title: "Mein Brief" })).toBe("# Mein Brief\nHallo {{name}}");
  });

  test("without custom templates only the built-in ones are listed", () => {
    expect(listNoteTemplates("en")).toHaveLength(5);
    expect(listNoteTemplates("en", [])).toEqual(builtInNoteTemplates("en"));
  });
});
