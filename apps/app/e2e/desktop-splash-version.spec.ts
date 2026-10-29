/**
 * Ticket #49 — Desktop-Splash zeigt die gebaute Version statt eines fest verdrahteten `v0.3.0`.
 *
 * Der native Splash läuft nur in der Electrobun-App und ist über das Dev-System (Web-App) nicht
 * erreichbar. Diese Fälle rendern deshalb die echte Vorlage `packages/desktop/src/splash/index.html`
 * mit dem Build-Code (`prepareSplashHtml`, bzw. die echte `electrobun.config.ts` per `bun`) und lesen
 * die Anzeige im Browser (Chromium) ab — dieselbe Datei, die `electrobun build` nach
 * `views/splash/index.html` kopiert.
 *
 * Nicht prüfbar ohne native Umgebung (siehe Meldung an den architect, nicht als bestanden gewertet):
 * - Splash und About-Dialog im laufenden nativen Fenster (QA-Matrix DUI-001, Schritt 6). Ersatz:
 *   Fall „About und Splash …" prüft, dass beide Pfade dieselbe Funktion nutzen und dieselbe Zeichenkette liefern.
 * - Echte Stable-/Development-/Insiders-Builds. Ersatz: je Kanal eine eigene Build-Umgebung.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DISPLAY_VERSION_PLACEHOLDER,
  formatDisplayVersion,
  resolveBuildVersion,
  resolveDisplayVersion,
} from "../../../packages/desktop/src/shared/display-version";
import { prepareSplashHtml } from "../../../packages/desktop/src/shared/splash-html";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "../../../packages/desktop");
const templateFile = path.join(desktopDir, "src/splash/index.html");
const indexTs = path.join(desktopDir, "src/bun/index.ts");
const packageVersion: string = JSON.parse(readFileSync(path.join(desktopDir, "package.json"), "utf8")).version;
const SHA = "2269618abcdef0123456789";

type Env = Record<string, string | undefined>;

const tempDirs: string[] = [];
test.afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function renderSplash(env: Env): { file: string; html: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "splash-t49-"));
  tempDirs.push(dir);
  const file = path.join(dir, "index.html");
  prepareSplashHtml({ templateFile, outFile: file, env, packageVersion });
  return { file, html: readFileSync(file, "utf8") };
}

async function readVersion(page: import("@playwright/test").Page, env: Env): Promise<string> {
  const { file } = renderSplash(env);
  await page.goto(pathToFileURL(file).href);
  const version = page.locator(".version");
  await expect(version).toBeVisible();
  return (await version.innerText()).trim();
}

test.describe("Desktop-Splash-Version @t49", () => {
  test("Kriterium 1: Splash zeigt BloomMD <version>, nie v0.3.0 oder den Platzhalter @t49", async ({ page }) => {
    await page.goto(pathToFileURL(renderSplash({}).file).href);
    await expect(page.locator(".version")).toHaveText(`BloomMD ${packageVersion}`);
    await expect(page.locator("body")).not.toContainText("v0.3.0");
    await expect(page.locator("body")).not.toContainText(DISPLAY_VERSION_PLACEHOLDER);

    await page.goto(pathToFileURL(renderSplash({ BLOOMMD_BUILD_SHA: SHA }).file).href);
    await expect(page.locator(".version")).toHaveText(`BloomMD ${packageVersion} (2269618)`);
    await expect(page.locator("body")).not.toContainText("v0.3.0");
    await expect(page.locator("body")).not.toContainText(DISPLAY_VERSION_PLACEHOLDER);
  });

  test("Kriterium 2: BLOOMMD_RELEASE_VERSION gewinnt, sonst die package.json-Version @t49", async ({ page }) => {
    expect(await readVersion(page, { BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1" })).toBe("BloomMD 0.5.16-beta.1");
    expect(await readVersion(page, {})).toBe(`BloomMD ${packageVersion}`);
    // Leere Variable zählt als nicht gesetzt.
    expect(await readVersion(page, { BLOOMMD_RELEASE_VERSION: "" })).toBe(`BloomMD ${packageVersion}`);
  });

  test("Kriterium 3: BLOOMMD_BUILD_SHA hängt die ersten 7 Zeichen an, ohne SHA nichts @t49", async ({ page }) => {
    expect(await readVersion(page, { BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: SHA })).toBe(
      "BloomMD 0.5.16-beta.1 (2269618)",
    );
    const withoutSha = await readVersion(page, { BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1" });
    expect(withoutSha).toBe("BloomMD 0.5.16-beta.1");
    expect(withoutSha).not.toContain("(");
    expect(await readVersion(page, { BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: "" })).toBe(
      "BloomMD 0.5.16-beta.1",
    );
  });

  test("Kriterium 4: About und Splash nutzen dieselbe Funktion und liefern dieselbe Zeichenkette @t49", async ({ page }) => {
    // Quellvertrag: About (desktopBuildInfo), User-Agent (desktopDisplayVersion) und Splash ziehen aus display-version.ts.
    const source = readFileSync(indexTs, "utf8");
    expect(source).toContain('from "../shared/display-version"');
    expect(source).toMatch(/formatDisplayVersion\(version, sha\)/);
    expect(source).toMatch(/resolveDisplayVersion\(process\.env, packageJson\.version\)/);
    expect(source, "keine zweite handgeschriebene Anzeige-Zeichenkette in index.ts").not.toMatch(/`BloomMD \$\{/);

    const envs: Env[] = [
      {},
      { BLOOMMD_BUILD_SHA: SHA },
      { BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1" },
      { BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: SHA },
    ];
    for (const env of envs) {
      // About: desktopBuildInfo() baut displayVersion aus resolveBuildVersion + formatDisplayVersion.
      const about = formatDisplayVersion(resolveBuildVersion(env, packageVersion), env.BLOOMMD_BUILD_SHA);
      const splash = await readVersion(page, env);
      expect(splash, JSON.stringify(env)).toBe(about);
      expect(splash).toBe(resolveDisplayVersion(env, packageVersion));
    }
  });

  test("Kriterium 5: Stable, Development und Insiders zeigen je ihre eigene Version @t49", async ({ page }) => {
    const channels: Array<{ name: string; env: Env; expected: string }> = [
      {
        name: "stable",
        env: { BLOOMMD_BUILD_CHANNEL: "stable", BLOOMMD_RELEASE_VERSION: "0.5.15", BLOOMMD_BUILD_SHA: "aaaaaaa1111" },
        expected: "BloomMD 0.5.15 (aaaaaaa)",
      },
      {
        name: "development",
        env: { BLOOMMD_BUILD_CHANNEL: "development", BLOOMMD_RELEASE_VERSION: "0.5.16-dev.3", BLOOMMD_BUILD_SHA: "bbbbbbb2222" },
        expected: "BloomMD 0.5.16-dev.3 (bbbbbbb)",
      },
      {
        name: "insiders",
        env: { BLOOMMD_BUILD_CHANNEL: "insiders", BLOOMMD_RELEASE_VERSION: "0.5.16-insiders.2", BLOOMMD_BUILD_SHA: "ccccccc3333" },
        expected: "BloomMD 0.5.16-insiders.2 (ccccccc)",
      },
    ];
    const seen = new Set<string>();
    for (const channel of channels) {
      const shown = await readVersion(page, channel.env);
      expect(shown, channel.name).toBe(channel.expected);
      seen.add(shown);
    }
    expect(seen.size, "jeder Kanal zeigt eine eigene Zeichenkette").toBe(channels.length);
    // Ohne Release-Variablen (lokaler Dev-Lauf) gilt die package.json-Version, kanalunabhängig.
    expect(await readVersion(page, { ELECTROBUN_BUILD_ENV: "dev" })).toBe(`BloomMD ${packageVersion}`);
  });

  test("Kriterium 6: echte electrobun.config.ts erzeugt .generated/splash/index.html ohne feste Version @t49", async () => {
    const generated = path.join(desktopDir, ".generated/splash/index.html");
    const run = (env: Env) => {
      execFileSync("bun", ["-e", 'await import(process.env.CONFIG_FILE)'], {
        cwd: desktopDir,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          CONFIG_FILE: path.join(desktopDir, "electrobun.config.ts"),
          ...env,
        } as NodeJS.ProcessEnv,
        stdio: "pipe",
      });
      return readFileSync(generated, "utf8");
    };
    const stripped = (html: string, displayVersion: string) => html.split(displayVersion).join("");
    try {
      const plain = run({});
      const shownPlain = `BloomMD ${packageVersion}`;
      expect(plain).toContain(`>${shownPlain}<`);
      const full = run({ BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: SHA });
      const shownFull = "BloomMD 0.5.16-beta.1 (2269618)";
      expect(full).toContain(`>${shownFull}<`);

      for (const [html, shown] of [
        [plain, shownPlain],
        [full, shownFull],
      ] as const) {
        expect(html).not.toContain("v0.3.0");
        expect(html).not.toContain(DISPLAY_VERSION_PLACEHOLDER);
        // Außerhalb der gerenderten Anzeige-Version steht keine Versionszahl mehr in der Datei.
        expect(stripped(html, shown)).not.toMatch(/\bv?\d+\.\d+\.\d+/);
      }
      // Die Vorlage selbst trägt nur den Platzhalter.
      const template = readFileSync(templateFile, "utf8");
      expect(template).toContain(DISPLAY_VERSION_PLACEHOLDER);
      expect(template).not.toMatch(/\bv?\d+\.\d+\.\d+/);
    } finally {
      rmSync(path.join(desktopDir, ".generated"), { recursive: true, force: true });
    }
  });

  test("Kriterium 7: Splash sonst unverändert — nur die Versionszeile unterscheidet sich, Hell und Dunkel @t49", async ({
    page,
  }) => {
    const template = readFileSync(templateFile, "utf8");
    const { file, html } = renderSplash({ BLOOMMD_RELEASE_VERSION: "0.5.16-beta.1", BLOOMMD_BUILD_SHA: SHA });
    const before = template.split("\n");
    const after = html.split("\n");
    expect(after.length).toBe(before.length);
    const changed = before.flatMap((line, index) => (line === after[index] ? [] : [index]));
    expect(changed.length, "genau eine Zeile weicht von der Vorlage ab").toBe(1);
    expect(before[changed[0]]).toContain(DISPLAY_VERSION_PLACEHOLDER);

    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 640, height: 480 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(pathToFileURL(file).href);
      await expect(page.locator("svg").first(), `${scheme}: Logo`).toBeVisible();
      await expect(page.locator(".loader"), `${scheme}: Ladeanzeige`).toBeVisible();
      const version = page.locator(".version");
      await expect(version, `${scheme}: Version`).toHaveText("BloomMD 0.5.16-beta.1 (2269618)");
      const box = await version.boundingBox();
      expect(box, `${scheme}: Version hat Fläche`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${scheme}: Version nicht abgeschnitten`).toBeLessThanOrEqual(640);
      const overflow = await version.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflow, `${scheme}: Version läuft nicht über`).toBe(false);
      // Text hebt sich vom Hintergrund ab.
      const colors = await version.evaluate((el) => ({
        text: getComputedStyle(el).color,
        background: getComputedStyle(document.body).backgroundColor,
      }));
      expect(colors.text, scheme).not.toBe(colors.background);
    }
  });
});
