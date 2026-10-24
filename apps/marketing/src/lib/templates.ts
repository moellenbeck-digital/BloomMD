import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { MarketingLocale } from "./locale";

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

const germanTemplateCopy: Record<string, Pick<TemplateMetadata, "title" | "description" | "audience" | "category" | "sections" | "tags" | "recommendedUse">> = {
  "software-architecture": {
    title: "Software-Architektur-Map",
    description: "Plane Systemziele, Komponenten, Integrationen, Sicherheit und Deployment als Markdown-native Architekturkarte.",
    audience: ["Entwickler", "CTOs", "Software-Agenturen", "Open-Source-Maintainer"],
    category: "Entwicklung",
    sections: ["Systemziele", "Architektur", "Frontend", "Backend", "Datenbank", "Integrationen", "Sicherheit", "Deployment", "Roadmap", "Offene Fragen"],
    tags: ["Architektur", "Entwicklung", "SaaS", "Systeme"],
    recommendedUse: "Nutze diese Vorlage vor einem Entwicklungs-Sprint, Architektur-Review oder einer technischen Due-Diligence.",
  },
  "startup-operating-system": {
    title: "Startup-Betriebssystem",
    description: "Bilde Vision, Produkt, Kunden, Positionierung, Marketing, Vertrieb, Metriken, Entscheidungen und Risiken für ein kleines Startup ab.",
    audience: ["Gründer", "Indie-Hacker", "Kleine SaaS-Teams"],
    category: "Geschäft",
    sections: ["Vision", "Produkt", "Kunden", "Positionierung", "Marketing", "Vertrieb", "Metriken", "Roadmap", "Entscheidungen", "Risiken"],
    tags: ["Startup", "Geschäft", "SaaS", "Strategie"],
    recommendedUse: "Nutze die Map wöchentlich für die Abstimmung von Produkt und Go-to-Market.",
  },
  "obsidian-vault-starter": {
    title: "Obsidian-Vault-Starter",
    description: "Eine praktische PARA-inspirierte Startkarte für Obsidian und persönliches Wissensmanagement mit Markdown.",
    audience: ["Obsidian-Nutzer", "PKM-Nutzer", "Second-Brain-Aufbauer"],
    category: "Wissensmanagement",
    sections: ["Posteingang", "Projekte", "Bereiche", "Ressourcen", "Personen", "Meetings", "Ideen", "Archiv"],
    tags: ["Obsidian", "PKM", "Second Brain", "Vault"],
    recommendedUse: "Nutze die Vorlage, bevor du einen Obsidian-Vault neu anlegst oder aufräumst.",
  },
  "research-project": {
    title: "Forschungsprojekt-Map",
    description: "Strukturiere Forschungsfragen, Hypothesen, Literatur, Belege, Ergebnisse und nächste Schritte in Markdown.",
    audience: ["Studierende", "Forscher", "Journalisten", "Analysten"],
    category: "Forschung",
    sections: ["Forschungsfrage", "Hypothesen", "Literatur", "Methoden", "Belege", "Ergebnisse", "Quellen", "Offene Fragen", "Nächste Schritte"],
    tags: ["Forschung", "Analyse", "Quellen", "Belege"],
    recommendedUse: "Nutze die Vorlage für eine Literaturübersicht, Untersuchung oder einen analytischen Bericht.",
  },
  "novel-writing": {
    title: "Roman-Schreib-Map",
    description: "Plane Prämisse, Welt, Figuren, Akte, Kapitel, Themen und Konflikte als visuelle Markdown-Gliederung.",
    audience: ["Romanautoren", "Drehbuchautoren", "Worldbuilding-Projekte"],
    category: "Schreiben",
    sections: ["Prämisse", "Welt", "Figuren", "Handlung", "Akt I", "Akt II", "Akt III", "Kapitel", "Themen", "Konflikte", "Offene Fragen"],
    tags: ["Schreiben", "Fiktion", "Roman", "Worldbuilding"],
    recommendedUse: "Nutze die Vorlage vor dem Schreiben oder wenn eine Story-Outline zu linear wird.",
  },
  "content-strategy": {
    title: "Content-Strategie-Map",
    description: "Plane Zielgruppe, Positionierung, Säulen, Kanäle, Formate, Kampagnen, Produktion, Distribution und Metriken.",
    audience: ["Creator", "Agenturen", "Marketingteams"],
    category: "Marketing",
    sections: ["Zielgruppe", "Positionierung", "Content-Säulen", "Kanäle", "Formate", "Kampagnen", "Produktion", "Distribution", "Metriken", "Content-Backlog"],
    tags: ["Content", "Marketing", "Creator", "Distribution"],
    recommendedUse: "Nutze die Map vor einem Launch, einer Redaktionsplanung oder einem Content-Audit.",
  },
};

function localizeTemplate(template: TemplateMetadata, locale: MarketingLocale): TemplateMetadata {
  if (locale !== "de") return template;
  return { ...template, ...germanTemplateCopy[template.slug] };
}

async function readTemplateMetadata(slug: string): Promise<TemplateMetadata> {
  const raw = await readFile(join(templatesRoot, slug, "metadata.json"), "utf-8");
  return JSON.parse(raw) as TemplateMetadata;
}

export async function listTemplates(locale: MarketingLocale = "en"): Promise<TemplateMetadata[]> {
  const templates = await Promise.all(TEMPLATE_SLUGS.map(readTemplateMetadata));
  return templates.map((template) => localizeTemplate(template, locale)).sort((a, b) => a.title.localeCompare(b.title));
}

export async function getTemplate(slug: string, locale: MarketingLocale = "en"): Promise<TemplateRecord | null> {
  if (!TEMPLATE_SLUGS.includes(slug as (typeof TEMPLATE_SLUGS)[number])) {
    return null;
  }

  const metadata = localizeTemplate(await readTemplateMetadata(slug), locale);
  const markdown = await readFile(join(repoRoot, metadata.filePath), "utf-8");
  return { ...metadata, markdown };
}

export function templateSlugs() {
  return [...TEMPLATE_SLUGS];
}
