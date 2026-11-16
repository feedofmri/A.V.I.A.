// Optional fixture refresh. Reads only published seed definitions and evaluates
// fictional inputs directly; never exports the user's database or journal data.
import fs from "node:fs/promises";
import {
  SEED_CREW,
  SEED_MISSION,
  SEED_COUNTERMEASURES,
  SEED_LOGS,
  LATEST,
  EEG,
} from "../../server/dist/db/seed-data.js";
const base = process.env.ML_URL ?? "http://localhost:8000";
async function evaluate(endpoint, body) {
  const r = await fetch(base + endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(`${endpoint}: ${JSON.stringify(data)}`);
  return data;
}
const data = {
  version: 1,
  fixture_generated_at: new Date().toISOString(),
  notice:
    "Fictional seed inputs and precomputed reference model outputs. No database export.",
  mission: SEED_MISSION,
  tasks: SEED_COUNTERMEASURES,
  logs: SEED_LOGS,
  crew: {},
};
for (const crew of SEED_CREW) {
  const telemetry = {
    ...LATEST[crew.slug],
    mission_day: 142,
    ...(crew.slug === "sato" ? EEG.light : EEG.deep),
  };
  const inference = await evaluate("/api/v1/infer", {
    crew_id: crew.slug,
    crew_code: crew.baseline_code,
    baseline: crew.baseline,
    steps: Array.from({ length: 6 }, () => telemetry),
  });
  const projection = await evaluate("/api/v1/twin/projection", {
    crew_id: crew.slug,
    adherence_pct: crew.baseline.adherence_pct,
    horizon_days: 60,
    femoral_bmd: crew.baseline.femoral_bmd,
    lumbar_bmd: crew.baseline.lumbar_bmd,
    cardiac_anomaly_prob: inference.encoder_outputs.cardiac_anomaly_prob,
  });
  data.crew[crew.slug] = { ...crew, telemetry, inference, projection };
}
data.suit = {};
for (const [name, patch] of Object.entries({
  nominal: {},
  left_arm: { suit_p_left_arm_psi: 1.8, bioimp_left_arm_ohm: 210 },
  right_arm: { suit_p_right_arm_psi: 1.8, bioimp_right_arm_ohm: 210 },
  legs: { suit_p_legs_psi: 1.8, bioimp_legs_ohm: 180 },
  torso: { suit_p_torso_psi: 1.8 },
})) {
  data.suit[name] = await evaluate("/api/v1/suit/evaluate", {
    crew_id: "okafor",
    ...patch,
  });
}
await fs.writeFile(
  new URL("./reference-data.json", import.meta.url),
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  "Saved fictional model reference fixtures for four crew and five suit presets.",
);
