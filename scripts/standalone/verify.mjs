import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const file = path.resolve(
  process.argv[2] ?? "state/standalone/AVIA-Standalone/index.html",
);
const url = pathToFileURL(file).href;
const output = path.resolve("state/standalone-verification");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  offline: true,
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [],
  network = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (/^https?:/.test(r.url())) network.push(r.url());
});
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
async function local(route, method = "GET", body) {
  return page.evaluate(
    async ({ route, method, body }) => {
      const r = await fetch("/bff" + route, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    },
    { route, method, body },
  );
}
async function settle() {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
try {
  await check("file:// startup while completely offline", async () => {
    await page.goto(url);
    await expect(page.locator(".crew-card")).toHaveCount(4);
    await expect(
      page.getByText("LOCAL DEMO · browser data · no live inference", {
        exact: false,
      }),
    ).toBeVisible();
    await settle();
    await page.screenshot({ path: path.join(output, "cockpit-overview.png") });
  });
  await check("all Cockpit destinations", async () => {
    for (const view of [
      "analytics",
      "alerts",
      "twin",
      "behavioral",
      "assistant",
      "tools",
      "setup",
      "overview",
    ]) {
      await page.locator("#side-nav-" + view).click();
      if (view === "twin") {
        await expect(page.locator("canvas").last()).toBeVisible();
        await expect(page.locator("#suit-zone-banner")).toBeVisible();
      }
      if (view === "assistant")
        await expect(
          page.getByRole("heading", { name: "Health snapshot" }),
        ).toBeVisible();
      if (view === "behavioral")
        await expect(
          page.getByRole("region", { name: "Behavioral health workspace" }),
        ).toBeVisible();
      await settle();
      await page.screenshot({ path: path.join(output, `cockpit-${view}.png`) });
    }
  });
  await check("analytics metrics and ranges", async () => {
    await page.locator("#side-nav-analytics").click();
    for (const metric of ["hr", "spo2", "eda", "hrv", "sleep"])
      for (const range of ["24h", "7d", "30d"]) {
        await page.locator("#vital-tile-" + metric).click();
        await page.locator("#range-tab-" + range).click();
        await expect(page.locator('svg[role="img"]')).toBeVisible();
      }
  });
  await check("twin layers, WebGL render and pressure preset", async () => {
    await page.locator("#side-nav-twin").click();
    for (const layer of ["dermal", "skeletal", "cardio"])
      await page.locator("#twin-layer-" + layer).click();
    await page.locator("#suit-preset-left-breach").click();
    await expect(page.locator("#suit-zone-banner")).toContainText(/left/i);
    await page.screenshot({ path: path.join(output, "twin-left-arm.png") });
    await page.locator("#theme-toggle-btn").click();
    await page
      .getByRole("button", { name: "Auto-rotate", exact: true })
      .click();
    const canvas = page.locator("canvas").last();
    const before = await canvas.screenshot();
    await page.waitForTimeout(180);
    const after = await canvas.screenshot();
    expect(before.equals(after)).toBe(false);
    await page
      .getByRole("button", { name: "Auto-rotate", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.screenshot({ path: path.join(output, "twin-light.png") });
    await page.locator("#theme-toggle-btn").click();
  });
  await check("offline CSV import and task outbox drain", async () => {
    await page.locator("#side-nav-tools").click();
    await page.locator('[data-workspace-tab="import"]').click();
    await page.getByLabel("Import telemetry CSV").setInputFiles({
      name: "demo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "recorded_at,hr_bpm,spo2_pct,eda_tonic_us,hrv_rmssd_ms,sleep_duration_hr\n" +
          new Date().toISOString() +
          ",74,98,2.2,54,7.1\n",
      ),
    });
    await expect
      .poll(
        async () =>
          (await local("/cockpit/crew/okafor/state")).data.vitals_current
            .hr_bpm,
      )
      .toBe(74);
    await page.locator('[data-workspace-tab="tasks"]').click();
    await page
      .getByLabel("Action label", { exact: true })
      .fill("Offline UI task");
    await page
      .getByRole("button", { name: "Schedule action", exact: true })
      .click();
    const row = page
      .locator(".workspace-task")
      .filter({ hasText: "Offline UI task" });
    await expect(row).toBeVisible();
    await row.getByRole("checkbox").check();
    await expect
      .poll(
        async () =>
          (await local("/software/crew/okafor/tasks")).data.find(
            (t) => t.label === "Offline UI task",
          )?.done,
      )
      .toBe(true);
    await expect(page.locator('.platform-session [role="status"]')).toHaveText(
      "0 queued",
    );
  });
  await check(
    "mission configuration form and confirmed mood persist",
    async () => {
      await page.locator("#side-nav-setup").click();
      await expect(page.locator("#setup-mission-mission_day")).toHaveValue(
        "142",
      );
      await page.locator("#setup-mission-mission_day").fill("143");
      await page.locator("#setup-save-btn").click();
      await expect(page.locator("#setup-save-btn")).toContainText(
        "Configuration saved",
      );
      expect((await local("/cockpit/mission")).data.mission_day).toBe(143);
      await page.locator("#side-nav-behavioral").click();
      await page.getByRole("radio", { name: "4 Good", exact: true }).check();
      await page
        .getByRole("button", { name: "Review check-in", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm check-in", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Mood check-in saved" }),
      ).toBeVisible();
    },
  );
  await check("all Mission tools tabs", async () => {
    await page.locator("#side-nav-tools").click();
    for (const tab of [
      "guide",
      "import",
      "tasks",
      "journal",
      "queue",
      "history",
    ]) {
      await page.locator(`[data-workspace-tab="${tab}"]`).click();
      await expect(page.getByTestId("software-workspace")).toBeVisible();
    }
  });
  await check("local assistant, confirmed observation and task", async () => {
    await page.locator("#side-nav-assistant").click();
    const assistant = page.getByRole("region", {
      name: "A.V.I.A. health assistant",
    });
    await assistant
      .getByRole("button", { name: "Prepare an observation" })
      .click();
    await assistant.getByLabel("Observation kind").selectOption("hydration");
    await assistant.getByLabel("Value (mL)", { exact: true }).fill("250");
    await assistant
      .getByRole("button", { name: "Review proposed observation" })
      .click();
    await assistant
      .getByRole("button", { name: "Confirm observation", exact: true })
      .click();
    await expect(
      assistant.getByText("hydration: 250", { exact: false }),
    ).toBeVisible();
    await assistant.getByLabel("Assistant role").selectOption("action");
    await assistant
      .getByRole("button", { name: "Ask assistant", exact: true })
      .click();
    await assistant
      .getByRole("button", { name: "Confirm task", exact: true })
      .click();
    await expect(
      assistant.getByText("saved in this browser", { exact: false }).first(),
    ).toBeVisible();
    const saved = await local("/software/crew/okafor/tasks");
    expect(
      saved.data.some(
        (t) => t.label === "Review latest crew health observations",
      ),
    ).toBe(true);
  });
  await check(
    "configuration, alerts and tasks persist through reload",
    async () => {
      const alerts = await local("/cockpit/alerts");
      const a = alerts.data[0];
      expect(
        (
          await local(`/cockpit/crew/${a.crewId}/alerts/${a.id}`, "PATCH", {
            state: "acknowledged",
          })
        ).status,
      ).toBe(200);
      const ts = await local("/software/crew/okafor/tasks");
      const task = ts.data[0];
      expect(
        (
          await local(`/software/crew/okafor/tasks/${task.id}`, "PATCH", {
            done: true,
          })
        ).status,
      ).toBe(200);
      await local("/cockpit/mission", "PUT", {
        name: "Standalone verification mission",
      });
      await page.reload();
      await expect(page.locator(".crew-card")).toHaveCount(4);
      expect((await local("/cockpit/mission")).data.name).toBe(
        "Standalone verification mission",
      );
      expect(
        (await local("/software/crew/okafor/tasks")).data.find(
          (t) => t.id === task.id,
        ).done,
      ).toBe(true);
      expect(
        (await local("/cockpit/alerts?state=all")).data.find(
          (x) => x.id === a.id,
        ).state,
      ).toBe("acknowledged");
    },
  );
  await check(
    "telemetry updates shared local database while offline",
    async () => {
      const r = await local("/api/v1/pulse/ingest", "POST", {
        crew_id: "sato",
        hr_bpm: 75,
        spo2_pct: 97,
        eda_tonic_us: 2.4,
        hrv_rmssd_ms: 48,
        sleep_duration_hr: 7.2,
        recorded_at: new Date().toISOString(),
        event_id: crypto.randomUUID(),
      });
      expect(r.status).toBe(200);
      expect(r.data.vitals_current.hr_bpm).toBe(75);
      await page.goto(url + "?app=pulse&user=sato");
      await expect(page.locator(".rail .crew")).toHaveCount(1);
      await expect(page.locator(".rail .crew")).toContainText("75");
      await expect(
        page.getByText("Local demo data", { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: path.join(output, "pulse-dashboard.png") });
    },
  );
  await check("Pulse navigation, owner journal and crew scope", async () => {
    for (const name of ["Health assistant", "Mission tools"])
      await page.getByRole("button", { name, exact: true }).click();
    await page.locator('[data-workspace-tab="journal"]').click();
    await page
      .getByLabel("Journal text", { exact: true })
      .fill("Fictional standalone persistence check");
    await page
      .getByRole("button", { name: "Save journal", exact: true })
      .click();
    await expect(
      page.getByText("Fictional standalone persistence check", { exact: true }),
    ).toBeVisible();
    expect((await local("/software/crew/brandt/journal")).status).toBe(403);
    await page.reload();
    await page
      .getByRole("button", { name: "Mission tools", exact: true })
      .click();
    await page.locator('[data-workspace-tab="journal"]').click();
    await expect(
      page.getByText("Fictional standalone persistence check", { exact: true }),
    ).toBeVisible();
  });
  await check("browser database export", async () => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export local data" }).click();
    const download = await pending;
    await download.saveAs(path.join(output, "exported-database.json"));
    const db = JSON.parse(
      await fs.readFile(path.join(output, "exported-database.json"), "utf8"),
    );
    expect(db.crew.sato.telemetry.hr_bpm).toBe(75);
  });
  await check("responsive navigation at mobile width", async () => {
    await page.goto(url + "?user=operator");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await page.locator("#side-nav-assistant").click();
    const box = await page
      .getByRole("region", { name: "A.V.I.A. health assistant" })
      .boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    await page.screenshot({
      path: path.join(output, "mobile-assistant.png"),
      fullPage: true,
    });
  });
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  console.log(
    JSON.stringify(
      { checks: checks.length, errors, networkRequests: network },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(output, "report.json"),
    JSON.stringify({ file, checks, errors, networkRequests: network }, null, 2),
  );
} finally {
  await browser.close();
}
