import type { Status } from '../lib/status';
import { statusClass } from '../lib/status';
import { StatusPill } from './StatusPill';

interface Props {
  label: string;
  value: string;
  unit?: string;
  status?: Status;
}

export function StatTile({ label, value, unit, status = 'unknown' }: Props) {
  const cls = statusClass(status);
  return (
    <div className={`tile vital-tile tile--${cls}`}>
      <span className="label" style={{ color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="value-l" style={{ fontWeight: 600 }}>{value}</span>
        {unit && <span className="unit" style={{ color: '#94A3B8', fontWeight: 400 }}>{unit}</span>}
      </div>
      {status !== 'unknown' && <StatusPill status={status} size="sm" />}
    </div>
  );
}
