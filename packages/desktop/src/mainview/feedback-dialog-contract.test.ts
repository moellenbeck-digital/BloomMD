import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const APP_SOURCE = new URL("./App.tsx", import.meta.url);

describe("Desktop feedback dialog contract", () => {
  test("protects message focus and avoids synchronous draft persistence", async () => {
    const source = await readFile(APP_SOURCE, "utf8");

    for (const contract of [
      "feedbackDraftPersistenceTimer",
      "messageRef",
      "autoFocus",
      'data-testid="desktop-feedback-message"',
      "document.activeElement === document.body",
      "}, 200);",
    ]) {
      expect(source).toContain(contract);
    }
  });
});
