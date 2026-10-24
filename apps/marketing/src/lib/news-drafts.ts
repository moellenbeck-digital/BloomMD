import { stringifyFrontmatter } from "@bloommd/core/frontmatter";

export interface ReleaseDraftInput {
  title: string;
  tag: string;
  body: string;
  sourceUrl: string;
  publishedAt: string;
}

export interface NewsDraftFile {
  filename: string;
  content: string;
}

function cleanReleaseText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .filter((line) => !/(DATABASE_URL|AUTH_SECRET|SYNC_SECRET|STRIPE_SECRET|TOKEN|PASSWORD|\/Users\/|[A-Z]:\\)/i.test(line))
    .join("\n")
    .trim()
    .slice(0, 4_000);
}

function descriptionFrom(body: string, title: string): string {
  const plain = body.replace(/[#*_`>[\]-]/g, " ").replace(/\s+/g, " ").trim();
  return (plain || title).slice(0, 180).trim();
}

function dateFrom(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid release date: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

function slugFrom(title: string, tag: string): string {
  const source = `${title}-${tag}`.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = source.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return slug || "bloommd-release";
}

export function releaseToNewsDraftFiles(input: ReleaseDraftInput): NewsDraftFile[] {
  const title = input.title.trim() || `BloomMD ${input.tag.trim()}`;
  const tag = input.tag.trim() || "release";
  const date = dateFrom(input.publishedAt);
  const body = cleanReleaseText(input.body);
  const description = descriptionFrom(body, title);
  const slug = slugFrom(title, tag);
  const frontmatter = {
    title,
    description,
    date,
    tags: ["Release", tag],
    version: tag,
    sourceUrl: input.sourceUrl,
    source: "github-release",
    draft: true,
  };
  const article = `${body || description}\n`;

  return [
    {
      filename: `${date}-${slug}.md`,
      content: stringifyFrontmatter(article, frontmatter),
    },
    {
      filename: `${date}-${slug}-en.md`,
      content: stringifyFrontmatter(article, frontmatter),
    },
  ];
}
