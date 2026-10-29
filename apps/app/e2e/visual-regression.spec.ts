import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PASSWORD = "Testpass12345";
function uniqueEmail(label: string) {
  return `visual-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

async function createVisualSession(page: Page, email: string) {
  await page.goto("/signup?next=/app");
  await page.getByLabel("Name").fill("Visual QA");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByTestId("signup-consent").check();
  await page.getByRole("button", { name: "Account erstellen" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/app");
}

async function prepareVisualPage(page: Page, testInfo: TestInfo) {
  const theme = testInfo.project.name.includes("dark") ? "dark" : "light";
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("bloommd-theme", selectedTheme);
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd_demo_guided_seen", "1");
  }, theme);
}

async function stabilizeVisuals(page: Page) {
  await page.addStyleTag({
    content: [
      "*, *::before, *::after {",
      "  animation-duration: 0s !important;",
      "  animation-delay: 0s !important;",
      "  transition-duration: 0s !important;",
      "  transition-delay: 0s !important;",
      "  caret-color: transparent !important;",
      "}",
    ].join("\n"),
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function openCommandPalette(page: Page) {
  await page.keyboard.press("Control+K");
  if (await page.getByTestId("command-palette").count() === 0) {
    await page.keyboard.press("Meta+K");
  }
  await expect(page.getByTestId("command-palette")).toBeVisible();
}

test.describe("M1 visual regression", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await prepareVisualPage(page, testInfo);
  });

  test("private beta page stays visually stable", async ({ page }) => {
    await page.goto("/beta");
    await expect(page.getByRole("heading", { name: "Danke, dass du BloomMD testest." })).toBeVisible();
    await stabilizeVisuals(page);
    await expect(page).toHaveScreenshot("beta-page.png");
  });

  test("app canvas, sidebar, editor and command palette stay visually stable", async ({ page }) => {
    await createVisualSession(page, uniqueEmail("app"));
    await expect(page.getByTestId("mindmap-canvas")).toBeVisible();
    await expect(page.locator('[data-node-label="Visual QA Workspace"]').first()).toBeVisible();

    await page.getByTitle(/Open file browser/i).click();
    await expect(page.getByTestId("file-drawer")).toBeVisible();
    await stabilizeVisuals(page);
    await expect(page).toHaveScreenshot("app-file-drawer.png");

    await page.getByTestId("file-drawer").locator("button").first().click();
    const rootNode = page.locator('[data-node-label="Visual QA Workspace"]').first();
    await rootNode.click();
    await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await stabilizeVisuals(page);
    await expect(page).toHaveScreenshot("app-editor.png");

    await openCommandPalette(page);
    await stabilizeVisuals(page);
    await expect(page).toHaveScreenshot("app-command-palette.png");
  });

  test("web About dialog stays visually stable across themes and viewport sizes", async ({ page }) => {
    await createVisualSession(page, uniqueEmail("about"));
    await expect(page.getByTestId("mindmap-canvas")).toBeVisible();

    if (await page.getByTestId("mobile-about").isVisible()) {
      await page.getByTestId("mobile-about").click();
    } else {
      await page.getByTestId("toolbar-help-menu").click();
      await page.getByTestId("toolbar-about").click();
    }
    await expect(page.getByTestId("about-dialog")).toBeVisible();
    await stabilizeVisuals(page);
    await page.evaluate(() => {
      document.querySelectorAll("nextjs-portal, script[data-nextjs-dev-overlay]").forEach((element) => {
        element.style.setProperty("display", "none", "important");
        (element as HTMLElement).shadowRoot
          ?.querySelectorAll("[data-nextjs-toast], [data-nextjs-dev-tools-button]")
          .forEach((child) => child.setAttribute("style", "display: none !important;"));
      });
    });
    await expect(await page.getByTestId("about-dialog").screenshot()).toMatchSnapshot("app-about-dialog.png");
  });
});
