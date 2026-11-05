import { expect, test, devices, type APIRequestContext, type CDPSession, type Page } from "@playwright/test";

/**
 * Mobile matrix for the web app (#66): touch targets, overflow, gestures and the on-screen keyboard
 * on a phone (Pixel 5, portrait and landscape). What emulation cannot show (the real keyboard, iOS
 * Safari, momentum scrolling) is on the manual list in docs/MOBILE-MATRIX.md.
 * Run it with `--project=chromium-mobile --grep @t66`.
 */

const { viewport: PORTRAIT } = devices["Pixel 5"];
const LANDSCAPE = { width: PORTRAIT!.height, height: PORTRAIT!.width };
/** Smallest touch target in CSS px (docs/MOBILE-MATRIX.md). */
const MIN_TARGET = 44;
const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: { Origin: API_ORIGIN },
    form: { name: "E2E T66", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

/** Signs up and opens the default map. */
async function openMap(page: Page, request: APIRequestContext) {
  const email = `e2e-t66-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@bloommd.local`;
  await createAccount(request, email);
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", "de");
  });
  await page.goto("/login?next=/app", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.locator('form[action="/api/auth/login"]').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
  await expect(page.getByTestId("mindmap-node").first()).toBeVisible();
  await fitView(page);
}

async function fitView(page: Page) {
  await page.locator(".react-flow__controls-fitview").tap();
  // fitView animates; wait for the viewport to stop moving.
  let previous = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await page.locator(".react-flow__viewport").evaluate((element) => (element as HTMLElement).style.transform);
    if (current === previous) return;
    previous = current;
    await page.waitForTimeout(120);
  }
}

/**
 * Operable elements smaller than MIN_TARGET. Exceptions (each one is in docs/MOBILE-MATRIX.md):
 *  - `.react-flow__handle`: connection handles, the map has no connect action;
 *  - links inside running text;
 *  - an input in a `<label>` is measured by its label, which is what the finger hits;
 *  - elements another element covers (they cannot be operated right now).
 */
async function smallTargets(page: Page): Promise<{ small: string[]; scanned: number }> {
  return page.evaluate((min) => {
    const selector = 'button, a[href], select, input:not([type="hidden"]), textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="combobox"], [contenteditable="true"]';
    const found: string[] = [];
    let scanned = 0;
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element.closest(".react-flow__handle")) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const label = element.closest("label");
      const measured = label && label.contains(element) && element.tagName !== "BUTTON" ? label : element;
      const rect = measured.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (element.tagName === "A" && style.display === "inline") {
        const rest = (element.parentElement?.textContent ?? "").replace(element.textContent ?? "", "").trim();
        if (rest.length > 0) continue;
      }
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        if (top && !measured.contains(top) && !top.contains(measured)) continue;
      }
      scanned += 1;
      if (rect.width < min - 0.5 || rect.height < min - 0.5) {
        const name = element.dataset.testid ?? element.getAttribute("aria-label") ?? (element.textContent ?? "").trim().slice(0, 30);
        found.push(`${rect.width.toFixed(0)}x${rect.height.toFixed(0)} <${element.tagName.toLowerCase()}> ${name}`);
      }
    }
    return { small: found, scanned };
  }, MIN_TARGET);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function expectTargetsAndFit(page: Page, state: string) {
  const { small, scanned } = await smallTargets(page);
  test.info().annotations.push({ type: "scanned", description: `${state}: ${scanned} operable elements measured` });
  // A scan that finds nothing to measure would pass for the wrong reason.
  expect.soft(scanned, `${state}: operable elements measured`).toBeGreaterThanOrEqual(4);
  expect.soft(small, `${state}: operable elements under ${MIN_TARGET} px`).toEqual([]);
  expect.soft(await horizontalOverflow(page), `${state}: horizontal overflow`).toBeLessThanOrEqual(1);
}

async function selectRoot(page: Page) {
  const root = page.getByTestId("mindmap-node").first();
  const box = (await root.boundingBox())!;
  await root.tap({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByTestId("node-action-toolbar")).toBeVisible();
}

// Sign-up, login and the first render of a development server are slow; the production build CI uses is not.
test.beforeEach(() => {
  test.slow();
});

for (const [orientation, viewport] of [["portrait", PORTRAIT!], ["landscape", LANDSCAPE]] as const) {
  test.describe(`touch targets, ${orientation} @t66`, () => {
    test.use({ viewport });

    test(`map, selected node, editor and file drawer in ${orientation} @t66`, async ({ page, request }) => {
      await openMap(page, request);
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the emulation must report a coarse pointer").toBe(true);
      await expectTargetsAndFit(page, "map");

      await selectRoot(page);
      await expectTargetsAndFit(page, "node selected (action bar)");

      await page.getByTestId("node-action-open-editor").tap();
      await expect(page.getByTestId("node-metadata-editor")).toBeVisible();
      await expectTargetsAndFit(page, "node editor");

      await page.getByTestId("open-file-browser").tap();
      await expect(page.getByTestId("file-drawer")).toBeVisible();
      await expectTargetsAndFit(page, "file drawer");
    });

    test(`toolbar menus in ${orientation} @t66`, async ({ page, request }) => {
      await openMap(page, request);
      const triggers = page.locator('header [aria-haspopup="menu"]:visible');
      const count = await triggers.count();
      // The toolbar is hidden on narrow phones (below 640 px).
      test.skip(count === 0, "no toolbar menus at this width");
      for (let index = 0; index < count; index += 1) {
        const trigger = triggers.nth(index);
        const name = (await trigger.getAttribute("data-testid")) ?? `menu ${index}`;
        await trigger.tap();
        await expect(page.getByRole("menu")).toBeVisible();
        await expectTargetsAndFit(page, name);
        await page.keyboard.press("Escape");
      }
    });
  });
}

test.describe("node controls keep their size at any zoom @t66", () => {
  test("action bar and expand handle stay 44 px when the map is zoomed out and in @t66", async ({ page, request }) => {
    await openMap(page, request);
    await selectRoot(page);
    const levels: Array<{ name: string; reach: (zoom: number) => boolean; button: string }> = [
      { name: "zoomed out", reach: (zoom) => zoom <= 0.3, button: ".react-flow__controls-zoomout" },
      { name: "zoomed in", reach: (zoom) => zoom >= 1.5, button: ".react-flow__controls-zoomin" },
    ];
    for (const level of levels) {
      for (let tap = 0; tap < 16 && !level.reach(await readZoom(page)); tap += 1) {
        // Zoom levels are far apart, so the map is fitted again before it goes the other way.
        await page.locator(level.button).tap();
        await page.waitForTimeout(250);
      }
      const zoom = await readZoom(page);
      expect(level.reach(zoom), `${level.name}: reached zoom ${zoom}`).toBe(true);
      const sizes = await page.evaluate(() => {
        const read = (selector: string) => {
          const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
          return rect ? { w: rect.width, h: rect.height } : null;
        };
        return {
          "action: add child": read('[data-testid="node-action-add-child"]'),
          "action: open editor": read('[data-testid="node-action-open-editor"]'),
          "expand handle": read('[data-testid="node-toggle-children"]'),
        };
      });
      for (const [name, size] of Object.entries(sizes)) {
        expect(size, `${name} exists ${level.name}`).not.toBeNull();
        expect.soft(size!.w, `${name} width ${level.name} (zoom ${zoom.toFixed(2)})`).toBeGreaterThanOrEqual(MIN_TARGET - 0.5);
        expect.soft(size!.h, `${name} height ${level.name} (zoom ${zoom.toFixed(2)})`).toBeGreaterThanOrEqual(MIN_TARGET - 0.5);
      }
      await fitView(page);
    }
  });

  test("tapping the middle of a node selects it, the expand handle does not take the tap @t66", async ({ page, request }) => {
    await openMap(page, request);
    // The nodes with an expand handle are the ones its large hit area can overlap.
    const nodes = page.getByTestId("mindmap-node");
    const withHandle = page.getByTestId("mindmap-node").filter({ has: page.getByTestId("node-toggle-children") });
    const count = await withHandle.count();
    expect(count).toBeGreaterThan(2);
    const before = await nodes.count();
    for (let index = 0; index < count; index += 1) {
      // The action bar of the node selected before covers the nodes below it: deselect first.
      await page.touchscreen.tap(200, 720);
      // Selecting a node centers it; fit the map again so every node is where the scan expects it.
      await fitView(page);
      const node = withHandle.nth(index);
      const box = (await node.boundingBox())!;
      await node.tap({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(node, `node ${index} is selected by a tap in its middle`).toHaveAttribute("data-selected", "true");
      expect(await nodes.count(), "no branch collapsed").toBe(before);
    }
  });
});

async function readZoom(page: Page) {
  return page.locator(".react-flow__viewport").evaluate((element) => Number(/scale\(([\d.]+)\)/.exec((element as HTMLElement).style.transform)![1]));
}

interface TouchPoint { id: number; x: number; y: number }

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: TouchPoint[]) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
}

interface MapState { zoom: number; pan: string; nodes: Record<string, string> }

async function mapState(page: Page): Promise<MapState> {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport")!;
    const transform = viewport.style.transform;
    return {
      zoom: Number(/scale\(([\d.]+)\)/.exec(transform)![1]),
      pan: /translate\([^)]*\)/.exec(transform)![0],
      nodes: Object.fromEntries([...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((node) => [node.dataset.id!, node.style.transform])),
    };
  });
}

function movedNodes(before: MapState, after: MapState) {
  return Object.keys(after.nodes).filter((id) => after.nodes[id] !== before.nodes[id]);
}

async function nodeCenter(page: Page, label: string) {
  const box = await page.locator(`[data-testid="mindmap-node"][data-node-label="${label}"]`).boundingBox();
  expect(box, `node ${label} is on screen`).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Moves the given fingers in a straight line and returns the map state while they are still down. */
async function drag(page: Page, from: TouchPoint[], to: Array<{ x: number; y: number }>) {
  const cdp = await page.context().newCDPSession(page);
  const before = await mapState(page);
  await touch(cdp, "touchStart", from);
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    await touch(cdp, "touchMove", from.map((point, index) => ({
      id: point.id,
      x: point.x + ((to[index]!.x - point.x) * step) / steps,
      y: point.y + ((to[index]!.y - point.y) * step) / steps,
    })));
    await page.waitForTimeout(16);
  }
  const during = await mapState(page);
  await touch(cdp, "touchEnd", []);
  await page.waitForTimeout(300);
  return { before, during };
}

test.describe("gestures on the map @t66", () => {
  test.beforeEach(async ({ page, request }) => {
    await openMap(page, request);
  });

  test("one finger on empty space pans the view and moves no node @t66", async ({ page }) => {
    const { before, during } = await drag(page, [{ id: 1, x: 200, y: 700 }], [{ x: 260, y: 640 }]);
    expect(during.pan).not.toBe(before.pan);
    expect(during.zoom).toBeCloseTo(before.zoom, 5);
    expect(movedNodes(before, during)).toEqual([]);
  });

  test("one finger on a node moves the node and does not pan the view @t66", async ({ page }) => {
    const target = await nodeCenter(page, "Typen");
    const { before, during } = await drag(page, [{ id: 1, ...target }], [{ x: target.x - 50, y: target.y - 20 }]);
    expect(movedNodes(before, during)).toHaveLength(1);
    expect(during.pan).toBe(before.pan);
    expect(during.zoom).toBeCloseTo(before.zoom, 5);
  });

  test("pinch on empty space zooms and moves no node @t66", async ({ page }) => {
    const { before, during } = await drag(page, [{ id: 1, x: 150, y: 700 }, { id: 2, x: 250, y: 700 }], [{ x: 100, y: 700 }, { x: 300, y: 700 }]);
    expect(during.zoom).toBeGreaterThan(before.zoom * 1.3);
    expect(movedNodes(before, during)).toEqual([]);
  });

  test("pinch with one finger on a node zooms and moves no node @t66", async ({ page }) => {
    const target = await nodeCenter(page, "Typen");
    const { before, during } = await drag(
      page,
      [{ id: 1, ...target }, { id: 2, x: target.x - 100, y: target.y + 250 }],
      [{ x: target.x + 20, y: target.y - 30 }, { x: target.x - 160, y: target.y + 330 }],
    );
    expect(during.zoom).not.toBeCloseTo(before.zoom, 2);
    expect(movedNodes(before, during)).toEqual([]);
  });

  test("two-finger pan with one finger on a node pans the view and moves no node @t66", async ({ page }) => {
    const target = await nodeCenter(page, "Typen");
    const { before, during } = await drag(
      page,
      [{ id: 1, ...target }, { id: 2, x: target.x - 80, y: target.y + 250 }],
      [{ x: target.x + 40, y: target.y + 40 }, { x: target.x - 40, y: target.y + 290 }],
    );
    expect(during.pan).not.toBe(before.pan);
    expect(movedNodes(before, during)).toEqual([]);
  });

  // Known deviation, see docs/MOBILE-MATRIX.md: React Flow gives every draggable node the class `nopan`,
  // which also blocks the zoom gesture when the second finger lands on a node too.
  test.fixme("pinch with both fingers on the same node zooms @t66", async ({ page }) => {
    const target = await nodeCenter(page, "Typen");
    const { before, during } = await drag(page, [{ id: 1, x: target.x - 5, y: target.y }, { id: 2, x: target.x + 5, y: target.y }], [{ x: target.x - 40, y: target.y }, { x: target.x + 40, y: target.y }]);
    expect(during.zoom).toBeGreaterThan(before.zoom * 1.3);
    expect(movedNodes(before, during)).toEqual([]);
  });
});

test.describe("on-screen keyboard @t66", () => {
  /** Opens the editor and focuses its text field; returns where the field is. */
  async function focusEditorField(page: Page) {
    await selectRoot(page);
    await page.getByTestId("node-action-open-editor").tap();
    const field = page.locator('[data-testid="node-content-panel"] [contenteditable="true"]').first();
    await field.scrollIntoViewIfNeeded();
    await field.tap();
    await expect(field).toBeFocused();
    return field;
  }

  /** The field has to be inside what the user sees: below the header, above the keyboard. */
  async function expectFieldVisible(page: Page, field: ReturnType<Page["locator"]>, visibleHeight: number, label: string) {
    await expect.poll(async () => {
      const rect = await field.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      return rect.top >= 0 && rect.top < visibleHeight - 20 ? "visible" : `top ${Math.round(rect.top)}, bottom ${Math.round(rect.bottom)}, visible height ${visibleHeight}`;
    }, { message: `${label}: the focused field stays on screen`, timeout: 5_000 }).toBe("visible");
  }

  test("the layout viewport shrinks with the keyboard (Android, Chrome): the field stays visible @t66", async ({ page, request }) => {
    await openMap(page, request);
    const field = await focusEditorField(page);
    const topBefore = await field.evaluate((element) => element.getBoundingClientRect().top);
    // A keyboard of about 45% of a Pixel 5 screen.
    const height = Math.max(300, Math.min(480, Math.floor(topBefore) - 20));
    await page.setViewportSize({ width: PORTRAIT!.width, height });
    await expectFieldVisible(page, field, height, "layout viewport");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await expect(page.locator("header").first()).toBeInViewport();
  });

  test("only the visual viewport shrinks (iOS Safari, WKWebView): the app follows it @t66", async ({ page, request }) => {
    await openMap(page, request);
    const field = await focusEditorField(page);
    const topBefore = await field.evaluate((element) => element.getBoundingClientRect().top);
    const height = Math.max(300, Math.min(480, Math.floor(topBefore) - 20));
    // Emulation cannot open a keyboard. This reports what iOS reports: a smaller visual viewport, same layout viewport.
    await page.evaluate((visualHeight) => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, "height", { configurable: true, get: () => visualHeight });
      viewport.dispatchEvent(new Event("resize"));
    }, height);
    await expect(page.getByTestId("app-root")).toHaveCSS("height", `${height}px`);
    await expectFieldVisible(page, field, height, "visual viewport");
    await expect(page.locator("header").first()).toBeInViewport();

    // The keyboard closes: the app takes the full screen again.
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      delete (viewport as unknown as { height?: number }).height;
      viewport.dispatchEvent(new Event("resize"));
    });
    await expect(page.getByTestId("app-root")).toHaveCSS("height", `${PORTRAIT!.height}px`);
  });
});
