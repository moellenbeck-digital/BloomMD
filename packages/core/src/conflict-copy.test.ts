import { describe, expect, test } from "bun:test";
import {
  CONFLICT_COPY_LABELS,
  conflictCopyPath,
  findConflictCopyOriginal,
  isConflictCopy,
  parseConflictCopy,
} from "./conflict-copy";

describe("conflictCopyPath", () => {
  test("names the first copy after the label and numbers the following ones", () => {
    expect(conflictCopyPath("Schule/Physik.md", CONFLICT_COPY_LABELS.ios, 1)).toBe("Schule/Physik (iPad-Konflikt).md");
    expect(conflictCopyPath("Physik.md", CONFLICT_COPY_LABELS.android, 2)).toBe("Physik (Android-Konflikt 2).md");
    expect(conflictCopyPath("Notiz.markdown", CONFLICT_COPY_LABELS.ios, 3)).toBe("Notiz (iPad-Konflikt 3).markdown");
    expect(conflictCopyPath("Ohne Endung", CONFLICT_COPY_LABELS.ios, 1)).toBe("Ohne Endung (iPad-Konflikt).md");
  });
});

describe("parseConflictCopy", () => {
  test("recognises the iPad and Android scheme, with and without a number", () => {
    expect(parseConflictCopy("Physik (iPad-Konflikt).md")).toEqual({ label: "iPad-Konflikt", attempt: 1, originalPath: "Physik.md" });
    expect(parseConflictCopy("Physik (iPad-Konflikt 2).md")).toEqual({ label: "iPad-Konflikt", attempt: 2, originalPath: "Physik.md" });
    expect(parseConflictCopy("Physik (Android-Konflikt).md")).toEqual({ label: "Android-Konflikt", attempt: 1, originalPath: "Physik.md" });
    expect(parseConflictCopy("Physik (Android-Konflikt 12).md")).toEqual({ label: "Android-Konflikt", attempt: 12, originalPath: "Physik.md" });
  });

  test("keeps the folder and the extension of the original", () => {
    expect(parseConflictCopy("Schule/Physik (iPad-Konflikt 3).markdown")).toEqual({
      label: "iPad-Konflikt",
      attempt: 3,
      originalPath: "Schule/Physik.markdown",
    });
    expect(parseConflictCopy("Mein Heft (v2) (iPad-Konflikt).md")?.originalPath).toBe("Mein Heft (v2).md");
  });

  test("reads back every name conflictCopyPath makes", () => {
    for (const label of Object.values(CONFLICT_COPY_LABELS)) {
      for (const attempt of [1, 2, 7]) {
        const info = parseConflictCopy(conflictCopyPath("A/B c.md", label, attempt));
        expect(info).toEqual({ label, attempt, originalPath: "A/B c.md" });
      }
    }
  });

  test("ignores names that only look similar", () => {
    for (const name of [
      "Physik.md",
      "Physik (iPad).md",
      "Physik (Konflikt).md",
      "Physik (iPad-Konflikt) final.md",
      "Physik (iPad-Konflikt 2 ).md",
      "Physik (iPad-Konflikt x).md",
      "Physik(iPad-Konflikt).md",
      " (iPad-Konflikt).md",
      "Physik (iPad-Konflikt).txt",
      "Ordner (iPad-Konflikt)/Physik.md",
    ]) {
      expect(parseConflictCopy(name)).toBeNull();
      expect(isConflictCopy(name)).toBe(false);
    }
  });

  test("is not case sensitive about the extension and label", () => {
    expect(parseConflictCopy("Physik (iPad-Konflikt).MD")?.originalPath).toBe("Physik.MD");
    expect(parseConflictCopy("Physik (ipad-konflikt).md")?.label).toBe("iPad-Konflikt");
  });
});

describe("findConflictCopyOriginal", () => {
  const files = [{ filename: "Schule/Physik.md" }, { filename: "Schule/Physik (iPad-Konflikt).md" }];

  test("finds the original in the list, ignoring case", () => {
    expect(findConflictCopyOriginal("Schule/Physik (iPad-Konflikt).md", files)).toBe("Schule/Physik.md");
    expect(findConflictCopyOriginal("schule/physik (iPad-Konflikt 2).md", files)).toBe("Schule/Physik.md");
  });

  test("is null when the original is gone or the note is no conflict copy", () => {
    expect(findConflictCopyOriginal("Schule/Chemie (iPad-Konflikt).md", files)).toBeNull();
    expect(findConflictCopyOriginal("Schule/Physik.md", files)).toBeNull();
  });
});
