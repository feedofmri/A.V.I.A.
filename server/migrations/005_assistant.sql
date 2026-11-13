CREATE TABLE assistant_consents (
 crew_id uuid NOT NULL REFERENCES crew_members(id), actor text NOT NULL,
 cloud boolean NOT NULL DEFAULT false, journal boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(crew_id,actor)
);
CREATE TABLE assistant_runs (
 id uuid PRIMARY KEY, crew_id uuid NOT NULL REFERENCES crew_members(id), actor text NOT NULL,
 request_hash text NOT NULL, status text NOT NULL CHECK(status IN ('running','completed','failed')),
 ciphertext text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 confirmed_actions jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX assistant_runs_owner ON assistant_runs(crew_id,actor,created_at DESC);
CREATE TABLE health_observations (
 id uuid PRIMARY KEY, crew_id uuid NOT NULL REFERENCES crew_members(id), actor text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('blood_pressure','glucose','body_temperature','mood','nutrition','hydration','symptom')),
 ciphertext text NOT NULL, recorded_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX health_observations_crew ON health_observations(crew_id,recorded_at DESC);
ALTER TABLE assistant_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistant_consent_scope ON assistant_consents USING (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid) WITH CHECK (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid);
CREATE POLICY assistant_run_scope ON assistant_runs USING (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid) WITH CHECK (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid);
CREATE POLICY health_observation_scope ON health_observations USING (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid) WITH CHECK (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON assistant_consents,assistant_runs,health_observations TO {{APP_USER}};
