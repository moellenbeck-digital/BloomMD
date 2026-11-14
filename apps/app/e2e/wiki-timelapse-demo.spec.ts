import { expect, test } from "@playwright/test";

test("Wiki E2E time-lapse demo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/wiki");
  await expect(page.getByTestId("wiki-search")).toBeVisible();
  await page.waitForTimeout(900);

  const search = page.getByTestId("wiki-search");
  await search.fill("graph");
  await expect(page.getByRole("navigation").getByRole("button", { name: "Graph concept" })).toBeVisible();
  await page.waitForTimeout(900);
  await page.getByRole("navigation").getByRole("button", { name: "Graph concept" }).click();
  await expect(page.getByTestId("wiki-citations")).toContainText("Graph specification");
  await page.waitForTimeout(1200);

  await search.fill("");
  await page.getByTestId("wiki-only-problems").check();
  await expect(page.getByRole("button", { name: "Storage" })).toBeVisible();
  await page.waitForTimeout(900);
  await page.getByTestId("wiki-only-problems").uncheck();

  await page.getByTestId("wiki-view-map").click();
  await expect(page.getByTestId("wiki-knowledge-map")).toContainText("defekt");
  await page.waitForTimeout(1200);
  await page.getByTestId("wiki-knowledge-map").getByRole("button", { name: "Storage" }).click();
  await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible();
  await page.waitForTimeout(900);
});
