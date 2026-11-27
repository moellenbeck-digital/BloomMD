export interface WorkspaceLoadIssue {
  path: string;
  kind: "yaml" | "permission" | "missing" | "path" | "unknown";
  line?: number;
  column?: number;
}

/** Keep parser source snippets and absolute paths out of renderer diagnostics. */
export function workspaceLoadIssue(path: string, error: unknown): WorkspaceLoadIssue {
  const value = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  if (value.name === "YAMLException") {
    const mark = typeof value.mark === "object" && value.mark !== null ? value.mark as Record<string, unknown> : {};
    return { path, kind: "yaml",
      ...(typeof mark.line === "number" ? { line: mark.line + 1 } : {}),
      ...(typeof mark.column === "number" ? { column: mark.column + 1 } : {}),
    };
  }
  const kind = value.code === "EACCES" || value.code === "EPERM" ? "permission"
    : value.code === "ENOENT" ? "missing"
      : value.message === "Existing path cannot be normalized without changing its name" ? "path" : "unknown";
  return { path, kind };
}
