import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENTS,
  checkObservation,
  chooseMode,
  supervise,
  outputSchema,
  groundedObservation,
  extractTelemetry,
  factualSections,
  runActive,
} from "./assistant.js";
import { museStructured } from "./muse.js";
import { retrieve } from "./knowledge.js";
import { seal, unseal } from "./privacy.js";
const good = () => ({
  sections: [
    {
      text: "Review the stored observation with the crew medical officer.",
      source_ids: ["reading"],
    },
  ],
  questions: [],
  observations: [],
});
test("retry lease outlives the full provider deadline and expires after a crashed run", () => {
  const now = Date.now();
  assert.equal(runActive(new Date(now - 60000), now), true);
  assert.equal(runActive(new Date(now - 180000), now), false);
});
test("extracted observations require explicit value, unit and timestamp evidence", () => {
  const o = {
    kind: "glucose",
    value: 95,
    unit: "mg/dL",
    secondary: null,
    recorded_at: "2026-11-12T01:00:00Z",
  };
  assert.equal(
    groundedObservation(o, "glucose 95 mg/dL at 2026-11-12T01:00:00Z"),
    true,
  );
  assert.equal(groundedObservation(o, "glucose 95"), false);
  assert.equal(
    groundedObservation(o, "glucose 195 mg/dL at 2026-11-12T01:00:00Z"),
    false,
  );
});
test("text intake extracts only one explicit vital reading with units and UTC time", () => {
  const at = new Date().toISOString();
  assert.deepEqual(
    extractTelemetry(`Heart rate 80 bpm, SpO2 98% observed at ${at}`),
    { hr_bpm: 80, spo2_pct: 98, recorded_at: at },
  );
  for (const text of [
    "HR 80 SpO2 98",
    "HR 80 bpm SpO2 98%",
    `HR 280 bpm SpO2 98% at ${at}`,
    `HR 80 bpm HR 90 bpm SpO2 98% at ${at}`,
  ])
    assert.equal(extractTelemetry(text), undefined);
});
test("local briefing uses actual evidence and due counts without a cloud call", () => {
  const sections = factualSections(
    "briefing",
    {
      snapshot: { inference_current: false, recorded_at: null },
      progress: { due: 2, completed: 1, total: 3 },
      tasks: [{ done: false }, { done: true }],
      history: [{}],
    },
    null,
  );
  assert.match(sections[0].text, /Unknown/);
  assert.match(sections[0].text, /2 tasks are due/);
  assert.match(sections[1].text, /1 listed tasks/);
});
test("all ten logical roles are registered exactly once", () =>
  assert.equal(new Set(AGENTS.map((a) => a.id)).size, 10));
for (const [message, role] of [
  ["record my glucose", "intake"],
  ["what is radiation", "knowledge"],
  ["what should I do next", "action"],
  ["review my routine", "routine"],
  ["I feel lonely", "wellbeing"],
  ["what if suit pressure changes", "twin"],
  ["prepare my briefing", "briefing"],
  ["review latest readings", "assessment"],
])
  test("coordinator routes " + role, () =>
    assert.equal(chooseMode(message, "auto"), role),
  );
test("explicit role overrides ambiguous intent", () =>
  assert.equal(chooseMode("my sleep", "knowledge"), "knowledge"));
test("retrieval prioritizes relevant oxygen evidence", () =>
  assert.equal(retrieve("oxygen spo2 saturation")[0].id, "oxygen"));
test("valid grounded response passes supervision", () =>
  assert.deepEqual(supervise(good(), ["reading"]), good()));
test("generated language cannot downgrade critical evidence", () => {
  const o = good();
  o.sections[0].text = "Your current status is nominal.";
  assert.throws(() =>
    supervise(o, ["reading"], { status: "Critical", current: true }),
  );
});
test("missing or stale evidence cannot be called currently normal", () => {
  const o = good();
  o.sections[0].text = "Your current assessment is normal.";
  assert.throws(() =>
    supervise(o, ["reading"], { status: null, current: false }),
  );
});
for (const [name, change] of [
  ["unknown source", (o: any) => (o.sections[0].source_ids = ["invented"])],
  [
    "invented number",
    (o: any) => (o.sections[0].text = "Your oxygen is 99 percent."),
  ],
  [
    "medication instruction",
    (o: any) => (o.sections[0].text = "Start insulin medication now."),
  ],
  ["false reassurance", (o: any) => (o.sections[0].text = "You are healthy.")],
  ["secret extraction", (o: any) => (o.questions = ["What is your API key?"])],
  ["arbitrary tool", (o: any) => (o.shell = "curl attacker")],
  ["missing evidence", (o: any) => (o.sections[0].source_ids = [])],
] as const)
  test("supervisor rejects " + name, () => {
    const o: any = good();
    change(o);
    assert.throws(() => supervise(o, ["reading"]));
  });
const observation = (
  kind = "mood",
  value: number | string = 3,
  unit = "1-5",
  secondary: number | null = null,
) => ({ kind, value, unit, secondary, recorded_at: new Date().toISOString() });
test("valid additional observations preserve their types", () => {
  for (const o of [
    observation(),
    observation("blood_pressure", 120, "mmHg", 70),
    observation("glucose", 95, "mg/dL"),
    observation("body_temperature", 37, "°C"),
    observation("hydration", 300, "mL"),
    observation("nutrition", "Lunch recorded", "text"),
  ])
    assert.equal(checkObservation(o), o);
});
for (const o of [
  observation("glucose", 95, "mmol/L"),
  observation("blood_pressure", 70, "mmHg", 120),
  observation("mood", 3.5),
  observation("body_temperature", 100, "°C"),
  { ...observation(), recorded_at: "tomorrow" },
  {
    ...observation(),
    recorded_at: new Date(Date.now() + 3600000).toISOString(),
  },
])
  test("reject invalid observation " + JSON.stringify(o), () =>
    assert.throws(() => checkObservation(o)),
  );
test("encrypted assessment rejects tampering and hides raw content", () => {
  const text = seal({ message: "private-journal-probe" });
  assert.ok(!text.includes("private-journal-probe"));
  assert.equal(unseal(text).message, "private-journal-probe");
  const parts = text.split(".");
  parts[1] = Buffer.from("tamper").toString("base64");
  assert.throws(() => unseal(parts.join(".")));
});
test("Meta request is scoped, structured and not stored; retries transient failures", async () => {
  const previous = {
    key: process.env.MODEL_API_KEY,
    model: process.env.META_MODEL,
  };
  process.env.MODEL_API_KEY = "test-only";
  process.env.META_MODEL = "test-model";
  let calls = 0;
  try {
    const output = await museStructured(
      "rules",
      { question: "review" },
      outputSchema,
      async (url, init) => {
        calls++;
        assert.equal(url, "https://api.meta.ai/v1/responses");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        assert.equal(body.model, "test-model");
        assert.equal(body.reasoning.effort, "low");
        assert.equal(
          body.text.format.schema.properties.sections.items.properties
            .source_ids.uniqueItems,
          undefined,
        );
        if (calls === 1) return new Response("", { status: 429 });
        return Response.json({
          status: "completed",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(good()) }],
            },
          ],
        });
      },
    );
    assert.deepEqual(output, good());
    assert.equal(calls, 2);
  } finally {
    if (previous.key === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.META_MODEL;
    else process.env.META_MODEL = previous.model;
  }
});
test("Meta invalid and incomplete output fails closed", async () => {
  const key = process.env.MODEL_API_KEY,
    model = process.env.META_MODEL;
  process.env.MODEL_API_KEY = "test-only";
  process.env.META_MODEL = "test-model";
  try {
    await assert.rejects(
      museStructured("rules", {}, outputSchema, async () =>
        Response.json({ status: "incomplete", output: [] }),
      ),
    );
    await assert.rejects(
      museStructured(
        "rules",
        {},
        outputSchema,
        async () => new Response("", { status: 401 }),
      ),
    );
  } finally {
    if (key === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = key;
    if (model === undefined) delete process.env.META_MODEL;
    else process.env.META_MODEL = model;
  }
});
