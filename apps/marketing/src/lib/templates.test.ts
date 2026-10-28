import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateTemplateMetadata } from "./template-metadata";
import { getTemplate, listTemplates, templateSlugs } from "./templates";

const realRoot = resolve(import.meta.dir, "../../../..");
const BROKEN = "research-project";

function readMetadata(slug: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(realRoot, "templates", slug, "metadata.json"), "utf-8"));
}

function paths(result: ReturnType<typeof validateTemplateMetadata>): string[] {
  return result.ok ? [] : result.violations.map((violation) => violation.path);
}

describe("@t78 validateTemplateMetadata", () => {
  test("accepts all real templates", () => {
    for (const slug of templateSlugs()) {
      const result = validateTemplateMetadata(readMetadata(slug), slug);
      expect(result.ok).toBe(true);
    }
  });

  test("copies only the known fields", () => {
    const result = validateTemplateMetadata({ ...readMetadata("novel-writing"), extra: "x" }, "novel-writing");
    expect(result.ok && "extra" in result.metadata).toBe(false);
  });

  test("rejects a missing field", () => {
    const { title: _title, ...rest } = readMetadata("novel-writing");
    const result = validateTemplateMetadata(rest, "novel-writing");
    expect(result).toEqual({ ok: false, violations: [{ path: "title", reason: "is missing" }] });
  });

  test("rejects wrong types and empty strings", () => {
    const result = validateTemplateMetadata({ ...readMetadata("novel-writing"), title: 42, category: "  ", tags: "a", audience: ["ok", ""] }, "novel-writing");
    expect(paths(result)).toEqual(["title", "category", "audience[1]", "tags"]);
  });

  test("rejects empty arrays", () => {
    const result = validateTemplateMetadata({ ...readMetadata("novel-writing"), sections: [] }, "novel-writing");
    expect(result).toEqual({ ok: false, violations: [{ path: "sections", reason: "must not be empty" }] });
  });

  test("rejects a slug that differs from the directory", () => {
    expect(paths(validateTemplateMetadata(readMetadata("novel-writing"), "research-project"))).toContain("slug");
  });

  test.each([
    ["templates/novel-writing/../research-project/template.md"],
    ["templates/novel-writing/../../secret.md"],
    ["/etc/passwd"],
    ["C:/windows/system.ini"],
    ["templates\\novel-writing\\template.md"],
    ["templates/research-project/template.md"],
    ["templates/novel-writing/"],
    ["README.md"],
  ])("rejects filePath %s", (filePath) => {
    expect(paths(validateTemplateMetadata({ ...readMetadata("novel-writing"), filePath }, "novel-writing"))).toEqual(["filePath"]);
  });

  test.each([["preview.png"], ["//evil.example/x.png"], ["https://evil.example/x.png"]])("rejects previewImage %s", (previewImage) => {
    expect(paths(validateTemplateMetadata({ ...readMetadata("novel-writing"), previewImage }, "novel-writing"))).toEqual(["previewImage"]);
  });

  test.each([["1.0"], ["v1.0.0"], ["01.0.0"], ["latest"]])("rejects version %s", (version) => {
    expect(paths(validateTemplateMetadata({ ...readMetadata("novel-writing"), version }, "novel-writing"))).toEqual(["version"]);
  });

  test.each([["1.2.3"], ["0.0.1-beta.1"], ["2.0.0+build.5"]])("accepts version %s", (version) => {
    expect(validateTemplateMetadata({ ...readMetadata("novel-writing"), version }, "novel-writing").ok).toBe(true);
  });

  test.each([[null], [[]], ["text"], [7], [undefined]])("rejects root %p", (root) => {
    expect(validateTemplateMetadata(root, "novel-writing")).toEqual({ ok: false, violations: [{ path: "$", reason: "must be an object" }] });
  });

  test("violation reasons never contain content values", () => {
    const secret = "TOP-SECRET-VALUE";
    const result = validateTemplateMetadata({ ...readMetadata("novel-writing"), version: secret, filePath: `../${secret}`, previewImage: secret, slug: secret }, "novel-writing");
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe("@t78 templates with injected root", () => {
  let root: string;
  let errors: ReturnType<typeof spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "t78-templates-"));
    cpSync(join(realRoot, "templates"), join(root, "templates"), { recursive: true });
    errors = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errors.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  const metadataFile = () => join(root, "templates", BROKEN, "metadata.json");
  const logged = () => errors.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");

  test("all 6 real templates are valid and listed", async () => {
    const templates = await listTemplates("en", root);
    expect(templates.map((template) => template.slug).sort()).toEqual([...templateSlugs()].sort());
    expect(errors).not.toHaveBeenCalled();
    expect((await listTemplates("de", root))).toHaveLength(6);
    expect((await getTemplate("novel-writing", "de", root))?.markdown.length).toBeGreaterThan(0);
  });

  test("works against the real repository by default", async () => {
    expect(await listTemplates()).toHaveLength(6);
    expect((await getTemplate("software-architecture"))?.slug).toBe("software-architecture");
    expect(await getTemplate("does-not-exist")).toBeNull();
  });

  test("listTemplates skips a template with a missing field and logs slug, file and path", async () => {
    const { title: _title, ...rest } = readMetadata(BROKEN);
    writeFileSync(metadataFile(), JSON.stringify(rest));
    const templates = await listTemplates("en", root);
    expect(templates).toHaveLength(5);
    expect(templates.some((template) => template.slug === BROKEN)).toBe(false);
    expect(logged()).toContain(BROKEN);
    expect(logged()).toContain("metadata.json");
    expect(logged()).toContain("title is missing");
  });

  test("getTemplate returns null for a slug that differs from the directory", async () => {
    writeFileSync(metadataFile(), JSON.stringify({ ...readMetadata(BROKEN), slug: "novel-writing" }));
    expect(await getTemplate(BROKEN, "en", root)).toBeNull();
    expect((await listTemplates("en", root)).map((template) => template.slug)).not.toContain(BROKEN);
    expect(logged()).toContain("slug must match the template directory");
  });

  test("getTemplate returns null for a filePath with ..", async () => {
    writeFileSync(join(root, "outside.md"), "# outside");
    writeFileSync(metadataFile(), JSON.stringify({ ...readMetadata(BROKEN), filePath: `templates/${BROKEN}/../../outside.md` }));
    expect(await getTemplate(BROKEN, "en", root)).toBeNull();
    expect(logged()).toContain("filePath");
  });

  test("broken JSON is handled like a schema violation", async () => {
    writeFileSync(metadataFile(), "{ not json");
    expect(await getTemplate(BROKEN, "en", root)).toBeNull();
    expect(await listTemplates("en", root)).toHaveLength(5);
    expect(logged()).toContain("invalid JSON");
    expect(logged()).not.toContain("not json");
  });

  test("a root that is not an object is rejected", async () => {
    writeFileSync(metadataFile(), "[]");
    expect(await getTemplate(BROKEN, "en", root)).toBeNull();
    expect(logged()).toContain("$ must be an object");
  });

  test("an unreadable metadata file is handled like a schema violation", async () => {
    rmSync(metadataFile());
    expect(await getTemplate(BROKEN, "en", root)).toBeNull();
    expect(await listTemplates("en", root)).toHaveLength(5);
    expect(logged()).toContain("unreadable");
  });

  test("a missing markdown file yields null instead of throwing", async () => {
    rmSync(join(root, "templates", BROKEN, "template.md"));
    expect(await getTemplate(BROKEN, "en", root)).toBeNull();
    expect(logged()).toContain("markdown unreadable");
  });

  test("a template directory that is missing entirely is skipped", async () => {
    rmSync(join(root, "templates", BROKEN), { recursive: true });
    mkdirSync(join(root, "templates", BROKEN));
    expect(await listTemplates("en", root)).toHaveLength(5);
  });
});
