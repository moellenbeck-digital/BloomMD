import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

/**
 * The export formats of the export menu plus the image formats "Save image" keeps as they are
 * (#53: the original file of an image in a note); anything else is refused.
 */
const EXPORT_EXTENSIONS = new Set([".md", ".opml", ".pdf", ".png", ".svg", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp"]);
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const MAX_NAME_ATTEMPTS = 999;

// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Reduces a requested name to a plain file name with an allowed extension, or `null`. */
export function safeExportName(filename: string): string | null {
  const name = basename(filename.replace(/\\/g, "/")).replace(UNSAFE_NAME_CHARS, "-").trim().replace(/^\.+/, "");
  const extension = extname(name).toLowerCase();
  if (!name || name.length > 200 || !EXPORT_EXTENSIONS.has(extension)) return null;
  return name;
}

export type SaveExportResult = { path: string } | { error: string };

/**
 * Writes an exported file into `directory` (the user's Downloads folder). An existing file is never
 * overwritten: `Name.md` becomes `Name (1).md`, `Name (2).md`, …
 */
export async function saveExportFile(directory: string, filename: string, dataBase64: string): Promise<SaveExportResult> {
  const name = safeExportName(filename);
  if (!name) return { error: "Unsupported export file name." };
  if (Math.floor((dataBase64.length * 3) / 4) > MAX_EXPORT_BYTES) return { error: "The export is too large." };
  const data = Buffer.from(dataBase64, "base64");
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  await mkdir(directory, { recursive: true });
  for (let attempt = 0; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const path = join(directory, attempt === 0 ? name : `${stem} (${attempt})${extension}`);
    try {
      // "wx" fails if the file exists, so a concurrent export can never be overwritten.
      await writeFile(path, data, { flag: "wx" });
      return { path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  return { error: "No free file name found in the Downloads folder." };
}
