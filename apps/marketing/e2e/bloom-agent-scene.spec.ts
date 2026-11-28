import { expect, test, type Page } from "@playwright/test";

/* Titles come from the landing page example map (useCases[0].file / .markdown in app/page.tsx and
   app/en/english-landing-page.tsx). */
const locales = [
  {
    path: "/",
    label: /MD-Agent pflanzt einen Samen/,
    pause: "Animation anhalten",
    play: "Animation abspielen",
    file: "strategie.md",
    titles: ["Strategie", "Ziele", "Initiativen", "Kundenbindung", "Startrisiko"],
  },
  {
    path: "/en",
    label: /MD agent plants a seed/,
    pause: "Pause animation",
    play: "Play animation",
    file: "strategy.md",
    titles: ["Product Strategy", "Goals", "Initiatives", "Retention", "Launch risk"],
  },
] as const;

type Box = { x: number; y: number; width: number; height: number };
/* Two stages, one is displayed: "wide" (viewBox 1000 × 440) from 720 px and on every landscape viewport,
   "tall" (360 × 470) on narrower portrait viewports. */
const isWide = (width: number, height: number) => width >= 720 || width >= height;
const stageRatio = (width: number, height: number) => (isWide(width, height) ? 1000 / 440 : 360 / 470);
/* Only the nodes of the displayed stage count. */
const visibleNodes = (page: Page, selector = "[data-bloom-node]") => page.getByTestId("bloom-agent-scene").locator(selector).filter({ visible: true });
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/* Stops every scene animation at its end state, so boxes are measured on the finished map. */
async function finishScene(page: Page) {
  await page.getByTestId("bloom-agent-scene").evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true })) {
      if (animation.timeline !== document.timeline) continue;
      const timing = animation.effect?.getComputedTiming();
      if (timing && Number.isFinite(timing.endTime)) animation.finish();
      else animation.pause();
    }
  });
}

for (const locale of locales) {
  test(`${locale.path} plays the MD agent bloom scene once it is in view and can stop it`, async ({ page }) => {
    await page.goto(locale.path);
    const scene = page.getByTestId("bloom-agent-scene");
    await expect(scene.getByRole("img", { name: locale.label })).toBeAttached();
    const stage = await page.getByTestId("bloom-agent-stage").boundingBox();
    expect(stage && stage.width / stage.height).toBeCloseTo(stageRatio(page.viewportSize()!.width, page.viewportSize()!.height), 1);

    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
    const toggle = page.getByRole("button", { name: locale.pause });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(scene).toHaveAttribute("data-state", "stopped");
    // Only the press feedback of the button itself may still transition.
    expect(await scene.evaluate((node) => node.getAnimations({ subtree: true }).filter((animation) => animation instanceof CSSAnimation).length)).toBe(0);
    await page.getByRole("button", { name: locale.play }).click();
    await expect(scene).toHaveAttribute("data-state", "play");
  });

  test(`${locale.path} plays the scene again after a reload and writes no browser storage and no cookie`, async ({ page, context }) => {
    await page.goto(locale.path);
    const scene = page.getByTestId("bloom-agent-scene");
    await page.waitForLoadState("load");
    const snapshot = async () => ({
      cookies: (await context.cookies()).map((cookie) => cookie.name).sort(),
      storage: await page.evaluate(() => ({
        local: Object.keys(window.localStorage).sort(),
        session: Object.keys(window.sessionStorage).sort(),
      })),
    });
    const before = await snapshot();
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
    await page.waitForTimeout(500);
    // The scene keeps its "played" flag in memory only.
    expect(await snapshot()).toEqual(before);

    await page.reload();
    await expect(scene).toHaveAttribute("data-state", /ready|play/);
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
  });

  test(`${locale.path} after the scene the final image is calm: no sparks of light, no pulses, only the agent floats`, async ({ page }) => {
    await page.goto(locale.path);
    const scene = page.getByTestId("bloom-agent-scene");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
    await finishScene(page);
    const after = await scene.evaluate((node) => {
      // Effective opacity: the element and every ancestor up to the scene.
      const opacity = (element: Element) => {
        let value = 1;
        for (let current: Element | null = element; current && current !== node; current = current.parentElement) value *= Number(getComputedStyle(current).opacity);
        return value;
      };
      const shown = (selector: string) =>
        [...node.querySelectorAll(selector)].filter((element) => element.getBoundingClientRect().width > 0 && opacity(element) > 0.01).length;
      return {
        flow: shown("[data-bloom-flow]"),
        ghost: shown("[data-bloom-ghost] :not(:has(*))"),
        water: shown("[data-bloom-water] :not(:has(*))"),
        loops: node
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity)
          .map((animation) => (animation as CSSAnimation).animationName),
      };
    });
    expect(after.flow).toBe(0);
    expect(after.ghost).toBe(0);
    expect(after.water).toBe(0);
    expect(after.loops.length).toBeGreaterThan(0);
    // Dev names the keyframes "…__bloom-float", production "…_bloom-float__<hash>".
    for (const name of after.loops) expect(name).toMatch(/bloom-float(?:__|$)/);
  });

  test(`${locale.path} map nodes carry the titles of the landing page example map`, async ({ page }) => {
    await page.goto(locale.path);
    const scene = page.getByTestId("bloom-agent-scene");
    await expect(scene.locator("[data-bloom-file]")).toHaveText(locale.file);
    // Both stages carry the same titles, in Markdown order.
    for (const kind of ["wide", "tall"]) {
      const texts = await scene.locator(`svg[data-bloom-stage="${kind}"] [data-bloom-title]`).allTextContents();
      expect(texts).toEqual([...locale.titles]);
    }
    expect(await visibleNodes(page, "[data-bloom-title]").allTextContents()).toEqual([...locale.titles]);
  });

  for (const width of [390, 768, 1440]) {
    test(`${locale.path} at ${width}px: the map is balanced, nothing overlaps and the pause button is free`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(locale.path);
      const scene = page.getByTestId("bloom-agent-scene");
      await scene.scrollIntoViewIfNeeded();
      await expect(scene).toHaveAttribute("data-state", "play");
      await finishScene(page);

      const sceneBox = (await scene.boundingBox())!;
      const stage = (await page.getByTestId("bloom-agent-stage").boundingBox())!;
      const toggle = (await page.getByTestId("bloom-agent-scene-toggle").boundingBox())!;
      expect(toggle.width).toBeGreaterThanOrEqual(44);
      expect(toggle.height).toBeGreaterThanOrEqual(44);
      expect(toggle.x + toggle.width).toBeLessThanOrEqual(sceneBox.x + sceneBox.width + 0.5);
      expect(toggle.y).toBeGreaterThanOrEqual(sceneBox.y - 0.5);
      // The button sits in the tab bar above the stage, so it can never cover the map.
      expect(toggle.y + toggle.height).toBeLessThanOrEqual(stage.y + 0.5);

      expect(stage.width / stage.height).toBeCloseTo(stageRatio(width, 900), 1);
      const nodes = visibleNodes(page);
      expect(await nodes.count()).toBe(5);
      const boxes: Box[] = [];
      for (let index = 0; index < 5; index += 1) boxes.push((await nodes.nth(index).locator("rect").first().boundingBox())!);
      const avatar = (await page.getByTestId("bloom-agent-avatar").boundingBox())!;

      for (const [index, box] of boxes.entries()) {
        expect(overlaps(box, toggle), `node ${index} overlaps the pause button`).toBe(false);
        expect(overlaps(box, avatar), `node ${index} overlaps the agent`).toBe(false);
        expect(box.x).toBeGreaterThanOrEqual(stage.x);
        expect(box.y).toBeGreaterThanOrEqual(stage.y);
        expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
        expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height);
        for (const [other, otherBox] of boxes.entries()) {
          if (other > index) expect(overlaps(box, otherBox), `node ${index} overlaps node ${other}`).toBe(false);
        }
      }

      // Balanced: every quadrant of the stage holds a node or the agent, and together they span the card.
      const items = [...boxes, avatar];
      const midX = stage.x + stage.width / 2;
      const midY = stage.y + stage.height / 2;
      const quadrants = new Set(items.map((box) => `${box.x + box.width / 2 < midX ? "l" : "r"}${box.y + box.height / 2 < midY ? "t" : "b"}`));
      expect([...quadrants].sort()).toEqual(["lb", "lt", "rb", "rt"]);
      const left = Math.min(...items.map((box) => box.x));
      const right = Math.max(...items.map((box) => box.x + box.width));
      const top = Math.min(...items.map((box) => box.y));
      const bottom = Math.max(...items.map((box) => box.y + box.height));
      expect((right - left) / stage.width).toBeGreaterThan(0.85);
      expect((bottom - top) / stage.height).toBeGreaterThan(0.75);

      const fits = await nodes.evaluateAll((groups) =>
        groups.every((group) => {
          const rect = group.querySelector("rect")!.getBoundingClientRect();
          return [...group.querySelectorAll("text, circle")].every((child) => {
            const box = child.getBoundingClientRect();
            return box.left >= rect.left + 1 && box.right <= rect.right - 1;
          });
        }),
      );
      expect(fits).toBe(true);
      // The leaf dot and the leaf title do not touch.
      const gaps = await visibleNodes(page, "[data-bloom-node='leaf']").evaluateAll((groups) =>
        groups.map((group) => group.querySelector("text")!.getBoundingClientRect().left - group.querySelector("circle")!.getBoundingClientRect().right),
      );
      for (const gap of gaps) expect(gap).toBeGreaterThan(2);
    });
  }
}

/* Phones in landscape and 1280 × 720 at 200 % zoom: the scene is taller than half the viewport, so a plain
   visibility ratio of 0.5 is never reached. It starts once half of the viewport shows it. */
for (const [width, height] of [[667, 375], [640, 360], [568, 320]] as const) {
  test(`at ${width}×${height} the scene starts and the map grows`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const scene = page.getByTestId("bloom-agent-scene");
    await expect(scene).toHaveAttribute("data-state", "ready");
    await scene.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await expect(scene).toHaveAttribute("data-state", "play");
    const nodes = visibleNodes(page);
    await expect(nodes).toHaveCount(5);
    // Real time: every node blooms to full opacity.
    await expect
      .poll(() => nodes.evaluateAll((groups) => groups.map((group) => Number(getComputedStyle(group).opacity))), { timeout: 10_000 })
      .toEqual([1, 1, 1, 1, 1]);
    for (const title of locales[0].titles) await expect(nodes.locator("[data-bloom-title]", { hasText: title })).toBeVisible();
  });
}

/* Phones held sideways take the wide layout, like the desktop: no portrait stage taller than the screen. */
for (const [width, height] of [[667, 375], [844, 390]] as const) {
  test(`at ${width}×${height} (landscape) the wide layout starts, every node is in sight and the pause button is free`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const scene = page.getByTestId("bloom-agent-scene");
    await expect(scene.locator('svg[data-bloom-stage="wide"]')).toBeVisible();
    await expect(scene.locator('svg[data-bloom-stage="tall"]')).toBeHidden();
    await scene.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await expect(scene).toHaveAttribute("data-state", "play");
    await finishScene(page);

    const sceneBox = (await scene.boundingBox())!;
    const stage = (await page.getByTestId("bloom-agent-stage").boundingBox())!;
    expect(stage.width / stage.height).toBeCloseTo(1000 / 440, 1);
    // The whole card fits into the viewport and the page does not scroll sideways.
    expect(sceneBox.height).toBeLessThanOrEqual(height);
    expect(sceneBox.x).toBeGreaterThanOrEqual(0);
    expect(sceneBox.x + sceneBox.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    const toggle = (await page.getByTestId("bloom-agent-scene-toggle").boundingBox())!;
    const nodes = visibleNodes(page);
    await expect(nodes).toHaveCount(5);
    for (const title of locales[0].titles) await expect(nodes.locator("[data-bloom-title]", { hasText: title })).toBeVisible();
    for (let index = 0; index < 5; index += 1) {
      const box = (await nodes.nth(index).locator("rect").first().boundingBox())!;
      expect(overlaps(box, toggle), `node ${index} overlaps the pause button`).toBe(false);
      expect(box.x).toBeGreaterThanOrEqual(stage.x);
      expect(box.y).toBeGreaterThanOrEqual(stage.y);
      expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width);
      expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height);
    }
  });
}

/* The watering can stays clear of the head (the box around its silhouette turns with the head) at every
   moment of the scene in which the can is shown. Samples every 20 ms through the whole watering act. */
for (const [width, height] of [[1440, 900], [768, 900], [390, 844], [667, 375]] as const) {
  test(`at ${width}×${height} the watering can never touches the face of the agent`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const scene = page.getByTestId("bloom-agent-scene");
    await scene.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await expect(scene).toHaveAttribute("data-state", "play");
    const result = await scene.evaluate((node) => {
      const touches: number[] = [];
      let shown = 0;
      for (let ms = 0; ms <= 3000; ms += 20) {
        for (const animation of node.getAnimations({ subtree: true })) {
          // Scroll-driven animations (parallax, scroll pose) follow the page scroll, not the clock.
          if (animation.timeline !== document.timeline) continue;
          animation.pause();
          animation.currentTime = ms;
        }
        const can = node.querySelector("[data-bloom-can]")!;
        if (Number(getComputedStyle(can).opacity) < 0.01) continue;
        shown += 1;
        const a = can.querySelector("svg")!.getBoundingClientRect();
        const b = node.querySelector("[data-bloom-head]")!.getBoundingClientRect();
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) touches.push(ms);
      }
      return { shown, touches };
    });
    // The can is shown for about 1.1 s, so the samples really cover the watering.
    expect(result.shown).toBeGreaterThan(50);
    expect(result.touches).toEqual([]);
  });
}

for (const locale of locales) {
  test(`${locale.path} on a phone the leaves keep a margin to the right edge and their twigs stay in sight`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(locale.path);
    const scene = page.getByTestId("bloom-agent-scene");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
    await finishScene(page);
    const stage = (await page.getByTestId("bloom-agent-stage").boundingBox())!;
    for (const leaf of await visibleNodes(page, "[data-bloom-node='leaf']").all()) {
      const box = (await leaf.locator("rect").boundingBox())!;
      expect(stage.x + stage.width - (box.x + box.width)).toBeGreaterThanOrEqual(8);
    }
    // Most of each twig runs outside every node pill, so the branch to the leaf is not hidden behind one.
    const inSight = await page.locator('svg[data-bloom-stage="tall"]').evaluate((svg) => {
      const pills = [...svg.querySelectorAll("[data-bloom-node] rect")].map((rect) => rect.getBoundingClientRect());
      const twigs = [...svg.querySelectorAll<SVGPathElement>("path[data-bloom-flow]")].slice(2);
      const matrix = svg.getScreenCTM()!;
      return twigs.map((twig) => {
        const length = twig.getTotalLength();
        let free = 0;
        for (let step = 0; step <= 40; step += 1) {
          const point = new DOMPoint(twig.getPointAtLength((length * step) / 40).x, twig.getPointAtLength((length * step) / 40).y).matrixTransform(matrix);
          if (!pills.some((pill) => point.x > pill.left && point.x < pill.right && point.y > pill.top && point.y < pill.bottom)) free += 1;
        }
        return free / 41;
      });
    });
    expect(inSight).toHaveLength(2);
    for (const share of inSight) expect(share).toBeGreaterThan(0.75);
  });
}

test("the landing ring of the seed stays hidden until the seed lands", async ({ page }) => {
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "play");
  const ringAt = (ms: number) =>
    scene.evaluate((node, time) => {
      for (const animation of node.getAnimations({ subtree: true })) {
        // Scroll-driven animations (parallax, scroll pose) follow the page scroll, not the clock.
        if (animation.timeline !== document.timeline) continue;
        animation.pause();
        animation.currentTime = time;
      }
      const ring = [...node.querySelectorAll("[data-bloom-ripple]")].find((element) => element.getBoundingClientRect().width > 0)!;
      return Number(getComputedStyle(ring).opacity);
    }, ms);
  // The seed lands at 0.665 s (70 % of its 0.95 s toss), the ring starts at 0.67 s.
  for (const ms of [0, 300, 500, 640]) expect(await ringAt(ms)).toBe(0);
  expect(await ringAt(740)).toBeGreaterThan(0.3);
});

test("reduced motion shows the finished map without a pause button", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "end");
  await expect(page.getByTestId("bloom-agent-scene-toggle")).toHaveCount(0);
  const running = await scene.evaluate((node) => node.getAnimations({ subtree: true }).length);
  expect(running).toBe(0);
  await expect(visibleNodes(page).locator("[data-bloom-title]", { hasText: "Startrisiko" })).toBeVisible();
  await context.close();
});

test("without JavaScript the server render is the finished map", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "end");
  await expect(page.getByTestId("bloom-agent-scene-toggle")).toHaveCount(0);
  for (const title of locales[0].titles) await expect(visibleNodes(page).locator("[data-bloom-title]", { hasText: title })).toBeVisible();
  // The agent comes from <noscript>, so the final image is complete without JavaScript.
  const layers = page.getByTestId("bloom-agent-avatar").locator("img");
  await expect(layers).toHaveCount(4);
  expect(await layers.first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await context.close();
});

test("the agent image is requested only when the scene comes close, not during the page load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/agents/md-avatar")) requests.push(request.url());
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
  await page.getByTestId("bloom-agent-scene").scrollIntoViewIfNeeded();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  // Phones take the 200 px file.
  expect(requests.every((url) => url.includes("md-avatar-200.webp"))).toBe(true);
});

/* Step A: the agent and the nodes of the grown map are buttons. A click, Enter or Space starts a short
   reaction; the reaction attribute restarts the CSS animation on every press. */
const reactionAnimations = (page: Page) =>
  page.getByTestId("bloom-agent-scene").evaluate((node) =>
    node
      .getAnimations({ subtree: true })
      .map((animation) => (animation as CSSAnimation).animationName)
      .filter((name) => /bloom-(poke|pop|petal)(?:__|$|-)/.test(name)),
  );

for (const locale of locales) {
  test(`${locale.path} a click, Enter and Tab reach the agent and the nodes and start a reaction`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(locale.path);
    const scene = page.getByTestId("bloom-agent-scene");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
    await finishScene(page);

    const agent = page.getByTestId("bloom-agent-avatar");
    await expect(agent).toBeEnabled();
    const box = (await agent.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await agent.click();
    await expect(scene).toHaveAttribute("data-react", "");
    expect(await reactionAnimations(page)).toEqual(expect.arrayContaining([expect.stringMatching(/bloom-poke(?:__|$)/)]));
    await expect(scene).not.toHaveAttribute("data-react", /.*/, { timeout: 2000 });

    // Tab from the pause button: the agent first, then the five nodes in Markdown order.
    await page.getByTestId("bloom-agent-scene-toggle").focus();
    await page.keyboard.press("Tab");
    await expect(agent).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(scene).toHaveAttribute("data-react", "");
    const hits = scene.locator("[data-bloom-hit]").filter({ visible: true });
    await expect(hits).toHaveCount(5);
    for (const [index, title] of locale.titles.entries()) {
      await page.keyboard.press("Tab");
      await expect(hits.nth(index)).toBeFocused();
      await expect(hits.nth(index)).toHaveAccessibleName(new RegExp(title));
      const hit = (await hits.nth(index).boundingBox())!;
      expect(hit.height).toBeGreaterThanOrEqual(44);
    }

    // Enter on the focused leaf: the leaf blooms (spring pop and petals) and the agent cheers.
    await page.keyboard.press("Enter");
    const leaf = scene.locator('svg[data-bloom-stage="wide"] [data-bloom-wrap="4"]');
    await expect(leaf).toHaveAttribute("data-pop", "");
    await expect(scene).toHaveAttribute("data-react", "");
    const names = await reactionAnimations(page);
    expect(names.some((name) => /bloom-pop(?:__|$)/.test(name))).toBe(true);
    expect(names.some((name) => /bloom-petal(?:__|$)/.test(name))).toBe(true);

    // A click on another node: that node blooms.
    await hits.nth(1).click();
    await expect(scene.locator('svg[data-bloom-stage="wide"] [data-bloom-wrap="1"]')).toHaveAttribute("data-pop", "");
  });
}

test("on the desktop the agent looks at the cursor and at a hovered node, damped and at most 6°; the pause stops it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "play");
  await finishScene(page);
  const look = scene.locator("[data-bloom-look]");
  const angle = () => look.evaluate((node) => {
    const match = /rotate\((-?[\d.]+)deg\)/.exec((node as HTMLElement).style.transform);
    return match ? Number(match[1]) : 0;
  });

  const leaf = scene.locator("[data-bloom-hit]").filter({ visible: true }).nth(3);
  await leaf.hover();
  await expect.poll(angle).toBeGreaterThan(2);
  const stage = (await page.getByTestId("bloom-agent-stage").boundingBox())!;
  await page.mouse.move(stage.x + stage.width - 2, stage.y + 2, { steps: 4 });
  await page.waitForTimeout(800);
  expect(Math.abs(await angle())).toBeLessThanOrEqual(6);

  // The pause stops the gaze and resets it; mouse moves no longer turn the head.
  await page.getByTestId("bloom-agent-scene-toggle").click();
  await expect(scene).toHaveAttribute("data-state", "stopped");
  await expect.poll(angle).toBe(0);
  await leaf.hover();
  await page.mouse.move(stage.x + stage.width - 20, stage.y + 20, { steps: 4 });
  await page.waitForTimeout(400);
  expect(await angle()).toBe(0);
  // A click while paused animates nothing.
  await page.getByTestId("bloom-agent-avatar").click();
  expect(await reactionAnimations(page)).toEqual([]);
});

test("on a touch phone there is no cursor gaze", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "play");
  expect(await page.evaluate(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches)).toBe(false);
  // A tap on a node still blooms it.
  await scene.locator("[data-bloom-hit]").filter({ visible: true }).nth(2).tap();
  await expect(scene.locator('svg[data-bloom-stage="tall"] [data-bloom-wrap="2"]')).toHaveAttribute("data-pop", "");
  await context.close();
});

test("reduced motion: a click on the agent or a node changes a colour only, no motion, no gaze", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "end");
  const agent = page.getByTestId("bloom-agent-avatar");
  await expect(agent).toBeEnabled();
  await agent.click();
  await expect(scene).toHaveAttribute("data-react", "");
  const node = scene.locator("[data-bloom-hit]").filter({ visible: true }).nth(0);
  await node.hover();
  await node.click();
  await expect(scene.locator('svg[data-bloom-stage="wide"] [data-bloom-wrap="0"]')).toHaveAttribute("data-pop", "");
  await page.waitForTimeout(300);
  expect(await scene.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await scene.locator("[data-bloom-look]").evaluate((element) => (element as HTMLElement).style.transform)).toBe("");
  await context.close();
});

test("clicks on the agent and the nodes write no browser storage and no cookie", async ({ page, context }) => {
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await page.waitForLoadState("load");
  const snapshot = async () => ({
    cookies: (await context.cookies()).map((cookie) => cookie.name).sort(),
    storage: await page.evaluate(() => ({ local: Object.keys(window.localStorage).sort(), session: Object.keys(window.sessionStorage).sort() })),
  });
  const before = await snapshot();
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "play");
  await page.getByTestId("bloom-agent-avatar").click();
  await scene.locator("[data-bloom-hit]").filter({ visible: true }).nth(1).click();
  await page.waitForTimeout(300);
  expect(await snapshot()).toEqual(before);
});

/* Scroll coupling (CSS scroll timeline). Scrolls the page in steps from the scene entering at the bottom
   to the scene leaving at the top and measures each step. */
async function scrollThroughScene(page: Page, steps = 14) {
  const range = await page.getByTestId("bloom-agent-scene").evaluate((node) => {
    const box = node.getBoundingClientRect();
    const top = window.scrollY + box.top;
    return { from: Math.max(0, top - window.innerHeight), to: top + box.height };
  });
  const samples: { y: number; avatar: Box; texts: { tag: string; text: string; box: Box }[]; parallax: number; pose: string; gaze: string }[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const y = Math.round(range.from + ((range.to - range.from) * index) / steps);
    samples.push(
      await page.evaluate(async (scrollTo) => {
        window.scrollTo({ top: scrollTo, behavior: "instant" });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const scene = document.querySelector('[data-testid="bloom-agent-scene"]')!;
        const rects = [...scene.querySelectorAll('[data-testid="bloom-agent-avatar"] img')].map((image) => image.getBoundingClientRect()).filter((rect) => rect.width > 0);
        const left = Math.min(...rects.map((rect) => rect.left));
        const top = Math.min(...rects.map((rect) => rect.top));
        const avatar = { x: left, y: top, width: Math.max(...rects.map((rect) => rect.right)) - left, height: Math.max(...rects.map((rect) => rect.bottom)) - top };
        /* Text of the agent section and of the sections next to it: headings, paragraphs, list items, links, buttons. */
        const section = document.getElementById("agenten")!;
        const areas = [section.previousElementSibling, section, section.nextElementSibling].filter((area): area is Element => Boolean(area));
        const texts = areas
          .flatMap((area) => [...area.querySelectorAll("h1, h2, h3, h4, p, li, a, button")])
          .filter((element) => !scene.contains(element))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { tag: element.tagName, text: (element.textContent ?? "").trim().slice(0, 40), box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
          })
          .filter((entry) => entry.box.width > 0 && entry.box.height > 0 && entry.box.y < window.innerHeight && entry.box.y + entry.box.height > 0);
        const parallax = new DOMMatrix(getComputedStyle(scene.querySelector("[data-bloom-parallax]")!).transform).m42;
        const pose = getComputedStyle(scene.querySelector("[data-bloom-scroll-pose]")!).transform;
        const gaze = getComputedStyle(scene.querySelector("[data-bloom-scroll-gaze]")!).transform;
        return { y: scrollTo, avatar, texts, parallax, pose, gaze };
      }, y),
    );
  }
  return samples;
}

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`at ${width}×${height} the agent follows the scroll, the map drifts at most 24 px and the agent never covers text`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 720, hasTouch: width < 720 });
    const page = await context.newPage();
    await page.goto("/");
    const scene = page.getByTestId("bloom-agent-scene");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
    await expect(scene.locator('[data-testid="bloom-agent-avatar"] img').first()).toBeVisible();
    const names = await scene.evaluate((node) => node.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName));
    for (const name of ["bloom-parallax", "bloom-scroll-pose", "bloom-scroll-gaze"]) expect(names.some((entry) => new RegExp(`${name}(?:__|$)`).test(entry))).toBe(true);

    const samples = await scrollThroughScene(page);
    for (const sample of samples) {
      expect(Math.abs(sample.parallax)).toBeLessThanOrEqual(width < 720 ? 6.01 : 12.01);
      for (const text of sample.texts) expect(overlaps(sample.avatar, text.box), `scrollY ${sample.y}: agent covers ${text.tag} "${text.text}"`).toBe(false);
    }
    // The scroll moves something: the map drifts and the pose changes from the entry to the exit.
    expect(samples.at(-1)!.parallax - samples[0]!.parallax).toBeGreaterThan(width < 720 ? 8 : 20);
    expect(samples[0]!.pose).not.toBe(samples.at(-1)!.pose);
    expect(samples[0]!.gaze).not.toBe("none");
    // In the middle the agent stands calm (on the phone the pose shows only at the edges of the section).
    expect(samples[Math.floor(samples.length / 2)]!.pose).toBe("none");
    await context.close();
  });
}

test("the pause stops the parallax and the scroll pose", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "play");
  await page.getByTestId("bloom-agent-scene-toggle").click();
  await expect(scene).toHaveAttribute("data-state", "stopped");
  const read = () => scene.evaluate((node) => ({
    parallax: getComputedStyle(node.querySelector("[data-bloom-parallax]")!).transform,
    pose: getComputedStyle(node.querySelector("[data-bloom-scroll-pose]")!).transform,
    gaze: getComputedStyle(node.querySelector("[data-bloom-scroll-gaze]")!).transform,
    grid: getComputedStyle(node.querySelector('[data-testid="bloom-agent-stage"]')!, "::before").transform,
  }));
  expect(await read()).toEqual({ parallax: "none", pose: "none", gaze: "none", grid: "none" });
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);
  expect(await read()).toEqual({ parallax: "none", pose: "none", gaze: "none", grid: "none" });
});

/* The scroll animations exist only near the viewport. Far away the page has no running animation from
   the scene, so checks that wait for all finite animations to end (mobile accessibility scan) can finish. */
test("the scroll animations run only while the scene is near the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("load");
  const scene = page.getByTestId("bloom-agent-scene");
  const scrollAnimations = () => page.evaluate(() => document.getAnimations().filter((animation) => animation.timeline !== document.timeline).length);
  await expect.poll(scrollAnimations).toBe(0);
  await expect(scene).not.toHaveAttribute("data-inview");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-inview", "");
  // Map parallax, agent pose, agent gaze and the counter-drift of the dot grid (depth).
  await expect.poll(scrollAnimations).toBe(4);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(scene).not.toHaveAttribute("data-inview");
  await expect.poll(scrollAnimations).toBe(0);
});

/* Chrome does not resolve var() in animation-timing-function inside @keyframes (falls back to linear).
   The keyframes carry literal easings, so the springs of the hop and the node pop really overshoot. */
test("the keyframes use literal easings, the springs of the hop and the node pop work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "play");
  await scene.locator("[data-bloom-hit]").filter({ visible: true }).nth(1).click();
  const easings = await scene.evaluate((node) => Object.fromEntries(
    node.getAnimations({ subtree: true })
      .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
      .map((animation) => [
        /* CSS module names: "bloom-agent-scene_bloom-hop__hash" (production) or "bloom-hop". */
        animation.animationName.match(/(?:^|_)(bloom-(?!agent-scene)[a-z-]+?)(?:__|$)/)?.[1] ?? animation.animationName,
        (animation.effect as KeyframeEffect).getKeyframes().map((frame) => ({ offset: frame.computedOffset, easing: frame.easing })),
      ]),
  ));
  expect(Object.keys(easings)).toEqual(expect.arrayContaining(["bloom-hop", "bloom-head", "bloom-pop"]));
  for (const frames of Object.values(easings)) for (const frame of frames) expect(frame.easing).not.toContain("var(");
  const at = (name: string, offset: number) => easings[name]!.find((frame) => Math.abs(frame.offset - offset) < 0.0005)?.easing ?? "";
  // Landing of the hop (84 %) and the node pop (14 %) settle with springs, the head snaps into its poses.
  expect(at("bloom-hop", 0.84)).toMatch(/^linear\(0 0%, 0\.113 /);
  expect(at("bloom-pop", 0.14)).toMatch(/^linear\(0 0%, 0\.134 /);
  expect(at("bloom-head", 0.05)).toBe("cubic-bezier(0.12, 0.9, 0.2, 1)");
});

test("the press feedback of the agent works while the scene runs, not in the pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const scene = page.getByTestId("bloom-agent-scene");
  const avatar = page.getByTestId("bloom-agent-avatar");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-state", "play");
  const pressed = async () => {
    const box = (await avatar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const transform = await avatar.evaluate((node) => getComputedStyle(node.querySelector("[class*='poke']")!).transform);
    await page.mouse.up();
    return transform;
  };
  expect(await pressed()).not.toBe("none");
  await page.getByTestId("bloom-agent-scene-toggle").click();
  await expect(scene).toHaveAttribute("data-state", "stopped");
  await page.waitForTimeout(800);
  expect(await pressed()).toBe("none");
});
