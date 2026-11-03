import { bytesToBase64, type ExportFile } from "@bloommd/ui";

export interface ExportShareDeps {
  /** Writes the file into the app's cache and returns its native `file://` URI. */
  writeFile: (path: string, dataBase64: string) => Promise<string>;
  removeFile: (path: string) => Promise<void>;
  canShare: () => Promise<boolean>;
  share: (options: { title: string; files: string[] }) => Promise<void>;
  /** Fallback outside a native shell (browser dev builds). */
  download: (file: ExportFile) => void;
}

export type ExportShareResult = "shared" | "cancelled" | "downloaded";

const CACHE_FOLDER = "exports";

/**
 * Hands an exported file to the system share sheet, which offers "Save to Files", AirDrop, Mail and
 * every other app that takes the file. Exports of any format go through the same path.
 */
export async function shareExportFile(file: ExportFile, deps: ExportShareDeps): Promise<ExportShareResult> {
  if (!(await deps.canShare())) {
    deps.download(file);
    return "downloaded";
  }
  const path = `${CACHE_FOLDER}/${file.filename}`;
  const uri = await deps.writeFile(path, bytesToBase64(file.data));
  try {
    await deps.share({ title: file.filename, files: [uri] });
    return "shared";
  } catch (error) {
    // Dismissing the share sheet rejects on iOS and Android; that is a choice, not a failure.
    if (error instanceof Error && /cancel/i.test(error.message)) return "cancelled";
    throw error;
  } finally {
    await deps.removeFile(path).catch((error: unknown) => console.error("[BloomMD] could not remove the temporary export:", error));
  }
}
