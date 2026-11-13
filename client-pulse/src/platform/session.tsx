import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { flush, operations, retry, watchQueue } from "./outbox";
export interface User {
  name: string;
  role: "operator" | "crew";
  crew?: string;
}
const Context = createContext<User>({ name: "", role: "operator" });
export const useSession = () => useContext(Context);
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/bff" + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(
      path.endsWith("/assistant/run") ? 65000 : 20000,
    ),
  });
  if (r.status === 204) return undefined as T;
  const data = await r
    .json()
    .catch(() => ({ error: "Invalid server response" }));
  if (!r.ok)
    throw Object.assign(new Error(data.error ?? `HTTP ${r.status}`), {
      status: r.status,
    });
  return data;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [username, setUsername] = useState("operator"),
    [password, setPassword] = useState(""),
    [count, setCount] = useState(0),
    [offline, setOffline] = useState(false),
    [demo, setDemo] = useState(false);
  useEffect(() => {
    const expired = () => {
      sessionStorage.removeItem("avia-session-display");
      setUser(null);
      setError("Session expired. Sign in again; queued entries are retained.");
    };
    window.addEventListener("avia-session-expired", expired);
    return () => window.removeEventListener("avia-session-expired", expired);
  }, []);
  useEffect(() => {
    api<User>("/auth/session")
      .then((u) => {
        setUser(u);
        sessionStorage.setItem("avia-session-display", JSON.stringify(u));
      })
      .catch(async (e) => {
        if (!navigator.onLine || !(e as { status?: number }).status) {
          const cache = sessionStorage.getItem("avia-session-display");
          if (cache) {
            setUser(JSON.parse(cache));
            setOffline(true);
          }
        }
        try {
          const r = await fetch("/bff/auth/session");
          const d = await r.json();
          setDemo(d.demo === true);
        } catch {}
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    const update = () =>
      void operations(user.name)
        .then((o) => setCount(o.length))
        .catch(() =>
          setError(
            "Browser storage is unavailable; queued entries cannot be saved.",
          ),
        );
    const sync = () => {
      void flush(user.name);
      setOffline(!navigator.onLine);
    };
    update();
    sync();
    const unwatch = watchQueue(update);
    const timer = setInterval(sync, 10000);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      unwatch();
      clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [user]);
  if (loading)
    return (
      <div className="platform-card" role="status">
        Loading local session…
      </div>
    );
  if (!user)
    return (
      <main className="platform-login">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              const u = await api<User>("/auth/login", "POST", {
                username,
                password,
              });
              sessionStorage.setItem("avia-session-display", JSON.stringify(u));
              setUser(u);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h1>A.V.I.A.</h1>
          <p>Local health monitoring · software demonstration</p>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit">Sign in</button>
          {demo && (
            <p>
              Local demo: operator / avia-demo-operator. Crew: okafor, brandt,
              sato, or diaz / avia-demo-crew.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </form>
      </main>
    );
  return (
    <Context.Provider value={user}>
      <div className="platform-session">
        <span>
          {user.name} · {user.role} · mission clock UTC
          {offline ? " · Offline browser session" : ""}
        </span>
        <span role="status">{count} queued</span>
        <button onClick={() => void retry(user.name)}>Retry pending</button>
        <button
          onClick={async () => {
            if (
              count &&
              !confirm("Queued entries remain saved for this user. Sign out?")
            )
              return;
            try {
              await api("/auth/logout", "POST");
            } finally {
              sessionStorage.removeItem("avia-session-display");
              setUser(null);
              setPassword("");
            }
          }}
        >
          Sign out
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {children}
    </Context.Provider>
  );
}
