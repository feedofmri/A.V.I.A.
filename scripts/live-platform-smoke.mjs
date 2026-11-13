import fs from "node:fs";
import { randomUUID } from "node:crypto";
if (!process.argv.includes("--live"))
  throw new Error(
    "Pass --live to enable an actual Meta request using the fictional local demo account.",
  );
const base = process.env.BFF_URL ?? "http://localhost:4000";
if (!/^http:\/\/localhost:(4000|24000)$/.test(base))
  throw new Error(
    "This smoke test is restricted to local demonstration servers.",
  );
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    username: "operator",
    password: "avia-demo-operator",
  }),
});
if (!login.ok) throw new Error("Demo operator login failed");
const cookie = login.headers.get("set-cookie").split(";")[0],
  root = "/software/crew/okafor/assistant";
async function call(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(65000),
  });
  const data = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error("HTTP " + r.status + ": " + data.error);
  return data;
}
const before = await call(root),
  id = randomUUID();
let response;
try {
  await call(root + "/consent", "PUT", { cloud: true, journal: false });
  response = await call(root + "/run", "POST", {
    request_id: id,
    message:
      "Explain the difference between a reference-context model and a current measurement. Use the supplied sources, no diagnosis or treatment.",
    mode: "knowledge",
    use_cloud: true,
  });
  fs.writeFileSync(
    "state/live-platform-smoke.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        provider: response.provider,
        model: response.model,
        fallback_reason: response.fallback_reason,
        agents: response.agents,
        source_count: response.sources.length,
        status: "completed",
      },
      null,
      2,
    ),
  );
  if (response.provider !== "meta")
    throw new Error(
      "Expected real Meta response; got fallback: " + response.fallback_reason,
    );
  console.log("Live authenticated platform workflow passed: " + response.model);
} finally {
  await call(root + "/consent", "PUT", {
    cloud: before.consent.cloud,
    journal: before.consent.journal,
  });
  await call(root + "/runs/" + id, "DELETE").catch(() => {});
  await call("/auth/logout", "POST", {});
}
