import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

/**
 * Ticket #345 — Darstellung für das Video des Laufs „Learnings W0“: Terminal-Ansicht für die CLI-Schritte,
 * Einblendung von Stand (SHA) und Testdaten, Markierung und Scrollen zu Abschnitten der Wiki-Seite.
 * Reine Darstellung: Die Asserts der Spec laufen auf den echten Ausgaben und Seiteninhalten, nicht auf dieser Ansicht.
 *
 * Die Terminal-Ansicht ist eine Ebene über der geladenen Seite (kein `page.setContent`, keine zweite Seite): Das Neuladen
 * von `/wiki` läuft darunter, der Ladebildschirm der Seite bleibt außerhalb des Bildes. Die Ebene überlebt das Neuladen
 * über `sessionStorage`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/** `LEARNINGS_W0_SHA` (z. B. aus der CI) vor dem aktuellen `git rev-parse`; sonst „unbekannt“. */
export function gitSha(): string {
  if (process.env.LEARNINGS_W0_SHA) return process.env.LEARNINGS_W0_SHA.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: here, encoding: "utf8" }).trim();
  } catch {
    return "unbekannt";
  }
}

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface BannerInfo {
  sha: string;
  fixture: string;
}

export interface ShownCommand {
  /** Kommando in der Schreibweise des Aufrufs (`bloommd-wiki …`). */
  cmd: string;
  /** Gekürzte Ausgabe; die Spec prüft die ungekürzte. */
  out: string;
  /** Exitcode, wird nur bei ≠ 0 hervorgehoben. */
  exit?: number;
}

const bannerHtml = (info: BannerInfo) =>
  `Ticket #345 · Stand (git HEAD): <b>${esc(info.sha)}</b> · Testdaten: <b>${esc(info.fixture)}</b> · Schema okf 0.2`;

const BANNER_CSS =
  "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:6px 14px;background:#111827;color:#e5e7eb;font:13px/1.3 ui-monospace,Menlo,Consolas,monospace;border-top:2px solid #f59e0b;";

const OVERLAY_CSS =
  "#t345-overlay{position:fixed;inset:0;z-index:2147483646;background:#0d1117;color:#e6edf3;font:15px/1.4 ui-monospace,Menlo,Consolas,monospace;overflow:hidden}" +
  "#t345-overlay .wrap{padding:18px 26px 52px}" +
  "#t345-overlay h1{margin:0 0 12px;font:600 20px/1.2 ui-monospace,Menlo,Consolas,monospace;color:#f59e0b}" +
  "#t345-overlay .cmd{color:#7ee787;margin:12px 0 2px;word-break:break-all}" +
  "#t345-overlay .p{color:#8b949e}" +
  "#t345-overlay pre{margin:0 0 4px 16px;white-space:pre-wrap;word-break:break-word;color:#e6edf3;font:inherit}" +
  "#t345-overlay .exit{margin-left:16px;color:#ff7b72;font-weight:600}" +
  "#t345-overlay .note{margin-top:14px;color:#8b949e}";

/** HTML einer Terminal-Ansicht (Titel, Kommandos mit gekürzter Ausgabe, Schlusszeile). */
export function terminalHtml(title: string, commands: ShownCommand[], note?: string): string {
  const blocks = commands
    .map(
      (c) =>
        `<div class="cmd"><span class="p">$</span> ${esc(c.cmd)}</div><pre>${esc(c.out)}</pre>` +
        (c.exit !== undefined && c.exit !== 0 ? `<div class="exit">Exitcode ${c.exit}</div>` : ""),
    )
    .join("");
  return `<div class="wrap"><h1>${esc(title)}</h1>${blocks}${note ? `<div class="note">${esc(note)}</div>` : ""}</div>`;
}

/**
 * Installiert Einblendung (SHA, Fixture) und Terminal-Ebene auf jeder geladenen Seite. `initialHtml` steht von der
 * ersten Seite an im Bild, bis `hideTerminal` sie entfernt (auch über ein Neuladen hinweg).
 */
export async function installOverlay(page: Page, info: BannerInfo, initialHtml: string): Promise<void> {
  await page.addInitScript(
    ({ bannerCss, bannerInner, overlayCss, initial }) => {
      const w = window as unknown as { __t345Render?: (html: string | null) => void };
      const store = (html: string | null) => {
        try {
          if (html === null) sessionStorage.removeItem("t345-overlay");
          else sessionStorage.setItem("t345-overlay", html);
        } catch {
          /* about:blank hat kein sessionStorage */
        }
      };
      const render = (html: string | null) => {
        store(html);
        const root = document.documentElement;
        let banner = document.getElementById("t345-banner");
        if (!banner) {
          banner = document.createElement("div");
          banner.id = "t345-banner";
          banner.setAttribute("style", bannerCss);
          banner.innerHTML = bannerInner;
          root.appendChild(banner);
        }
        let style = document.getElementById("t345-overlay-style");
        if (!style) {
          style = document.createElement("style");
          style.id = "t345-overlay-style";
          style.textContent = overlayCss;
          root.appendChild(style);
        }
        let overlay = document.getElementById("t345-overlay");
        if (html === null) {
          overlay?.remove();
          return;
        }
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "t345-overlay";
          root.insertBefore(overlay, banner);
        }
        overlay.innerHTML = html;
      };
      w.__t345Render = render;
      const start = () => {
        let stored: string | null = null;
        try {
          if (!sessionStorage.getItem("t345-started")) {
            sessionStorage.setItem("t345-started", "1");
            sessionStorage.setItem("t345-overlay", initial);
          }
          stored = sessionStorage.getItem("t345-overlay");
        } catch {
          stored = null;
        }
        render(stored);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    },
    { bannerCss: BANNER_CSS, bannerInner: bannerHtml(info), overlayCss: OVERLAY_CSS, initial: initialHtml },
  );
}

/** Zeigt eine Terminal-Ansicht über der Seite. */
export async function showTerminal(page: Page, title: string, commands: ShownCommand[], note?: string): Promise<void> {
  const html = terminalHtml(title, commands, note);
  await page.evaluate((markup) => (window as unknown as { __t345Render: (html: string | null) => void }).__t345Render(markup), html);
}

/** Entfernt die Terminal-Ebene; die Seite darunter wird sichtbar. */
export async function hideTerminal(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __t345Render: (html: string | null) => void }).__t345Render(null));
}

/**
 * Holt einen Textabschnitt der geöffneten Wiki-Seite ins Bild und markiert ihn (CSS Custom Highlight API, kein
 * Eingriff in den DOM). `from` bis einschließlich `to` (Standard: nur `from`); der Abschnitt steht oben im Viewport.
 */
export async function highlightText(page: Page, from: string, to: string = from): Promise<void> {
  const found = await page.evaluate(
    ({ from, to }) => {
      const root = document.querySelector("article pre") ?? document.querySelector("article");
      if (!root) return false;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let start: { node: Text; offset: number } | null = null;
      let end: { node: Text; offset: number } | null = null;
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const text = node.textContent ?? "";
        if (!start) {
          const at = text.indexOf(from);
          if (at >= 0) start = { node, offset: at };
        }
        if (start) {
          const searchFrom = node === start.node ? start.offset : 0;
          const at = text.indexOf(to, searchFrom);
          if (at >= 0) {
            end = { node, offset: at + to.length };
            break;
          }
        }
      }
      if (!start || !end) return false;
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const css = document.getElementById("t345-highlight-style") ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: "t345-highlight-style" }));
      css.textContent = "::highlight(t345){background:#fde047;color:#111827}";
      const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
      registry.set("t345", new (window as unknown as { Highlight: new (range: Range) => unknown }).Highlight(range));
      const top = range.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - 140), behavior: "instant" as ScrollBehavior });
      return true;
    },
    { from, to },
  );
  if (!found) throw new Error(`Abschnitt nicht gefunden: „${from}“ … „${to}“`);
}
