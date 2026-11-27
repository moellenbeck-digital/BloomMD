import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Ticket #346 — „Bühne“ für das Video des Laufs „Offline-Konflikt W1“.
 *
 * Playwright nimmt je Seite ein eigenes Video auf; der Fall braucht aber zwei Geräte in einem Nachweis. Darum läuft ein
 * dritter, aufgenommener Browser-Kontext (1280×720) mit einer Bühnenseite: Sie zeigt das Bild des gerade aktiven Geräts
 * (A oder B) — Screenshots der echten Client-Seiten, mehrmals pro Sekunde —, oben die Schrittzeile mit Gerät, unten die
 * Einblendung (Ticket, Stand, Testdaten). Die Clients selbst sind unverändert und werden nicht aufgenommen.
 * Reine Darstellung: Alle Asserts der Spec laufen auf den echten Clients, der API und den Dateien.
 *
 * Ohne `T346_VIDEO=1` (Config ohne Video) ist die Bühne eine leere Hülle: kein Kontext, keine Pausen.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/** Viewport der Clients: so, dass ihr Bild ohne Skalierung ins Bühnenfenster (1280×656) passt (Faktor 0,8). */
export const STAGE_CLIENT_VIEWPORT = { width: 1600, height: 820 } as const;

/** `T346_SHA` (z. B. aus der CI) vor dem aktuellen `git rev-parse`; sonst „unbekannt“. */
export function gitSha(): string {
  if (process.env.T346_SHA) return process.env.T346_SHA.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: here, encoding: "utf8" }).trim();
  } catch {
    return "unbekannt";
  }
}

export type DeviceLabel = "A" | "B";

export interface Stage {
  readonly enabled: boolean;
  /** Registriert eine Client-Seite, damit ihr Bild auf der Bühne erscheinen kann. */
  attach(label: DeviceLabel, page: Page): void;
  /** Zeigt dieses Gerät auf der Bühne. */
  show(label: DeviceLabel): Promise<void>;
  /** Setzt die Schrittzeile und wartet `T346_PAUSE_MS`, damit das Video lesbar bleibt. */
  step(text: string, label?: DeviceLabel): Promise<void>;
  /** Wartet nur die Pause (z. B. nach einer Aktion, deren Ergebnis im Bild stehen soll). */
  pause(factor?: number): Promise<void>;
  /** Beendet die Aufnahme und legt das Video unter `target` ab. */
  finish(target: string): Promise<void>;
}

const STAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#0d1117;font:15px/1.2 ui-monospace,Menlo,Consolas,monospace;color:#e6edf3}
#top{height:40px;display:flex;align-items:center;gap:12px;padding:0 14px;background:#111827;border-bottom:2px solid #f59e0b;box-sizing:border-box}
#chip{min-width:78px;text-align:center;padding:3px 10px;border-radius:4px;font-weight:700;color:#fff;background:#2563eb}
#chip.b{background:#c2410c}#chip.none{background:#374151}
#step{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#view{display:block;width:1280px;height:656px;object-fit:contain;background:#fff}
#bottom{height:24px;line-height:24px;padding:0 14px;background:#111827;color:#9ca3af;font-size:12px;border-top:2px solid #f59e0b;box-sizing:border-box;white-space:nowrap;overflow:hidden}
#bottom b{color:#e5e7eb}
</style></head><body>
<div id="top"><span id="chip" class="none">—</span><span id="step"></span></div>
<img id="view" alt="">
<div id="bottom"></div>
</body></html>`;

function noopStage(): Stage {
  const nothing = async () => undefined;
  return { enabled: false, attach: () => undefined, show: nothing, step: nothing, pause: nothing, finish: nothing };
}

export interface StageInfo {
  sha: string;
  /** Kurzbeschreibung der Testdaten für die Einblendung. */
  data: string;
}

/** Legt die Bühne an, wenn `T346_VIDEO=1` gesetzt ist; sonst eine leere Hülle. */
export async function createStage(browser: Browser, info: StageInfo): Promise<Stage> {
  if (process.env.T346_VIDEO !== "1") return noopStage();
  const pauseMs = Number(process.env.T346_PAUSE_MS ?? 1500);
  const pages = new Map<DeviceLabel, Page>();
  let active: DeviceLabel | null = null;
  let running = true;

  const videoDir = path.join(process.env.T346_VIDEO_TMP ?? "/tmp/bloommd-e2e-offline-t346-video", "stage-raw");
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const stage = await context.newPage();
  await stage.setContent(STAGE_HTML);
  await stage.evaluate((html) => {
    document.getElementById("bottom")!.innerHTML = html;
  }, `ticket #346 · Stand (git HEAD): <b>${esc(info.sha)}</b> · Testdaten: <b>${esc(info.data)}</b> · nur Testdaten, keine Secrets`);

  const chip = async (label: DeviceLabel | null) =>
    stage.evaluate((value) => {
      const el = document.getElementById("chip")!;
      el.textContent = value ? `Gerät ${value}` : "—";
      el.className = value === "B" ? "b" : value === "A" ? "" : "none";
    }, label);

  // Bild des aktiven Geräts, so oft es der Browser schafft (Pause zwischen den Aufnahmen), Fehler beim Neuladen werden übergangen.
  const loop = (async () => {
    while (running) {
      const page = active ? pages.get(active) : undefined;
      if (page && !page.isClosed()) {
        try {
          const frame = await page.screenshot({ type: "jpeg", quality: 72, scale: "css", timeout: 3_000 });
          if (running) await stage.evaluate((data) => ((document.getElementById("view") as HTMLImageElement).src = `data:image/jpeg;base64,${data}`), frame.toString("base64"));
        } catch {
          /* Seite lädt gerade neu oder wurde geschlossen */
        }
      }
      await new Promise((done) => setTimeout(done, 120));
    }
  })();

  const pause = async (factor = 1) => {
    await new Promise((done) => setTimeout(done, pauseMs * factor));
  };

  return {
    enabled: true,
    attach(label, page) {
      pages.set(label, page);
    },
    async show(label) {
      active = label;
      await chip(label);
    },
    async step(text, label) {
      if (label) await this.show(label);
      await stage.evaluate((value) => (document.getElementById("step")!.textContent = value), text);
      await pause();
    },
    pause,
    async finish(target) {
      running = false;
      await loop;
      await context.close();
      await stage.video()?.saveAs(target);
    },
  };
}

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
