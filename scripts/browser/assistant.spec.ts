import { test, expect, type Page } from "@playwright/test";
const cockpit = process.env.COCKPIT_URL ?? "http://localhost:28080",
  pulse = process.env.PULSE_URL ?? "http://localhost:28081";
async function open(page: Page, crew = false) {
  await page.goto(crew ? pulse : cockpit);
  await page
    .getByLabel("Username", { exact: true })
    .fill(crew ? "brandt" : "operator");
  await page
    .getByLabel("Password", { exact: true })
    .fill(crew ? "avia-demo-crew" : "avia-demo-operator");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  if (crew) {
    const reset = await page.request.put(
      pulse + "/bff/software/crew/brandt/assistant/consent",
      { data: { cloud: false, journal: false } },
    );
    expect(reset.ok()).toBe(true);
  }
  if (crew)
    await page
      .getByRole("button", { name: "Health assistant", exact: true })
      .click();
  else await page.locator("#side-nav-assistant").click();
  const panel = page.getByTestId("software-workspace");
  return panel.getByRole("region", { name: "A.V.I.A. health assistant" });
}
test("assistant explains local evidence and confirms a proposed task", async ({
  page,
}) => {
  const ui = await open(page);
  await ui.getByLabel("Assistant role").selectOption("action");
  await ui.getByRole("button", { name: "Ask assistant", exact: true }).click();
  const result = ui.getByRole("article", { name: "Assistant result" });
  await expect(result).toBeVisible();
  await expect(
    result.getByText("Local guidance:", { exact: false }),
  ).toBeVisible();
  await result
    .getByRole("button", { name: "Confirm task", exact: true })
    .first()
    .click();
  await expect(
    result.getByText("server acknowledged", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "state/screenshots/assistant.png",
    fullPage: true,
  });
  await page.reload();
  await page.locator("#side-nav-assistant").click();
  await expect(
    page.getByRole("heading", { name: "Recent reviews" }),
  ).toBeVisible();
});
test("crew observation is proposed, confirmed and retained across reload", async ({
  page,
}) => {
  const ui = await open(page, true);
  await ui.getByRole("button", { name: "Prepare an observation" }).click();
  await ui.getByLabel("Observation kind").selectOption("hydration");
  await ui.getByLabel("Value (mL)", { exact: true }).fill("250");
  await ui.getByRole("button", { name: "Review proposed observation" }).click();
  await ui
    .getByRole("button", { name: "Confirm observation", exact: true })
    .click();
  await expect(ui.getByText("hydration: 250", { exact: false })).toBeVisible();
  await ui
    .getByRole("button", { name: "Delete observation", exact: true })
    .last()
    .click();
});
test("cloud and journal preferences are separate and revocable", async ({
  page,
}) => {
  const ui = await open(page, true);
  await ui.getByText("Privacy & processing", { exact: true }).click();
  const cloud = ui.getByLabel("Allow sending my question", { exact: false }),
    journal = ui.getByLabel("Separately allow processing", { exact: false });
  await expect(journal).toBeDisabled();
  await cloud.check();
  await journal.check();
  await ui.getByRole("button", { name: "Save processing preferences" }).click();
  await expect(ui.getByRole("status")).toContainText("saved");
  await cloud.uncheck();
  await ui.getByRole("button", { name: "Save processing preferences" }).click();
  await expect(journal).not.toBeChecked();
  await expect(journal).toBeDisabled();
});
