import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, exportCsv } from '../client-cockpit/src/platform/csv';
const header =
  'recorded_at,hr_bpm,spo2_pct,eda_tonic_us,hrv_rmssd_ms,sleep_duration_hr';
test('CSV parser preserves quoted values and timestamps', () => {
  const rows = parseCsv(header + '\n"2026-11-12T00:00:00Z",61,98,1.9,62,7.5\n');
  assert.equal(rows[0].hr_bpm, 61);
  assert.equal(rows[0].recorded_at, '2026-11-12T00:00:00.000Z');
});
test('CSV rejects missing columns, malformed records and invalid dates', () => {
  for (const input of [
    'hr_bpm\n61',
    header + '\ninvalid,61,98,1.9,62,7.5',
    header + '\n"unterminated',
    header + '\n2026-11-12,NaN,98,1.9,62,7.5',
  ])
    assert.throws(() => parseCsv(input));
});
test('CSV protects export against spreadsheet formula execution', () => {
  const output = exportCsv([{ actor: '=SUM(1,2)', text: 'quoted "entry"' }]);
  assert.ok(output.includes("'=SUM"));
  assert.ok(output.includes('""entry""'));
});
test('CSV enforces row limits', () =>
  assert.throws(() =>
    parseCsv(
      header +
        '\n' +
        Array.from({ length: 201 }, () => ',61,98,1.9,62,7.5').join('\n'),
    ),
  ));
