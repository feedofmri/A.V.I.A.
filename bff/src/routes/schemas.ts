/** Crew slug ("okafor") or uuid. */
export const crewParams = {
  type: 'object',
  required: ['crewId'],
  properties: { crewId: { type: 'string', pattern: '^[A-Za-z0-9-]{2,64}$' } },
} as const;

const num = (minimum: number, maximum: number) =>
  ({ type: 'number', minimum, maximum }) as const;

/** PulseTelemetryRequest (AIVI_model_to_UI.docx §3.2). Required/optional exactly as the "Status" column lists them. */
export const pulseTelemetry = {
  type: 'object',
  required: [
    'crew_id',
    'hr_bpm',
    'spo2_pct',
    'eda_tonic_us',
    'hrv_rmssd_ms',
    'sleep_duration_hr',
  ],
  properties: {
    event_id: { type: 'string', minLength: 8, maxLength: 128 },
    input_origin: { type: 'string', enum: ['manual', 'csv', 'scenario'] },
    recorded_at: { type: 'string', format: 'date-time' },
    crew_id: { type: 'string', pattern: '^[A-Za-z0-9-]{2,64}$' },
    mission_day: {
      anyOf: [
        { type: 'integer', minimum: 1, maximum: 1000 },
        {
          type: 'string',
          pattern:
            '^(L-92|L-44|L-3|R\\+1|R\\+45|R\\+82|R\\+194|[1-9][0-9]{0,2}|1000)$',
        },
      ],
    },
    mission_timepoint: {
      type: 'string',
      enum: ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'],
    },
    hr_bpm: num(40, 180),
    spo2_pct: num(70, 100),
    eda_tonic_us: num(0.05, 40),
    hrv_rmssd_ms: num(5, 150),
    hrv_sdnn_ms: num(10, 200),
    resp_rate_bpm: num(6, 45),
    scr_peaks_min: num(0, 120),
    skin_temp_c: num(25, 41),
    sleep_duration_hr: num(0, 12),
    eeg_delta_rel: num(0, 1),
    eeg_theta_rel: num(0, 1),
    eeg_sigma_rel: num(0, 1),
    eeg_beta_rel: num(0, 1),
    eog_std_uv: num(0, 500),
  },
} as const;

/** The Cockpit's quick-entry modal: HR and SpO₂ required, everything else optional (filled server-side). */
export const cockpitTelemetry = {
  ...pulseTelemetry,
  required: ['hr_bpm', 'spo2_pct'],
  properties: Object.fromEntries(
    Object.entries(pulseTelemetry.properties).filter(([k]) => k !== 'crew_id'),
  ),
} as const;
