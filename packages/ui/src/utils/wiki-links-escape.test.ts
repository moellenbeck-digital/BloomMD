import { describe, expect, test } from "bun:test";
import { restoreWikiLinks } from "./wiki-links-escape";

describe("restoreWikiLinks", () => {
  test("restores links and embeds the editor escaped", () => {
    expect(restoreWikiLinks("Wärme und \\[\\[Arbeit]].\n\n!\\[\\[Thermodynamik ink.svg]]")).toBe("Wärme und [[Arbeit]].\n\n![[Thermodynamik ink.svg]]");
  });

  test("restores aliases, headings and fully escaped closing brackets", () => {
    expect(restoreWikiLinks("\\[\\[Physik#Arbeit\\|die Arbeit\\]\\]")).toBe("[[Physik#Arbeit|die Arbeit]]");
    expect(restoreWikiLinks("\\[\\[T\\_kalt]]")).toBe("[[T_kalt]]");
  });

  test("leaves unescaped links and single escaped brackets alone", () => {
    expect(restoreWikiLinks("[[Arbeit]] und ![[a.svg]]")).toBe("[[Arbeit]] und ![[a.svg]]");
    expect(restoreWikiLinks("Liste \\[x] und \\[Text]")).toBe("Liste \\[x] und \\[Text]");
  });
});
