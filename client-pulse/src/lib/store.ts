import { CREW } from '../data/crew';
import { NOMINAL } from '../data/presets';
import type {
  CrewId,
  PulseTelemetryResponse,
  SimEvent,
  Status,
  Symptom,
  Task,
  Telemetry,
} from '../types';

/** Everything Pulse remembers per crew member. The whole store is keyed by crew_id (spec: global state by crew_id). */
export interface CrewState {
  form: Telemetry;
  vitals: { hr: number; spo2: number; eda: number };
  status: Status;
  statusNote?: string;
  simEvent: SimEvent;
  hrHistory: number[];
  symptoms: Symptom[];
  tasks: Task[];
  response: PulseTelemetryResponse | null; // last backend response for this crew member
  error: string | null;
  syncedAt: string | null;
  source: 'default' | 'model' | 'local';
}

export type CrewStore = Record<CrewId, CrewState>;

export const NOMINAL_VITALS = {
  hr: NOMINAL.hr_bpm,
  spo2: NOMINAL.spo2_pct,
  eda: NOMINAL.eda_tonic_us,
};

// PLACEHOLDER history. Replaced by hr_24h_bars from the backend response once it is returned.
const seedHistory = (offset: number) =>
  Array.from(
    { length: 24 },
    (_, i) =>
      62 + offset + Math.round(Math.sin((i + offset) / 2.2) * 5 + (i % 3)),
  );

const freshTasks = (): Task[] => [
  { id: 'resistive', label: 'Resistive exercise', done: false },
  { id: 'hydration', label: 'Hydration check', done: true },
  { id: 'sleep', label: 'Sleep window 22:30', done: false },
  { id: 'badge', label: 'Radiation badge', done: false },
];

export const initialCrewState = (id: CrewId, index: number): CrewState => ({
  form: { ...NOMINAL, crew_id: id },
  vitals: { hr: NaN, spo2: NaN, eda: NaN },
  status: 'Unknown',
  statusNote: 'No observation loaded',
  simEvent: null,
  hrHistory: [],
  symptoms: [],
  tasks: [],
  response: null,
  error: null,
  syncedAt: null,
  source: 'default',
});

export const initialStore = (): CrewStore =>
  Object.fromEntries(
    CREW.map((c, i) => [c.id, initialCrewState(c.id, i)]),
  ) as CrewStore;
