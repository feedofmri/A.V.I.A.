ALTER TABLE crew_baselines ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE vitals ADD COLUMN event_id text;
ALTER TABLE vitals ADD COLUMN input_payload jsonb;
ALTER TABLE vitals ADD COLUMN inference_status text NOT NULL DEFAULT 'scored' CHECK (inference_status IN ('pending','scored','failed','raw'));
ALTER TABLE vitals ADD COLUMN inference_error text;
ALTER TABLE vitals ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE vitals ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE vitals ADD COLUMN baseline_version integer;
CREATE UNIQUE INDEX vitals_event_identity ON vitals(crew_id,event_id) WHERE event_id IS NOT NULL;
GRANT UPDATE ON vitals TO {{APP_USER}};
ALTER TABLE inferences ADD COLUMN baseline_version integer NOT NULL DEFAULT 1;
GRANT UPDATE ON inferences TO {{APP_USER}};
ALTER TABLE countermeasures DROP CONSTRAINT countermeasures_scheduled_for_label_key;
CREATE UNIQUE INDEX countermeasure_assignment ON countermeasures(scheduled_for,label,crew_id) NULLS NOT DISTINCT;
ALTER TABLE countermeasures ADD COLUMN completed_at timestamptz;
ALTER TABLE countermeasures ADD COLUMN completed_by text;
CREATE TABLE activity_history (
 id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, resource text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON activity_history TO {{APP_USER}};
GRANT USAGE ON SEQUENCE activity_history_id_seq TO {{APP_USER}};
CREATE TABLE journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), crew_id uuid NOT NULL REFERENCES crew_members(id),
 ciphertext text NOT NULL, consent boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_crew ON journals USING (crew_id = NULLIF(current_setting('app.crew_id',true),'')::uuid)
 WITH CHECK (crew_id = NULLIF(current_setting('app.crew_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON journals TO {{APP_USER}};
CREATE TABLE seed_anchors (crew_id uuid PRIMARY KEY REFERENCES crew_members(id), anchor timestamptz NOT NULL);
ALTER TABLE alerts ADD COLUMN event_id text;
CREATE UNIQUE INDEX log_event_identity ON alerts(crew_id,event_id) WHERE event_id IS NOT NULL;
