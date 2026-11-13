ALTER TABLE mission ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE vitals DROP CONSTRAINT vitals_mission_day_check;
ALTER TABLE vitals ADD CONSTRAINT vitals_mission_day_check CHECK (mission_day BETWEEN 1 AND 1000);
CREATE TABLE task_history (
 id bigserial PRIMARY KEY, task_id bigint NOT NULL REFERENCES countermeasures(id) ON DELETE CASCADE,
 crew_id uuid REFERENCES crew_members(id), actor text NOT NULL, done boolean NOT NULL,
 label text NOT NULL, scheduled_for date NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_history_crew ON task_history USING (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid)
 WITH CHECK (crew_id=NULLIF(current_setting('app.crew_id',true),'')::uuid);
GRANT SELECT,INSERT ON task_history TO {{APP_USER}};
GRANT USAGE ON SEQUENCE task_history_id_seq TO {{APP_USER}};
UPDATE alerts SET title='Local application connection restored (demo)',
 detail='Illustrative local browser connection event; no hardware connection is represented.',source='APPLICATION'
 WHERE is_seed AND kind='device';
UPDATE alerts SET detail='Illustrative rash example for the software demonstration; no camera measurement was performed.'
 WHERE is_seed AND kind='dermal_scan';
