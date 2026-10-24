import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mainview = readFileSync(join(import.meta.dir, "index.html"), "utf8");
const globals = readFileSync(join(import.meta.dir, "globals.css"), "utf8");
const bunMain = readFileSync(join(import.meta.dir, "../bun/index.ts"), "utf8");
const mindMapNode = readFileSync(join(import.meta.dir, "../../../ui/src/components/MindMapNode.tsx"), "utf8");
const mindMapPreview = readFileSync(join(import.meta.dir, "../../../ui/src/components/MindMapPreview.tsx"), "utf8");
const nodeEditor = readFileSync(join(import.meta.dir, "../../../ui/src/components/NodeEditor.tsx"), "utf8");

function relativeLuminance(hex: string): number {
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset + 1, offset + 3), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

describe("Linux desktop typography", () => {
  test("selects the Linux rendering profile before the first paint", () => {
    const platformScript = mainview.indexOf('classList.toggle("platform-linux"');
    expect(platformScript).toBeGreaterThanOrEqual(0);
    expect(platformScript).toBeLessThan(mainview.indexOf("<body"));
    expect(mainview).toContain("navigator.platform || navigator.userAgent");
  });

  test("has a deterministic local sans-serif fallback", () => {
    expect(globals).toContain("html.platform-linux");
    expect(globals).not.toContain("fonts.googleapis.com");
    expect(globals).toContain("'Outfit', 'Helvetica Neue'");
    expect(globals).toContain("'Noto Sans', 'DejaVu Sans', 'Liberation Sans'");
    expect(globals).toContain("'DejaVu Sans Mono', 'Liberation Mono'");
    expect(mainview).toContain("if (!isLinux)");
    expect(mainview).toContain("fonts.googleapis.com");
  });

  test("does not thin Linux glyphs with forced WebKit antialiasing", () => {
    expect(globals).toContain("html.platform-linux body");
    expect(globals).toContain("-webkit-font-smoothing: auto");
    expect(globals).toContain("text-rendering: optimizeLegibility");
  });

  test("leaves fractional scaling to the native Wayland/WebKit window", () => {
    expect(bunMain).toContain("mainWindow = new BrowserWindow({");
    for (const forbiddenOverride of ["zoomFactor", "deviceScaleFactor", "scaleFactor", "GDK_SCALE", "GDK_DPI_SCALE"]) {
      expect(bunMain).not.toContain(forbiddenOverride);
    }
  });

  test("raises the contrast of secondary text in both Linux themes", () => {
    expect(globals).toContain("--color-ink-muted: #5F5953");
    expect(globals).toContain("--color-ink-faint: #6B655F");
    expect(globals).toContain("--color-ink-muted: #B0A9A2");
    expect(globals).toContain("--color-ink-faint: #9F978F");
  });

  test("routes deeper mindmap surfaces through the Linux contrast tokens", () => {
    for (const source of [mindMapNode, mindMapPreview, nodeEditor]) {
      expect(source).not.toContain("text-[#666");
    }
    expect(mindMapNode).toContain("text-[var(--color-ink-muted)]");
    expect(mindMapNode).toContain("placeholder-[var(--color-ink-faint)]");
    expect(mindMapPreview).toContain("text-[var(--color-ink-muted)]");
    expect(nodeEditor).toContain("text-[var(--color-ink-muted)]");
  });

  test("keeps Linux secondary text above normal-text contrast on its surfaces", () => {
    const pairs = [
      ["#5F5953", "#FFFFFF"],
      ["#6B655F", "#FFFFFF"],
      ["#5F5953", "#F5F3F0"],
      ["#5F5953", "#E8E4DF"],
      ["#B0A9A2", "#1A1A1A"],
      ["#9F978F", "#1A1A1A"],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
