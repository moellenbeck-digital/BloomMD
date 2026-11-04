import { describe, expect, test } from "bun:test";
import { parseAppLink } from "./app-links";

describe("parseAppLink", () => {
  test("recognizes the sign-in callback and keeps the full URL for the state check", () => {
    expect(parseAppLink("bloommd://auth?code=bloom_mac_x&state=abc")).toEqual({ kind: "auth", url: "bloommd://auth?code=bloom_mac_x&state=abc" });
  });

  test("still opens notes and ignores foreign links", () => {
    expect(parseAppLink("bloommd://open?path=Schule/Physik.md&node=abc")).toEqual({ kind: "open", path: "Schule/Physik.md", node: "abc" });
    expect(parseAppLink("https://bloommd.app/auth?code=x")).toBeNull();
    expect(parseAppLink("bloommd://open?path=../x.md")).toBeNull();
  });
});

describe("parseAppLink: universal links and documents", () => {
  test("opens notes from https://bloommd.io/open with the same validation as the scheme", () => {
    expect(parseAppLink("https://bloommd.io/open?path=Schule/Physik.md&node=abc")).toEqual({ kind: "open", path: "Schule/Physik.md", node: "abc" });
    expect(parseAppLink("https://bloommd.io/open/?path=a%20b/c.markdown")).toEqual({ kind: "open", path: "a b/c.markdown", node: null });
    expect(parseAppLink("https://BLOOMMD.IO/open?path=x.md")).toEqual({ kind: "open", path: "x.md", node: null });
    expect(parseAppLink("https://bloommd.io/open?path=/Abs/x.md")).toEqual({ kind: "open", path: "Abs/x.md", node: null });
    expect(parseAppLink("https://bloommd.io/open?path=../x.md")).toBeNull();
    expect(parseAppLink("https://bloommd.io/open?path=a/../x.md")).toBeNull();
    expect(parseAppLink("https://bloommd.io/open?path=x.txt")).toBeNull();
    expect(parseAppLink("https://bloommd.io/open")).toBeNull();
    expect(parseAppLink("https://bloommd.io/open?path=x.md&node=bad%20id")).toEqual({ kind: "open", path: "x.md", node: null });
  });

  test("accepts only exactly bloommd.io over https", () => {
    for (const url of [
      "https://www.bloommd.io/open?path=x.md",
      "https://app.bloommd.io/open?path=x.md",
      "https://evilbloommd.io/open?path=x.md",
      "https://bloommd.io.evil.com/open?path=x.md",
      "https://bloommd.io./open?path=x.md",
      "https://bloommd.io:8443/open?path=x.md",
      "https://user@bloommd.io/open?path=x.md",
      "https://user:pw@bloommd.io/open?path=x.md",
      "https://bloommd.io@evil.com/open?path=x.md",
      "http://bloommd.io/open?path=x.md",
      "https://bloommd.app/open?path=x.md",
      "https://bloommd.io/openx?path=x.md",
      "https://bloommd.io/other?path=x.md",
      "https://bloommd.io/open/a/b",
    ]) expect(parseAppLink(url)).toBeNull();
  });

  test("opens cloud documents from both carriers", () => {
    expect(parseAppLink("bloommd://open?doc=Doc_1-x&node=n1")).toEqual({ kind: "doc", doc: "Doc_1-x", node: "n1" });
    expect(parseAppLink("https://bloommd.io/open/Doc_1-x?node=n1")).toEqual({ kind: "doc", doc: "Doc_1-x", node: "n1" });
    expect(parseAppLink("https://bloommd.io/open/Doc_1-x")).toEqual({ kind: "doc", doc: "Doc_1-x", node: null });
    expect(parseAppLink("bloommd://open?doc=Doc&path=x.md")).toEqual({ kind: "doc", doc: "Doc", node: null });
  });

  test("rejects malformed document ids", () => {
    for (const url of [
      "bloommd://open?doc=",
      "bloommd://open?doc=a/b",
      "bloommd://open?doc=..",
      "bloommd://open?doc=a%20b",
      `bloommd://open?doc=${"a".repeat(129)}`,
      "https://bloommd.io/open/..",
      "https://bloommd.io/open/%2e%2e",
      "https://bloommd.io/open/a%2Fb",
      "https://bloommd.io/open/a.md",
    ]) expect(parseAppLink(url)).toBeNull();
  });

  test("keeps auth and selftest to the custom scheme", () => {
    expect(parseAppLink("https://bloommd.io/auth?code=x&state=y")).toBeNull();
    expect(parseAppLink("https://bloommd.io/selftest")).toBeNull();
    expect(parseAppLink("https://bloommd.io/open/auth")).toEqual({ kind: "doc", doc: "auth", node: null });
    expect(parseAppLink("bloommd://selftest")).toEqual({ kind: "selftest" });
  });
});

describe("parseAppLink: Markdown files from the Files app", () => {
  test("a file URL of a Markdown file is a file link, the URL is kept as it came", () => {
    const url = "file:///private/var/mobile/Library/Mobile%20Documents/com~apple~CloudDocs/Obsidian/Vault/Notiz.md";
    expect(parseAppLink(url)).toEqual({ kind: "file", url });
    expect(parseAppLink("file:///private/var/mobile/Containers/Shared/AppGroup/Ordner/Seite.MARKDOWN")).toEqual({ kind: "file", url: "file:///private/var/mobile/Containers/Shared/AppGroup/Ordner/Seite.MARKDOWN" });
    expect(parseAppLink("file://localhost/private/var/x/Notiz.md")?.kind).toBe("file");
    expect(parseAppLink("file:///private/var/x/Notiz%20mit%20Leerzeichen.md")?.kind).toBe("file");
  });

  test("anything but a Markdown file is ignored", () => {
    for (const url of [
      "file:///private/var/x/Bild.png",
      "file:///private/var/x/Notiz.md.txt",
      "file:///private/var/x/Ordner/",
      "file:///private/var/x/notiz",
      "file://evil.example/x/Notiz.md",
      "file:///private/var/x/Notiz%2",
      "file:///private/var/x/Notiz.md%00.png",
    ]) expect(parseAppLink(url)).toBeNull();
  });

  test("other kinds of links are unchanged", () => {
    expect(parseAppLink("bloommd://open?path=Notiz.md")).toEqual({ kind: "open", path: "Notiz.md", node: null });
    expect(parseAppLink("ftp://example.com/Notiz.md")).toBeNull();
  });
});
