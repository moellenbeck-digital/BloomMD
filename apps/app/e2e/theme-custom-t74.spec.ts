import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";

/**
 * Ticket #74 — eigene Farbthemen (Oberflächentests des Testers, alle Fälle tragen @t74).
 *
 * Kriterium 1–10 je ein eigener Fall, Kriterium 11 (Sichtprüfung) je Vorlage ein Fall: jede Vorlage geht
 * durch Start, Karte, Befehlspalette, Dateischublade, Editor, Hilfemenü, Über-Dialog und Theme-Dialog; ein
 * Lauf über alle sichtbaren Textknoten meldet Text auf Hintergrund mit weniger als 3:1 sowie helle
 * Hintergrundflächen unter einem dunklen Theme.
 *
 * Nicht prüfbar: der Vergleich "Akzentelemente ändern sich sichtbar" geschieht über den Token
 * `--color-bloom` und den berechneten Hintergrund/Text von <body>, nicht über einen Pixelvergleich.
 *
 * Testdaten: ein Konto `e2e-t74-…@bloommd.local` und eine Karte `t74-…md`; beides wird in `afterAll` entfernt.
 */

const PASSWORD = "Testpass12345";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: BASE_URL };
const STORAGE_KEY = "bloommd-theme-custom";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `e2e-t74-${RUN_ID}@bloommd.local`;
const MAP_FILENAME = `t74-${RUN_ID}.md`;
const MAP_TITLE = `Theme Prüfkarte t74 ${RUN_ID}`;

const PRESETS = {
  ocean: { name: "Ocean", base: "light", accent: "#0B5FA5", surface: "#F4F8FB", ink: "#12202B" },
  forest: { name: "Forest", base: "light", accent: "#2E6B34", surface: "#F5F8F3", ink: "#1B261C" },
  sepia: { name: "Sepia", base: "light", accent: "#9A3F12", surface: "#F6EFE3", ink: "#2B2118" },
  midnight: { name: "Midnight", base: "dark", accent: "#7AB2FF", surface: "#0F1626", ink: "#E6ECF7" },
  graphite: { name: "Graphite", base: "dark", accent: "#FF9F6B", surface: "#1C1C1E", ink: "#F2F2F2" },
} as const;
type PresetId = keyof typeof PRESETS;

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: BASE_URL });
  const signup = await api.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T74", email: EMAIL, password: PASSWORD, acceptTerms: "1", next: "/app" },
    maxRedirects: 0,
  });
  expect(signup.status()).toBe(303);

  const now = new Date().toISOString();
  const markdown = [
    "---",
    `title: ${MAP_TITLE}`,
    `id: ${MAP_FILENAME.replace(/[^a-z0-9]/gi, "-")}`,
    `created: "${now}"`,
    `updated: "${now}"`,
    "tags:",
    "  - e2e",
    "layout:",
    "  direction: LR",
    "---",
    "",
    `# ${MAP_TITLE} <!-- bloommd:id=t74-root -->`,
    "",
    "Quelle: [Beispiel](https://example.com/reference). Ein **fetter** und ein `Code`-Abschnitt.",
    "",
    "## Kind A <!-- bloommd:id=t74-a -->",
    "",
    "Text im Kindknoten mit [[#t74-b|Verweis]].",
    "",
    "## Kind B <!-- bloommd:id=t74-b -->",
    "",
    "Zweiter Knoten.",
  ].join("\n");
  const created = await api.post("/api/mindmaps", { headers: SAME_ORIGIN_HEADERS, data: { filename: MAP_FILENAME, markdown } });
  expect(created.ok()).toBe(true);
});

test.afterAll(async () => {
  if (!api) return;
  await api.delete(`/api/mindmaps/${encodeURIComponent(MAP_FILENAME)}`, { headers: SAME_ORIGIN_HEADERS }).catch(() => undefined);
  // Das Konto entfernt sich über die eigene Löschroute; nur das selbst angelegte Konto.
  await api
    .post("/api/account/delete", {
      headers: SAME_ORIGIN_HEADERS,
      form: { confirmation: EMAIL, password: PASSWORD },
      maxRedirects: 0,
    })
    .catch(() => undefined);
  await api.dispose();
});

async function login(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));
  await page.goto("/login?next=/app", { waitUntil: "domcontentloaded" });
  const loginForm = page.locator('form[action="/api/auth/login"]');
  await expect(loginForm).toBeVisible();
  await page.getByLabel("E-Mail", { exact: true }).fill(EMAIL);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await loginForm.evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
}

async function openHelpMenu(page: Page) {
  if (await page.getByTestId("toolbar-theme-custom").isVisible()) return;
  await page.getByTestId("toolbar-help-menu").click();
  await expect(page.getByTestId("toolbar-theme-custom")).toBeVisible();
}

async function openThemeDialog(page: Page) {
  await openHelpMenu(page);
  await page.getByTestId("toolbar-theme-custom").click();
  await expect(page.getByTestId("theme-custom-dialog")).toBeVisible();
}

async function applyPreset(page: Page, id: PresetId) {
  await openThemeDialog(page);
  await page.getByTestId(`theme-custom-preset-${id}`).click();
  await expect(page.getByTestId("theme-custom-accent")).toHaveValue(PRESETS[id].accent);
  await page.getByTestId("theme-custom-save").click();
  await expect(page.getByTestId("theme-custom-dialog")).toBeHidden();
}

const token = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n).trim().toUpperCase(), name);
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));
const bodyColors = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, color: style.color };
  });

function rgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

async function fillColors(page: Page, colors: { accent?: string; surface?: string; ink?: string }) {
  if (colors.accent !== undefined) await page.getByTestId("theme-custom-accent").fill(colors.accent);
  if (colors.surface !== undefined) await page.getByTestId("theme-custom-surface").fill(colors.surface);
  if (colors.ink !== undefined) await page.getByTestId("theme-custom-ink").fill(colors.ink);
}

test("Kriterium 1: Menü enthält „Eigenes Theme…“, Dialog zeigt 5 Vorlagen und Farbfelder @t74", async ({ page }) => {
  await login(page);
  await page.getByTestId("toolbar-help-menu").click();
  await expect(page.getByTestId("toolbar-theme-custom")).toHaveText("Eigenes Theme…");

  await page.getByTestId("toolbar-theme-custom").click();
  const dialog = page.getByTestId("theme-custom-dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('[data-testid^="theme-custom-preset-"]').count()).toBeGreaterThanOrEqual(3);
  await expect(dialog.locator('[data-testid^="theme-custom-preset-"]')).toHaveCount(5);
  for (const id of Object.keys(PRESETS)) await expect(page.getByTestId(`theme-custom-preset-${id}`)).toBeVisible();
  await expect(page.getByTestId("theme-custom-accent")).toBeVisible();
  await expect(page.getByTestId("theme-custom-surface")).toBeVisible();
  await expect(page.getByTestId("theme-custom-ink")).toBeVisible();
});

test("Kriterium 2: Vorlage wählen und speichern ändert Oberfläche, Text und Akzent @t74", async ({ page }) => {
  await login(page);
  const before = await bodyColors(page);
  await applyPreset(page, "midnight");

  expect(await token(page, "--color-surface")).toBe(PRESETS.midnight.surface);
  expect(await token(page, "--color-ink")).toBe(PRESETS.midnight.ink);
  expect(await token(page, "--color-bloom")).toBe(PRESETS.midnight.accent);
  const after = await bodyColors(page);
  expect(after.background).toBe(rgb(PRESETS.midnight.surface));
  expect(after.color).toBe(rgb(PRESETS.midnight.ink));
  expect(after.background).not.toBe(before.background);
  expect(after.color).not.toBe(before.color);
  // Akzent: ein Element, das den Akzent-Token verwendet, löst ihn auf den gespeicherten Wert auf.
  const accentResolved = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-bloom)";
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(accentResolved).toBe(rgb(PRESETS.midnight.accent));
  expect(JSON.parse((await stored(page)) ?? "{}")).toMatchObject({ name: "Midnight", base: "dark", accent: "#7AB2FF" });
});

test("Kriterium 3: Theme bleibt nach Reload erhalten, auch beim Laden ohne Standard-Theme @t74", async ({ page }) => {
  await login(page);
  await applyPreset(page, "ocean");

  // Ab dem ersten Frame jede Zustandsänderung von <html> mitschreiben.
  await page.addInitScript(() => {
    const w = window as unknown as { __states: string[] };
    w.__states = [];
    const record = () => {
      const root = document.documentElement;
      w.__states.push(`${root.style.getPropertyValue("--color-surface").trim()}|${root.classList.contains("dark")}`);
    };
    requestAnimationFrame(record);
    new MutationObserver(record).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  });
  await page.reload({ waitUntil: "commit" });
  await expect.poll(() => token(page, "--color-surface")).toBe(PRESETS.ocean.surface);
  await expect(page.locator("#mindmap-canvas")).toBeVisible();

  const states = await page.evaluate(() => (window as unknown as { __states: string[] }).__states);
  expect(states.length).toBeGreaterThan(0);
  // Nach dem ersten Frame nie das Standard-Theme (leerer Token) und nie dunkel.
  for (const state of states) expect(state).toBe(`${PRESETS.ocean.surface}|false`);
  expect((await bodyColors(page)).background).toBe(rgb(PRESETS.ocean.surface));
});

test("Kriterium 4: zu wenig Textkontrast wird abgelehnt, Gegenbeispiel wird gespeichert @t74", async ({ page }) => {
  await login(page);
  await applyPreset(page, "ocean");
  const savedBefore = await stored(page);

  await openThemeDialog(page);
  await fillColors(page, { surface: "#FFFFFF", ink: "#CCCCCC" });
  await page.getByTestId("theme-custom-save").click();

  const error = page.getByTestId("theme-custom-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("Kontrast");
  await expect(error).toContainText("4,5:1");
  await expect(page.getByTestId("theme-custom-ink")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("theme-custom-dialog")).toBeVisible();
  expect(await stored(page)).toBe(savedBefore);
  expect(await token(page, "--color-surface")).toBe(PRESETS.ocean.surface);

  await fillColors(page, { ink: "#1A1A1A" });
  await page.getByTestId("theme-custom-save").click();
  await expect(page.getByTestId("theme-custom-dialog")).toBeHidden();
  expect(await token(page, "--color-surface")).toBe("#FFFFFF");
  expect(await token(page, "--color-ink")).toBe("#1A1A1A");
  expect(JSON.parse((await stored(page)) ?? "{}")).toMatchObject({ surface: "#FFFFFF", ink: "#1A1A1A" });
});

test("Kriterium 5: zu wenig Akzentkontrast wird abgelehnt @t74", async ({ page }) => {
  await login(page);
  await openThemeDialog(page);
  await fillColors(page, { accent: "#DDDDDD", surface: "#FFFFFF", ink: "#1A1A1A" });
  await page.getByTestId("theme-custom-save").click();

  const error = page.getByTestId("theme-custom-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("Akzent");
  await expect(error).toContainText("3:1");
  await expect(page.getByTestId("theme-custom-accent")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("theme-custom-dialog")).toBeVisible();
  expect(await stored(page)).toBeNull();
  expect(await token(page, "--color-bloom")).toBe("");
});

test("Kriterium 6: ungültiger Hex-Wert „blau“ zeigt Hex-Hinweis, nichts wird angewendet @t74", async ({ page }) => {
  await login(page);
  const before = await bodyColors(page);
  await openThemeDialog(page);
  await fillColors(page, { accent: "blau" });
  await page.getByTestId("theme-custom-save").click();

  const error = page.getByTestId("theme-custom-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("Hex-Wert");
  await expect(page.getByTestId("theme-custom-accent")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("theme-custom-dialog")).toBeVisible();
  expect(await stored(page)).toBeNull();
  expect(await token(page, "--color-bloom")).toBe("");
  expect(await bodyColors(page)).toEqual(before);
});

test("Kriterium 7: Standard-Theme wiederherstellen (Dialog und Menü), auch nach Reload @t74", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bloommd-theme", "dark"));
  await login(page);
  const plain = await bodyColors(page);
  expect(await isDark(page)).toBe(true);

  // Über den Dialog.
  await applyPreset(page, "forest");
  expect(await isDark(page)).toBe(false);
  expect(await token(page, "--color-surface")).toBe(PRESETS.forest.surface);
  await openThemeDialog(page);
  await page.getByTestId("theme-custom-reset").click();
  await expect(page.getByTestId("theme-custom-dialog")).toBeHidden();
  expect(await stored(page)).toBeNull();
  expect(await token(page, "--color-surface")).toBe("");
  expect(await isDark(page)).toBe(true);
  expect(await bodyColors(page)).toEqual(plain);
  await page.reload();
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
  expect(await stored(page)).toBeNull();
  expect(await isDark(page)).toBe(true);
  expect(await bodyColors(page)).toEqual(plain);

  // Über das Menü.
  await applyPreset(page, "sepia");
  await openHelpMenu(page);
  await page.getByTestId("toolbar-theme-reset").click();
  await expect.poll(() => token(page, "--color-surface")).toBe("");
  expect(await stored(page)).toBeNull();
  await page.reload();
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
  expect(await stored(page)).toBeNull();
  expect(await isDark(page)).toBe(true);
  expect(await bodyColors(page)).toEqual(plain);
  expect(await page.evaluate(() => window.localStorage.getItem("bloommd-theme"))).toBe("dark");
});

test("Kriterium 8: Hell/Dunkel-Umschalter funktioniert und setzt ein eigenes Theme zurück @t74", async ({ page }) => {
  await page.addInitScript(() => {
    // Nur beim ersten Laden setzen, damit der Umschalter nicht bei jedem Reload überschrieben wird.
    if (!window.sessionStorage.getItem("t74-init")) {
      window.sessionStorage.setItem("t74-init", "1");
      window.localStorage.setItem("bloommd-theme", "light");
    }
  });
  await login(page);
  expect(await isDark(page)).toBe(false);

  // Ohne eigenes Theme: Hell → Dunkel → Hell.
  await openHelpMenu(page);
  await page.getByTestId("toolbar-theme").click();
  await expect.poll(() => isDark(page)).toBe(true);
  expect((await bodyColors(page)).background).toBe("rgb(17, 17, 17)");
  await openHelpMenu(page);
  await page.getByTestId("toolbar-theme").click();
  await expect.poll(() => isDark(page)).toBe(false);

  // Mit eigenem dunklem Theme: der Umschalter setzt es zurück und wechselt auf die Gegenseite (hell).
  await applyPreset(page, "graphite");
  expect(await isDark(page)).toBe(true);
  expect(await token(page, "--color-surface")).toBe(PRESETS.graphite.surface);
  await openHelpMenu(page);
  await page.getByTestId("toolbar-theme").click();
  await expect.poll(() => token(page, "--color-surface")).toBe("");
  expect(await stored(page)).toBeNull();
  await expect.poll(() => isDark(page)).toBe(false);
  expect(await page.evaluate(() => window.localStorage.getItem("bloommd-theme"))).toBe("light");
});

test("Kriterium 9: Dialog per Tastatur bedienbar, Escape schließt ohne Speichern @t74", async ({ page }) => {
  await login(page);
  await openThemeDialog(page);
  const dialog = page.getByTestId("theme-custom-dialog");

  // Beschriftungen: jedes Feld hat einen zugänglichen Namen.
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("textbox", { name: /Name/ })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /Akzentfarbe/ }).first()).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /Oberfläche/ }).first()).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /^Text/ }).first()).toBeVisible();
  const unnamed = await dialog.evaluate((root) => {
    return Array.from(root.querySelectorAll<HTMLElement>("button, input")).filter((el) => {
      const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el as HTMLInputElement).labels?.length || el.textContent?.trim();
      return !labelled;
    }).length;
  });
  expect(unnamed).toBe(0);

  // Fokus startet im Dialog (erste Vorlage); Tab folgt der DOM-Reihenfolge und bleibt im Dialog (Fokusfalle).
  const focusables = await dialog.evaluate((root) => {
    const selector = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).map(
      (el) => el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.tagName,
    );
  });
  expect(focusables.length).toBeGreaterThan(8);
  const activeId = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("data-testid") ?? el?.getAttribute("aria-label") ?? el?.tagName ?? null;
    });
  expect(await activeId()).toBe("theme-custom-preset-ocean");
  const startIndex = focusables.indexOf("theme-custom-preset-ocean");
  for (let step = 1; step <= focusables.length + 1; step += 1) {
    await page.keyboard.press("Tab");
    expect(await activeId(), `Tab-Schritt ${step}`).toBe(focusables[(startIndex + step) % focusables.length]);
    expect(await dialog.evaluate((root) => root.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((root) => root.contains(document.activeElement))).toBe(true);

  // Vorlage per Tastatur wählen, dann Escape: nichts gespeichert, Fokus zurück am Hilfemenü.
  await page.getByTestId("theme-custom-preset-forest").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("theme-custom-accent")).toHaveValue(PRESETS.forest.accent);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await stored(page)).toBeNull();
  expect(await token(page, "--color-surface")).toBe("");
  await expect(page.getByTestId("toolbar-help-menu")).toBeFocused();

  // Speichern ist per Tastatur erreichbar: Vorlage + Enter im Namensfeld.
  await openThemeDialog(page);
  await page.getByTestId("theme-custom-preset-sepia").focus();
  await page.keyboard.press("Space");
  await page.getByTestId("theme-custom-name").focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(await token(page, "--color-surface")).toBe(PRESETS.sepia.surface);
});

test("Kriterium 10: keine Theme-Daten an einen Server, Speicherung nur in localStorage @t74", async ({ page, context }) => {
  await login(page);
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  const needles = ["0b5fa5", "f4f8fb", "12202b", "bloommd-theme", "theme-custom"];

  await applyPreset(page, "ocean");
  await page.reload();
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(requests.length).toBeGreaterThan(0);
  const leaks: string[] = [];
  for (const request of requests) {
    const headers = JSON.stringify(await request.allHeaders()).toLowerCase();
    const haystack = `${request.url()}\n${request.postData() ?? ""}\n${headers}`.toLowerCase();
    for (const needle of needles) if (haystack.includes(needle)) leaks.push(`${request.method()} ${request.url()} enthält ${needle}`);
  }
  expect(leaks).toEqual([]);

  // Speicherung: localStorage, nicht Cookie.
  expect(JSON.parse((await stored(page)) ?? "{}")).toMatchObject({ name: "Ocean", accent: "#0B5FA5" });
  const cookies = JSON.stringify(await context.cookies()).toLowerCase();
  for (const needle of needles) expect(cookies).not.toContain(needle);
  expect(await page.evaluate(() => document.cookie.toLowerCase())).not.toContain("0b5fa5");
});

// ---------------------------------------------------------------------------------------------
// Kriterium 11: Sichtprüfung je Vorlage.

interface Finding {
  kind: "text-kontrast" | "helle-flaeche-im-dunklen-theme";
  detail: string;
}

async function scanReadability(page: Page, dark: boolean): Promise<Finding[]> {
  return page.evaluate((isDarkTheme) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    };
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i]! * top[3] + bottom[i]! * bottom[3] * (1 - top[3])) / alpha;
      return [mix(0), mix(1), mix(2), alpha];
    };
    const lum = (c: Rgba) => {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const describe = (el: Element) => {
      const testId = el.closest("[data-testid]")?.getAttribute("data-testid");
      return `${el.tagName.toLowerCase()}${testId ? `[${testId}]` : ""}`;
    };
    // Effektiver Hintergrund: Ebenen von innen nach außen übereinanderlegen; Verläufe/Bilder → unbekannt.
    const backdrop = (el: Element): Rgba | null => {
      let acc: Rgba = [0, 0, 0, 0];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") return null;
        const layer = parse(style.backgroundColor);
        if (layer && layer[3] > 0) acc = over(acc, layer);
        if (acc[3] >= 0.999) return acc;
      }
      return over(acc, [255, 255, 255, 1]);
    };
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0;
    };

    const findings: Array<{ kind: "text-kontrast" | "helle-flaeche-im-dunklen-theme"; detail: string }> = [];
    const seen = new Set<string>();
    const add = (kind: "text-kontrast" | "helle-flaeche-im-dunklen-theme", detail: string) => {
      if (seen.has(`${kind}${detail}`) || findings.length >= 25) return;
      seen.add(`${kind}${detail}`);
      findings.push({ kind, detail });
    };

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.closest("svg, canvas, script, style, noscript")) continue;
      if (!visible(el)) continue;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0);
      const style = getComputedStyle(el);
      if (hasText) {
        const fg = parse(style.color);
        const bg = backdrop(el);
        if (fg && bg) {
          const effective = over(fg, bg);
          const value = ratio(effective, bg);
          if (value < 3) {
            const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
            add("text-kontrast", `${describe(el)} „${text}“ ${value.toFixed(2)}:1 (Text ${style.color} auf ${bg.map((n) => Math.round(n)).slice(0, 3).join(",")})`);
          }
        }
      }
      if (isDarkTheme) {
        const own = parse(style.backgroundColor);
        const rect = el.getBoundingClientRect();
        if (own && own[3] > 0.9 && lum(own) > 0.6 && rect.width >= 40 && rect.height >= 16 && !el.closest("img, [data-allow-light-surface]")) {
          add("helle-flaeche-im-dunklen-theme", `${describe(el)} ${style.backgroundColor} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        }
      }
    }
    return findings;
  }, dark);
}

for (const id of Object.keys(PRESETS) as PresetId[]) {
  test(`Kriterium 11: Sichtprüfung Vorlage ${PRESETS[id].name} — Hauptansichten lesbar @t74`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const dark = PRESETS[id].base === "dark";
    const findings: string[] = [];
    const check = async (view: string) => {
      await page.waitForTimeout(250);
      const shot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`${id}-${view}`, { body: shot, contentType: "image/png" });
      for (const finding of await scanReadability(page, dark)) findings.push(`[${id}/${view}] ${finding.kind}: ${finding.detail}`);
    };

    await login(page);
    await applyPreset(page, id);
    expect(await token(page, "--color-surface")).toBe(PRESETS[id].surface);

    // Arbeitsbereich vor dem Öffnen einer Karte.
    await check("arbeitsbereich");

    // Befehlspalette mit Treffer.
    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("command-palette-input")).toBeVisible();
    await page.getByTestId("command-palette-input").fill(MAP_TITLE);
    await expect(page.getByTestId("command-palette-item-mindmap").first()).toBeVisible();
    await check("befehlspalette");

    // Karte.
    await page.getByTestId("command-palette-item-mindmap").first().click();
    const root = page.locator(`[data-node-label="${MAP_TITLE}"]`).first();
    await expect(root).toBeVisible();
    await check("karte");

    // Knoten gewählt + Aktionsleiste, dann Editor.
    await root.click();
    await expect(page.getByTestId("node-action-open-editor")).toBeVisible();
    await check("knoten-aktionen");
    await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await check("editor");

    // Hilfemenü.
    await page.getByTestId("toolbar-help-menu").click();
    await expect(page.getByTestId("toolbar-theme-custom")).toBeVisible();
    await check("hilfemenue");

    // Über-Dialog.
    await page.getByTestId("toolbar-about").click();
    await expect(page.getByTestId("about-dialog")).toBeVisible();
    await check("ueber-dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("about-dialog")).toBeHidden();

    // Theme-Dialog selbst (mit Fehlerhinweis sichtbar, damit auch der Fehlerzustand geprüft wird).
    await openThemeDialog(page);
    await check("theme-dialog");
    await fillColors(page, { surface: PRESETS[id].surface, ink: PRESETS[id].surface });
    await page.getByTestId("theme-custom-save").click();
    await expect(page.getByTestId("theme-custom-error")).toBeVisible();
    await check("theme-dialog-fehler");
    await page.keyboard.press("Escape");

    expect(findings, `Unlesbare oder helle Stellen unter Vorlage ${PRESETS[id].name}`).toEqual([]);
  });
}
