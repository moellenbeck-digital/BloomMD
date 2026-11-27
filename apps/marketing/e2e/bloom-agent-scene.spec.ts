import { expect, test, type Page } from "@playwright/test";

const locales = [
  {
    path: "/",
    label: /MD-Agent pflanzt einen Samen/,
    pause: "Animation anhalten",
    play: "Animation abspielen",
    titles: ["strategie.md", "Strategie", "Ziele", "Initiativen", "Kundenbindung", "Startrisiko"],
  },
  {
    path: "/en",
    label: /MD agent plants a seed/,
    pause: "Pause animation",
    play: "Play animation",
    titles: ["strategy.md", "Product Strategy", "Goals", "Initiatives", "Retention", "Launch risk"],
  },
] as const;

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
    const box = await scene.boundingBox();
    expect(box && box.width / box.height).toBeCloseTo(440 / 320, 1);

    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-state", "play");
    const toggle = page.getByRole("button", { name: locale.pause });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(scene).toHaveAttribute("data-state", "stopped");
    await page.getByRole("button", { name: locale.play }).click();
    await expect(scene).toHaveAttribute("data-state", "play");
  });

  test(`${locale.path} map nodes carry the titles of the landing page example map`, async ({ page }) => {
    await page.goto(locale.path);
    const texts = await page.getByTestId("bloom-agent-scene").locator("[data-bloom-node] text").allTextContents();
    expect(texts.filter((text) => !/^#+$/.test(text))).toEqual([...locale.titles]);
  });

  for (const width of [390, 768, 1440]) {
    test(`${locale.path} at ${width}px: the pause button has its own space and titles fit their nodes`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(locale.path);
      const scene = page.getByTestId("bloom-agent-scene");
      await scene.scrollIntoViewIfNeeded();
      await expect(scene).toHaveAttribute("data-state", "play");
      await finishScene(page);

      const toggle = await page.getByTestId("bloom-agent-scene-toggle").boundingBox();
      const sceneBox = await scene.boundingBox();
      expect(toggle && sceneBox).toBeTruthy();
      expect(toggle!.width).toBeGreaterThanOrEqual(44);
      expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(sceneBox!.x + sceneBox!.width + 0.5);
      expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(sceneBox!.y + sceneBox!.height + 0.5);

      const nodes = scene.locator("[data-bloom-node]");
      const count = await nodes.count();
      expect(count).toBe(6);
      for (let index = 0; index < count; index += 1) {
        const node = await nodes.nth(index).boundingBox();
        expect(node).toBeTruthy();
        const overlaps = node!.x < toggle!.x + toggle!.width && toggle!.x < node!.x + node!.width && node!.y < toggle!.y + toggle!.height && toggle!.y < node!.y + node!.height;
        expect(overlaps, `node ${index} overlaps the pause button`).toBe(false);
      }

      const fits = await nodes.evaluateAll((groups) =>
        groups.every((group) => {
          const rect = group.querySelector("rect")!.getBoundingClientRect();
          return [...group.querySelectorAll("text")].every((text) => {
            const box = text.getBoundingClientRect();
            return box.left >= rect.left + 1 && box.right <= rect.right - 1;
          });
        }),
      );
      expect(fits).toBe(true);
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
  await expect(scene.locator("[data-bloom-node] text", { hasText: "Startrisiko" })).toBeVisible();
  await context.close();
});
