# A.V.I.A. Pulse — integration notes

## Run
    npm install
    npm run dev            # http://localhost:5174
    npm run mock           # optional: MOCK backend on :8000 (not the real model; then run with API_URL=http://localhost:8000)
Real backend: the BFF on :4000 serves /api/v1/* and stores every reading (Vite proxies /api -> :4000, override with API_URL).

## Contract
- `GET  /api/v1/health`       -> `models_loaded: true` (or `status: "online"`) lights "Offline · on-board models".
- `POST /api/v1/pulse/ingest` -> body = `PulseTelemetryRequest` (see src/types.ts, preview shown in the drawer).

## For the Cockpit teammate
Pulse stores the last `CockpitStateResponse` per `crew_id` and publishes it:

    { type: 'state', crew_id, request, response }

Cross-origin (Cockpit :5173 <- Pulse :5174) uses a Server-Sent Events relay served by Pulse:

    // useAviaCrewState.ts (Cockpit)
    import { useEffect, useState } from 'react';
    const PULSE = 'http://localhost:5174/__avia';
    export function useAviaCrewState() {
      const [byCrew, setByCrew] = useState<Record<string, unknown>>({});
      useEffect(() => {
        const es = new EventSource(`${PULSE}/stream`);
        es.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.type === 'state') setByCrew((p) => ({ ...p, [m.crew_id]: m.response }));
        };
        return () => es.close();
      }, []);
      return byCrew;
    }
    // Acknowledge an alert -> the watch shows a banner:
    fetch(`${PULSE}/publish`, { method: 'POST', body: JSON.stringify({ type: 'ack' }) });

Other messages: `telemetry`, `event`, `symptom`, `task` (see src/lib/sync.ts).

## Moving the drawer INTO the Cockpit (Pulse ↗ button)
Copy: components/TelemetryDrawer.tsx, components/Slider.tsx, data/presets.ts, data/crew.ts, lib/payload.ts,
api/pulse.ts, types.ts, and the `.drawer/.group/.slider/.preset/.note` rules from styles.css.
Then write the ingest response into the Cockpit's own store keyed by crew_id.
