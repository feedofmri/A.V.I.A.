import { useEffect, useState } from 'react';

/** Calls `load` now and every `intervalMs`, keeping the last good result. */
export function usePolling<T>(load: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    const tick = () =>
      load()
        .then((d) => active && (setData(d), setError(null)))
        .catch((e: Error) => active && setError(e));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [load, intervalMs]);

  return { data, error };
}
