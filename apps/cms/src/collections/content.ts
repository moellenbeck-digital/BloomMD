import type { CollectionConfig, Field } from "payload";
import { contentReaders, contentRoles } from "../access";

const fields: Field[] = [
  {
    name: "locale",
    type: "select",
    required: true,
    defaultValue: "de",
    label: "Sprache",
    options: [
      { label: "Deutsch", value: "de" },
      { label: "English", value: "en" },
    ],
  },
  { name: "title", type: "text", required: true, label: "Titel" },
  {
    name: "slug",
    type: "text",
    required: true,
    unique: true,
    index: true,
    label: "Slug",
    admin: { description: "Wie der Dateiname im Repo, englische Fassungen mit Suffix -en." },
    validate: (value: string | null | undefined) => (typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? true : "slug: Kleinbuchstaben, Ziffern und Bindestriche"),
  },
  { name: "summary", type: "textarea", label: "Zusammenfassung" },
  { name: "body", type: "textarea", label: "Text", admin: { description: "Markdown wie in apps/marketing/content." } },
  { name: "tags", type: "text", hasMany: true, label: "Tags" },
  { name: "version", type: "text", label: "Version", admin: { description: "Produktversion, auf die sich der Beitrag bezieht (z. B. 0.6.0)." } },
  { name: "date", type: "date", required: true, label: "Datum", defaultValue: () => new Date().toISOString() },
  { name: "image", type: "upload", relationTo: "media", label: "Bild" },
];

/**
 * Blog and news share one shape (German and English entries, draft and published through Payload
 * drafts, tags, version, date, image). Import of the existing Markdown, the marketing read path, RSS and
 * the news draft from CI are #366, not part of this collection.
 */
function contentCollection(slug: "blog" | "news", singular: string): CollectionConfig {
  return {
    slug,
    labels: { singular, plural: singular },
    admin: {
      useAsTitle: "title",
      defaultColumns: ["title", "locale", "date", "_status"],
      group: "Inhalte",
      description: "Entwurf speichern, prüfen und erst dann veröffentlichen. Nur Veröffentlichtes erreicht /svc/v1/content; Entwürfe nie. Die Vorschau zeigt den aktuellen Entwurf.",
      // The preview is a page of the admin app itself (no marketing read path yet, #366): only for signed-in operators.
      preview: (doc) => (doc?.id ? `/preview/${slug}/${String(doc.id)}` : null),
    },
    access: {
      create: contentRoles,
      read: contentReaders,
      update: contentRoles,
      delete: contentRoles,
      readVersions: contentReaders,
    },
    versions: { drafts: true, maxPerDoc: 25 },
    fields,
  };
}

export const Blog = contentCollection("blog", "Blog");
export const News = contentCollection("news", "News");
