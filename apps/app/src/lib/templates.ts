import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

export interface TemplateRecord extends TemplateMetadata {
  markdown: string;
}

const TEMPLATE_SLUGS = [
  "software-architecture",
  "startup-operating-system",
  "obsidian-vault-starter",
  "research-project",
  "novel-writing",
  "content-strategy",
] as const;

const cwd = process.cwd();
const repoRoot = existsSync(join(cwd, "templates")) ? cwd : resolve(cwd, "../..");
const templatesRoot = join(repoRoot, "templates");

async function readTemplateMetadata(slug: string): Promise<TemplateMetadata> {
  const raw = await readFile(join(templatesRoot, slug, "metadata.json"), "utf-8");
  return JSON.parse(raw) as TemplateMetadata;
}

export async function listTemplates(): Promise<TemplateMetadata[]> {
  const templates = await Promise.all(TEMPLATE_SLUGS.map(readTemplateMetadata));
  return templates.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getTemplate(slug: string): Promise<TemplateRecord | null> {
  if (!TEMPLATE_SLUGS.includes(slug as (typeof TEMPLATE_SLUGS)[number])) {
    return null;
  }

  const metadata = await readTemplateMetadata(slug);
  const markdown = await readFile(join(repoRoot, metadata.filePath), "utf-8");
  return { ...metadata, markdown };
}

export function templateSlugs() {
  return [...TEMPLATE_SLUGS];
}
