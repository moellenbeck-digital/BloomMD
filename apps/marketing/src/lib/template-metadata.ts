export interface TemplateMetadata {
  title: string;
  description: string;
  audience: string[];
  category: string;
  previewImage: string;
  sections: string[];
  tags: string[];
  recommendedUse: string;
  version: string;
  slug: string;
  filePath: string;
}

export interface TemplateMetadataViolation {
  /** Field path such as `tags[1]`; `$` is the document root. */
  path: string;
  /** Static reason text. Never contains values from the validated content. */
  reason: string;
}

export type TemplateMetadataResult =
  | { ok: true; metadata: TemplateMetadata }
  | { ok: false; violations: TemplateMetadataViolation[] };

const STRING_FIELDS = ["title", "description", "category", "recommendedUse"] as const;
const STRING_ARRAY_FIELDS = ["audience", "sections", "tags"] as const;

// Official semver.org pattern (prerelease and build metadata allowed).
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filePathViolation(filePath: string, slug: string): string | null {
  if (filePath.includes("\0")) return "must not contain control characters";
  if (filePath.includes("\\")) return "must use forward slashes only";
  if (filePath.startsWith("/") || /^[A-Za-z]:/.test(filePath)) return "must be a relative path";
  const segments = filePath.split("/");
  if (segments.some((segment) => segment === ".." || segment === "." || segment === "")) {
    return "must not contain empty, '.' or '..' segments";
  }
  const prefix = ["templates", slug];
  if (segments.length < 3 || prefix.some((part, index) => segments[index] !== part)) {
    return "must be a file below templates/<slug>/";
  }
  return null;
}

/**
 * Validates parsed `metadata.json` content for the template in directory
 * `expectedSlug`. Only the known fields are copied into the result.
 */
export function validateTemplateMetadata(value: unknown, expectedSlug: string): TemplateMetadataResult {
  if (!isPlainObject(value)) {
    return { ok: false, violations: [{ path: "$", reason: "must be an object" }] };
  }

  const violations: TemplateMetadataViolation[] = [];
  const add = (path: string, reason: string) => violations.push({ path, reason });

  for (const field of STRING_FIELDS) {
    if (!(field in value)) add(field, "is missing");
    else if (!isNonEmptyString(value[field])) add(field, "must be a non-empty string");
  }

  for (const field of STRING_ARRAY_FIELDS) {
    const items = value[field];
    if (!(field in value)) add(field, "is missing");
    else if (!Array.isArray(items)) add(field, "must be an array");
    else if (items.length === 0) add(field, "must not be empty");
    else items.forEach((item, index) => {
      if (!isNonEmptyString(item)) add(`${field}[${index}]`, "must be a non-empty string");
    });
  }

  if (!("version" in value)) add("version", "is missing");
  else if (!isNonEmptyString(value.version)) add("version", "must be a non-empty string");
  else if (!SEMVER.test(value.version)) add("version", "must be a semantic version (MAJOR.MINOR.PATCH)");

  if (!("slug" in value)) add("slug", "is missing");
  else if (!isNonEmptyString(value.slug)) add("slug", "must be a non-empty string");
  else if (value.slug !== expectedSlug) add("slug", "must match the template directory");

  if (!("filePath" in value)) add("filePath", "is missing");
  else if (!isNonEmptyString(value.filePath)) add("filePath", "must be a non-empty string");
  else {
    const problem = filePathViolation(value.filePath, expectedSlug);
    if (problem) add("filePath", problem);
  }

  if (!("previewImage" in value)) add("previewImage", "is missing");
  else if (!isNonEmptyString(value.previewImage)) add("previewImage", "must be a non-empty string");
  else if (!value.previewImage.startsWith("/") || value.previewImage.startsWith("//") || value.previewImage.includes("\\")) {
    add("previewImage", "must be an absolute site path starting with a single '/'");
  }

  if (violations.length > 0) return { ok: false, violations };

  return {
    ok: true,
    metadata: {
      title: value.title as string,
      description: value.description as string,
      audience: [...(value.audience as string[])],
      category: value.category as string,
      previewImage: value.previewImage as string,
      sections: [...(value.sections as string[])],
      tags: [...(value.tags as string[])],
      recommendedUse: value.recommendedUse as string,
      version: value.version as string,
      slug: value.slug as string,
      filePath: value.filePath as string,
    },
  };
}
