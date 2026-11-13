export interface Operation {
  id: string;
  user: string;
  path: string;
  method: string;
  body: unknown;
  createdAt: string;
  state: "pending" | "failed";
  error?: string;
}
const listeners = new Set<() => void>();
let draining = false;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("avia-software-outbox", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("operations", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", mode);
      const request = run(tx.objectStore("operations"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function operations(user: string) {
  return ((await transaction("readonly", (s) => s.getAll())) as Operation[])
    .filter((o) => o.user === user)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function overlayTasks<T extends { id: string | number; done: boolean }>(
  tasks: T[],
  pending: Operation[],
) {
  return tasks.map((task) => {
    const operation = pending
      .filter(
        (o) =>
          o.state === "pending" &&
          o.method === "PATCH" &&
          (o.path.endsWith("/tasks/" + task.id) ||
            o.path.endsWith("/countermeasures/" + task.id)),
      )
      .at(-1);
    return operation
      ? {
          ...task,
          done: Boolean((operation.body as { done: boolean }).done),
          pending: true,
        }
      : { ...task, pending: false };
  });
}
export function watchQueue(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function notify() {
  listeners.forEach((fn) => fn());
  window.dispatchEvent(new Event("avia-data-changed"));
}
export async function enqueue(
  user: string,
  path: string,
  method: string,
  body: unknown,
  id = crypto.randomUUID(),
) {
  const operation: Operation = {
    id,
    user,
    path,
    method,
    body,
    createdAt: new Date().toISOString(),
    state: "pending",
  };
  await transaction("readwrite", (s) => s.put(operation));
  notify();
  return operation;
}
export async function discard(id: string) {
  await transaction("readwrite", (s) => s.delete(id));
  notify();
}
export async function retry(user: string) {
  for (const op of await operations(user))
    await transaction("readwrite", (s) =>
      s.put({ ...op, state: "pending", error: undefined }),
    );
  await flush(user);
}
export async function flush(user: string) {
  if (draining || !navigator.onLine) return;
  draining = true;
  try {
    for (const op of await operations(user)) {
      if (op.state === "failed") continue;
      try {
        const response = await fetch(op.path, {
          method: op.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(op.body),
          signal: AbortSignal.timeout(20000),
        });
        if (response.ok) {
          await discard(op.id);
          continue;
        }
        if (
          response.status === 401 ||
          response.status === 429 ||
          response.status >= 500
        )
          break;
        const body = await response.json().catch(() => ({}));
        await transaction("readwrite", (s) =>
          s.put({
            ...op,
            state: "failed",
            error: body.error ?? `HTTP ${response.status}`,
          }),
        );
        notify();
      } catch {
        break;
      }
    }
  } finally {
    draining = false;
    notify();
  }
}
