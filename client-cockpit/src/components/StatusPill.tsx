import type { Status } from '../lib/status';
import { statusClass, statusLabel } from '../lib/status';

interface StatusPillProps {
  status: Status;
  size?: 'sm' | 'md';
}

export function StatusPill({ status, size = 'md' }: StatusPillProps) {
  const cls = statusClass(status);
  return (
    <span
      className={`status-pill status-pill--${cls}`}
      style={{ fontSize: size === 'sm' ? '10px' : undefined }}
    >
      <span className={`status-dot status-dot--${cls}`} />
      {statusLabel(status)}
    </span>
  );
}

interface StatusDotProps {
  status: Status;
}

export function StatusDot({ status }: StatusDotProps) {
  const cls = statusClass(status);
  return <span className={`status-dot status-dot--${cls}`} />;
}
