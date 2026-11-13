import { ml } from "../clients/ml.js";
import { roster } from "./crew.js";
import { processVital } from "./telemetry.js";
import type { Db } from "../db/pool.js";

export function startRecovery(db: Db, onError: (err: unknown) => void) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (!(await ml.health()).models_loaded) return;
      for (const crew of await roster(db)) {
        const rows = await db.withCrew(
          crew.id,
          async (c) =>
            (
              await c.query<{
                id: number;
              }>(`SELECT v.id FROM vitals v JOIN crew_baselines b ON b.crew_id=v.crew_id
          WHERE (v.inference_status='pending' AND v.next_attempt_at<=now()) OR
          (v.id=(SELECT id FROM vitals ORDER BY recorded_at DESC,id DESC LIMIT 1)
           AND v.heart_rate IS NOT NULL AND v.spo2 IS NOT NULL AND v.eda IS NOT NULL AND v.hrv_rmssd_ms IS NOT NULL AND v.sleep_duration_hr IS NOT NULL
           AND (v.baseline_version IS DISTINCT FROM b.version OR NOT EXISTS (SELECT 1 FROM inferences i WHERE i.vital_id=v.id AND i.result->>'policy_version'='software-1')))
          ORDER BY v.recorded_at,v.id LIMIT 8`)
            ).rows,
        );
        for (const { id } of rows) await processVital(db, crew, id);
      }
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  return () => clearInterval(timer);
}
