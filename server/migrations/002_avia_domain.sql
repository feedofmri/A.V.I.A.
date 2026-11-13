-- A.V.I.A. domain: crew roster + personal baselines, full Pulse telemetry, model inference results, alerts,
-- countermeasures and mission parameters. Crew-scoped tables keep Row Level Security.

-- ---------------------------------------------------------------- crew roster
ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS slug          text UNIQUE,              -- UI / model crew_id: okafor, brandt, sato, diaz
  ADD COLUMN IF NOT EXISTS initials      text,
  ADD COLUMN IF NOT EXISTS baseline_code text,                     -- OSD-569 CBC subject: C001-C004
  ADD COLUMN IF NOT EXISTS sort_order    integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_seed       boolean NOT NULL DEFAULT false;

-- The cockpit lists every crew member, but RLS hides crew_members rows unless app.crew_id is set.
-- This SECURITY DEFINER function exposes only the non-sensitive roster columns.
CREATE OR REPLACE FUNCTION crew_roster()
RETURNS TABLE (id uuid, slug text, name text, role text, initials text, baseline_code text, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, slug, name, role, initials, baseline_code, sort_order
    FROM crew_members WHERE slug IS NOT NULL ORDER BY sort_order, name
$$;
REVOKE ALL ON FUNCTION crew_roster() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crew_roster() TO {{APP_USER}};

-- ---------------------------------------------------------------- personal pre-flight baselines
CREATE TABLE IF NOT EXISTS crew_baselines (
  crew_id        uuid PRIMARY KEY REFERENCES crew_members(id) ON DELETE CASCADE,
  hr_bpm         double precision NOT NULL CHECK (hr_bpm BETWEEN 30 AND 120),
  hr_sd          double precision NOT NULL CHECK (hr_sd > 0),
  rmssd_ms       double precision NOT NULL CHECK (rmssd_ms BETWEEN 5 AND 150),
  rmssd_sd       double precision NOT NULL CHECK (rmssd_sd > 0),
  sdnn_ms        double precision CHECK (sdnn_ms BETWEEN 10 AND 200),
  eda_us         double precision NOT NULL CHECK (eda_us BETWEEN 0.05 AND 40),
  eda_sd         double precision NOT NULL CHECK (eda_sd > 0),
  sleep_hr       double precision NOT NULL CHECK (sleep_hr BETWEEN 3 AND 12),
  sleep_sd       double precision NOT NULL CHECK (sleep_sd > 0),
  resp_bpm       double precision NOT NULL CHECK (resp_bpm BETWEEN 6 AND 45),
  skin_temp_c    double precision NOT NULL CHECK (skin_temp_c BETWEEN 25 AND 41),
  spo2_pct       double precision NOT NULL CHECK (spo2_pct BETWEEN 80 AND 100),
  femoral_bmd    double precision NOT NULL CHECK (femoral_bmd BETWEEN 0.3 AND 2),
  lumbar_bmd     double precision NOT NULL CHECK (lumbar_bmd BETWEEN 0.3 AND 2),
  adherence_pct  double precision NOT NULL DEFAULT 70 CHECK (adherence_pct BETWEEN 0 AND 100),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- full Pulse telemetry
ALTER TABLE vitals ALTER COLUMN heart_rate TYPE double precision;
ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS hrv_rmssd_ms      double precision CHECK (hrv_rmssd_ms BETWEEN 5 AND 150),
  ADD COLUMN IF NOT EXISTS hrv_sdnn_ms       double precision CHECK (hrv_sdnn_ms BETWEEN 10 AND 200),
  ADD COLUMN IF NOT EXISTS resp_rate_bpm     double precision CHECK (resp_rate_bpm BETWEEN 6 AND 45),
  ADD COLUMN IF NOT EXISTS scr_peaks_min     double precision CHECK (scr_peaks_min BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS skin_temp_c       double precision CHECK (skin_temp_c BETWEEN 25 AND 41),
  ADD COLUMN IF NOT EXISTS sleep_duration_hr double precision CHECK (sleep_duration_hr BETWEEN 0 AND 12),
  ADD COLUMN IF NOT EXISTS eeg_delta_rel     double precision CHECK (eeg_delta_rel BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS eeg_theta_rel     double precision CHECK (eeg_theta_rel BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS eeg_sigma_rel     double precision CHECK (eeg_sigma_rel BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS eeg_beta_rel      double precision CHECK (eeg_beta_rel BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS eog_std_uv        double precision CHECK (eog_std_uv BETWEEN 0 AND 500),
  ADD COLUMN IF NOT EXISTS mission_day       integer CHECK (mission_day BETWEEN 1 AND 300),
  ADD COLUMN IF NOT EXISTS mission_timepoint text,
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'api',   -- pulse | cockpit | api | seed
  ADD COLUMN IF NOT EXISTS imputed_fields    text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS vitals_crew_source_idx ON vitals (crew_id, source);

-- ---------------------------------------------------------------- model inference results (one per reading)
CREATE TABLE IF NOT EXISTS inferences (
  id                    bigserial PRIMARY KEY,
  crew_id               uuid NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  vital_id              bigint NOT NULL UNIQUE REFERENCES vitals(id) ON DELETE CASCADE,
  recorded_at           timestamptz NOT NULL,
  model_version         text NOT NULL,
  crew_status_badge     text NOT NULL CHECK (crew_status_badge IN ('Nominal', 'Warning', 'Critical')),
  anomaly_score         double precision NOT NULL,
  recovery_score        double precision NOT NULL,
  stress_score          double precision NOT NULL,
  cardiac_anomaly_prob  double precision,
  stress_probability    double precision,
  recovery_index        double precision,
  predicted_sleep_stage text,
  z_scores              jsonb NOT NULL,
  attributions          jsonb NOT NULL,
  result                jsonb NOT NULL,       -- full inference payload (forecast, trajectory, explanation ...)
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inferences_crew_recorded_idx ON inferences (crew_id, recorded_at DESC);

-- ---------------------------------------------------------------- alerts
CREATE TABLE IF NOT EXISTS alerts (
  id            bigserial PRIMARY KEY,
  crew_id       uuid NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  inference_id  bigint REFERENCES inferences(id) ON DELETE SET NULL,
  kind          text NOT NULL,       -- sleep | stress | cardiac | hypoxia | anomaly | bone | dermal_scan | symptom | device
  source        text NOT NULL,       -- PULSE SLEEP | PULSE VITALS | BONE MODEL | DERMAL SCAN | PULSE LOG | DEVICE
  title         text NOT NULL,
  detail        text NOT NULL,
  value         text,
  severity      text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'resolved')),
  model_derived boolean NOT NULL DEFAULT true,
  contributions jsonb NOT NULL DEFAULT '[]',
  explanation   text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  is_seed       boolean NOT NULL DEFAULT false
);
-- At most one active model alert per crew member and condition; repeated triggers refresh it.
-- Manual log entries (symptoms, device events) are individual records.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_active_idx ON alerts (crew_id, kind) WHERE state <> 'resolved' AND model_derived;
CREATE INDEX IF NOT EXISTS alerts_crew_seen_idx ON alerts (crew_id, last_seen_at DESC);

-- ---------------------------------------------------------------- mission-wide tables (no RLS)
CREATE TABLE IF NOT EXISTS countermeasures (
  id            bigserial PRIMARY KEY,
  crew_id       uuid REFERENCES crew_members(id) ON DELETE CASCADE,
  label         text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  done          boolean NOT NULL DEFAULT false,
  scheduled_for date NOT NULL DEFAULT current_date,
  source        text NOT NULL DEFAULT 'manual',   -- manual | digital_twin | seed
  is_seed       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheduled_for, label)
);

CREATE TABLE IF NOT EXISTS mission (
  id                 integer PRIMARY KEY CHECK (id = 1),
  name               text NOT NULL,
  mission_day        integer NOT NULL CHECK (mission_day BETWEEN 1 AND 1000),
  phase              text NOT NULL,
  duration_days      integer NOT NULL CHECK (duration_days BETWEEN 1 AND 2000),
  orbit_altitude_km  integer CHECK (orbit_altitude_km BETWEEN 0 AND 1000000),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- RLS + grants
ALTER TABLE crew_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inferences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crew_baselines', 'inferences', 'alerts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_crew') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (crew_id = NULLIF(current_setting(''app.crew_id'', true), '''')::uuid) '
        'WITH CHECK (crew_id = NULLIF(current_setting(''app.crew_id'', true), '''')::uuid)', t || '_crew', t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON crew_baselines TO {{APP_USER}};
GRANT SELECT, INSERT ON inferences TO {{APP_USER}};
GRANT SELECT, INSERT, UPDATE ON alerts TO {{APP_USER}};
GRANT SELECT, INSERT, UPDATE ON countermeasures TO {{APP_USER}};
GRANT SELECT, UPDATE ON mission TO {{APP_USER}};
GRANT USAGE ON SEQUENCE inferences_id_seq, alerts_id_seq, countermeasures_id_seq TO {{APP_USER}};
