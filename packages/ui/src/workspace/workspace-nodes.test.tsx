import { afterEach, expect, test } from "bun:test";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { WorkspaceNodeContent, workspaceNodeLabels } from "./workspace-nodes";
import { installDom } from "../components/test-dom";

let root: Root | undefined;
afterEach(() => { flushSync(() => root?.unmount()); root = undefined; });

test("open is a host capability, respects busy state and does not bubble to the canvas", () => {
  installDom();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let opens = 0;
  let selections = 0;
  const draw = (available: boolean, opening = false) => flushSync(() => root!.render(
    <div onClick={() => selections++} onDoubleClick={() => selections++}>
      <WorkspaceNodeContent kind="file" title="Plan" path="Team/Plan.md" labels={workspaceNodeLabels("de-DE")}
        onOpen={available ? () => { opens++; } : undefined} opening={opening} />
    </div>,
  ));
  draw(false);
  expect(container.textContent).toContain("Team/Plan.md");
  expect(container.querySelector("button")).toBeNull();
  draw(true, true);
  let button = container.querySelector("button")!;
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  button.click();
  expect(opens).toBe(0);
  draw(true);
  button = container.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe("Datei öffnen: Team/Plan.md");
  button.click();
  button.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
  expect(opens).toBe(1);
  expect(selections).toBe(0);
});

test("folder and heading expose their type without suggesting an unavailable file action", () => {
  installDom();
  const container = document.createElement("div");
  root = createRoot(container);
  for (const kind of ["folder", "heading"] as const) {
    flushSync(() => root!.render(<WorkspaceNodeContent kind={kind} title="Team" labels={workspaceNodeLabels("en")} />));
    expect(container.textContent).toContain(kind === "folder" ? "Folder" : "Content preview");
    expect(container.querySelector("button")).toBeNull();
  }
});
