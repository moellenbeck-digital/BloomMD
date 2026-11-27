import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceLoadNotice, loadIssueExplanation } from "./WorkspaceLoadNotice";

let root: Root | undefined;
afterEach(() => { if (root) flushSync(() => root!.unmount()); root = undefined; });

test("loading issues can be dismissed, reopened and reappear when the failure changes", () => {
  const win = new Window();
  globalThis.window = win as unknown as Window & typeof window;
  globalThis.document = win.document as unknown as Document;
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  const render = (path: string) => flushSync(() => root!.render(<WorkspaceLoadNotice locale="de" failed={false} issues={[{ path, kind: "yaml", line: 3, column: 8 }]} onRetry={async () => {}} />));
  render("note.md");
  expect(container.textContent).not.toContain("Zeile 3");
  flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
  expect(container.textContent).toContain("Zeile 3, Spalte 8");
  expect(container.textContent).toContain("keinen Knoten");
  flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="Ladehinweise ausblenden"]')!.click());
  expect(container.querySelector("section")).toBeNull();
  render("note.md");
  expect(container.querySelector("section")).toBeNull();
  flushSync(() => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.textContent).toContain("Zeile 3");
  flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="Ladehinweise ausblenden"]')!.click());
  render("new.md");
  expect(container.querySelector("section")).not.toBeNull();
});

test("failure explanations support English and do not invent a cause for unknown errors", () => {
  expect(loadIssueExplanation({ path: "a", kind: "yaml", line: 2 }, "en")).toContain("line 2");
  expect(loadIssueExplanation({ path: "a", kind: "permission" }, "en")).toContain("permissions");
  expect(loadIssueExplanation({ path: "a", kind: "unknown" }, "de")).not.toContain("YAML");
});
