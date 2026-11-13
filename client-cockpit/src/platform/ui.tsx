const paths: Record<string, string> = {
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.9Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6ZM9 12l2 2 4-4",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  plus: "M12 5v14M5 12h14",
  book: "M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  lock: "M6 10h12v11H6Zm2 0V7a4 4 0 0 1 8 0v3",
  layers: "m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  message: "M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z",
  external: "M14 3h7v7M10 14 21 3M21 14v7H3V3h7",
};
export function Icon({
  name = "spark",
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.spark} />
    </svg>
  );
}
export function dateLabel(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("en", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d) + " UTC"
    : "Time unavailable";
}
export const fieldLabels: Record<string, string> = {
  hr_bpm: "Heart rate · bpm",
  spo2_pct: "Oxygen saturation · %",
  eda_tonic_us: "EDA · µS",
  hrv_rmssd_ms: "HRV · ms",
  sleep_duration_hr: "Sleep · hours",
  recorded_at: "Observed at",
  kind: "Observation",
  value: "Value",
  secondary: "Diastolic",
  unit: "Unit",
  input_origin: "Input source",
};
export function ObservationSummary({
  value,
}: {
  value: Record<string, unknown>;
}) {
  return (
    <dl className="observation-review">
      {Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([key, v]) => (
          <div key={key}>
            <dt>{fieldLabels[key] ?? key.replaceAll("_", " ")}</dt>
            <dd>
              {key === "recorded_at"
                ? dateLabel(String(v))
                : String(v).replaceAll("_", " ")}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function ScenarioSummary({ scenario }: { scenario: any }) {
  if (scenario.unavailable)
    return (
      <p className="ui-empty">
        Scenario calculations are unavailable. Try again when the local service
        reconnects.
      </p>
    );
  const baseline = scenario.baseline?.skeletal_risk_projection?.regions ?? {},
    changed = scenario.changed?.skeletal_risk_projection?.regions ?? {},
    body = scenario.suit?.digital_twin_body_map ?? {};
  return (
    <section className="scenario-summary">
      <p className="ui-kicker">SOFTWARE SIMULATION</p>
      <h4>Your scenario comparison</h4>
      <p className="ui-muted">
        Heuristic bone projections and simulated suit inputs. These are not
        measurements or validated predictions.
      </p>
      <div className="scenario-parameters">
        <span>{scenario.parameters?.horizon_days} day horizon</span>
        <span>{scenario.parameters?.adherence_pct}% scenario adherence</span>
        <span>
          {scenario.parameters?.suit_preset?.replaceAll("_", " ")} suit example
        </span>
      </div>
      <div className="scenario-regions">
        {Object.entries(changed).map(([name, region]: [string, any]) => (
          <div key={name}>
            <span className="ui-kicker">
              {name === "femoral" ? "Femoral region" : "Lumbar region"}
            </span>
            <div className="scenario-values">
              <span>
                <small>Stored baseline scenario</small>
                <strong>{baseline[name]?.projected_bmd ?? "—"}</strong>
              </span>
              <Icon name="arrow" />
              <span>
                <small>Adjusted scenario</small>
                <strong>{region.projected_bmd ?? "—"}</strong>
              </span>
            </div>
            <small className="ui-muted">
              Projected BMD · g/cm² · {region.status_projected}
            </small>
          </div>
        ))}
      </div>
      {Object.keys(body).length > 0 && (
        <>
          <h4>Suit body map</h4>
          <div className="suit-summary">
            {Object.entries(body).map(([name, status]) => (
              <div key={name}>
                <span>{name.replaceAll("_", " ")}</span>
                <span className={"ui-status " + String(status).toLowerCase()}>
                  {String(status)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
