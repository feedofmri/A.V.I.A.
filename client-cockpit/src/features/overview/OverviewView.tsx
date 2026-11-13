import { useCockpitData } from '../../api/CockpitData';
import { bff, type Countermeasure } from '../../api/bff';
import { StatusPill } from '../../components/StatusPill';
import { WaveLine } from '../../components/WaveLine';
import { statusClass } from '../../lib/status';
import { useEffect, useState } from 'react';

const WAVE_VARIANTS: ('gentle' | 'sharp' | 'arc' | 'flat')[] = [
  'gentle',
  'flat',
  'arc',
  'sharp',
];

interface OverviewViewProps {
  onNavigate?: (
    v: 'overview' | 'twin' | 'analytics' | 'alerts' | 'behavioral' | 'setup',
  ) => void;
}

export function OverviewView({ onNavigate }: OverviewViewProps = {}) {
  const { crew: CREW, alerts: ALERTS, error } = useCockpitData();
  const [countermeasures, setCountermeasures] = useState<Countermeasure[]>([]);
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      bff
        .countermeasures()
        .then((items) => {
          if (live) {
            setCountermeasures(items);
            setTaskError(null);
          }
        })
        .catch((e) => {
          if (live) setTaskError(e.message);
        });
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  function toggle(item: Countermeasure) {
    setCountermeasures((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, done: !item.done } : c)),
    );
    bff
      .setCountermeasure(item.id, !item.done)
      .catch(() =>
        setCountermeasures((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, done: item.done } : c)),
        ),
      );
  }

  return (
    <div className="overview-grid view-enter">
      {taskError && <p role="alert">Schedule unavailable: {taskError}</p>}
      {/* Crew cards row */}
      <div className="crew-cards-row">
        {CREW.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <span className="caption">
              {error
                ? `Backend unavailable: ${error}`
                : 'Loading crew telemetry…'}
            </span>
          </div>
        )}
        {CREW.map((member, idx) => {
          const cls = statusClass(member.status);
          const maxHR = Math.max(1, ...member.hrHistory);
          return (
            <div key={member.id} className={`tile crew-card tile--${cls}`}>
              {/* Blurry ambient inner wave glow positioned at base of card */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: -20,
                  right: -20,
                  height: 80,
                  zIndex: 0,
                  opacity: 0.75,
                  pointerEvents: 'none',
                  filter: 'blur(16px)',
                  overflow: 'hidden',
                }}
              >
                <WaveLine
                  variant={WAVE_VARIANTS[idx % WAVE_VARIANTS.length]}
                  height={80}
                  status={member.status}
                  showBorder={false}
                  blur={16}
                />
              </div>
              {/* Card content — above wave */}
              <div style={{ position: 'relative', zIndex: 2 }}>
                <div className="crew-card__header">
                  <span className="crew-card__name">{member.name}</span>
                  <StatusPill status={member.status} size="sm" />
                </div>

                <small>
                  {member.updatedAt
                    ? new Date(member.updatedAt).toISOString()
                    : 'No observation'}{' '}
                  ·{' '}
                  {member.inferenceCurrent
                    ? 'Current assessment'
                    : 'Assessment unavailable'}{' '}
                  · {member.imputedFields?.length ?? 0} filled fields
                </small>
                <div
                  className="label"
                  style={{
                    marginTop: 4,
                    color: 'var(--text-3)',
                    fontWeight: 500,
                    letterSpacing: '0.06em',
                  }}
                >
                  {member.role}
                </div>

                <div className="crew-card__vitals" style={{ marginTop: 14 }}>
                  {[
                    { val: member.hr, unit: 'bpm', label: 'HR' },
                    { val: member.spo2, unit: '%', label: 'SpO₂' },
                    { val: member.eda, unit: 'µS', label: 'EDA' },
                  ].map((v) => (
                    <div key={v.label} className="crew-card__vital">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          className="value-xl"
                          style={{
                            fontSize: 23.5,
                            lineHeight: '27px',
                            fontWeight: 600,
                          }}
                        >
                          {v.val ?? '—'}
                        </span>
                        <span
                          className="unit"
                          style={{
                            fontSize: 11,
                            color: '#94A3B8',
                            fontWeight: 400,
                            marginLeft: 5,
                          }}
                        >
                          {v.unit}
                        </span>
                      </div>
                      <span
                        className="label"
                        style={{
                          fontSize: 10,
                          color: 'var(--text-2)',
                          fontWeight: 500,
                          marginTop: 3,
                        }}
                      >
                        {v.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 24h HR bar chart */}
                <div className="crew-card__bars" style={{ marginTop: 10 }}>
                  {member.hrHistory.map((v, i) => (
                    <div
                      key={i}
                      className={`hr-bar${i === member.hrHistory.length - 1 ? ' hr-bar--latest' : ''}`}
                      style={{
                        height: `${Math.round((v / maxHR) * 100)}%`,
                        ['--i' as string]: i,
                      }}
                      title={`${v} bpm`}
                    />
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginTop: 8,
                    minHeight: 18,
                  }}
                >
                  {member.flags.length > 0 && (
                    <div className="crew-card__flag">{member.flags[0]}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom row */}
      <div className="overview-bottom">
        {/* Needs attention */}
        <div className="tile timeline-panel">
          <div className="view-title" style={{ fontSize: 16, fontWeight: 600 }}>
            Needs attention
          </div>
          <div className="timeline-list">
            {ALERTS.map((alert) => (
              <div key={alert.id} className="timeline-item">
                <div
                  className={`timeline-item__dot timeline-item__dot--${statusClass(alert.status)}`}
                />
                <div className="timeline-item__body">
                  <div className="timeline-item__title">{alert.title}</div>
                  <div className="timeline-item__meta">
                    <span className="timeline-item__source">
                      {alert.source}
                    </span>
                    <span style={{ color: 'var(--text-3)', fontSize: 10 }}>
                      ·
                    </span>
                    <span className="timeline-item__time">{alert.time}</span>
                    {alert.isMock && <span className="chip">Illustrative</span>}
                  </div>
                </div>
                <div className="timeline-item__arrow">↗</div>
              </div>
            ))}
          </div>
        </div>

        {/* Countermeasures */}
        <div className="tile countermeasures-panel">
          <div className="view-title" style={{ fontSize: 16, fontWeight: 600 }}>
            Scheduled actions
          </div>
          <div className="checklist">
            {countermeasures.map((item) => (
              <label key={item.id} className="checklist-item">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggle(item)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
