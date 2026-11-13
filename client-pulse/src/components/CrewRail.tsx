import { useSession } from '../platform/session';
import { CREW } from '../data/crew';
import type { CrewStore } from '../lib/store';
import type { CrewId } from '../types';

interface Props {
  crews: CrewStore;
  active: CrewId;
  onSelect: (id: CrewId) => void;
}

/** One card per crew member. Shows the per-crew state Pulse keeps (keyed by crew_id). */
export function CrewRail({ crews, active, onSelect }: Props) {
  const user = useSession();
  return (
    <nav className="rail" aria-label="Crew members">
      {CREW.filter((c) => user.role === 'operator' || c.id === user.crew).map(
        (c) => {
          const s = crews[c.id];
          return (
            <button
              key={c.id}
              className={c.id === active ? 'crew crew--on' : 'crew'}
              onClick={() => onSelect(c.id)}
              aria-pressed={c.id === active}
            >
              <span className="crew__top">
                <b>{c.name}</b>
                <span className={`tag tag--${s.status}`}>{s.status}</span>
              </span>
              <span className="crew__vals">
                <span>
                  <b>{Number.isFinite(s.vitals.hr) ? s.vitals.hr : '—'}</b>
                  <small>bpm</small>
                </span>
                <span>
                  <b>{Number.isFinite(s.vitals.spo2) ? s.vitals.spo2 : '—'}</b>
                  <small>% SpO₂</small>
                </span>
                <span>
                  <b>
                    {Number.isFinite(s.vitals.eda)
                      ? s.vitals.eda.toFixed(1)
                      : '—'}
                  </b>
                  <small>µS</small>
                </span>
              </span>
              <span className="crew__sync">
                {s.syncedAt
                  ? `Last stored observation · ${s.syncedAt}`
                  : 'No server-acknowledged observation displayed'}
              </span>
            </button>
          );
        },
      )}
    </nav>
  );
}
