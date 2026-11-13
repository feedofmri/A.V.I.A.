import { test, expect, type Page } from "@playwright/test";
const cockpit = process.env.COCKPIT_URL ?? "http://localhost:28080",
  pulse = process.env.PULSE_URL ?? "http://localhost:28081";
async function signIn(
  page: Page,
  url = cockpit,
  username = "operator",
  password = "avia-demo-operator",
) {
  await page.goto(url);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function tools(page: Page, tab: string) {
  if (await page.locator("#side-nav-tools").count()) {
    if (!(await page.locator("#side-nav-tools").isVisible()))
      await page
        .getByRole("button", { name: "Toggle navigation menu" })
        .click();
    await page.locator("#side-nav-tools").click();
  } else
    await page
      .getByRole("button", { name: "Mission tools", exact: true })
      .click();
  const panel = page.getByTestId("software-workspace");
  await panel.locator(`[data-workspace-tab="${tab}"]`).click();
  return panel;
}
test("operator loads crew, guidance and no external runtime dependencies", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://localhost:") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await signIn(page);
  await expect(page.locator(".crew-card")).toHaveCount(4);
  await page.screenshot({
    path: "state/screenshots/cockpit.png",
    fullPage: true,
  });
  const panel = await tools(page, "guide");
  await expect(
    panel.getByRole("heading", { name: "Spaceflight context" }),
  ).toBeVisible();
  await expect(
    panel.getByText("Clinical review is not established.", { exact: false }),
  ).toBeVisible();
  expect(external).toEqual([]);
});
test("analytics has UTC dates, declared extrapolation and accessible data", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("#side-nav-analytics").click();
  await page.locator("#vital-tile-spo2").click();
  await expect(
    page.getByRole("img", {
      name: "SpO₂ history and experimental extrapolation",
    }),
  ).toBeVisible();
  await page.getByText("Accessible data table", { exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "UTC time" }),
  ).toBeVisible();
});
test("CSV import is durable and accepts historical observations", async ({
  page,
}) => {
  await signIn(page);
  const panel = await tools(page, "import");
  await panel.getByLabel("Import telemetry CSV").setInputFiles({
    name: "example.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "recorded_at,hr_bpm,spo2_pct,eda_tonic_us,hrv_rmssd_ms,sleep_duration_hr\n" +
        new Date(Date.now() - 7200000).toISOString() +
        ",61,98,1.9,62,7.5\n",
    ),
  });
  await expect(panel.getByRole("status")).toContainText("1 readings saved");
});
test("offline symptoms survive reload and replay after reconnect", async ({
  page,
  context,
}) => {
  await signIn(page, pulse, "brandt", "avia-demo-crew");
  await expect(
    page.getByRole("heading", { name: "A.V.I.A. Pulse" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Symptom log", exact: true }).click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Fatigue", exact: true }).click();
  await expect(page.locator(".platform-session")).toContainText("1 queued");
  await page.reload();
  await expect(page.locator(".platform-session")).toContainText("1 queued");
  await context.setOffline(false);
  await page.getByRole("button", { name: "Retry pending" }).click();
  await expect(page.locator(".platform-session")).toContainText("0 queued", {
    timeout: 30000,
  });
});
test("private journal can be shared and sharing revoked", async ({ page }) => {
  await signIn(page, pulse, "brandt", "avia-demo-crew");
  const panel = await tools(page, "journal");
  const text = "Browser privacy demonstration " + Date.now();
  await panel.getByLabel("Journal text", { exact: true }).fill(text);
  await panel.getByRole("button", { name: "Save journal" }).click();
  const entry = panel.getByRole("article").filter({ hasText: text });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "Share entry", exact: true }).click();
  await expect(
    entry.getByRole("button", { name: "Revoke sharing" }),
  ).toBeVisible();
  await entry.getByRole("button", { name: "Revoke sharing" }).click();
  await expect(
    entry.getByRole("button", { name: "Share entry" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await entry.getByRole("button", { name: "Delete entry" }).click();
  await expect(entry).toHaveCount(0);
});
test("crew account cannot select another crew", async ({ page }) => {
  await signIn(page, pulse, "sato", "avia-demo-crew");
  await expect(page.locator(".rail .crew")).toHaveCount(1);
  await expect(page.locator(".rail .crew")).toContainText("Sato");
  const response = await page.request.get(
    pulse + "/bff/software/crew/brandt/journal",
  );
  expect(response.status()).toBe(403);
});
test("twin scenario updates results and can be navigated repeatedly", async ({
  page,
}) => {
  await signIn(page);
  for (let i = 0; i < 2; i++) {
    await page.locator("#side-nav-twin").click();
    await expect(page.locator("#suit-zone-banner")).toBeVisible();
    await page.locator("#suit-preset-left-breach").click();
    await expect(page.locator("#suit-zone-banner")).toContainText(/left/i);
    await page.locator("#side-nav-overview").click();
  }
});
test("mobile navigation and keyboard focus are usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "Toggle navigation menu" }).click();
  await page.locator("#side-nav-alerts").click();
  await expect(page.getByText("Alerts", { exact: true }).last()).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
});
test("invalid imported rows remain visible for correction after reload", async ({
  page,
}) => {
  await signIn(page);
  let panel = await tools(page, "import");
  await panel.getByLabel("Import telemetry CSV").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "hr_bpm,spo2_pct,eda_tonic_us,hrv_rmssd_ms,sleep_duration_hr\n260,98,1.9,62,7.5\n",
    ),
  });
  panel = await tools(page, "queue");
  await expect(
    panel.getByRole("article").filter({ hasText: "failed" }),
  ).toBeVisible();
  await page.reload();
  panel = await tools(page, "queue");
  await expect(
    panel.getByRole("article").filter({ hasText: "failed" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(panel.getByText("No queued operations.")).toBeVisible();
});
test("complete assessment-to-action workflow converges across both applications", async ({
  browser,
}) => {
  const operatorContext = await browser.newContext(),
    crewContext = await browser.newContext();
  const operator = await operatorContext.newPage(),
    crewPage = await crewContext.newPage();
  try {
    await signIn(operator);
    let panel = await tools(operator, "tasks");
    await panel
      .getByRole("combobox", { name: "Crew", exact: true })
      .selectOption("brandt");
    const label = "Browser review action " + Date.now();
    await panel.getByLabel("Action label").fill(label);
    await panel.getByRole("button", { name: "Schedule action" }).click();
    await expect(panel.getByRole("status")).toContainText("Action scheduled");
    await signIn(crewPage, pulse, "brandt", "avia-demo-crew");
    const crewTools = await tools(crewPage, "tasks");
    await expect(crewTools.getByLabel(label, { exact: false })).toBeVisible();
    await crewTools.getByLabel(label, { exact: false }).check();
    await expect(crewPage.locator(".platform-session")).toContainText(
      "0 queued",
    );
    await expect
      .poll(async () => {
        const r = await operator.request.get(
          cockpit + "/bff/software/crew/brandt/tasks",
        );
        return (await r.json()).find((t) => t.label === label)?.done;
      })
      .toBe(true);
    const r = await operator.request.post(
      cockpit + "/bff/api/v1/pulse/ingest",
      {
        data: {
          crew_id: "brandt",
          hr_bpm: 61,
          spo2_pct: 80,
          eda_tonic_us: 1.9,
          hrv_rmssd_ms: 62,
          sleep_duration_hr: 7.5,
          event_id: crypto.randomUUID(),
        },
      },
    );
    expect(r.status()).toBe(201);
    const body = await r.json(),
      alert = body.active_alerts.find((a) => a.kind === "hypoxia");
    await operator.locator("#side-nav-alerts").click();
    await expect(operator.locator("#alert-row-" + alert.id)).toBeVisible({
      timeout: 30000,
    });
    await operator.locator("#alert-row-" + alert.id).click();
    const acknowledge = operator.getByRole("button", { name: "Acknowledge alert", exact: true });
    if (alert.state === "open") await acknowledge.click();
    else {
      expect(alert.state).toBe("acknowledged");
      await expect(acknowledge).toBeDisabled();
    }
    await expect(
      crewPage.getByRole("region", { name: "Stored alerts" }),
    ).toContainText("acknowledged", { timeout: 30000 });
    await operator.screenshot({
      path: "state/screenshots/alerts.png",
      fullPage: true,
    });
    await crewPage.screenshot({
      path: "state/screenshots/pulse.png",
      fullPage: true,
    });
  } finally {
    await operatorContext.close().catch(() => {});
    await crewContext.close().catch(() => {});
  }
});
