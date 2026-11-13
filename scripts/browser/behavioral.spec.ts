import { test, expect, type Page } from "@playwright/test";
const cockpit = process.env.COCKPIT_URL ?? "http://localhost:28080";
async function open(page: Page, crew = false) {
  await page.goto(cockpit);
  await page
    .getByLabel("Username", { exact: true })
    .fill(crew ? "brandt" : "operator");
  await page
    .getByLabel("Password", { exact: true })
    .fill(crew ? "avia-demo-crew" : "avia-demo-operator");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  if (crew)
    await page
      .getByRole("button", { name: "Behavioral health", exact: true })
      .click();
  else await page.locator("#side-nav-behavioral").click();
  return page.getByRole("region", { name: "Behavioral health workspace" });
}
test("mood check-in requires confirmation, persists and can be deleted", async ({
  page,
}) => {
  const ui = await open(page);
  const before = await page.request.get(
    cockpit + "/bff/software/crew/okafor/assistant",
  );
  const ids = new Set(
    (await before.json()).context.observations.map((o: any) => o.id),
  );
  await ui.getByRole("radio", { name: "4 Good", exact: true }).check();
  await ui
    .getByRole("button", { name: "Review check-in", exact: true })
    .click();
  await expect(
    ui.getByRole("region", { name: "Review mood check-in" }),
  ).toBeVisible();
  await ui.getByRole("button", { name: "Edit check-in", exact: true }).click();
  await expect(
    ui.getByRole("button", { name: "Confirm check-in" }),
  ).toHaveCount(0);
  await ui
    .getByRole("button", { name: "Review check-in", exact: true })
    .click();
  await ui.getByRole("button", { name: "Confirm check-in" }).click();
  await expect(ui.getByRole("status")).toContainText("Mood check-in saved");
  await page.reload();
  await page.locator("#side-nav-behavioral").click();
  await expect(
    ui.getByRole("img", { name: "Reported mood over time", exact: false }),
  ).toBeVisible();
  await ui.getByText("View check-in data", { exact: true }).click();
  await expect(ui.getByRole("table")).toContainText("4/5");
  await page.screenshot({ path: "state/screenshots/behavioral-populated.png" });
  const after = await page.request.get(
    cockpit + "/bff/software/crew/okafor/assistant",
  );
  const added = (await after.json()).context.observations.find(
    (o: any) => !ids.has(o.id) && o.kind === "mood",
  );
  expect(added.value).toBe(4);
  page.once("dialog", (d) => d.accept());
  await ui
    .getByRole("button", { name: "Delete check-in", exact: false })
    .first()
    .click();
  await expect(ui.getByRole("status")).toContainText("deleted");
  await expect
    .poll(async () =>
      (
        await (
          await page.request.get(
            cockpit + "/bff/software/crew/okafor/assistant",
          )
        ).json()
      ).context.observations.some((o: any) => o.id === added.id),
    )
    .toBe(false);
});
test("crew journal sharing is visible to operator and revocation removes access", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const crew = await a.newPage(),
    operator = await b.newPage();
  try {
    const ui = await open(crew, true);
    await ui.getByRole("button", { name: "My journal", exact: true }).click();
    const text = "Behavioral privacy test " + Date.now();
    await ui.getByLabel("Journal text", { exact: true }).fill(text);
    await ui.getByRole("button", { name: "Save journal", exact: true }).click();
    const entry = ui
      .getByRole("article", { name: "Journal entry", exact: true })
      .filter({ hasText: text });
    await expect(entry).toContainText("Private");
    const op = await open(operator);
    await operator.locator("#crew-dropdown-btn").click();
    await operator.locator("#crew-tab-brandt").click();
    await op
      .getByRole("button", { name: "Shared journal", exact: true })
      .click();
    await expect(op.getByText(text, { exact: true })).toHaveCount(0);
    await entry
      .getByRole("button", { name: "Share entry", exact: true })
      .click();
    await expect(
      entry.getByRole("button", { name: "Revoke sharing", exact: true }),
    ).toBeVisible();
    await op
      .getByRole("button", { name: "Refresh record", exact: true })
      .click();
    await expect(op.getByText(text, { exact: true })).toBeVisible();
    await expect(
      op.getByRole("button", { name: "Save journal", exact: true }),
    ).toHaveCount(0);
    await entry
      .getByRole("button", { name: "Revoke sharing", exact: true })
      .click();
    await expect(
      entry.getByRole("button", { name: "Share entry", exact: true }),
    ).toBeVisible();
    await op
      .getByRole("button", { name: "Refresh record", exact: true })
      .click();
    await expect(op.getByText(text, { exact: true })).toHaveCount(0);
    crew.once("dialog", (d) => d.accept());
    await entry
      .getByRole("button", { name: "Delete entry", exact: true })
      .click();
    await expect(entry).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});
test("wellbeing assistant uses real local guidance", async ({ page }) => {
  const ui = await open(page);
  await ui
    .getByRole("button", { name: "Wellbeing assistant", exact: true })
    .click();
  await expect(ui.getByLabel("Assistant role")).toHaveValue("wellbeing");
  await ui.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(
    ui.getByRole("article", { name: "Assistant result", exact: true }),
  ).toContainText("Local guidance");
});
test("behavioral layout fits mobile and both themes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(cockpit);
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Password", { exact: true }).fill("avia-demo-operator");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Toggle navigation menu" }).click();
  await page.locator("#side-nav-behavioral").click();
  const ui = page.getByRole("region", { name: "Behavioral health workspace" });
  await expect(
    ui.getByRole("button", { name: "Review check-in", exact: true }),
  ).toBeEnabled();
  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page.locator("#topbar-theme-toggle-btn").click();
    const box = await ui.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    await page.screenshot({
      path: `state/screenshots/behavioral-mobile-${theme}.png`,
      fullPage: true,
    });
  }
});
