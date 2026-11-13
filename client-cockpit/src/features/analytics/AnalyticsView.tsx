import { useEffect, useState } from 'react';
import { bff, type Analytics } from '../../api/bff';
import { useCockpitData } from '../../api/CockpitData';
const metrics = [
  { key: 'hr', label: 'Heart rate', unit: 'bpm', threshold: 100, low: false },
  { key: 'spo2', label: 'SpO₂', unit: '%', threshold: 94, low: true },
  { key: 'eda', label: 'EDA', unit: 'µS', threshold: 5, low: false },
  { key: 'hrv', label: 'HRV', unit: 'ms', threshold: 30, low: true },
  { key: 'sleep', label: 'Sleep', unit: 'h', threshold: 6, low: true },
];
export function AnalyticsView({
  activeCrew = 'okafor',
}: {
  activeCrew?: string;
  theme?: 'light' | 'dark';
}) {
  const { crew } = useCockpitData(),
    updated = crew.find((c) => c.id === activeCrew)?.updatedAt;
  const [metric, setMetric] = useState('hr'),
    [range, setRange] = useState('24h'),
    [data, setData] = useState<Analytics | null>(null),
    [error, setError] = useState('');
  const meta = metrics.find((m) => m.key === metric)!;
  useEffect(() => {
    let live = true;
    setData(null);
    bff
      .analytics(activeCrew, metric, range)
      .then((d) => {
        if (live) {
          setData(d);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [activeCrew, metric, range, updated]);
  const points = [
    ...(data?.historical ?? []).map((p) => ({ ...p, forecast: false })),
    ...(data?.forecast_7step ?? []).map((value, i) => ({
      t: data!.forecast_timestamps[i],
      value,
      forecast: true,
    })),
  ];
  const values = points
      .map((p) => p.value)
      .filter((v): v is number => v !== null),
    lo = values.length ? Math.min(...values, meta.threshold) : 0,
    hi = values.length ? Math.max(...values, meta.threshold) : 1;
  const time = points.map((p) => Date.parse(p.t)),
    start = time[0] ?? 0,
    end = time.at(-1) ?? 1;
  const x = (t: string) =>
      30 + ((Date.parse(t) - start) / Math.max(1, end - start)) * 920,
    y = (v: number) => 190 - ((v - lo) / Math.max(1, hi - lo)) * 160;
  return (
    <section className="tile platform-card">
      <h2>Health trends · {activeCrew}</h2>
      <div className="platform-tabs">
        {metrics.map((m) => (
          <button
            key={m.key}
            id={'vital-tile-' + m.key}
            aria-pressed={metric === m.key}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="platform-tabs">
        {['24h', '7d', '30d'].map((r) => (
          <button
            key={r}
            id={'range-tab-' + r}
            aria-pressed={range === r}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <h3>
        {meta.label} · {meta.unit}
      </h3>
      {error && <p role="alert">Analytics unavailable: {error}</p>}
      {!data && !error && <p role="status">Loading observations…</p>}
      <p>
        Solid points: recorded bucket averages. Outlined points: experimental
        extrapolation at 12-hour steps, up to 84 hours. Empty buckets represent
        missing observations. The dashed guide is illustrative;
        personal-baseline alerts use their separately explained rules.
      </p>
      {points.length > 0 && (
        <svg
          viewBox="0 0 1000 230"
          role="img"
          aria-label={`${meta.label} history and experimental extrapolation`}
          style={{ width: '100%', minHeight: 180 }}
        >
          <line
            x1="30"
            x2="950"
            y1={y(meta.threshold)}
            y2={y(meta.threshold)}
            stroke="#f5b94a"
            strokeDasharray="5 5"
          />
          {points.map((p, i) =>
            p.value === null ? (
              <text
                key={i}
                x={x(p.t)}
                y="210"
                fill="currentColor"
                fontSize="10"
              >
                ×
              </text>
            ) : (
              <circle
                key={i}
                cx={x(p.t)}
                cy={y(p.value)}
                r="5"
                fill={
                  p.forecast
                    ? 'none'
                    : (
                          meta.low
                            ? p.value < meta.threshold
                            : p.value > meta.threshold
                        )
                      ? '#f5b94a'
                      : '#71b7ff'
                }
                stroke={
                  (
                    meta.low
                      ? p.value < meta.threshold
                      : p.value > meta.threshold
                  )
                    ? '#f5b94a'
                    : '#71b7ff'
                }
              >
                <title>
                  {new Date(p.t).toISOString()} · {p.value} {meta.unit} ·{' '}
                  {p.forecast ? 'experimental' : 'recorded'}
                </title>
              </circle>
            ),
          )}
          <text x="30" y="228" fill="currentColor" fontSize="11">
            {new Date(start).toISOString()}
          </text>
          <text
            x="950"
            y="228"
            textAnchor="end"
            fill="currentColor"
            fontSize="11"
          >
            {new Date(end).toISOString()}
          </text>
        </svg>
      )}
      <p>
        Minimum {data?.min ?? '—'} · mean {data?.mean ?? '—'} · maximum{' '}
        {data?.max ?? '—'} · extrapolated end {data?.forecast_end ?? '—'}{' '}
        {meta.unit}
        {data && !data.inference_current
          ? ' · Current inference unavailable; no extrapolation shown.'
          : ''}
      </p>
      <details>
        <summary>Accessible data table</summary>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>UTC time</th>
                <th>{meta.unit}</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>{new Date(p.t).toISOString()}</td>
                  <td>{p.value ?? 'Missing'}</td>
                  <td>
                    {p.forecast
                      ? 'Experimental extrapolation'
                      : 'Entered/imported observation'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
