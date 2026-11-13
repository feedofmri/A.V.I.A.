import { spawn } from "node:child_process";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
const project = "avia-platform-test";
const envFile = "state/platform-test.env";
fs.mkdirSync("state", { recursive: true });
const secret = randomBytes(32).toString("hex");
const vars = {
  POSTGRES_DB: "avia_platform_test",
  POSTGRES_PORT: "25432",
  REDIS_PORT: "26379",
  SERVER_PORT: "23000",
  BFF_PORT: "24000",
  AGENT_PORT: "28000",
  COCKPIT_PORT: "28080",
  PULSE_PORT: "28081",
  DEMO_MODE: "true",
  INTERNAL_API_TOKEN: secret,
  JOURNAL_KEY: randomBytes(32).toString("hex"),
  ALLOWED_ORIGINS: "http://localhost:28080,http://localhost:28081",
};
// Reuse credentials if resuming a failed disposable run; never touch the normal avia project.
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").trim().split("\n")) {
    const i = line.indexOf("=");
    vars[line.slice(0, i)] = line.slice(i + 1);
  }
}
fs.writeFileSync(
  envFile,
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
);
const env = {
  ...process.env,
  ...vars,
  AVIA_TEST_PROJECT: project,
  BFF_URL: "http://localhost:24000",
  CORE_URL: "http://localhost:23000",
  ML_URL: "http://localhost:28000",
  COCKPIT_URL: "http://localhost:28080",
  PULSE_URL: "http://localhost:28081",
};
const compose = [
  "compose",
  "-p",
  project,
  "--env-file",
  envFile,
  "-f",
  "docker-compose.yml",
  "-f",
  "docker-compose.test.yml",
];
const results = [];
async function run(label, cmd, args, required = true) {
  console.log(`\n${label}`);
  const start = Date.now();
  const log = fs.createWriteStream(
    "state/" + label.replaceAll(/[^a-z0-9]/gi, "-").toLowerCase() + ".log",
  );
  const code = await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env,
      shell: process.platform === "win32" && cmd === "npm",
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (data) => {
        process.stdout.write(data);
        log.write(data);
      });
    child.on("error", (e) => {
      console.error(e);
      resolve(1);
    });
    child.on("close", (c) => resolve(c ?? 1));
  });
  log.end();
  results.push({
    label,
    exitCode: code,
    durationSeconds: Math.round((Date.now() - start) / 100) / 10,
  });
  fs.writeFileSync(
    "state/platform-validation.json",
    JSON.stringify(
      { date: new Date().toISOString(), project, results },
      null,
      2,
    ),
  );
  if (code && required) throw new Error(label + " failed");
  return code;
}
try {
  if (!process.argv.includes("--tests-only")) {
    await run("Unit tests", "npm", ["run", "test:server"]);
    await run("CSV unit tests", "npm", ["run", "test:ui-unit"]);
    await run("Production builds", "npm", ["run", "build:all"]);
    await run("Isolated stack", "docker", [...compose, "up", "-d", "--build"]);
    await run("Seed completion", "docker", ["wait", project + "-seed-1"]);
    const until = Date.now() + 240000;
    let seeded = false;
    while (Date.now() < until) {
      const s = await fetch(env.BFF_URL + "/health")
        .then((r) => r.json())
        .catch(() => null);
      if (s?.ml === "ok") {
        const r = await fetch(env.BFF_URL + "/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: "operator",
            password: "avia-demo-operator",
          }),
        });
        const cookie = r.headers.get("set-cookie")?.split(";")[0];
        if (cookie) {
          const crew = await fetch(env.BFF_URL + "/cockpit/crew", {
            headers: { cookie },
          })
            .then((r) => r.json())
            .catch(() => []);
          if (
            Array.isArray(crew) &&
            crew.length === 4 &&
            crew.every((c) => c.hrHistory.length === 24 && c.inferenceCurrent)
          ) {
            seeded = true;
            break;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!seeded)
      throw new Error("Demo seed did not become ready in four minutes");
  }
  await run(
    "Existing integration tests",
    process.execPath,
    ["--test", "scripts/e2e.test.mjs"],
    false,
  );
  await run(
    "Regression integration tests",
    process.execPath,
    ["--test", "--test-concurrency=1", "scripts/regression.test.mjs"],
    false,
  );
  await run(
    "ML tests",
    "docker",
    [...compose, "run", "--rm", "--build", "ml-test"],
    false,
  );
  await run(
    "Assistant integration tests",
    process.execPath,
    ["--test", "--test-concurrency=1", "scripts/assistant.test.mjs"],
    false,
  );
  await run("Browser tests", "npm", ["run", "test:browser"], false);
  await run(
    "Backup restore verification",
    process.execPath,
    ["scripts/backup.mjs", "--verify-test"],
    false,
  );
  const failed = results.some((r) => r.exitCode !== 0);
  if (!failed && !process.argv.includes("--keep"))
    await run("Disposable stack cleanup", "docker", [
      ...compose,
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
  console.log(
    failed
      ? "Validation failed; disposable stack retained for diagnosis."
      : "Platform validation passed.",
  );
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
