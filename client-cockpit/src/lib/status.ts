/** A.V.I.A. status type — matches spec status colors */
export type Status = 'nominal' | 'warning' | 'critical' | 'not-tracked' | 'unknown';

export function statusClass(s: Status): 'ok' | 'warn' | 'crit' | 'off' {
  if (s === 'nominal')     return 'ok';
  if (s === 'warning')     return 'warn';
  if (s === 'critical')    return 'crit';
  return 'off';
}

export function statusLabel(s: Status): string {
  if (s === 'nominal')     return 'Nominal';
  if (s === 'warning')     return 'Warning';
  if (s === 'critical')    return 'Critical';
  if (s === 'not-tracked') return 'Not tracked';
  return 'Unknown';
}

export function heartRateStatus(bpm: number | null): Status {
  if (bpm == null) return 'unknown';
  if (bpm >= 50 && bpm <= 100) return 'nominal';
  if (bpm >= 40 && bpm <= 130) return 'warning';
  return 'critical';
}

export function spo2Status(pct: number | null): Status {
  if (pct == null) return 'unknown';
  if (pct >= 95) return 'nominal';
  if (pct >= 90) return 'warning';
  return 'critical';
}

export function edaStatus(eda: number | null): Status {
  if (eda == null) return 'unknown';
  if (eda <= 3.0) return 'nominal';
  if (eda <= 5.0) return 'warning';
  return 'critical';
}
