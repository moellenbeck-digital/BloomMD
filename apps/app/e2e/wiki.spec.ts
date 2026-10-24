import { expect, test } from "@playwright/test";

/**
 * The Wiki view runs against a fixture bundle containing exactly the awkward cases: a link to a
 * page that does not exist, a local image that is missing, and a remote image.
 */

test.describe("Wiki previews stay opt-in", () => {
  test("opening a page makes no request to a third party", async ({ page }) => {
    // The previous implementation rendered <img src={remoteUrl}> for every external image as soon
    // as a page opened, which told a third-party server who was reading which page. This asserts
    // the behaviour rather than the markup, so any route back to eager loading fails here.
    const external: string[] = [];
    await page.route("**://example.com/**", (route) => {
      external.push(route.request().url());
      return route.abort();
    });

    await page.goto("/wiki");
    await expect(page.getByTestId("wiki-search")).toBeVisible();
    await page.getByRole("button", { name: "Graph" }).first().click();
    await page.waitForTimeout(500);

    expect(external, `No request may leave the page before a click: ${external.join(", ")}`).toEqual([]);
  });

  test("a remote preview loads only after the reader asks for it", async ({ page }) => {
    let requested = false;
    await page.route("**://example.com/remote-diagram.png", (route) => {
      requested = true;
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("") });
    });

    await page.goto("/wiki");
    await page.getByRole("button", { name: "Graph" }).first().click();

    const request = page.getByTestId("wiki-preview-request").first();
    await expect(request).toBeVisible();
    // The button has to say what pressing it will do.
    await expect(request).toContainText("example.com");
    expect(requested).toBe(false);

    await request.click();
    await page.waitForTimeout(500);
    expect(requested).toBe(true);
  });
});

test.describe("Broken references stay visible", () => {
  test("a missing local file is reported rather than dropped", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "Graph" }).first().click();
    await expect(page.getByTestId("wiki-reference-missing").first()).toBeVisible();
  });

  test("a page without citations says so", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "Storage" }).first().click();
    await expect(page.getByTestId("wiki-citations")).toContainText("keine Quelle");
  });

  test("a page with citations lists them with their hash", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "Graph" }).first().click();
    await expect(page.getByTestId("wiki-citations")).toContainText("Graph specification");
    await expect(page.getByTestId("wiki-citations")).toContainText("sha256:aaa");
  });
});

test.describe("Search and the Knowledge Map", () => {
  test("search narrows by title, tag and status", async ({ page }) => {
    await page.goto("/wiki");
    const search = page.getByTestId("wiki-search");

    await search.fill("storage");
    await expect(page.getByRole("button", { name: "Storage" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Graph", exact: true })).toHaveCount(0);

    await search.fill("draft");
    await expect(page.getByRole("button", { name: "Storage" })).toBeVisible();
  });

  test("the problem filter surfaces pages that need attention", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByTestId("wiki-only-problems").check();
    // Storage has no citations; Graph has a broken link and a missing file.
    await expect(page.getByRole("button", { name: "Storage" })).toBeVisible();
  });

  test("the Knowledge Map is its own view and shows broken links", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByTestId("wiki-view-map").click();

    const map = page.getByTestId("wiki-knowledge-map");
    await expect(map).toBeVisible();
    await expect(map).toContainText("defekt");
    await expect(map).toContainText("ohne Quelle");
  });

  test("selecting a node in the map opens that page", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByTestId("wiki-view-map").click();
    await page.getByTestId("wiki-knowledge-map").getByRole("button", { name: "Storage" }).click();

    await expect(page.getByTestId("wiki-search")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible();
  });
});
