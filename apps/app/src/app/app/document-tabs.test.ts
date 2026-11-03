import { describe, expect, test } from "bun:test";
import {
  MAX_OPEN_TABS,
  backTarget,
  closeTab,
  parseStoredTabs,
  renameTabFile,
  serializeTabs,
  tabKey,
  upsertTab,
  type OpenTab,
} from "./document-tabs";

const none = new Set<string>();

function cloud(filename: string, workspaceId: string | null = null) {
  return { source: "cloud" as const, workspaceId, filename, title: filename.replace(/\.md$/, "") };
}

function build(names: string[], active: string | null = null, unsaved: ReadonlySet<string> = none): OpenTab[] {
  let tabs: OpenTab[] = [];
  for (const name of names) tabs = upsertTab(tabs, cloud(name), { activeKey: active, unsavedKeys: unsaved });
  return tabs;
}

const key = (name: string, workspaceId: string | null = null) => tabKey(cloud(name, workspaceId));

describe("@t52 tab order", () => {
  test("new tabs are appended", () => {
    expect(build(["a.md", "b.md", "c.md"]).map((tab) => tab.filename)).toEqual(["a.md", "b.md", "c.md"]);
  });

  test("activating an existing tab keeps its position", () => {
    const tabs = build(["a.md", "b.md", "c.md"]);
    const again = upsertTab(tabs, cloud("a.md"), { activeKey: key("a.md"), unsavedKeys: none });
    expect(again.map((tab) => tab.filename)).toEqual(["a.md", "b.md", "c.md"]);
  });

  test("a changed title updates the tab in place", () => {
    const tabs = build(["a.md", "b.md"]);
    const next = upsertTab(tabs, { ...cloud("a.md"), title: "Renamed" }, { activeKey: key("a.md"), unsavedKeys: none });
    expect(next.map((tab) => tab.title)).toEqual(["Renamed", "b"]);
  });

  test("an unchanged tab returns the same array", () => {
    const tabs = build(["a.md"]);
    expect(upsertTab(tabs, cloud("a.md"), { activeKey: key("a.md"), unsavedKeys: none })).toBe(tabs);
  });

  test("the same filename in two workspaces is two tabs", () => {
    let tabs = build([]);
    tabs = upsertTab(tabs, cloud("a.md", "w1"), { activeKey: null, unsavedKeys: none });
    tabs = upsertTab(tabs, cloud("a.md", "w2"), { activeKey: null, unsavedKeys: none });
    expect(tabs).toHaveLength(2);
  });
});

describe("@t52 tab limit", () => {
  const names = Array.from({ length: MAX_OPEN_TABS }, (_, i) => `n${i}.md`);

  test("the eleventh tab evicts the oldest inactive one", () => {
    const tabs = upsertTab(build(names), cloud("new.md"), { activeKey: key("new.md"), unsavedKeys: none });
    expect(tabs).toHaveLength(MAX_OPEN_TABS);
    expect(tabs[0]!.filename).toBe("n1.md");
    expect(tabs.at(-1)!.filename).toBe("new.md");
  });

  test("the active tab is never evicted", () => {
    const tabs = upsertTab(build(names), cloud("new.md"), { activeKey: key("n0.md"), unsavedKeys: none });
    expect(tabs.map((tab) => tab.filename)).toContain("n0.md");
    expect(tabs.map((tab) => tab.filename)).not.toContain("n1.md");
  });

  test("a tab with unsaved changes is never evicted", () => {
    const tabs = upsertTab(build(names), cloud("new.md"), {
      activeKey: key("new.md"),
      unsavedKeys: new Set([key("n0.md"), key("n1.md")]),
    });
    expect(tabs.map((tab) => tab.filename)).toContain("n0.md");
    expect(tabs.map((tab) => tab.filename)).toContain("n1.md");
    expect(tabs.map((tab) => tab.filename)).not.toContain("n2.md");
  });

  test("other workspaces do not count against the limit", () => {
    let tabs = build(names);
    tabs = upsertTab(tabs, cloud("x.md", "w2"), { activeKey: null, unsavedKeys: none });
    expect(tabs).toHaveLength(MAX_OPEN_TABS + 1);
  });
});

describe("@t52 closing", () => {
  test("closing picks the right neighbour, else the left", () => {
    const tabs = build(["a.md", "b.md", "c.md"]);
    expect(closeTab(tabs, tabs, key("a.md")).neighbour?.filename).toBe("b.md");
    expect(closeTab(tabs, tabs, key("b.md")).neighbour?.filename).toBe("c.md");
    expect(closeTab(tabs, tabs, key("c.md")).neighbour?.filename).toBe("b.md");
  });

  test("the neighbour comes from the visible bar, not hidden tabs of other workspaces", () => {
    let tabs = build(["a.md", "b.md"]);
    tabs = upsertTab(tabs, cloud("z.md", "w2"), { activeKey: null, unsavedKeys: none });
    const visible = tabs.filter((tab) => tab.workspaceId === null);
    expect(closeTab(tabs, visible, key("b.md")).neighbour?.filename).toBe("a.md");
  });

  test("closing the only tab has no neighbour", () => {
    const tabs = build(["a.md"]);
    const result = closeTab(tabs, tabs, key("a.md"));
    expect(result.neighbour).toBeNull();
    expect(result.tabs).toEqual([]);
  });

  test("tabs opened from a closed tab inherit its origin", () => {
    let tabs = build(["a.md"]);
    tabs = upsertTab(tabs, cloud("b.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "map" } });
    tabs = upsertTab(tabs, cloud("c.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "document", key: key("b.md") } });
    const closed = closeTab(tabs, tabs, key("b.md")).tabs;
    expect(closed.find((tab) => tab.filename === "c.md")?.origin).toEqual({ kind: "map" });
  });
});

describe("@t52 back navigation", () => {
  test("a document opened from the map goes back to the map", () => {
    const tabs = upsertTab([], cloud("a.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "map" } });
    expect(backTarget(tabs, key("a.md"), true)).toEqual({ kind: "map" });
  });

  test("without a map there is no back action", () => {
    const tabs = upsertTab([], cloud("a.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "map" } });
    expect(backTarget(tabs, key("a.md"), false)).toBeNull();
  });

  test("a document opened from another document goes back to it", () => {
    let tabs = build(["a.md"]);
    tabs = upsertTab(tabs, cloud("b.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "document", key: key("a.md") } });
    const target = backTarget(tabs, key("b.md"), false);
    expect(target?.kind === "document" && target.tab.filename).toBe("a.md");
  });

  test("no origin, or an origin that is gone, has no back action", () => {
    expect(backTarget(build(["a.md"]), key("a.md"), true)).toBeNull();
    const tabs = upsertTab([], cloud("b.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "document", key: key("gone.md") } });
    expect(backTarget(tabs, key("b.md"), true)).toBeNull();
  });

  test("a tab is never its own origin", () => {
    const tabs = upsertTab([], cloud("a.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "document", key: key("a.md") } });
    expect(tabs[0]!.origin).toBeUndefined();
  });
});

describe("@t52 rename", () => {
  test("a rename keeps position and re-points origins", () => {
    let tabs = build(["a.md", "b.md"]);
    tabs = upsertTab(tabs, cloud("c.md"), { activeKey: null, unsavedKeys: none, origin: { kind: "document", key: key("a.md") } });
    const next = renameTabFile(tabs, cloud("a.md"), "z.md");
    expect(next.map((tab) => tab.filename)).toEqual(["z.md", "b.md", "c.md"]);
    expect(next[2]!.origin).toEqual({ kind: "document", key: key("z.md") });
    expect(next[0]!.key).toBe(key("z.md"));
  });

  test("renaming an unknown tab changes nothing", () => {
    const tabs = build(["a.md"]);
    expect(renameTabFile(tabs, cloud("nope.md"), "z.md")).toBe(tabs);
  });
});

describe("@t52 storage", () => {
  test("only cloud tabs are stored, without origins", () => {
    let tabs = build(["a.md"]);
    tabs = upsertTab(tabs, { source: "local", workspaceId: null, filename: "notes/x.md", title: "X" }, { activeKey: null, unsavedKeys: none, origin: { kind: "map" } });
    const stored = JSON.parse(serializeTabs(tabs)) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty("origin");
  });

  test("the former {filename,title} shape is read as a default-workspace cloud tab", () => {
    const tabs = parseStoredTabs(JSON.stringify([{ filename: "a.md", title: "A" }, { filename: "a.md", title: "dup" }, { nope: true }]));
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ filename: "a.md", title: "A", source: "cloud", workspaceId: null, key: key("a.md") });
  });

  test("garbage resets to no tabs", () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      expect(parseStoredTabs("{not json")).toEqual([]);
    } finally {
      console.warn = originalWarn;
    }
    expect(parseStoredTabs('{"a":1}')).toEqual([]);
    expect(parseStoredTabs(null)).toEqual([]);
  });

  test("a round trip keeps order and workspace", () => {
    let tabs: OpenTab[] = [];
    tabs = upsertTab(tabs, cloud("a.md", "w1"), { activeKey: null, unsavedKeys: none });
    tabs = upsertTab(tabs, cloud("b.md", "w1"), { activeKey: null, unsavedKeys: none });
    expect(parseStoredTabs(serializeTabs(tabs)).map((tab) => [tab.workspaceId, tab.filename])).toEqual([["w1", "a.md"], ["w1", "b.md"]]);
  });
});
