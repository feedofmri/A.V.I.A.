import { useEffect, useRef, useState } from "react";
import { api, useSession } from "./session";
import { Icon, dateLabel, ObservationSummary, ScenarioSummary } from "./ui";
const modes = [
  "auto",
  "intake",
  "assessment",
  "knowledge",
  "action",
  "routine",
  "wellbeing",
  "twin",
  "briefing",
];
const readingLabels: Record<string, string> = {
  hr_bpm: "Heart rate (bpm)",
  spo2_pct: "Oxygen saturation (%)",
  eda_us: "EDA (µS)",
  hrv_rmssd_ms: "HRV RMSSD (ms)",
  sleep_duration_hr: "Sleep duration (hours)",
  resp_rate_bpm: "Respiration (breaths/min)",
  skin_temp_c: "Skin temperature (°C)",
};
const fallbackLabels: Record<string, string> = {
  local_requested: "Local guidance selected",
  cloud_consent_required: "Cloud processing is not enabled for this record",
  not_configured: "Cloud explanations are not configured",
  consent_revoked: "Cloud permission changed; local guidance retained",
};
const kinds: Record<string, [string, string]> = {
  blood_pressure: ["Blood pressure", "mmHg"],
  glucose: ["Blood glucose", "mg/dL"],
  body_temperature: ["Body temperature", "°C"],
  mood: ["Mood (one to five)", "1-5"],
  nutrition: ["Food / nutrition note", "text"],
  hydration: ["Hydration", "mL"],
  symptom: ["Symptom note", "text"],
};
const templates: Record<string, string> = {
  assessment: "Explain my latest assessment and missing information.",
  knowledge: "How do spaceflight hazards affect health?",
  action: "What approved follow-up should I consider?",
  routine: "Help me review my mission health routine.",
  wellbeing: "Help me review my sleep and wellbeing.",
  twin: "Compare the software twin scenario with my stored baseline.",
  briefing: "Prepare my health briefing and handover.",
  intake: "Help me review and record this observation.",
  auto: "",
};
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Assistant({
  crew,
  initialMode = "assessment",
}: {
  crew: string;
  initialMode?: string;
}) {
  const user = useSession(),
    [info, setInfo] = useState<any>(null),
    [result, setResult] = useState<any>(null),
    [mode, setMode] = useState(initialMode),
    [question, setQuestion] = useState(
      templates[initialMode] ?? templates.assessment,
    ),
    [cloud, setCloud] = useState(false),
    [journal, setJournal] = useState(false),
    [journalId, setJournalId] = useState(""),
    [journals, setJournals] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [kind, setKind] = useState("mood"),
    [value, setValue] = useState(""),
    [secondary, setSecondary] = useState(""),
    [at, setAt] = useState(new Date().toISOString().slice(0, 16)),
    [adherence, setAdherence] = useState("70"),
    [days, setDays] = useState("60"),
    [suitPreset, setSuitPreset] = useState("nominal"),
    [showEntry, setShowEntry] = useState(false),
    [vitals, setVitals] = useState({
      hr_bpm: "",
      spo2_pct: "",
      eda_tonic_us: "",
      hrv_rmssd_ms: "",
      sleep_duration_hr: "",
    });
  const seq = useRef(0),
    root = `/software/crew/${crew}/assistant`,
    pending = useRef<any>(null);
  useEffect(() => {
    const current = ++seq.current;
    setResult(null);
    setInfo(null);
    setCloud(false);
    setJournal(false);
    setJournalId("");
    setJournals([]);
    setError("");
    setNotice("");
    pending.current = null;
    api<any>(root)
      .then((data) => {
        if (current !== seq.current) return;
        setInfo(data);
        setCloud(data.consent.cloud);
        setJournal(data.consent.journal);
      })
      .catch((e) => {
        if (current === seq.current) setError(e.message);
      });
    return () => {
      seq.current++;
    };
  }, [crew, user.name]);
  async function refresh() {
    const data = await api<any>(root);
    setInfo(data);
  }
  async function saveConsent() {
    setBusy(true);
    setError("");
    try {
      await api(root + "/consent", "PUT", { cloud, journal: cloud && journal });
      setNotice(
        "Processing preferences saved. Revocation prevents future cloud requests.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run(observation?: any, telemetry?: any) {
    const current = seq.current;
    setBusy(true);
    setError("");
    setNotice("");
    const body = {
      request_id: crypto.randomUUID(),
      message:
        question.trim() || templates[mode] || "Review my health information.",
      mode,
      use_cloud: cloud,
      ...(result?.id ? { previous_id: result.id } : {}),
      ...(journalId ? { journal_id: journalId } : {}),
      ...(mode === "twin"
        ? {
            scenario: {
              adherence_pct: Number(adherence),
              horizon_days: Number(days),
              suit_preset: suitPreset,
            },
          }
        : {}),
      ...(observation ? { observation } : {}),
      ...(telemetry ? { telemetry } : {}),
    };
    // A timed-out request can be retried with its original ID; never create duplicate actions.
    const request = pending.current ?? body;
    pending.current = request;
    try {
      const data = await api<any>(root + "/run", "POST", request);
      if (current !== seq.current) return;
      setResult(data);
      pending.current = null;
      await refresh();
    } catch (e) {
      if (current === seq.current)
        setError(
          (e as Error).message + " Retry keeps the same request identifier.",
        );
    } finally {
      if (current === seq.current) setBusy(false);
    }
  }
  async function confirm(p: any) {
    setBusy(true);
    setError("");
    try {
      const saved = await api<any>(
        `${root}/runs/${result.id}/confirm`,
        "POST",
        { action_id: p.id, confirm: true },
      );
      setResult((r: any) => ({
        ...r,
        proposals: r.proposals.map((x: any) =>
          x.id === p.id ? { ...x, result: saved } : x,
        ),
      }));
      setNotice("Action acknowledged by the server.");
      if (p.type !== "task") {
        setShowEntry(false);
        setValue("");
        setSecondary("");
        setVitals({
          hr_bpm: "",
          spo2_pct: "",
          eda_tonic_us: "",
          hrv_rmssd_ms: "",
          sleep_duration_hr: "",
        });
        setAt(new Date().toISOString().slice(0, 16));
      }
      if (p.type === "telemetry") {
        setResult(null);
        setNotice(
          saved.accepted_status === 202
            ? "Observation saved; local inference is pending."
            : "Observation saved and assessed. Stored evidence has been refreshed.",
        );
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openRun(id: string) {
    setError("");
    try {
      setResult(await api(root + "/runs/" + id));
      pending.current = null;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function removeRun() {
    try {
      await api(root + "/runs/" + result.id, "DELETE");
      setResult(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const snapshot = info?.context?.snapshot ?? result?.context?.snapshot;
  const immediateUrgent =
    snapshot?.crew_status_badge === "Critical" ||
    /\b(chest pain|cannot breathe|can.t breathe|fainting|suicid|kill myself|self.harm)\b/i.test(
      question,
    );
  const modeLabels: Record<string, string> = {
    auto: "Choose for me",
    assessment: "Review my health",
    intake: "Record an observation",
    knowledge: "Understand an indicator",
    action: "Find my next step",
    routine: "Plan my routine",
    wellbeing: "Sleep & wellbeing",
    twin: "Explore a scenario",
    briefing: "Prepare a briefing",
  };
  const choose = (value: string) => {
    setMode(value);
    setQuestion(templates[value]);
    pending.current = null;
  };
  const status = snapshot?.inference_current
    ? snapshot.crew_status_badge
    : "Unknown";
  const readings = snapshot?.vitals_current;
  const context = info?.context ?? result?.context;
  const progress = context?.progress;
  return (
    <section className="assistant" aria-label="A.V.I.A. health assistant">
      <header className="assistant-head">
        <div className="assistant-brandmark">
          <Icon size={28} />
        </div>
        <div>
          <p className="ui-kicker">YOUR HEALTH COMPANION</p>
          <h2>A.V.I.A. health assistant</h2>
          <p className="ui-muted">
            A clearer picture of your health. A considered next step.
          </p>
        </div>
        <span className="ui-status connected">
          <i />
          {cloud && info?.consent.cloud
            ? "Cloud assistance enabled"
            : "Local guidance"}
        </span>
      </header>
      {immediateUrgent && (
        <div role="alert" className="assistant-urgent">
          <Icon name="heart" />
          <div>
            <strong>Prioritize crew medical review</strong>
            <p>
              For severe symptoms, follow mission emergency procedures. Do not
              wait for cloud AI.
            </p>
          </div>
        </div>
      )}
      <div className="assistant-layout">
        <div className="assistant-main">
          <section
            className="assistant-composer"
            aria-label="Ask your health assistant"
          >
            <div className="ui-section-heading">
              <div>
                <p className="ui-kicker">LET’S START HERE</p>
                <h3>What would you like to review?</h3>
              </div>
              <span className="ui-label">
                <Icon name="shield" size={14} /> Your crew record only
              </span>
            </div>
            <div className="assistant-shortcuts">
              {[
                ["assessment", "heart", "Review my health"],
                ["action", "activity", "Next steps"],
                ["wellbeing", "message", "Check in"],
                ["briefing", "book", "Daily briefing"],
              ].map(([id, icon, label]) => (
                <button
                  key={id}
                  disabled={busy}
                  aria-pressed={mode === id}
                  onClick={() => choose(id)}
                >
                  <Icon name={icon} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <fieldset disabled={busy} className="composer-fields">
              <legend className="sr-only">
                Your question and assistant role
              </legend>
              <label className="role-select">
                Assistant role
                <select value={mode} onChange={(e) => choose(e.target.value)}>
                  {modes.map((m) => (
                    <option key={m} value={m}>
                      {modeLabels[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="question-label">
                Your question
                <textarea
                  placeholder="Ask about a change, a reading or your next step…"
                  maxLength={4000}
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    pending.current = null;
                  }}
                />
              </label>
              {mode === "twin" && (
                <div className="assistant-grid scenario-inputs">
                  <label>
                    Scenario adherence (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={adherence}
                      onChange={(e) => {
                        setAdherence(e.target.value);
                        pending.current = null;
                      }}
                    />
                  </label>
                  <label>
                    Scenario horizon (days)
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={days}
                      onChange={(e) => {
                        setDays(e.target.value);
                        pending.current = null;
                      }}
                    />
                  </label>
                  <label>
                    Software suit scenario
                    <select
                      value={suitPreset}
                      onChange={(e) => {
                        setSuitPreset(e.target.value);
                        pending.current = null;
                      }}
                    >
                      <option value="nominal">Nominal defaults</option>
                      <option value="left_arm">
                        Left arm pressure-loss example
                      </option>
                    </select>
                  </label>
                </div>
              )}
              <div className="composer-actions">
                <button
                  className="ui-secondary"
                  aria-expanded={showEntry}
                  onClick={() => {
                    setShowEntry(!showEntry);
                    if (!showEntry) choose("intake");
                  }}
                >
                  <Icon name="plus" size={16} /> Prepare an observation
                </button>
                <button className="ui-primary" onClick={() => void run()}>
                  {busy ? (
                    <span className="ui-spinner" />
                  ) : (
                    <Icon name="spark" size={17} />
                  )}{" "}
                  {busy
                    ? "Assessing…"
                    : pending.current
                      ? "Retry assessment"
                      : "Ask assistant"}{" "}
                  <Icon name="arrow" size={16} />
                </button>
              </div>
              {showEntry && (
                <section className="observation-form">
                  <div className="ui-section-heading">
                    <div>
                      <p className="ui-kicker">
                        01 ENTER · 02 REVIEW · 03 CONFIRM
                      </p>
                      <h4>Add a health observation</h4>
                    </div>
                    <span className="ui-label">Not saved yet</span>
                  </div>
                  <div className="assistant-grid">
                    <label>
                      Observation kind
                      <select
                        value={kind}
                        onChange={(e) => {
                          setKind(e.target.value);
                          setValue("");
                          setSecondary("");
                        }}
                      >
                        <option value="telemetry">
                          Model-supported vital reading
                        </option>
                        {Object.entries(kinds).map(([k, [label]]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Observed at (UTC)
                      <input
                        type="datetime-local"
                        value={at}
                        onChange={(e) => setAt(e.target.value)}
                      />
                    </label>
                  </div>
                  {kind === "telemetry" ? (
                    <div className="assistant-grid">
                      {Object.entries({
                        hr_bpm: "Heart rate (bpm)",
                        spo2_pct: "Oxygen saturation (%)",
                        eda_tonic_us: "EDA (µS)",
                        hrv_rmssd_ms: "HRV (ms)",
                        sleep_duration_hr: "Sleep duration (hours)",
                      }).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            type="number"
                            step="any"
                            placeholder="Enter observed value"
                            value={vitals[key as keyof typeof vitals]}
                            onChange={(e) =>
                              setVitals((v) => ({
                                ...v,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="assistant-grid">
                      <label>
                        Value ({kinds[kind][1]})
                        <input
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          maxLength={1000}
                          placeholder={
                            kinds[kind][1] === "text"
                              ? "Describe your observation"
                              : "Enter observed value"
                          }
                        />
                      </label>
                      {kind === "blood_pressure" && (
                        <label>
                          Diastolic (mmHg)
                          <input
                            type="number"
                            value={secondary}
                            onChange={(e) => setSecondary(e.target.value)}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  <p className="ui-muted">
                    Use an observation you have. Missing values should stay
                    missing. You will review and confirm before anything is
                    saved.
                  </p>
                  <button
                    className="ui-primary"
                    onClick={() => {
                      if (!at || (!value && kind !== "telemetry")) {
                        setError("Enter the observed value and UTC time.");
                        return;
                      }
                      if (
                        kind === "telemetry" &&
                        Object.values(vitals).some((v) => v === "")
                      ) {
                        setError(
                          "Complete all model-supported inputs; missing observations must not be invented.",
                        );
                        return;
                      }
                      const time = new Date(at + "Z");
                      if (!Number.isFinite(time.getTime())) {
                        setError("Enter a valid UTC time.");
                        return;
                      }
                      pending.current = null;
                      const recorded_at = time.toISOString();
                      if (kind === "telemetry")
                        void run(undefined, {
                          ...Object.fromEntries(
                            Object.entries(vitals).map(([k, v]) => [
                              k,
                              Number(v),
                            ]),
                          ),
                          recorded_at,
                        });
                      else
                        void run({
                          kind,
                          value:
                            kinds[kind][1] === "text" ? value : Number(value),
                          secondary:
                            kind === "blood_pressure"
                              ? Number(secondary)
                              : null,
                          unit: kinds[kind][1],
                          recorded_at,
                        });
                    }}
                  >
                    Review proposed observation <Icon name="arrow" size={16} />
                  </button>
                </section>
              )}
            </fieldset>
            <p className="assistant-disclaimer">
              <Icon name="shield" size={14} /> Decision support for this
              prototype. A review is not a diagnosis.
            </p>
          </section>
          {error && (
            <div className="ui-callout error" role="alert">
              <strong>We couldn’t complete that request</strong>
              <p>{error}</p>
            </div>
          )}
          {notice && (
            <p className="ui-callout success" role="status">
              <Icon name="check" size={17} />
              {notice}
            </p>
          )}
          {busy && pending.current && (
            <div className="assistant-thinking" role="status">
              <span className="ui-spinner" />
              <div>
                <strong>Preparing your review</strong>
                <p>Checking your record and available evidence…</p>
              </div>
            </div>
          )}
          {result ? (
            <article
              className="assistant-response"
              aria-label="Assistant result"
              aria-live="polite"
            >
              <header className="ui-section-heading">
                <div>
                  <p className="ui-kicker">{dateLabel(result.created_at)}</p>
                  <h3>{modeLabels[result.mode] ?? "Your health review"}</h3>
                </div>
                <button
                  className="ui-icon-button"
                  aria-label="Download review / handover"
                  title="Download review / handover"
                  onClick={() => download(result, `avia-${crew}-briefing.json`)}
                >
                  <Icon name="download" />
                </button>
              </header>
              <div className="response-provider">
                <Icon name="spark" size={15} />
                {result.provider === "meta"
                  ? "Explained with Meta Muse"
                  : `Local guidance: ${fallbackLabels[result.fallback_reason] ?? "Cloud response unavailable; using saved guidance"}`}
              </div>
              <p
                className={"response-notice " + (result.urgent ? "urgent" : "")}
              >
                {result.notice}
              </p>
              {result.sections.map((s: any, i: number) => (
                <section className="response-section" key={i}>
                  <p>{s.text}</p>
                  <div className="evidence-chips">
                    {s.source_ids.map((id: string) => {
                      const source = result.sources.find(
                        (x: any) => x.id === id,
                      );
                      return source?.url?.startsWith("https://") ? (
                        <a
                          key={id}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="book" size={12} />
                          {source.title.replace(/^[^:]+: /, "")}
                          <Icon name="external" size={11} />
                        </a>
                      ) : (
                        <span key={id}>
                          <Icon name="shield" size={12} />
                          {source?.title ?? "Stored evidence"}
                        </span>
                      );
                    })}
                  </div>
                </section>
              ))}
              {result.questions?.length > 0 && (
                <section className="response-questions">
                  <h4>A little more context</h4>
                  <ul>
                    {result.questions.map((q: string, i: number) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </section>
              )}
              {result.proposals.length > 0 && (
                <section className="response-proposals">
                  <p className="ui-kicker">REVIEW BEFORE SAVING</p>
                  <h4>Your proposed next steps</h4>
                  {result.proposals.map((p: any) => (
                    <div
                      className={
                        "assistant-proposal " + (p.result ? "is-confirmed" : "")
                      }
                      key={p.id}
                    >
                      <span className="proposal-icon">
                        <Icon
                          name={
                            p.result
                              ? "check"
                              : p.type === "task"
                                ? "activity"
                                : "plus"
                          }
                        />
                      </span>
                      <div className="proposal-content">
                        <h4>
                          {p.type === "task"
                            ? p.label
                            : "Review proposed observation"}
                        </h4>
                        {p.type === "task" ? (
                          <p className="ui-muted">
                            Due {p.scheduled_for} UTC · educational review task
                          </p>
                        ) : (
                          <ObservationSummary
                            value={p.observation ?? p.telemetry}
                          />
                        )}{" "}
                        {p.result ? (
                          <p className="confirmation-line">
                            <Icon name="check" size={14} />
                            Confirmed by {p.result.actor} · server acknowledged
                          </p>
                        ) : (
                          <button
                            className="ui-secondary"
                            disabled={busy}
                            onClick={() => void confirm(p)}
                          >
                            Confirm {p.type === "task" ? "task" : "observation"}{" "}
                            <Icon name="check" size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              )}
              {result.scenario && (
                <details className="ui-details" open>
                  <summary>Scenario assumptions and results</summary>
                  <ScenarioSummary scenario={result.scenario} />
                </details>
              )}
              <details className="ui-details">
                <summary>
                  <Icon name="book" size={16} /> Sources & review details
                </summary>
                <ul className="source-list">
                  {result.sources.map((s: any) => (
                    <li key={s.id}>
                      <Icon name="book" size={16} />
                      {s.url?.startsWith("https://") ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                          <Icon name="external" size={13} />
                        </a>
                      ) : (
                        <span>{s.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="ui-muted">
                  Review roles: {result.agents.join(" → ")}. Independent model
                  accuracy and clinical validation are unverified.
                </p>
                <button
                  className="ui-danger-text"
                  onClick={() => void removeRun()}
                >
                  Delete this assessment history
                </button>
              </details>
            </article>
          ) : (
            !busy && (
              <section className="assistant-welcome">
                <span className="welcome-orbit">
                  <Icon size={28} />
                </span>
                <h3>A useful conversation starts with your evidence.</h3>
                <p>
                  Choose a review above, ask a question, or record an
                  observation. Your response will appear here with sources and
                  next steps you control.
                </p>
                <div>
                  <span>
                    <Icon name="heart" size={16} /> Personal baseline
                  </span>
                  <span>
                    <Icon name="book" size={16} /> Cited guidance
                  </span>
                  <span>
                    <Icon name="shield" size={16} /> Confirmed actions
                  </span>
                </div>
              </section>
            )
          )}
        </div>
        <aside className="assistant-aside" aria-label="Health context">
          <section className="context-card">
            <header className="ui-section-heading">
              <h3>Health snapshot</h3>
              <Icon name="activity" size={18} />
            </header>
            {!info && !result ? (
              <div
                className="ui-skeleton"
                aria-label="Loading health evidence"
              />
            ) : (
              <>
                <div className="snapshot-status">
                  <span className={"ui-status " + String(status).toLowerCase()}>
                    <i />
                    {status === "Unknown" ? "Awaiting assessment" : status}
                  </span>
                  <small>
                    {snapshot?.recorded_at
                      ? dateLabel(snapshot.recorded_at)
                      : "No observation yet"}
                  </small>
                </div>
                <div className="snapshot-metrics">
                  {[
                    ["hr_bpm", "Heart rate", "bpm"],
                    ["spo2_pct", "Oxygen", "%"],
                    ["hrv_rmssd_ms", "HRV", "ms"],
                    ["sleep_duration_hr", "Sleep", "h"],
                  ].map(([key, label, unit]) => (
                    <div key={key}>
                      <span>{label}</span>
                      <strong>
                        {readings?.[key] ?? "—"}
                        <small>{unit}</small>
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="snapshot-provenance">
                  <Icon name="shield" size={13} />
                  <span>
                    {snapshot?.provenance?.input ?? "Unknown source"} ·{" "}
                    {snapshot?.imputed_fields?.length ?? 0} filled fields
                  </span>
                </div>
              </>
            )}
          </section>
          <section className="context-card">
            <header className="ui-section-heading">
              <h3>Routine progress</h3>
              <Icon name="check" size={18} />
            </header>
            <div className="routine-count">
              <strong>
                {progress?.completed ?? "—"}
                <span> / {progress?.total ?? "—"}</span>
              </strong>
              <span className="ui-label">{progress?.due ?? 0} due</span>
            </div>
            <progress
              max={progress?.total || 1}
              value={progress?.completed ?? 0}
              aria-label="Task completion progress"
            />
            <p className="ui-muted">
              Your assigned actions, one step at a time.
            </p>
            <ul className="routine-tasks">
              {context?.tasks
                ?.filter((t: any) => !t.done)
                .slice(0, 3)
                .map((t: any) => (
                  <li key={t.id}>
                    <span className="task-ring" />
                    <div>
                      {t.label}
                      <small>Due {t.scheduled_for} UTC</small>
                    </div>
                  </li>
                ))}
            </ul>
            {progress && (
              <small className="ui-muted">
                {progress.points} engagement points · not a health score
              </small>
            )}
          </section>
          <details className="context-card assistant-settings">
            <summary>
              <Icon name="lock" size={17} /> Privacy & processing
            </summary>
            <fieldset disabled={busy}>
              <legend className="sr-only">Processing preferences</legend>
              <label className="consent-option">
                <input
                  type="checkbox"
                  checked={cloud}
                  onChange={(e) => {
                    setCloud(e.target.checked);
                    if (!e.target.checked) {
                      setJournal(false);
                      setJournalId("");
                    }
                  }}
                />
                <span>
                  Allow sending my question and scoped health evidence to Meta
                  for this crew record
                  <small>
                    Optional cloud explanations. Local guidance remains
                    available without it.
                  </small>
                </span>
              </label>
              {user.role === "crew" && (
                <label className="consent-option">
                  <input
                    type="checkbox"
                    checked={journal}
                    disabled={!cloud}
                    onChange={(e) => {
                      setJournal(e.target.checked);
                      if (!e.target.checked) setJournalId("");
                    }}
                  />
                  <span>
                    Separately allow processing a journal entry I explicitly
                    select
                    <small>
                      Independent of sharing an entry with the operator.
                    </small>
                  </span>
                </label>
              )}
              <button
                className="ui-secondary"
                onClick={() => void saveConsent()}
              >
                Save processing preferences
              </button>
              {journal && cloud && user.role === "crew" && (
                <>
                  <button
                    className="ui-text-button"
                    onClick={() =>
                      void api<any[]>(`/software/crew/${crew}/journal`)
                        .then(setJournals)
                        .catch((e) => setError(e.message))
                    }
                  >
                    Choose a journal entry
                  </button>
                  <label>
                    Journal excerpt to process
                    <select
                      value={journalId}
                      onChange={(e) => setJournalId(e.target.value)}
                    >
                      <option value="">None</option>
                      {journals.map((j) => (
                        <option key={j.id} value={j.id}>
                          {dateLabel(j.created_at)} · {j.text.slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <p className="ui-muted">
                {info?.cloud_configured
                  ? "Meta is configured for optional requests."
                  : "Cloud explanations are not configured."}{" "}
                Revoking permission prevents future requests; it cannot undo
                data already sent.
              </p>
            </fieldset>
          </details>
          <section className="context-card review-history">
            <header className="ui-section-heading">
              <h3>Recent reviews</h3>
              <button
                className="ui-text-button"
                disabled={busy}
                onClick={() => {
                  setResult(null);
                  pending.current = null;
                  setNotice("New conversation started.");
                }}
                aria-label="New conversation"
              >
                <Icon name="plus" size={16} />
              </button>
            </header>
            {info?.runs?.length ? (
              info.runs.slice(0, 5).map((r: any) => (
                <button
                  className={
                    "history-item " + (result?.id === r.id ? "is-selected" : "")
                  }
                  key={r.id}
                  disabled={busy || r.status !== "completed"}
                  onClick={() => void openRun(r.id)}
                >
                  <Icon name="message" size={15} />
                  <span>
                    {dateLabel(r.created_at)}
                    <small>
                      {r.status === "completed"
                        ? "Saved health review"
                        : r.status === "running"
                          ? "Preparing review"
                          : "Review incomplete"}
                    </small>
                  </span>
                  <Icon name="arrow" size={13} />
                </button>
              ))
            ) : (
              <p className="ui-muted">Your private reviews will appear here.</p>
            )}
            <small className="ui-muted">
              <Icon name="lock" size={12} /> Visible only to this signed-in
              account.
            </small>
          </section>
          {context?.observations?.length > 0 && (
            <section className="context-card">
              <h3>Your additional observations</h3>
              {context.observations.map((o: any) => (
                <div className="saved-observation" key={o.id}>
                  <p>
                    {o.kind.replaceAll("_", " ")}: {o.value}
                    {o.secondary !== null ? "/" + o.secondary : ""} {o.unit}
                  </p>
                  <small>{dateLabel(o.recorded_at)}</small>
                  <button
                    className="ui-danger-text"
                    onClick={() =>
                      void api(root + "/observations/" + o.id, "DELETE")
                        .then(refresh)
                        .catch((e) => setError(e.message))
                    }
                  >
                    Delete observation
                  </button>
                </div>
              ))}
            </section>
          )}
          <details className="context-card">
            <summary>
              <Icon name="layers" size={17} /> How A.V.I.A. supports you
            </summary>
            <ul className="agent-responsibilities">
              {info?.agents?.map((a: any) => (
                <li key={a.id}>
                  <strong>{a.id}</strong>
                  <span>{a.description}</span>
                </li>
              ))}
            </ul>
            <p className="ui-muted">
              Check values, units and UTC time. Follow mission-approved
              procedures. The system does not diagnose conditions or prescribe
              treatments.
            </p>
          </details>
        </aside>
      </div>
    </section>
  );
}
