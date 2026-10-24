/**
 * Handwriting files for the app, stored like the Obsidian plugin stores them: `<note> ink.svg` in
 * the vault's attachment folder (Obsidian setting), embedded into the node as `![[<note> ink.svg]]`.
 */
import type { BloomFolderPlugin } from "@bloommd/capacitor-folder";
import type { InkAttachments } from "@bloommd/ui";
import { Encoding, Filesystem } from "@capacitor/filesystem";
import { APP_DIRECTORY } from "./platform";

/** Folder for new attachments from Obsidian's `attachmentFolderPath` setting. */
export function attachmentFolder(setting: string | undefined, notePath: string): string {
  const noteFolder = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")) : "";
  const value = (setting ?? "/").trim();
  if (value === "" || value === "/") return "";
  if (value === "./" || value === ".") return noteFolder;
  if (value.startsWith("./")) return [noteFolder, value.slice(2)].filter(Boolean).join("/").replace(/\/+$/, "");
  return value.replace(/^\/+|\/+$/g, "");
}

/** `Physik ink.svg`, then `Physik ink 1.svg`, … — the plugin's naming. */
export function freeInkName(noteBase: string, taken: Set<string>): string {
  for (let index = 0; index < 1000; index += 1) {
    const name = `${noteBase} ink${index ? ` ${index}` : ""}.svg`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  throw new Error("No free file name for the drawing.");
}

/** Error code of a rejected plugin call (CONFLICT, EXISTS, …). */
function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function noteBase(notePath: string): string {
  return baseName(notePath).replace(/\.(md|markdown)$/i, "") || "Notiz";
}

export function folderInkAttachments(folder: BloomFolderPlugin, options: { pickNote?: () => Promise<string | null>; openNote?: (target: string) => void } = {}): InkAttachments {
  const svgFiles = async () => (await folder.list({ extensions: ["svg"] })).files.map((file) => file.path);
  /** Obsidian resolves `![[name]]` by file name anywhere in the vault, nearest folder first. */
  const resolve = async (name: string, notePath: string): Promise<string | null> => {
    if (name.includes("/")) return name;
    const noteFolder = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")) : "";
    const matches = (await svgFiles()).filter((path) => baseName(path).toLowerCase() === name.toLowerCase());
    return matches.find((path) => path === [noteFolder, name].filter(Boolean).join("/")) ?? matches[0] ?? null;
  };
  /** Modification time of each drawing when it was read or written, to detect edits elsewhere. */
  const modified = new Map<string, number>();
  /** A new drawing under a free name; an existing file (also one still in iCloud) is never replaced. */
  const create = async (svg: string, notePath: string): Promise<string> => {
    const settings = await folder.read({ path: ".obsidian/app.json" }).then((file) => JSON.parse(file.data) as { attachmentFolderPath?: string }, () => ({} as { attachmentFolderPath?: string }));
    const target = attachmentFolder(settings.attachmentFolderPath, notePath);
    const taken = new Set((await svgFiles()).map((path) => baseName(path).toLowerCase()));
    for (;;) {
      const fresh = freeInkName(noteBase(notePath), taken);
      const path = [target, fresh].filter(Boolean).join("/");
      try {
        const written = await folder.write({ path, data: svg, exclusive: true });
        modified.set(path, written.modified);
        return fresh;
      } catch (error) {
        if (errorCode(error) !== "EXISTS") throw error;
        taken.add(fresh.toLowerCase());
      }
    }
  };
  return {
    async read(name, notePath) {
      const path = await resolve(name, notePath);
      if (!path) throw new Error(`${name} not found`);
      const file = await folder.read({ path });
      modified.set(path, file.modified);
      return file.data;
    },
    async write(name, svg, notePath) {
      if (!name) return create(svg, notePath);
      const path = (await resolve(name, notePath)) ?? name;
      const expectedModified = modified.get(path);
      try {
        const written = await folder.write({ path, data: svg, ...(expectedModified !== undefined ? { expectedModified } : {}) });
        modified.set(path, written.modified);
        return name;
      } catch (error) {
        // Changed (or deleted) on another device since it was opened: keep both versions.
        if (errorCode(error) === "CONFLICT") return create(svg, notePath);
        throw error;
      }
    },
    ...options,
  };
}

const APP_DIR = "bloommd";

export function appInkAttachments(options: { pickNote?: () => Promise<string | null>; openNote?: (target: string) => void } = {}): InkAttachments {
  return {
    async read(name) {
      const file = await Filesystem.readFile({ directory: APP_DIRECTORY, path: `${APP_DIR}/${baseName(name)}`, encoding: Encoding.UTF8 });
      return file.data as string;
    },
    async write(name, svg, notePath) {
      let target = name ? baseName(name) : "";
      if (!target) {
        const { files } = await Filesystem.readdir({ directory: APP_DIRECTORY, path: APP_DIR }).catch(() => ({ files: [] as Array<{ name: string }> }));
        const taken = new Set(files.map((file) => file.name.toLowerCase()));
        target = freeInkName(noteBase(notePath), taken);
        // Never replace a drawing that appeared since the folder was listed.
        while (await Filesystem.stat({ directory: APP_DIRECTORY, path: `${APP_DIR}/${target}` }).then(() => true, () => false)) {
          taken.add(target.toLowerCase());
          target = freeInkName(noteBase(notePath), taken);
        }
      }
      await Filesystem.writeFile({ directory: APP_DIRECTORY, path: `${APP_DIR}/${target}`, data: svg, encoding: Encoding.UTF8, recursive: true });
      return target;
    },
    ...options,
  };
}
