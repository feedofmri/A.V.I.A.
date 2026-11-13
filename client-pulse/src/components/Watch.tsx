import {
  useRef,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { Status, Symptom, Task } from '../types';
import './watch.css';

export const SCREENS = [
  'Vitals',
  'Heart rate trend',
  'Symptom log',
  'Tasks',
  'Application',
] as const;
export const SYMPTOM_OPTIONS = ['Headache', 'Nausea', 'Dizziness', 'Fatigue'];

interface Props {
  screen: number;
  time: string;
  status: Status;
  statusNote?: string;
  vitals: { hr: number; spo2: number; eda: number };
  hrHistory: number[];
  symptoms: Symptom[];
  tasks: Task[];
  onLogSymptom: (label: string) => void;
  onToggleTask: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

const HR_MIN = 40;
const HR_MAX = 160;
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

/* ---------- small SVG helpers ---------- */

/** Smooth (Catmull-Rom -> cubic Bezier) path through points. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function Ring({
  frac,
  size = 44,
  stroke = 4,
  color,
  children,
}: {
  frac: number;
  size?: number;
  stroke?: number;
  color: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="sw-ring" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * clamp(frac)} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <span className="sw-ring__in">{children}</span>}
    </span>
  );
}

/** Semicircle heart-rate gauge with an end marker. */
function Gauge({ hr }: { hr: number }) {
  const frac = clamp((hr - HR_MIN) / (HR_MAX - HR_MIN));
  const a = Math.PI * (1 - frac);
  const x = 120 + 100 * Math.cos(a);
  const y = 112 - 100 * Math.sin(a);
  const d = 'M20,112 A100,100 0 0 1 220,112';
  return (
    <svg className="sw-gauge" viewBox="0 0 240 124" aria-hidden="true">
      <defs>
        <linearGradient id="swg" x1="0" x2="1">
          <stop offset="0" stopColor="rgba(var(--s-rgb),0.25)" />
          <stop offset="1" stopColor="rgb(var(--s-rgb))" />
        </linearGradient>
      </defs>
      <path
        d={d}
        pathLength={100}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d={d}
        pathLength={100}
        fill="none"
        stroke="url(#swg)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${frac * 100} 100`}
      />
      <circle cx={x} cy={y} r="9" fill="rgba(var(--s-rgb),0.25)" />
      <circle cx={x} cy={y} r="4.5" fill="#fff" />
    </svg>
  );
}

const BEAT_PX = 96;
const BEAT =
  'M0 20 H22 L27 20 L32 14 L37 20 H44 L48 25 L53 2 L58 32 L62 20 H77 Q85 13 92 20 H96';

/** Scrolling ECG trace; one beat per heart beat (duration = 60 / bpm s). Reduced motion stops it (CSS). */
function Ecg({ hr }: { hr: number }) {
  const dur = clamp(60 / hr, 0.35, 2);
  return (
    <div className="sw-ecg" aria-hidden="true">
      <div className="sw-ecg__run" style={{ animationDuration: `${dur}s` }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            width={BEAT_PX}
            height="34"
            viewBox={`0 0 ${BEAT_PX} 34`}
          >
            <path
              d={BEAT}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ))}
      </div>
    </div>
  );
}

const spo2Color = (v: number) =>
  v >= 95 ? '#5aa8ff' : v >= 90 ? '#f5a524' : '#ef4444';

/* ---------- faces ---------- */

function VitalsFace({
  vitals,
  note,
}: {
  vitals: Props['vitals'];
  note?: string;
}) {
  if (!Number.isFinite(vitals.hr))
    return (
      <div className="sw-face">
        <p>No observation available</p>
        <p>Enter or import a reading to begin.</p>
      </div>
    );
  return (
    <div className="sw-face">
      <div className="sw-hr">
        <Gauge hr={vitals.hr} />
        <div className="sw-hr__num">
          <b>{vitals.hr}</b>
          <small>bpm</small>
        </div>
      </div>
      <Ecg hr={vitals.hr} />
      <div className="sw-comps">
        <div className="sw-comp">
          <Ring frac={(vitals.spo2 - 85) / 15} color={spo2Color(vitals.spo2)} />
          <span className="sw-comp__t">
            <b>
              {vitals.spo2}
              <small>%</small>
            </b>
            <em>SpO₂</em>
          </span>
        </div>
        <div className="sw-comp">
          <Ring frac={vitals.eda / 10} color="#a99bff" />
          <span className="sw-comp__t">
            <b>
              {vitals.eda.toFixed(1)}
              <small>µS</small>
            </b>
            <em>EDA</em>
          </span>
        </div>
      </div>
      {note && <p className="sw-note">{note}</p>}
    </div>
  );
}

function TrendFace({ history, now }: { history: number[]; now: number }) {
  if (history.length < 2)
    return (
      <div className="sw-face">
        <p>Not enough stored observations for a trend.</p>
      </div>
    );
  const W = 300;
  const H = 150;
  const lo = Math.min(...history);
  const hi = Math.max(...history);
  const pad = Math.max(4, (hi - lo) * 0.25);
  const min = lo - pad;
  const max = hi + pad;
  const pts = history.map((v, i): [number, number] => [
    (i / (history.length - 1)) * W,
    H - ((v - min) / (max - min)) * H,
  ]);
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
  return (
    <div className="sw-face">
      <div className="sw-head">
        <span className="sw-cap">Heart rate</span>
        <span className="sw-cap">Last 24 readings</span>
      </div>
      <div className="sw-chartwrap">
        <svg
          className="sw-chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Heart rate trend"
        >
          <defs>
            <linearGradient id="swa" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6aa2ff" stopOpacity="0.34" />
              <stop offset="1" stopColor="#6aa2ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="2 5"
            />
          ))}
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#swa)" />
          <path
            d={line}
            fill="none"
            stroke="#8db6ff"
            strokeWidth="2.2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="sw-dotnow"
          style={
            {
              left: `${(last[0] / W) * 100}%`,
              top: `${(last[1] / H) * 100}%`,
            } as CSSProperties
          }
        />
      </div>
      <div className="sw-stats">
        <span>
          <em>Min</em>
          <b>{lo}</b>
        </span>
        <span>
          <em>Avg</em>
          <b>{avg}</b>
        </span>
        <span>
          <em>Max</em>
          <b>{hi}</b>
        </span>
        <span className="sw-stats__now">
          <em>Now</em>
          <b>{now}</b>
        </span>
      </div>
    </div>
  );
}

function SymptomFace({
  symptoms,
  onLog,
}: {
  symptoms: Symptom[];
  onLog: (l: string) => void;
}) {
  return (
    <div className="sw-face">
      <span className="sw-cap">Log a symptom</span>
      <div className="sw-grid">
        {SYMPTOM_OPTIONS.map((s) => (
          <button key={s} className="sw-pill" onClick={() => onLog(s)}>
            {s}
          </button>
        ))}
      </div>
      <span className="sw-cap sw-cap--gap">Recent</span>
      <ul className="sw-list">
        {symptoms.length === 0 && (
          <li className="sw-empty">Nothing logged yet</li>
        )}
        {symptoms.slice(0, 3).map((s) => (
          <li key={s.id}>
            <span>{s.label}</span>
            <em>{s.at}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TasksFace({
  tasks,
  onToggle,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
}) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <div className="sw-face">
      <div className="sw-head sw-head--ring">
        <Ring frac={done / tasks.length} size={40} stroke={4} color="#14c98f">
          <b>{done}</b>
        </Ring>
        <span>
          <b className="sw-h">Countermeasures</b>
          <em className="sw-sub">
            {done} of {tasks.length} done today
          </em>
        </span>
      </div>
      <ul className="sw-tasks">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              className={t.done ? 'sw-task sw-task--on' : 'sw-task'}
              onClick={() => onToggle(t.id)}
              aria-pressed={t.done}
            >
              <i>{t.done ? '✓' : ''}</i>
              <span>{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeviceFace() {
  return (
    <div className="sw-face">
      <div className="sw-head sw-head--ring">
        <span>
          <b className="sw-h">A.V.I.A. Pulse</b>
          <em className="sw-sub">Browser demonstration</em>
        </span>
      </div>
      <ul className="sw-rows">
        <li>
          <span>Input</span>
          <b>Forms · CSV</b>
        </li>
        <li>
          <span>Connection</span>
          <b>Local web API</b>
        </li>
        <li>
          <span>Hardware</span>
          <b>Not connected</b>
        </li>
        <li>
          <span>Version</span>
          <b>Software 1</b>
        </li>
      </ul>
    </div>
  );
}

/* ---------- the watch ---------- */

export function Watch(p: Props) {
  const scene = useRef<HTMLDivElement>(null);

  // 3D tilt: writes CSS variables directly (no re-render). Skipped for reduced motion.
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = scene.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
    el.style.setProperty('--rx', String(((0.5 - ny) * 16).toFixed(2)));
    el.style.setProperty('--ry', String(((nx - 0.5) * 20).toFixed(2)));
    el.style.setProperty('--mx', String((nx * 100).toFixed(0)));
    el.style.setProperty('--my', String((ny * 100).toFixed(0)));
  };
  const onLeave = () => {
    const el = scene.current;
    if (!el) return;
    ['--rx', '--ry', '--mx', '--my'].forEach((v) => el.style.removeProperty(v));
  };

  return (
    <div className="stage" data-status={p.status}>
      <button
        className="icon-btn"
        onClick={p.onPrev}
        aria-label="Previous screen"
      >
        ←
      </button>

      <div
        className="sw-scene"
        ref={scene}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        <div className="sw-3d" role="group" aria-label="Pulse smartwatch">
          <div className="sw-strap sw-strap--top" />
          <div className="sw-strap sw-strap--bot" />

          <div className="sw-case">
            <span className="sw-crown" />
            <span className="sw-btn" />

            <div className="sw-glass" data-status={p.status}>
              <header className="sw-top">
                <span className="sw-time">{p.time}</span>
                <span className={`sw-status sw-status--${p.status}`}>
                  <i />
                  {p.status}
                </span>
              </header>

              <div className="sw-body" key={p.screen}>
                {p.screen === 0 && (
                  <VitalsFace vitals={p.vitals} note={p.statusNote} />
                )}
                {p.screen === 1 && (
                  <TrendFace history={p.hrHistory} now={p.vitals.hr} />
                )}
                {p.screen === 2 && (
                  <SymptomFace symptoms={p.symptoms} onLog={p.onLogSymptom} />
                )}
                {p.screen === 3 && (
                  <TasksFace tasks={p.tasks} onToggle={p.onToggleTask} />
                )}
                {p.screen === 4 && <DeviceFace />}
              </div>

              <footer className="sw-dots">
                {SCREENS.map((s, i) => (
                  <span
                    key={s}
                    className={i === p.screen ? 'sw-dot sw-dot--on' : 'sw-dot'}
                  />
                ))}
              </footer>

              <i className="sw-sheen" />
            </div>
          </div>
        </div>
      </div>

      <button className="icon-btn" onClick={p.onNext} aria-label="Next screen">
        →
      </button>
    </div>
  );
}
