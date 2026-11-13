import { useEffect, useState } from 'react';
import { useCockpitData } from '../../api/CockpitData';
import { StatusPill } from '../../components/StatusPill';
import { statusClass } from '../../lib/status';
import { bff } from '../../api/bff';
import type { AlertItem } from '../../api/bff';

type Filter = 'all' | 'vitals' | 'sleep' | 'bone';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'bone', label: 'Bone' },
];

function matchesFilter(alert: AlertItem, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'sleep') return alert.source.toLowerCase().includes('sleep');
  if (filter === 'vitals') return alert.source.toLowerCase().includes('vital');
  if (filter === 'bone')
    return (
      alert.source.toLowerCase().includes('dermal') ||
      alert.source.toLowerCase().includes('bone')
    );
  return true;
}

export function AlertsView() {
  const { alerts: ALERTS, refresh } = useCockpitData();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false),
    [history, setHistory] = useState<AlertItem[]>([]);
  useEffect(() => {
    let live = true;
    if (showHistory)
      bff
        .alerts(true)
        .then((a) => {
          if (live) setHistory(a);
        })
        .catch((e) => setActionError(e.message));
    return () => {
      live = false;
    };
  }, [showHistory, ALERTS]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = (showHistory ? history : ALERTS).filter((a) =>
    matchesFilter(a, filter),
  );
  const detail = filtered.find((a) => a.id === selected) ?? filtered[0];

  return (
    <div className="view-enter">
      <div className="alerts-layout">
        {/* Alert feed */}
        <div className="tile alerts-feed">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              className="view-title"
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              Alerts
            </span>
            <span
              className="mono"
              style={{ color: 'var(--text-1)', fontSize: 12, fontWeight: 600 }}
            >
              {filtered.length} {showHistory ? 'records' : 'active'}
            </span>
          </div>

          <label>
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
            />
            Include resolved alert history
          </label>
          <div className="filter-tabs">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                id={`alert-filter-${f.id}`}
                className={`filter-tab${filter === f.id ? ' filter-tab--active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="alerts-feed-list">
            {filtered.map((alert) => (
              <div
                key={alert.id}
                id={`alert-row-${alert.id}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(alert.id);
                  }
                }}
                className={`alert-row${detail?.id === alert.id ? ' alert-row--selected' : ''}`}
                onClick={() => setSelected(alert.id)}
              >
                <div
                  className={`status-dot status-dot--${statusClass(alert.status)}`}
                  style={{ flexShrink: 0 }}
                />
                <div className="alert-row__info">
                  <div className="alert-row__title">{alert.crewName}</div>
                  <div className="alert-row__meta">
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: 'var(--text-3)',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        fontWeight: 400,
                      }}
                    >
                      {alert.source}
                    </span>
                    <span
                      style={{
                        color: 'var(--text-3)',
                        fontSize: 10,
                        opacity: 0.6,
                      }}
                    >
                      ·
                    </span>
                    <span
                      className="caption"
                      style={{ color: 'var(--text-2)', fontWeight: 400 }}
                    >
                      {alert.detail}
                    </span>
                    {alert.isMock && <span className="chip">Mock</span>}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <StatusPill status={alert.status} size="sm" />
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--text-3)',
                      fontWeight: 400,
                    }}
                  >
                    {alert.time}
                  </span>
                  <div className="timeline-item__arrow">↗</div>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-state__icon" style={{ fontSize: 32 }}>
                  ◎
                </div>
                <span className="caption">No alerts in this category</span>
              </div>
            )}
          </div>
        </div>

        {/* Detail drawer */}
        {detail && (
          <div className="tile alert-detail" id="alert-detail-panel">
            <div className="alert-detail__title">{detail.crewName}</div>
            <div className="caption" style={{ color: 'var(--text-2)' }}>
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                }}
              >
                {detail.source}
              </span>
            </div>

            <div style={{ marginTop: 12 }}>
              <StatusPill status={detail.status} />
            </div>

            <div className="detail-section">
              <p>
                {new Date(detail.timestamp).toISOString()} · {detail.state}
              </p>
              <button
                className="btn-ghost"
                disabled={detail.state !== 'open'}
                onClick={async () => {
                  try {
                    await bff.setAlertState(
                      detail.crewId,
                      detail.id,
                      'acknowledged',
                    );
                    await refresh();
                  } catch (e) {
                    setActionError((e as Error).message);
                  }
                }}
              >
                Acknowledge alert
              </button>
              <button
                className="btn-ghost"
                disabled={detail.state === 'resolved'}
                onClick={async () => {
                  try {
                    await bff.setAlertState(
                      detail.crewId,
                      detail.id,
                      'resolved',
                    );
                    await refresh();
                  } catch (e) {
                    setActionError((e as Error).message);
                  }
                }}
              >
                Resolve alert
              </button>
              {actionError && <p role="alert">{actionError}</p>}
              <p>
                Review the observation, entered units, personal baseline and
                symptoms. Follow the mission medical protocol for severe or
                persistent concerns. Acknowledgment records review; it does not
                confirm a diagnosis or treatment.
              </p>
            </div>
            <div className="detail-section">
              <div className="detail-section__label">Detail</div>
              <p className="caption" style={{ color: 'var(--text-2)' }}>
                {detail.detail}
              </p>
            </div>

            <div className="detail-section">
              <div className="detail-section__label">Flagged by</div>
              {/* Timeline rail */}
              <div className="timeline-list" style={{ paddingLeft: 12 }}>
                <div className="timeline-item" style={{ padding: '6px 0' }}>
                  <div
                    className={`timeline-item__dot timeline-item__dot--${statusClass(detail.status)}`}
                    style={{ left: -16 }}
                  />
                  <div className="timeline-item__body">
                    <div
                      className="mono"
                      style={{ fontSize: 11, color: 'var(--text-1)' }}
                    >
                      {detail.modelDerived
                        ? 'On-board model'
                        : 'Manual log (not model-derived)'}{' '}
                      — {detail.source}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 10, color: 'var(--text-3)' }}
                    >
                      {detail.time}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section__label">Explanation</div>
              <p
                className="caption"
                style={{ color: 'var(--text-2)', lineHeight: 1.7 }}
              >
                {detail.explanation}
              </p>
            </div>

            <div className="detail-section">
              <div className="detail-section__label">Top contributors</div>
              {detail.contributions.map((c) => (
                <div key={c.label} className="contribution-bar">
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--text-2)',
                      width: 90,
                      flexShrink: 0,
                    }}
                  >
                    {c.label}
                  </span>
                  <div className="contribution-bar__track">
                    <div
                      className="contribution-bar__fill"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--accent-ice)',
                      width: 36,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {c.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
