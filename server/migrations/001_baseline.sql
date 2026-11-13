-- Original scaffold schema (previously created by docker/postgres/init/01-init.sh).
-- Idempotent, so it is a no-op on volumes initialised by the old init script.
-- {{APP_USER}} is replaced by the migration runner with the quoted app role name.

CREATE TABLE IF NOT EXISTS crew_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  role       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vitals (
  id          bigserial PRIMARY KEY,
  crew_id     uuid NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  heart_rate  integer CHECK (heart_rate BETWEEN 20 AND 250),
  spo2        numeric(5,2) CHECK (spo2 BETWEEN 0 AND 100),
  eda         numeric(8,3)
);
CREATE INDEX IF NOT EXISTS vitals_crew_recorded_idx ON vitals (crew_id, recorded_at DESC);

-- Row Level Security: a session only sees rows for the crew member it has declared via
-- `SELECT set_config('app.crew_id', '<uuid>', true)`. Unset -> NULL -> no rows.
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals       ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crew_members' AND policyname = 'crew_self') THEN
    CREATE POLICY crew_self ON crew_members
      USING (id = NULLIF(current_setting('app.crew_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vitals' AND policyname = 'crew_vitals') THEN
    CREATE POLICY crew_vitals ON vitals
      USING      (crew_id = NULLIF(current_setting('app.crew_id', true), '')::uuid)
      WITH CHECK (crew_id = NULLIF(current_setting('app.crew_id', true), '')::uuid);
  END IF;
END $$;

GRANT SELECT ON crew_members TO {{APP_USER}};
GRANT SELECT, INSERT ON vitals TO {{APP_USER}};
GRANT USAGE ON SEQUENCE vitals_id_seq TO {{APP_USER}};
