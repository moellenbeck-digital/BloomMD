/**
 * Mermaid rendering, loaded on first use.
 *
 * The library is large, so it is imported dynamically: it is not part of the start bundle, and notes
 * without a diagram never download it. `securityLevel: "strict"` makes Mermaid sanitize the diagram
 * text and disable click handlers and scripts, because the source is untrusted note content.
 */

export type MermaidRenderResult =
  | { ok: true; svg: string }
  | { ok: false; message: string; line?: number; loadFailed?: boolean };

export interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
}

export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "default",
  // Plain SVG text instead of HTML labels: the SVG then renders the same in the preview, in a saved
  // .svg file and when it is rasterized to PNG (foreignObject content is lost or taints the canvas).
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  // Errors are shown by BloomMD's own card, not as Mermaid's bomb graphic appended to the page.
  suppressErrorRendering: true,
} as const;

const MAX_MESSAGE_LENGTH = 600;

let loadMermaid = async (): Promise<MermaidApi> => (await import("mermaid")).default as unknown as MermaidApi;
let apiPromise: Promise<MermaidApi> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/** Replaces the library loader; tests use this to avoid loading the real library. */
export function setMermaidLoader(loader: (() => Promise<MermaidApi>) | null): void {
  loadMermaid = loader ?? (async () => (await import("mermaid")).default as unknown as MermaidApi);
  apiPromise = null;
}

function getApi(): Promise<MermaidApi> {
  if (!apiPromise) {
    apiPromise = loadMermaid().then((api) => {
      api.initialize({ ...MERMAID_CONFIG });
      return api;
    });
    // A failed load must not be cached, or one flaky network request disables diagrams until reload.
    apiPromise.catch(() => {
      apiPromise = null;
    });
  }
  return apiPromise;
}

/**
 * Message and line of a Mermaid syntax error. The line is relative to the diagram source; Mermaid
 * counts the end of input as one more line when the text ends in a newline or an unfinished
 * statement, so it is kept within the source (also inside the message, so both agree).
 */
export function describeMermaidError(error: unknown, source?: string): { message: string; line?: number } {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : String((error as { str?: unknown })?.str ?? error);
  let message = raw.replace(/\r/g, "").trim().slice(0, MAX_MESSAGE_LENGTH) || "Unknown error";
  const match = /\bline\s+(\d+)/i.exec(message);
  if (!match) return { message };
  let line = Number(match[1]);
  if (source !== undefined) {
    line = Math.max(1, Math.min(line, source.replace(/\n+$/, "").split("\n").length));
    message = message.replace(/\b(line\s+)\d+/i, `$1${line}`);
  }
  return { message, line };
}

/** Renders `source` to an SVG string. Never throws: a broken diagram is a result, not a crash. */
export function renderMermaid(source: string): Promise<MermaidRenderResult> {
  const run = async (): Promise<MermaidRenderResult> => {
    let api: MermaidApi;
    try {
      api = await getApi();
    } catch (error) {
      console.error("[BloomMD] Mermaid could not be loaded:", error);
      return { ok: false, message: describeMermaidError(error).message, loadFailed: true };
    }
    counter += 1;
    try {
      const { svg } = await api.render(`bloommd-mermaid-${counter}`, source);
      return { ok: true, svg };
    } catch (error) {
      return { ok: false, ...describeMermaidError(error, source) };
    }
  };
  // Mermaid renders through one shared scratch element, so renders run one after another.
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
