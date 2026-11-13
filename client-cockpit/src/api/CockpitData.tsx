import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { bff, type AlertItem, type CrewMember, type Mission } from './bff';
import { POLL_INTERVAL_MS } from '../config';

interface CockpitData {
  crew: CrewMember[];
  alerts: AlertItem[];
  mission: Mission | null;
  error: string | null;
  loaded: boolean;
  /** Re-fetch now (after a submission), instead of waiting for the next poll. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<CockpitData>({
  crew: [],
  alerts: [],
  mission: null,
  error: null,
  loaded: false,
  refresh: async () => {},
});

/** Polls the BFF for the crew roster, alert feed and mission once, for every view. */
export function CockpitDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<CockpitData, 'refresh'>>({
    crew: [],
    alerts: [],
    mission: null,
    error: null,
    loaded: false,
  });

  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const [crew, alerts, mission] = await Promise.all([
        bff.crew(),
        bff.alerts(),
        bff.mission(),
      ]);
      setState({ crew, alerts, mission, error: null, loaded: true });
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message, loaded: true }));
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    const changed = () => void refresh();
    window.addEventListener('avia-data-changed', changed);
    return () => {
      clearInterval(id);
      window.removeEventListener('avia-data-changed', changed);
    };
  }, [refresh]);

  return (
    <Ctx.Provider value={{ ...state, refresh }}>
      {state.error && (
        <div className="platform-card" role="alert">
          Connection unavailable. Last successful values may be stale:{' '}
          {state.error}
        </div>
      )}
      {state.crew.some((c) => !c.inferenceCurrent) && (
        <div className="platform-card" role="status">
          Some assessments are pending, expired, or based on an older baseline.
          Unknown status is shown until a current result is available.
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}

export const useCockpitData = () => useContext(Ctx);
