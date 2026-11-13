import { useEffect, useState, useRef } from "react";
import { api, useSession } from "./session";
import {
  enqueue,
  flush,
  operations,
  discard,
  overlayTasks,
  type Operation,
} from "./outbox";
import { parseCsv, exportCsv } from "./csv";
import { Assistant } from "./Assistant";
const CREW = ["okafor", "brandt", "sato", "diaz"];
const CREW_LABELS: Record<string, string> = {
  okafor: "Cmdr. A. Okafor",
  brandt: "Dr. L. Brandt",
  sato: "M. Sato",
  diaz: "R. Diaz",
};
const guidance = [
  {
    name: "Heart rate · bpm",
    text: "Enter a resting value and its UTC time. Compare readings collected under similar conditions. Activity, stress and sleep can change the result; an isolated value is not a diagnosis.",
    source: "https://medlineplus.gov/vitalsigns.html",
  },
  {
    name: "Oxygen saturation · %",
    text: "Enter an existing observation or use a labeled demonstration scenario. Accuracy has limitations; interpret symptoms and repeated observations together. A.V.I.A. does not establish oxygen measurement accuracy.",
    source:
      "https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters",
  },
  {
    name: "Sleep · hours",
    text: "Record total sleep for the previous sleep period. Keep a daily record at a consistent point in the mission routine. Duration and the experimental sleep-model output describe different things.",
    source: "https://www.nasa.gov/hrp/risks/",
  },
  {
    name: "HRV · ms and EDA · µS",
    text: "Use the same units and observation conditions as your personal baseline. These prototype indicators support trend review; they do not diagnose stress or a cardiac condition.",
    source: "https://www.nasa.gov/hrp/hazards/",
  },
  {
    name: "Respiration · breaths/min and skin temperature · °C",
    text: "Enter the observation and unit exactly. Skin temperature is not core body temperature. Mark missing observations as missing rather than inventing normal values.",
    source: "https://medlineplus.gov/vitalsigns.html",
  },
];
export function Workspace({
  crewId,
  initialTab = "guide",
  focused = false,
  onCrewChange,
}: {
  crewId?: string;
  initialTab?: string;
  focused?: boolean;
  onCrewChange?: (crew: string) => void;
}) {
  const user = useSession(),
    [crew, setCrew] = useState(crewId ?? user.crew ?? "okafor"),
    [tab, setTab] = useState(initialTab),
    [message, setMessage] = useState(""),
    [queue, setQueue] = useState<Operation[]>([]),
    [entries, setEntries] = useState<any[]>([]),
    [text, setText] = useState(""),
    [consent, setConsent] = useState(false),
    [tasks, setTasks] = useState<any[]>([]),
    [activity, setActivity] = useState<any[]>([]),
    [taskHistory, setTaskHistory] = useState<any[]>([]),
    [taskLabel, setTaskLabel] = useState(""),
    [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const selected = user.role === "crew" ? user.crew! : crew;
  useEffect(() => {
    if (crewId) setCrew(crewId);
  }, [crewId]);
  const sequence = useRef(0);
  const load = async () => {
    const seq = ++sequence.current;
    try {
      if (tab === "journal") {
        const data = await api<any[]>(`/software/crew/${selected}/journal`);
        if (seq === sequence.current) setEntries(data);
      }
      if (tab === "tasks") {
        const [data, history] = await Promise.all([
          api<any[]>(`/software/crew/${selected}/tasks`),
          api<any[]>(`/software/crew/${selected}/task-history`),
        ]);
        const pending = await operations(user.name);
        if (seq === sequence.current) {
          setTasks(overlayTasks(data, pending));
          setTaskHistory(history);
          if (
            !pending.some(
              (o) =>
                o.path.includes("/tasks/") ||
                o.path.includes("/countermeasures/"),
            )
          )
            setMessage((current) =>
              current.startsWith("Task update saved locally")
                ? "Task update acknowledged by server"
                : current,
            );
        }
      }
      if (tab === "queue") setQueue(await operations(user.name));
      if (tab === "history" && user.role === "operator")
        setActivity(await api<any[]>("/software/activity"));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  useEffect(() => {
    setEntries([]);
    setTasks([]);
    setTaskHistory([]);
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      clearInterval(timer);
      sequence.current++;
    };
  }, [tab, selected, user.name]);
  return (
    <section
      className="platform-card workspace-page"
      data-testid="software-workspace"
      aria-label="Mission tools workspace"
    >
      {!focused && (
        <header className="workspace-heading">
          <div>
            <p className="workspace-eyebrow">CREW HEALTH / MISSION SUPPORT</p>
            <h1>Health workspace</h1>
            <p>Guidance, daily actions and your private health record.</p>
          </div>
          <span className="workspace-label">Mission clock · UTC</span>
        </header>
      )}
      {!focused && (
        <nav className="platform-tabs" aria-label="Mission tools">
          {[
            "guide",
            "assistant",
            "import",
            "tasks",
            "journal",
            "queue",
            ...(user.role === "operator" ? ["history"] : []),
          ].map((t) => (
            <button
              key={t}
              data-workspace-tab={t}
              aria-pressed={tab === t}
              onClick={() => {
                setTab(t);
                setMessage("");
              }}
            >
              {
                {
                  guide: "Health guide",
                  assistant: "Health assistant",
                  import: "Data import",
                  tasks: "Care tasks",
                  journal: "Journal",
                  queue: "Sync queue",
                  history: "Activity",
                }[t]
              }
            </button>
          ))}
        </nav>
      )}
      {user.role === "operator" && (
        <label className="workspace-crew">
          Crew
          <select
            aria-label="Crew"
            value={crew}
            onChange={(e) => {
              setCrew(e.target.value);
              onCrewChange?.(e.target.value);
            }}
          >
            {CREW.map((c) => (
              <option key={c} value={c}>
                {CREW_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      )}
      {tab === "assistant" && <Assistant key={selected} crew={selected} />}
      {tab === "guide" && (
        <section>
          <h2>Understand your observations</h2>
          <p>
            This software prototype supports reviewing trends and discussing
            concerns. Its rules and experimental models are not validated
            medical diagnoses. Severe symptoms or a Critical flag require prompt
            review under the mission medical protocol; do not let a model score
            delay contacting the designated medical officer.
          </p>
          {guidance.map((g) => (
            <article key={g.name}>
              <h3>{g.name}</h3>
              <p>{g.text}</p>
              <a href={g.source} target="_blank" rel="noreferrer">
                Educational source
              </a>
            </article>
          ))}
          <h3>Spaceflight context</h3>
          <p>
            NASA describes five hazards: radiation, isolation/confinement,
            distance from Earth, altered gravity, and hostile closed
            environments. A.V.I.A. demonstrates sleep/stress and cardiovascular
            monitoring plus a heuristic skeletal projection. It does not assess
            radiation dose, diagnose immune disorders, or measure bone density.
          </p>
          <a
            href="https://www.nasa.gov/hrp/hazards/"
            target="_blank"
            rel="noreferrer"
          >
            NASA hazard overview
          </a>
          <h3>Guidance library · version 1</h3>
          <p>
            Educational guidance for reviewing crew health observations;
            sources checked 12 November 2026. Clinical review is not
            established. Recheck units and the entered observation, review the
            personal baseline and quality flags, log symptoms, and seek mission
            medical review for persistent or concerning changes. Medication and
            exercise prescriptions are excluded; use only the individual's
            approved mission plan.
          </p>
        </section>
      )}
      {tab === "import" && (
        <section>
          <h2>Import historical observations</h2>
          <p>
            CSV, 1–200 rows. Required columns: hr_bpm, spo2_pct, eda_tonic_us,
            hrv_rmssd_ms, sleep_duration_hr. Optional: recorded_at (UTC ISO),
            resp_rate_bpm, skin_temp_c, scr_peaks_min, mission_day. Import into{" "}
            {selected}. Uploaded values are user-supplied, not independently
            verified.
          </p>
          <input
            aria-label="Import telemetry CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const rows = parseCsv(await file.text());
                for (const row of rows) {
                  const id = crypto.randomUUID();
                  await enqueue(
                    user.name,
                    "/bff/api/v1/pulse/ingest",
                    "POST",
                    {
                      ...row,
                      input_origin: "csv",
                      crew_id: selected,
                      event_id: id,
                      recorded_at: row.recorded_at ?? new Date().toISOString(),
                    },
                    id,
                  );
                }
                setMessage(`${rows.length} readings saved to the local queue`);
                void flush(user.name);
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          />
          <button
            onClick={() => {
              const csv =
                "recorded_at,hr_bpm,spo2_pct,eda_tonic_us,hrv_rmssd_ms,sleep_duration_hr\n" +
                new Date().toISOString() +
                ",61,98,1.9,62,7.5\n";
              const url = URL.createObjectURL(
                new Blob([csv], { type: "text/csv" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "avia-example.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download example CSV
          </button>
        </section>
      )}
      {tab === "tasks" && (
        <section>
          <h2>{CREW_LABELS[selected]} · assigned actions</h2>
          <p>
            UTC due dates. Tasks represent the approved plan entered by an
            operator; they are not medical prescriptions generated by the
            models.
          </p>
          {user.role === "operator" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/cockpit/countermeasures", "POST", {
                    label: taskLabel,
                    crew_id: selected,
                    scheduled_for: due,
                    source: "manual",
                  });
                  setTaskLabel("");
                  setMessage("Action scheduled");
                  void load();
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              <label>
                Action label
                <input
                  required
                  maxLength={200}
                  value={taskLabel}
                  onChange={(e) => setTaskLabel(e.target.value)}
                />
              </label>
              <label>
                Due date UTC
                <input
                  required
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <button>Schedule action</button>
            </form>
          )}
          {tasks.length === 0 && <p>No assigned actions.</p>}
          {tasks.map((t) => (
            <label className="workspace-task" key={t.id}>
              <input
                type="checkbox"
                checked={t.done}
                onChange={async (e) => {
                  const done = e.currentTarget.checked;
                  setTasks((items) =>
                    items.map((item) =>
                      item.id === t.id
                        ? { ...item, done, pending: true }
                        : item,
                    ),
                  );
                  try {
                    await enqueue(
                      user.name,
                      `/bff/software/crew/${selected}/tasks/${t.id}`,
                      "PATCH",
                      { done },
                    );
                    setMessage(
                      "Task update saved locally; waiting for server acknowledgment",
                    );
                    void flush(user.name);
                  } catch (e) {
                    setTasks((items) =>
                      items.map((item) =>
                        item.id === t.id
                          ? { ...item, done: !done, pending: false }
                          : item,
                      ),
                    );
                    setMessage((e as Error).message);
                  }
                }}
              />
              <span className="workspace-task-copy">
                <strong>{t.label}</strong>
                <small>
                  Due {t.scheduled_for} UTC
                  {t.pending ? " · pending server acknowledgment" : ""}
                  {t.completed_at ? " · completed " + t.completed_at : ""}
                </small>
              </span>
              <span
                className={"workspace-task-state " + (t.done ? "complete" : "")}
              >
                {t.done ? "Completed" : t.pending ? "Syncing" : "Open"}
              </span>
            </label>
          ))}
          <details>
            <summary>Completion history</summary>
            {taskHistory.map((h) => (
              <p key={h.id}>
                {h.recorded_at} · {h.actor} · {h.label} ·{" "}
                {h.done ? "Completed" : "Reopened"}
              </p>
            ))}
          </details>
        </section>
      )}
      {tab === "journal" && (
        <section>
          <h2>{CREW_LABELS[selected]} · private text journal</h2>
          <p>
            Entries are encrypted in the local server database. Operators see
            only entries whose owner has explicitly shared them. No sentiment
            model analyzes this text.
          </p>
          {user.role === "crew" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(`/software/crew/${selected}/journal`, "POST", {
                    text,
                    consent,
                  });
                  setText("");
                  setConsent(false);
                  setMessage("Journal saved");
                  void load();
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              <label>
                Journal text
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                  maxLength={10000}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Share this entry with the operator
              </label>
              <button>Save journal</button>
            </form>
          )}
          {entries.length === 0 && <p>No entries available to this account.</p>}
          {entries.map((j) => (
            <article key={j.id}>
              <small>
                {new Date(j.created_at).toISOString()} ·{" "}
                {j.consent ? "Shared" : "Private"}
              </small>
              <p style={{ whiteSpace: "pre-wrap" }}>{j.text}</p>
              {user.role === "crew" && (
                <>
                  <button
                    onClick={async () => {
                      await api(
                        `/software/crew/${selected}/journal/${j.id}`,
                        "PATCH",
                        { consent: !j.consent },
                      );
                      void load();
                    }}
                  >
                    {j.consent ? "Revoke sharing" : "Share entry"}
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm("Delete this journal entry?")) {
                        await api(
                          `/software/crew/${selected}/journal/${j.id}`,
                          "DELETE",
                        );
                        void load();
                      }
                    }}
                  >
                    Delete entry
                  </button>
                </>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "queue" && (
        <section>
          <h2>Durable local queue</h2>
          <p>
            Pending entries survive reloads. Failed validation entries need
            review. Only server-acknowledged entries leave this list. Signing
            out preserves this user's queue.
          </p>
          {queue.length === 0 ? (
            <p>No queued operations.</p>
          ) : (
            queue.map((o) => (
              <article key={o.id}>
                {o.createdAt} · {o.state} · {o.error ?? "Awaiting server"}
                <button
                  onClick={async () => {
                    if (confirm("Discard this unsent entry?")) {
                      await discard(o.id);
                      void load();
                    }
                  }}
                >
                  Discard
                </button>
              </article>
            ))
          )}
        </section>
      )}
      {tab === "history" && (
        <section>
          <h2>Activity history</h2>
          <p>
            Actor and action history excludes raw journal and symptom content.
          </p>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    exportCsv(
                      activity.map(
                        ({ actor, action, resource, recorded_at }) => ({
                          actor,
                          action,
                          resource,
                          recorded_at,
                        }),
                      ),
                    ),
                  ],
                  { type: "text/csv" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "avia-activity.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export activity CSV
          </button>
          {activity.map((a) => (
            <p key={a.id}>
              {new Date(a.recorded_at).toISOString()} · {a.actor} · {a.action}{" "}
              {a.resource} ·{" "}
              {a.detail?.state ??
                (a.detail?.done == null
                  ? ""
                  : a.detail.done
                    ? "Completed"
                    : "Reopened")}
            </p>
          ))}
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
