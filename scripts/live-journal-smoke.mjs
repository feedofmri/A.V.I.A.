import fs from "node:fs";
import { randomUUID } from "node:crypto";
if (!process.argv.includes("--live"))
  throw new Error(
    "Pass --live for a real Meta request using a fictional journal entry.",
  );
const base = process.env.BFF_URL ?? "http://localhost:4000";
if (!/^http:\/\/localhost:(4000|24000)$/.test(base))
  throw new Error("Restricted to local demonstration servers.");
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "brandt", password: "avia-demo-crew" }),
});
if (!login.ok) throw new Error("Demo crew login failed");
const cookie = login.headers.get("set-cookie").split(";")[0],
  root = "/software/crew/brandt/assistant",
  journalPath = "/software/crew/brandt/journal",
  runId = randomUUID();
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
const before = await call(root);
let entry;
try {
  entry = await call(journalPath, "POST", {
    text: "Fictional demonstration entry: I felt isolated during the mission and would like a conversation with my crewmates.",
    consent: false,
  });
  await call(root + "/consent", "PUT", { cloud: true, journal: true });
  const response = await call(root + "/run", "POST", {
    request_id: runId,
    message:
      "Summarize only my explicitly selected fictional journal excerpt supportively. Cite journal as the source. Do not diagnose or infer a medical condition.",
    mode: "wellbeing",
    use_cloud: true,
    journal_id: entry.id,
  });
  const report = {
    date: new Date().toISOString(),
    provider: response.provider,
    model: response.model,
    fallback_reason: response.fallback_reason,
    journal_included: response.journal_included,
    source_present: response.sources.some((s) => s.id === "journal"),
    citation_present: response.sections.some((s) =>
      s.source_ids.includes("journal"),
    ),
  };
  fs.writeFileSync(
    "state/live-journal-smoke.json",
    JSON.stringify(report, null, 2),
  );
  if (
    report.provider !== "meta" ||
    !report.journal_included ||
    !report.source_present ||
    !report.citation_present
  )
    throw new Error(
      "Journal cloud citation workflow did not complete: " +
        report.fallback_reason,
    );
  console.log(
    "Live owner-consented journal workflow passed with an explicit journal citation.",
  );
} finally {
  await call(root + "/consent", "PUT", {
    cloud: before.consent.cloud,
    journal: before.consent.journal,
  });
  await call(root + "/runs/" + runId, "DELETE").catch(() => {});
  if (entry) await call(journalPath + "/" + entry.id, "DELETE");
  await call("/auth/logout", "POST", {});
}
