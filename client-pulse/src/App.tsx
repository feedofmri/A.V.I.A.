import { Workspace } from "./platform/Workspace";
import { useSession, api } from "./platform/session";
import { enqueue, flush, operations, overlayTasks } from "./platform/outbox";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pulseApi } from "./api/pulse";
import { COCKPIT_URL, HEALTH_POLL_MS } from "./config";
import { CREW, crewName } from "./data/crew";
import { buildPayload, localStatus, statusFromAnomaly } from "./lib/payload";
import {
  initialStore,
  NOMINAL_VITALS,
  type CrewState,
  type CrewStore,
} from "./lib/store";
import { CrewRail } from "./components/CrewRail";
import { SCREENS, Watch } from "./components/Watch";
import { TelemetryDrawer } from "./components/TelemetryDrawer";
import type { CrewId, SimEvent, Telemetry } from "./types";

const clock = () => new Date().toISOString().slice(11, 16) + " UTC";

export default function App() {
  const user = useSession();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [crews, setCrews] = useState<CrewStore>(initialStore); // global state, organised by crew_id
  const [active, setActive] = useState<CrewId>(
    (user.crew ?? "okafor") as CrewId,
  );
  const [screen, setScreen] = useState(0);
  const [section, setSection] = useState<"dashboard" | "assistant" | "tools">(
    "dashboard",
  );
  const [time, setTime] = useState(clock());
  const [drawer, setDrawer] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const cs = crews[active];
  const payload = useMemo(() => buildPayload(cs.form), [cs.form]);

  const update = useCallback(
    (id: CrewId, fn: (s: CrewState) => CrewState) =>
      setCrews((c) => ({ ...c, [id]: fn(c[id]) })),
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const id = setInterval(() => setTime(clock()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Green "Offline · on-board models" badge: only while GET /api/v1/health passes.
  useEffect(() => {
    let live = true;
    const check = () =>
      pulseApi
        .health()
        .then(
          (h) =>
            live &&
            setModelsLoaded(h.models_loaded === true || h.status === "online"),
        )
        .catch(() => live && setModelsLoaded(false));
    check();
    const id = setInterval(check, HEALTH_POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  // Hydrate every crew member's watch from the last stored reading + model output.
  useEffect(() => {
    let live = true;
    const hydrate = () => {
      for (const { id } of CREW.filter(
        (c) => user.role === "operator" || c.id === user.crew,
      )) {
        pulseApi
          .state(id)
          .then((s) => {
            if (!live || !s.vitals_current) return;
            const v = s.vitals_current;
            update(id, (cs) => ({
              ...cs,
              vitals: {
                hr: Math.round(v.hr_bpm),
                spo2: Math.round(v.spo2_pct),
                eda: v.eda_us ?? cs.vitals.eda,
              },
              status: s.inference_current
                ? (s.crew_status_badge ?? "Unknown")
                : "Unknown",
              statusNote: s.inference_current
                ? "Stored assessment"
                : "Assessment pending or stale",
              hrHistory: s.hr_24h_bars?.length
                ? s.hr_24h_bars.slice(-24)
                : cs.hrHistory,
              response: s,
              source: "model",
              symptoms: Array.isArray(s.symptoms)
                ? (s.symptoms as any[]).map((a) => ({
                    id: a.id,
                    label: a.detail,
                    at: new Date(a.first_seen_at).toISOString(),
                  }))
                : cs.symptoms,
              syncedAt: s.recorded_at
                ? new Date(s.recorded_at).toISOString()
                : cs.syncedAt,
            }));
          })
          .catch(() => {
            /* last stored observation remains labeled with its time */
          });
        api<any[]>("/software/crew/" + id + "/tasks")
          .then(async (tasks) => {
            const view = overlayTasks(tasks, await operations(user.name));
            if (live)
              update(id, (cs) => ({
                ...cs,
                tasks: view.map((t) => ({
                  id: String(t.id),
                  label: t.label,
                  done: t.done,
                })),
              }));
          })
          .catch(() => {});
      }
    };
    hydrate();
    const timer = setInterval(hydrate, 5000);
    window.addEventListener("avia-data-changed", hydrate);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("avia-data-changed", hydrate);
    };
  }, [update, user.name]);

  const setForm = (form: Telemetry) => update(active, (s) => ({ ...s, form }));

  const simulate = (e: SimEvent) => {
    update(active, (s) => {
      if (e === "spo2")
        return {
          ...s,
          source: "local",
          syncedAt: null,
          simEvent: e,
          vitals: { ...NOMINAL_VITALS, spo2: 91 },
          status: "Warning",
          statusNote: "Simulation only: SpO₂ low",
        };
      if (e === "critical")
        return {
          ...s,
          simEvent: e,
          vitals: { hr: 148, spo2: 96, eda: 4.6 },
          status: "Critical",
          statusNote: "Simulation only: irregular rhythm",
        };
      return {
        ...s,
        source: "local",
        syncedAt: null,
        simEvent: null,
        vitals: { ...NOMINAL_VITALS },
        status: "Nominal",
        statusNote: "Simulation only",
      };
    });
  };

  const logSymptom = (label: string) => {
    const at = clock();
    update(active, (s) => ({
      ...s,
      symptoms: [{ id: Date.now(), label, at }, ...s.symptoms],
    }));
    pulseApi
      .logSymptom(active, label)
      .catch((e: Error) => update(active, (s) => ({ ...s, error: e.message })));
  };

  const toggleTask = (taskId: string) => {
    const done = !cs.tasks.find((t) => t.id === taskId)?.done;
    update(active, (s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)),
    }));
    void enqueue(
      user.name,
      "/bff/software/crew/" + active + "/tasks/" + taskId,
      "PATCH",
      { done },
    )
      .then(() => flush(user.name))
      .catch((e: Error) => update(active, (s) => ({ ...s, error: e.message })));
  };

  const sync = async () => {
    const id = active;
    const f = cs.form;
    const req = payload;
    setSyncing(true);
    update(id, (s) => ({
      ...s,
      simEvent: null,
      error: null,
      vitals: { hr: f.hr_bpm, spo2: f.spo2_pct, eda: f.eda_tonic_us },
      hrHistory: [...s.hrHistory.slice(1), f.hr_bpm],
    }));
    try {
      const res = await pulseApi.ingest(req);
      update(id, (s) => ({
        ...s,
        response: res,
        error: null,
        source: "model",
        syncedAt: clock(),
        statusNote: res.inference_current
          ? "Current stored assessment"
          : "Accepted; assessment pending or stale",
        status: res.inference_current
          ? (res.crew_status_badge ?? "Unknown")
          : "Unknown",
        hrHistory: res.hr_24h_bars?.length
          ? res.hr_24h_bars.slice(-24)
          : s.hrHistory,
      }));
    } catch (e) {
      update(id, (s) => ({
        ...s,
        response: null,
        error: e instanceof Error ? e.message : String(e),
        source: "local",
        syncedAt: s.syncedAt,
        status: "Unknown",
        statusNote: "Pending delivery or assessment",
      }));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>A.V.I.A. Pulse</h1>
          <p className="muted">
            Software Pulse interface · crew {crewName(active)}
          </p>
        </div>
        <span className="spacer" />
        <span
          className={modelsLoaded ? "pill pill--ok" : "pill"}
          title="GET /api/v1/health"
        >
          <i /> {modelsLoaded ? "Local models available" : "Backend offline"}
        </span>
        <button
          className="icon-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle light or dark theme"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <a className="link" href={COCKPIT_URL} target="_blank" rel="noreferrer">
          Open A.V.I.A. Cockpit ↗
        </a>
      </header>

      <nav className="pulse-workspace-nav" aria-label="Pulse navigation">
        {[
          ["dashboard", "Crew dashboard"],
          ["assistant", "Health assistant"],
          ["tools", "Mission tools"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={section === id}
            onClick={() => setSection(id as typeof section)}
          >
            {label}
          </button>
        ))}
      </nav>
      {section !== "assistant" && Array.isArray(cs.response?.active_alerts) && (
        <section className="pulse-alert-strip" aria-label="Stored alerts">
          <h2>Stored alerts</h2>
          {(cs.response.active_alerts as any[]).map((a) => (
            <p key={a.id}>
              {a.title} · {a.severity} · {a.state}
            </p>
          ))}
        </section>
      )}
      {section !== "dashboard" && (
        <Workspace
          key={section}
          crewId={active}
          initialTab={section === "assistant" ? "assistant" : "guide"}
          focused={section === "assistant"}
          onCrewChange={(crew) => setActive(crew as CrewId)}
        />
      )}
      <div hidden={section !== "dashboard"}>
        <p className="muted">
          Browser demonstration. Scenario buttons simulate values; no hardware
          is connected. Stored results are experimental decision support.
        </p>
        <CrewRail crews={crews} active={active} onSelect={setActive} />

        <main className="main">
          <div>
            <Watch
              screen={screen}
              time={time}
              status={cs.status}
              statusNote={cs.statusNote}
              vitals={cs.vitals}
              hrHistory={cs.hrHistory}
              symptoms={cs.symptoms}
              tasks={cs.tasks}
              onLogSymptom={logSymptom}
              onToggleTask={toggleTask}
              onPrev={() =>
                setScreen((s) => (s + SCREENS.length - 1) % SCREENS.length)
              }
              onNext={() => setScreen((s) => (s + 1) % SCREENS.length)}
            />
            <p className="caption">
              {screen + 1} / {SCREENS.length} · {SCREENS[screen]}
            </p>
          </div>

          <aside className="panel">
            <h3>Screens</h3>
            <div className="grid2">
              {SCREENS.map((s, i) => (
                <button
                  key={s}
                  className={i === screen ? "btn btn--on" : "btn"}
                  onClick={() => setScreen(i)}
                >
                  {s}
                </button>
              ))}
            </div>

            <h3>Simulate an event on the watch</h3>
            <button
              className={
                cs.simEvent === "spo2"
                  ? "btn btn--on btn--block"
                  : "btn btn--block"
              }
              onClick={() => simulate("spo2")}
            >
              SpO₂ warning
            </button>
            <button
              className={
                cs.simEvent === "critical"
                  ? "btn btn--on btn--block"
                  : "btn btn--block"
              }
              onClick={() => simulate("critical")}
            >
              Critical: irregular rhythm
            </button>
            <button className="textbtn" onClick={() => simulate(null)}>
              Reset to nominal
            </button>

            <h3>Send readings to the backend</h3>
            <button
              className="btn btn--primary btn--block"
              onClick={() => setDrawer(true)}
            >
              Open telemetry input
            </button>

            <p className="muted small">
              Saved readings, symptoms and task updates are shared through the
              local backend. Pending entries remain in the browser queue until
              acknowledged.
            </p>
          </aside>
        </main>
      </div>

      <TelemetryDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        crewId={active}
        onCrewChange={setActive}
        form={cs.form}
        setForm={setForm}
        payload={payload}
        syncing={syncing}
        onSync={sync}
        result={cs.response}
        error={cs.error}
      />
    </div>
  );
}
