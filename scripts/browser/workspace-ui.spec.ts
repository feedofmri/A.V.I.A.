import { test, expect, type Page } from "@playwright/test";
const cockpit = process.env.COCKPIT_URL ?? "http://localhost:28080";
async function login(page: Page) {
  await page.goto(cockpit);
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Password", { exact: true }).fill("avia-demo-operator");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("assistant and mission tools have dedicated navigation without displacing overview", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator(".crew-card")).toHaveCount(4);
  await expect(page.getByTestId("software-workspace")).toHaveCount(0);
  await page.locator("#side-nav-assistant").click();
  await expect(
    page.getByRole("region", { name: "A.V.I.A. health assistant" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Health snapshot" }),
  ).toBeVisible();
  await expect(page.locator(".crew-card")).toHaveCount(0);
  await page.locator("#side-nav-tools").click();
  await page.locator('[data-workspace-tab="tasks"]').click();
  await expect(page.getByLabel("Action label")).toBeVisible();
  await page.locator("#side-nav-overview").click();
  await expect(page.locator(".crew-card")).toHaveCount(4);
});
test("mobile assistant is in bounds and the navigation drawer closes after selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Toggle navigation menu" }).click();
  await page.locator("#side-nav-assistant").click();
  await expect(
    page.getByRole("complementary", { name: "Sidebar navigation" }),
  ).not.toBeVisible();
  const ui = page.getByRole("region", { name: "A.V.I.A. health assistant" });
  await expect(ui).toBeVisible();
  const rect = await ui.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(391);
  await ui.getByLabel("Your question").fill("Explain my stored reading.");
  await ui.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(
    ui.getByRole("article", { name: "Assistant result" }),
  ).toBeVisible();
  await page.screenshot({ path: "state/screenshots/assistant-mobile.png" });
});
function luminance(rgb: string) {
  const values = rgb
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number)
    .map((n) => {
      const c = n / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}
test("health cards remain readable in both themes", async ({ page }) => {
  await login(page);
  await page.locator("#side-nav-assistant").click();
  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page.locator("#theme-toggle-btn").click();
    const colors = await page
      .locator(".snapshot-metrics strong")
      .first()
      .evaluate((el) => ({
        text: getComputedStyle(el).color,
        bg: getComputedStyle(el.closest(".context-card")!).backgroundColor,
      }));
    const a = luminance(colors.text),
      b = luminance(colors.bg);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThan(
      4.5,
    );
    await page.screenshot({ path: `state/screenshots/assistant-${theme}.png` });
  }
});
test("scenario results use a readable comparison instead of raw JSON", async ({
  page,
}) => {
  await login(page);
  await page.locator("#side-nav-assistant").click();
  const ui = page.getByRole("region", { name: "A.V.I.A. health assistant" });
  await ui.getByLabel("Assistant role").selectOption("twin");
  await ui.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(
    ui.getByRole("heading", { name: "Your scenario comparison" }),
  ).toBeVisible();
  await expect(ui.getByText("Adjusted scenario", { exact: true })).toHaveCount(
    2,
  );
  await expect(ui.locator("pre")).toHaveCount(0);
  await expect(
    ui.getByRole("heading", { name: "Suit body map" }),
  ).toBeVisible();
});
