import { expect, test } from "@playwright/test";

test.describe("auth and workspace invitation handoff", () => {
  test("shows an actionable invalid invitation state in both languages", async ({ page }) => {
    await page.goto("/invite/not-a-real-token");
    await expect(page.getByTestId("workspace-invite-invalid")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dieser Einladungslink ist ungültig oder nicht mehr verfügbar." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur Anmeldung" })).toBeVisible();

    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/invite\/not-a-real-token\?lang=en/);
    await expect(page.getByRole("heading", { name: "This invitation link is invalid or no longer available." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  });

  test("keeps beta messaging out of direct login and signup", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Closed Beta")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Auf die Beta-Warteliste" })).toHaveCount(0);

    await page.goto("/signup");
    await expect(page.getByTestId("beta-access-gate")).toHaveCount(0);
    await expect(page.getByText("Beta-Zugang")).toHaveCount(0);
  });
});
