import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseToNewsDraftFiles, type ReleaseDraftInput } from "../src/lib/news-drafts";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseArguments(args: string[]): JsonRecord {
  const values: JsonRecord = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (!argument.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    const value = inlineValue ?? args[index + 1] ?? "";
    if (inlineValue === undefined) index += 1;
    values[key ?? ""] = value;
  }
  return values;
}

function releaseInputFromEvent(event: JsonRecord): ReleaseDraftInput {
  const release = asRecord(event.release);
  if (!release) throw new Error("GITHUB_EVENT_PATH does not contain a release payload");
  const title = textValue(release.name) || textValue(release.tag_name);
  const tag = textValue(release.tag_name);
  const sourceUrl = textValue(release.html_url);
  const publishedAt = textValue(release.published_at) || textValue(release.created_at);
  if (!title || !tag || !sourceUrl || !publishedAt) throw new Error("Release payload is missing title, tag, URL or date");
  return { title, tag, body: textValue(release.body), sourceUrl, publishedAt };
}

function releaseInputFromArguments(args: JsonRecord): ReleaseDraftInput {
  const input = {
    title: textValue(args.title),
    tag: textValue(args.tag),
    body: textValue(args.body),
    sourceUrl: textValue(args.url),
    publishedAt: textValue(args["published-at"]),
  };
  if (!input.title || !input.tag || !input.sourceUrl || !input.publishedAt) {
    throw new Error("Usage: --title <title> --tag <version> --url <release-url> --published-at <ISO date> [--body <notes>]");
  }
  return input;
}

async function main(): Promise<void> {
  const eventPath = textValue(process.env.GITHUB_EVENT_PATH);
  const event = eventPath ? asRecord(JSON.parse(await readFile(eventPath, "utf8"))) : null;
  const input = event ? releaseInputFromEvent(event) : releaseInputFromArguments(parseArguments(Bun.argv.slice(2)));
  const outputDirectory = join(process.cwd(), "content", "news");
  await mkdir(outputDirectory, { recursive: true });
  for (const file of releaseToNewsDraftFiles(input)) {
    const path = join(outputDirectory, file.filename);
    await Bun.write(path, file.content);
    console.log(`Created draft: ${path}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not create release news draft");
  process.exitCode = 1;
});
