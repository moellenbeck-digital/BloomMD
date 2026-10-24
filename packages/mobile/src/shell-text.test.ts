import { describe, expect, test } from "bun:test";
import { shellText } from "./shell-text";

describe("shellText", () => {
  test("English devices get English shell texts, everything else German", () => {
    expect(shellText("en").openFolder).toBe("Open folder");
    expect(shellText("de").openFolder).toBe("Ordner öffnen");
    expect(shellText("fr").openFolder).toBe("Ordner öffnen");
  });

  test("English texts contain no German leftovers", () => {
    const flatten = (value: unknown): string[] => typeof value === "string" ? [value]
      : typeof value === "function" ? [String((value as (...args: string[]) => string)("x", "y"))]
      : Object.values(value as Record<string, unknown>).flatMap(flatten);
    for (const line of flatten(shellText("en"))) expect(line).not.toMatch(/[äöüß„]|\b(der|die|das|nicht)\b/i);
  });
});
