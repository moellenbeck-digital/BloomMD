export function isChangedFileActive(currentFilePath: string | null, changedFilename: string): boolean {
  if (!currentFilePath || !changedFilename) return false;

  const current = currentFilePath.replaceAll("\\", "/");
  const changed = changedFilename.replaceAll("\\", "/");

  return current === changed || current.endsWith(`/${changed}`);
}
