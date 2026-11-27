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
/* Two stages, one is displayed: "wide" (viewBox 1000 × 440) from 720 px, "tall" (360 × 470) below. */
const stageRatio = (width: number) => (width >= 720 ? 1000 / 440 : 360 / 470);
/* Only the nodes of the displayed stage count. */
const visibleNodes = (page: Page, selector = "[data-bloom-node]") => page.getByTestId("bloom-agent-scene").locator(selector).filter({ visible: true });
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/* Stops every scene animation at its end state, so boxes are measured on the finished map. */
async function finishScene(page: Page) {
  await page.getByTestId("bloom-agent-scene").evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true })) {
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
    expect(stage && stage.width / stage.height).toBeCloseTo(stageRatio(page.viewportSize()!.width), 1);

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

  test(`${locale.path} plays the scene once per visit and starts on the final image afterwards`, async ({ page }) => {
    await page.goto(locale.path);
    const scene = page.getByTestId("bloom-agent-scene");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");

    await page.reload();
    await expect(scene).toHaveAttribute("data-state", "idle");
    await expect(visibleNodes(page).locator("[data-bloom-title]", { hasText: locale.titles[4] })).toBeVisible();
    await page.getByRole("button", { name: locale.pause }).click();
    await expect(scene).toHaveAttribute("data-state", "stopped");
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

      expect(stage.width / stage.height).toBeCloseTo(stageRatio(width), 1);
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
