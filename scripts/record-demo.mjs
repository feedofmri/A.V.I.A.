// Record a reproducible, real browser walkthrough against a disposable test stack.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const url = process.env.COCKPIT_URL ?? "http://localhost:28080";
if (!url.includes(":28080") && !process.argv.includes("--allow-demo-host"))
  throw new Error(
    "Use a disposable demo host or explicitly pass --allow-demo-host.",
  );
fs.mkdirSync("state/demo", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: "state/demo", size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
const video = page.video();
async function caption(text) {
  await page.evaluate((text) => {
    document.getElementById("demo-caption")?.remove();
    const el = document.createElement("div");
    el.id = "demo-caption";
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed",
      bottom: "0",
      left: "0",
      right: "0",
      padding: "18px 28px",
      background: "#08182bf5",
      color: "white",
      font: "600 20px system-ui",
      zIndex: "99999",
      borderTop: "2px solid #54dce4",
    });
    document.body.append(el);
  }, text);
}
async function linger(ms = 4000) {
  await new Promise((r) => setTimeout(r, ms));
}
try {
  await page.goto(url);
  await page.getByLabel("Username", { exact: true }).fill("operator");
  await page.getByLabel("Password", { exact: true }).fill("avia-demo-operator");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).waitFor();
  await caption(
    "A.V.I.A. — fictional crew data, existing models, clear evidence and follow-up.",
  );
  await linger();
  await page.locator("#side-nav-assistant").click();
  const panel = page.getByTestId("software-workspace");
  await panel.getByRole("combobox").first().selectOption("brandt");
  const assistant = page.getByRole("region", {
    name: "A.V.I.A. health assistant",
  });
  await assistant.scrollIntoViewIfNeeded();
  await caption(
    "The assistant uses the current record. Cloud processing is optional and separately consented.",
  );
  await linger();
  async function recordReading(oxygen, heart = "61") {
    await assistant.getByLabel("Assistant role").selectOption("intake");
    if (!(await assistant.getByLabel("Observation kind").isVisible()))
      await assistant
        .getByRole("button", { name: "Prepare an observation" })
        .click();
    await assistant.getByLabel("Observation kind").selectOption("telemetry");
    await assistant
      .getByLabel("Observed at (UTC)")
      .fill(new Date().toISOString().slice(0, 19));
    for (const [label, value] of [
      ["Heart rate (bpm)", heart],
      ["Oxygen saturation (%)", oxygen],
      ["EDA (µS)", "1.9"],
      ["HRV (ms)", "62"],
      ["Sleep duration (hours)", "7.5"],
    ])
      await assistant.getByLabel(label, { exact: true }).fill(value);
    await assistant
      .getByRole("button", { name: "Review proposed observation" })
      .click();
    await assistant
      .getByRole("button", { name: "Confirm observation", exact: true })
      .click();
    await assistant
      .getByText(
        "Observation saved and assessed. Stored evidence has been refreshed.",
        { exact: true },
      )
      .waitFor();
    await assistant
      .getByRole("heading", { name: "Health snapshot" })
      .scrollIntoViewIfNeeded();
  }
  await recordReading("98");
  await caption(
    "A fictional baseline reading is reviewed, confirmed and assessed through the actual software pipeline.",
  );
  await linger(3000);
  await recordReading("86", "100");
  await caption(
    "A low-oxygen example triggers the local assessment and Critical guardrail, independently of Meta.",
  );
  await linger(4000);
  await assistant.getByLabel("Assistant role").selectOption("action");
  await assistant
    .getByRole("button", { name: "Ask assistant", exact: true })
    .click();
  const result = assistant.getByRole("article", { name: "Assistant result" });
  await result.waitFor();
  await result.scrollIntoViewIfNeeded();
  await caption(
    "Without a cloud call, approved local guidance and citations remain available.",
  );
  await linger();
  const confirm = result
    .getByRole("button", { name: "Confirm task", exact: true })
    .first();
  await confirm.scrollIntoViewIfNeeded();
  await confirm.click();
  await result.getByText("server acknowledged", { exact: false }).waitFor();
  await caption(
    "A proposed action becomes a stored task only after explicit confirmation. Replays are idempotent.",
  );
  await linger();
  await recordReading("98");
  await caption(
    "A follow-up observation updates the stored evidence and history. The application does not invent a recovery outcome.",
  );
  await linger(3000);
  await assistant.getByLabel("Assistant role").selectOption("twin");
  await assistant
    .getByRole("button", { name: "Ask assistant", exact: true })
    .click();
  await assistant.getByRole("article", { name: "Assistant result" }).waitFor();
  const scenario = assistant.getByText("Scenario assumptions and results", {
    exact: true,
  });
  if (!(await scenario.evaluate((el) => el.parentElement.open)))
    await scenario.click();
  await scenario.scrollIntoViewIfNeeded();
  await caption(
    "Twin scenarios run the existing models and expose their assumptions. Simulations are labeled.",
  );
  await linger();
  await assistant.getByLabel("Assistant role").selectOption("briefing");
  await assistant
    .getByRole("button", { name: "Ask assistant", exact: true })
    .click();
  await assistant.getByRole("article", { name: "Assistant result" }).waitFor();
  await assistant
    .getByRole("heading", { name: "Routine progress" })
    .scrollIntoViewIfNeeded();
  await caption(
    "Briefings combine actual readings, pending tasks and provenance. No clinical accuracy is claimed.",
  );
  await linger();
  await page.screenshot({ path: "state/demo/closing.png", fullPage: true });
} finally {
  await context.close();
  await video.saveAs("state/demo/avia-walkthrough.webm");
  await browser.close();
}
console.log("Recorded state/demo/avia-walkthrough.webm");
