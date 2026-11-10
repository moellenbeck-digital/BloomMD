import { afterEach, describe, expect, test } from "bun:test";
import { describeMermaidError, MERMAID_CONFIG, renderMermaid, setMermaidLoader, type MermaidApi } from "./mermaid-render";

afterEach(() => setMermaidLoader(null));

function fakeApi(render: MermaidApi["render"]): { api: MermaidApi; configs: Array<Record<string, unknown>> } {
  const configs: Array<Record<string, unknown>> = [];
  return { api: { initialize: (config) => configs.push(config), render }, configs };
}

describe("renderMermaid", () => {
  test("returns the SVG of a valid diagram and initializes strict, once", async () => {
    const { api, configs } = fakeApi(async (id, text) => ({ svg: `<svg data-id="${id}">${text}</svg>` }));
    let loads = 0;
    setMermaidLoader(async () => {
      loads += 1;
      return api;
    });
    const first = await renderMermaid("graph TD; A-->B");
    const second = await renderMermaid("graph TD; B-->C");
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect(loads).toBe(1);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ securityLevel: "strict", startOnLoad: false });
    expect(MERMAID_CONFIG.securityLevel).toBe("strict");
    // Every render gets its own element id.
    expect(first.ok && second.ok && first.svg !== second.svg).toBe(true);
  });

  test("a syntax error is a result with message and line, not an exception", async () => {
    const { api } = fakeApi(async () => {
      throw new Error("Parse error on line 3:\n...A-->\n-----^\nExpecting 'SEMI'");
    });
    setMermaidLoader(async () => api);
    const result = await renderMermaid("graph TD\nA-->B\nB-->");
    expect(result).toEqual({ ok: false, message: "Parse error on line 3:\n...A-->\n-----^\nExpecting 'SEMI'", line: 3 });
  });

  test("an error without a line number still carries its message", async () => {
    const { api } = fakeApi(async () => {
      throw new Error("No diagram type detected");
    });
    setMermaidLoader(async () => api);
    expect(await renderMermaid("nonsense")).toEqual({ ok: false, message: "No diagram type detected" });
  });

  test("a failed library load is reported, not cached", async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      let attempt = 0;
      const { api } = fakeApi(async () => ({ svg: "<svg/>" }));
      setMermaidLoader(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("network down");
        return api;
      });
      expect(await renderMermaid("graph TD; A-->B")).toEqual({ ok: false, message: "network down", loadFailed: true });
      expect(await renderMermaid("graph TD; A-->B")).toMatchObject({ ok: true });
    } finally {
      console.error = originalError;
    }
  });

  test("renders run one after another", async () => {
    const order: string[] = [];
    const { api } = fakeApi(async (_id, text) => {
      order.push(`start ${text}`);
      await new Promise((resolve) => setTimeout(resolve, text === "a" ? 20 : 1));
      order.push(`end ${text}`);
      return { svg: text };
    });
    setMermaidLoader(async () => api);
    await Promise.all([renderMermaid("a"), renderMermaid("b")]);
    expect(order).toEqual(["start a", "end a", "start b", "end b"]);
  });
});

describe("describeMermaidError", () => {
  test("takes the line from Mermaid's wording and caps long messages", () => {
    expect(describeMermaidError(new Error("Lexical error on line 12. Unrecognized text."))).toMatchObject({ line: 12 });
    expect(describeMermaidError("x".repeat(2000)).message).toHaveLength(600);
    expect(describeMermaidError({ str: "Parse error on line 2" })).toEqual({ message: "Parse error on line 2", line: 2 });
  });

  test("keeps the reported line within the source, in the line field and in the message", () => {
    // Mermaid reports line 4 for a three-line flowchart that ends in an unfinished statement.
    const source = "graph TD\nA-->B\nB-->";
    expect(describeMermaidError(new Error("Parse error on line 4:\n..."), source)).toEqual({ message: "Parse error on line 3:\n...", line: 3 });
    expect(describeMermaidError(new Error("Parse error on line 2:"), source)).toEqual({ message: "Parse error on line 2:", line: 2 });
  });
});
