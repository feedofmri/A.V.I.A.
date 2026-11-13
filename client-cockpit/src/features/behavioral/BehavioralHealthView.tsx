import { useEffect, useRef, useState } from "react";
import { api, useSession } from "../../platform/session";
import { Assistant } from "../../platform/Assistant";
import { dateLabel, Icon } from "../../platform/ui";
import "./behavioral.css";

type Observation = {
  id: string;
  kind: string;
  value: number;
  recorded_at: string;
};
type Journal = {
  id: string;
  text: string;
  consent: boolean;
  created_at: string;
};
type Context = {
  observations: Observation[];
  history: { recorded_at: string; sleep_duration_hr: number | null }[];
  snapshot: any;
};
const names: Record<string, string> = {
  okafor: "Cmdr. A. Okafor",
  brandt: "Dr. L. Brandt",
  sato: "M. Sato",
  diaz: "R. Diaz",
};
const moods = ["Very low", "Low", "Neutral", "Good", "Very good"];
function utcNow() {
  return new Date().toISOString().slice(0, 16);
}

function MoodTrend({ entries }: { entries: Observation[] }) {
  const points = [...entries].reverse();
  if (!points.length)
    return (
      <div className="bh-empty">
        <Icon name="heart" />
        <h3>Your check-ins build the picture</h3>
        <p>
          Record a mood report to start a trend. Missing reports are left empty.
        </p>
      </div>
    );
  const times = points.map((p) => Date.parse(p.recorded_at));
  const start = Math.min(...times),
    span = Math.max(...times) - start;
  const x = (i: number) =>
    span ? 48 + ((times[i] - start) / span) * 590 : 343;
  const y = (value: number) => 170 - (value - 1) * 34;
  return (
    <>
      <svg
        className="bh-chart"
        viewBox="0 0 680 205"
        role="img"
        aria-label="Reported mood over time, from one very low to five very good"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <g key={value}>
            <line x1="48" x2="638" y1={y(value)} y2={y(value)} />
            <text x="27" y={y(value) + 4}>
              {value}
            </text>
          </g>
        ))}
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
        />
        {points.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.value)} r="5">
            <title>
              {dateLabel(p.recorded_at)}: {moods[p.value - 1]}
            </title>
          </circle>
        ))}
        <text x="48" y="199">
          {new Date(start).toISOString().slice(0, 10)}
        </text>
        <text x="638" y="199" textAnchor="end">
          {new Date(Math.max(...times)).toISOString().slice(0, 10)} UTC
        </text>
      </svg>
      <p className="bh-muted">
        Self-reported mood, 1–5. Lines connect recorded reports; they do not
        estimate missing days.
      </p>
      <details>
        <summary>View check-in data</summary>
        <div className="bh-table">
          <table>
            <thead>
              <tr>
                <th>Observed at (UTC)</th>
                <th>Mood</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((p) => (
                <tr key={p.id}>
                  <td>{dateLabel(p.recorded_at)}</td>
                  <td>
                    {p.value}/5 · {moods[p.value - 1]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function BehavioralHealthView({
  activeCrew = "okafor",
}: {
  activeCrew?: string;
  theme?: "dark" | "light";
}) {
  const user = useSession();
  const crew = user.crew ?? activeCrew;
  const root = `/software/crew/${crew}`;
  const [tab, setTab] = useState("overview");
  const [context, setContext] = useState<Context | null>(null);
  const [entries, setEntries] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState(3);
  const [at, setAt] = useState(utcNow);
  const [proposal, setProposal] = useState<any>(null);
  const pending = useRef<any>(null);
  const sequence = useRef(0);
  const [text, setText] = useState("");
  const [share, setShare] = useState(false);
  async function load() {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      api<any>(root + "/assistant"),
      api<Journal[]>(root + "/journal"),
    ]);
    if (current !== sequence.current) return;
    if (results[0].status === "fulfilled") setContext(results[0].value.context);
    if (results[1].status === "fulfilled") setEntries(results[1].value);
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") setError(failed.reason.message);
    setLoading(false);
  }
  useEffect(() => {
    setContext(null);
    setEntries([]);
    setProposal(null);
    pending.current = null;
    setText("");
    setShare(false);
    setNotice("");
    setMood(3);
    setAt(utcNow());
    void load();
    return () => {
      sequence.current++;
    };
  }, [crew, user.name]);
  async function review() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const date = new Date(at + ":00Z");
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now())
        throw new Error(
          "Choose a valid observation time at or before now in UTC.",
        );
      pending.current ??= {
        request_id: crypto.randomUUID(),
        mode: "intake",
        use_cloud: false,
        message: "Review this explicitly reported mood observation.",
        observation: {
          kind: "mood",
          value: mood,
          secondary: null,
          unit: "1-5",
          recorded_at: date.toISOString(),
        },
      };
      const result = await api<any>(
        root + "/assistant/run",
        "POST",
        pending.current,
      );
      const observation = result.proposals.find(
        (p: any) => p.type === "observation",
      );
      if (!observation)
        throw new Error(
          "No observation was proposed. Review the input and try again.",
        );
      setProposal({ run: result.id, ...observation });
      pending.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmMood() {
    setBusy(true);
    setError("");
    try {
      await api(`${root}/assistant/runs/${proposal.run}/confirm`, "POST", {
        action_id: proposal.id,
        confirm: true,
      });
      setProposal(null);
      setNotice("Mood check-in saved.");
      setAt(utcNow());
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeObservation(id: string) {
    if (!window.confirm("Delete this mood check-in?")) return;
    setBusy(true);
    setError("");
    try {
      await api(root + "/assistant/observations/" + id, "DELETE");
      setNotice("Mood check-in deleted.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function journalAction(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(root + "/journal" + path, method, body);
      if (method === "POST") {
        setText("");
        setShare(false);
      }
      setNotice(
        method === "DELETE"
          ? "Journal entry deleted."
          : method === "PATCH"
            ? "Journal sharing updated."
            : "Journal saved.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const reports = context?.observations.filter((o) => o.kind === "mood") ?? [];
  const latest = reports[0];
  const snapshot = context?.snapshot;
  const sleep = snapshot?.vitals_current?.sleep_duration_hr;
  const stress = snapshot?.fusion_outputs?.stress_score;
  const sleepHistory = (context?.history ?? []).filter(
    (h) => h.sleep_duration_hr != null,
  );
  const owner = user.role === "crew";
  return (
    <section
      className="behavioral-page platform-card"
      aria-label="Behavioral health workspace"
    >
      <header className="bh-header">
        <div>
          <p className="workspace-eyebrow">A little space to check in</p>
          <h1>Behavioral health</h1>
          <p>Sleep, mood and support for {names[crew] ?? crew}.</p>
        </div>
        <div className="bh-support-actions">
          <span className="bh-badge">Private by choice</span>
          <button disabled={busy || loading} onClick={() => void load()}>
            Refresh record
          </button>
        </div>
      </header>
      <nav className="bh-tabs" aria-label="Behavioral health sections">
        {[
          ["overview", "Check-in & trends"],
          ["journal", owner ? "My journal" : "Shared journal"],
          ["support", "Wellbeing assistant"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setError("");
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="bh-error" role="alert">
          {error}
          <button onClick={() => void load()} disabled={busy}>
            Retry loading
          </button>
        </div>
      )}
      {notice && (
        <p className="bh-notice" role="status">
          {notice}
        </p>
      )}
      {loading && <p aria-live="polite">Loading the saved record…</p>}
      {tab === "overview" && (
        <>
          <div className="bh-metrics">
            <article>
              <span>Latest reported mood</span>
              <strong>{latest ? `${latest.value}/5` : "No report"}</strong>
              <p>
                {latest
                  ? `${moods[latest.value - 1]} · ${dateLabel(latest.recorded_at)}`
                  : "Record a check-in below."}
              </p>
            </article>
            <article>
              <span>Last recorded sleep</span>
              <strong>
                {typeof sleep === "number"
                  ? `${sleep.toFixed(1)} h`
                  : "Not recorded"}
              </strong>
              <p>
                {snapshot?.recorded_at
                  ? dateLabel(snapshot.recorded_at)
                  : "No observation available."}
              </p>
            </article>
            <article>
              <span>Experimental stress model</span>
              <strong>
                {typeof stress === "number" ? stress.toFixed(2) : "Unavailable"}
              </strong>
              <p>Model output, 0–1. Not a mood score or diagnosis.</p>
            </article>
          </div>
          <div className="bh-grid">
            <article className="bh-card">
              <div className="bh-card-heading">
                <div>
                  <p className="workspace-eyebrow">One honest moment</p>
                  <h2>Record a mood check-in</h2>
                </div>
                <Icon name="heart" />
              </div>
              <p className="bh-muted">
                {owner
                  ? "How would you describe your mood?"
                  : "Record the crew member’s reported mood, rather than inferring it from their journal."}{" "}
                Check-ins here are visible to your signed-in account for this
                crew record.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void review();
                }}
              >
                <fieldset disabled={busy || !!proposal}>
                  <legend>Reported mood</legend>
                  <div className="bh-mood-options">
                    {moods.map((label, i) => (
                      <label key={label}>
                        <input
                          type="radio"
                          name="mood"
                          value={i + 1}
                          checked={mood === i + 1}
                          onChange={() => {
                            setMood(i + 1);
                            pending.current = null;
                          }}
                        />
                        <span>
                          <b>{i + 1}</b>
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <label className="bh-field">
                    Observed at (UTC)
                    <input
                      type="datetime-local"
                      required
                      value={at}
                      max={utcNow()}
                      onChange={(e) => {
                        setAt(e.target.value);
                        pending.current = null;
                      }}
                    />
                  </label>
                  <button className="bh-primary" disabled={loading || !context}>
                    Review check-in
                  </button>
                </fieldset>
              </form>
              {proposal && (
                <div
                  className="bh-review"
                  role="region"
                  aria-label="Review mood check-in"
                >
                  <h3>Ready to save?</h3>
                  <p>
                    {moods[proposal.observation.value - 1]} ·{" "}
                    {proposal.observation.value}/5
                  </p>
                  <p>{dateLabel(proposal.observation.recorded_at)}</p>
                  <button
                    className="bh-primary"
                    disabled={busy}
                    onClick={() => void confirmMood()}
                  >
                    Confirm check-in
                  </button>
                  <button disabled={busy} onClick={() => setProposal(null)}>
                    Edit check-in
                  </button>
                </div>
              )}
            </article>
            <article className="bh-card">
              <p className="workspace-eyebrow">Your recorded perspective</p>
              <h2>Mood over time</h2>
              <MoodTrend entries={reports} />
            </article>
          </div>
          <div className="bh-grid">
            <article className="bh-card">
              <h2>Sleep observations</h2>
              <p className="bh-muted">
                Up to fourteen recorded readings from the last seven days.
                Repeated readings can belong to the same sleep period; they are
                not averaged into nights.
              </p>
              {sleepHistory.length ? (
                <div className="bh-sleep-list">
                  {[...sleepHistory].reverse().map((h, i) => (
                    <div key={i}>
                      <time>{dateLabel(h.recorded_at)}</time>
                      <meter
                        min="0"
                        max="24"
                        value={h.sleep_duration_hr!}
                        aria-label={`Sleep at ${dateLabel(h.recorded_at)}`}
                      />
                      <strong>{h.sleep_duration_hr} h</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No sleep observations in this review window.</p>
              )}
            </article>
            <article className="bh-card">
              <h2>Make room for support</h2>
              <p>
                Review changes in sleep or mood with the crew medical officer.
                Use your mission’s approved routine for rest, exercise and
                connection with others.
              </p>
              <div className="bh-support-actions">
                <button onClick={() => setTab("journal")}>
                  {owner ? "Write privately" : "Review shared entries"}
                </button>
                <button onClick={() => setTab("support")}>
                  Open wellbeing assistant
                </button>
              </div>
              <p className="bh-muted">
                Isolation and mental health conditions are not diagnosed by
                these indicators. If you feel unsafe or symptoms are severe,
                contact the crew medical officer or follow the mission emergency
                protocol now.
              </p>
              <a
                href="https://www.nasa.gov/hrp/hazards/"
                target="_blank"
                rel="noreferrer"
              >
                NASA: hazards of human spaceflight ↗
              </a>
            </article>
          </div>
          {reports.length > 0 && (
            <article className="bh-card">
              <h2>Manage check-ins</h2>
              <p className="bh-muted">
                Only reports recorded by your account appear here. Deleting a
                report removes it from this trend.
              </p>
              <div className="bh-report-list">
                {reports.map((p) => (
                  <div key={p.id}>
                    <span>
                      {dateLabel(p.recorded_at)} · {moods[p.value - 1]} (
                      {p.value}/5)
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => void removeObservation(p.id)}
                      aria-label={`Delete check-in ${dateLabel(p.recorded_at)}`}
                    >
                      Delete check-in
                    </button>
                  </div>
                ))}
              </div>
            </article>
          )}
        </>
      )}
      {tab === "journal" && (
        <div className="bh-grid">
          <article className="bh-card">
            <p className="workspace-eyebrow">Your words, your permission</p>
            <h2>{owner ? "Private journal" : "Shared journal access"}</h2>
            <p>
              {owner
                ? "Entries stay private unless you choose to share them with the operator. Sharing an entry does not enable cloud processing."
                : "Only entries explicitly shared by this crew member appear here. Operators cannot create entries on their behalf or change their sharing preferences."}
            </p>
            {owner ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void journalAction("", "POST", {
                    text: text.trim(),
                    consent: share,
                  });
                }}
              >
                <label className="bh-field">
                  Journal text
                  <textarea
                    required
                    maxLength={10000}
                    rows={8}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="bh-consent">
                  <input
                    type="checkbox"
                    checked={share}
                    onChange={(e) => setShare(e.target.checked)}
                    disabled={busy}
                  />
                  Share this entry with the operator
                </label>
                <button className="bh-primary" disabled={busy || !text.trim()}>
                  Save journal
                </button>
              </form>
            ) : (
              <div className="bh-empty">
                <Icon name="lock" />
                <p>
                  Privacy is controlled by the crew member. An empty list does
                  not imply that no private entries exist.
                </p>
              </div>
            )}
          </article>
          <article className="bh-card">
            <h2>{owner ? "My entries" : "Entries shared with you"}</h2>
            {!entries.length && !loading && (
              <p>No entries available to this account.</p>
            )}
            <div className="bh-journal-list">
              {entries.map((j) => (
                <article key={j.id} aria-label="Journal entry">
                  <div className="bh-entry-meta">
                    <time>{dateLabel(j.created_at)}</time>
                    <span className="bh-badge">
                      {j.consent ? "Shared" : "Private"}
                    </span>
                  </div>
                  <p className="bh-journal-text">{j.text}</p>
                  {owner && (
                    <div className="bh-support-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void journalAction("/" + j.id, "PATCH", {
                            consent: !j.consent,
                          })
                        }
                      >
                        {j.consent ? "Revoke sharing" : "Share entry"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Delete this journal entry?"))
                            void journalAction("/" + j.id, "DELETE");
                        }}
                      >
                        Delete entry
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </article>
        </div>
      )}
      {tab === "support" && (
        <div className="bh-card">
          <p className="bh-muted">
            The assistant uses your stored evidence and bundled guidance
            locally. Optional Meta explanations require saved processing
            consent. Journal processing requires separate owner consent and
            explicit entry selection.
          </p>
          <Assistant key={crew} crew={crew} initialMode="wellbeing" />
        </div>
      )}
    </section>
  );
}
