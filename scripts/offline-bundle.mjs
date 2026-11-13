import { spawnSync } from "node:child_process";
import fs from "node:fs";
const images = [
  "avia-agent",
  "avia-server",
  "avia-bff",
  "avia-cockpit",
  "avia-pulse",
  "avia-migrate",
  "avia-seed",
  "postgres:16-alpine",
  "redis:7-alpine",
];
const inspect = spawnSync(
  "docker",
  ["image", "inspect", ...images, "--format", "{{.RepoTags}}"],
  { stdio: "inherit" },
);
if (inspect.status !== 0) {
  console.error("Build the normal avia stack before exporting.");
  process.exit(1);
}
if (process.argv.includes("--check")) process.exit(0);
const destination = "state/offline";
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(".env.example", destination + "/.env.example");
// Ship explicit image names so the bundle works under any Compose project name.
// No source checkout or build contexts are needed on the destination machine.
let compose = fs.readFileSync("docker-compose.yml", "utf8");
compose = compose.replace(
  /    build:\r?\n      context: \.\/agent\r?\n      target: runtime/,
  "    image: avia-agent:latest",
);
for (const service of [
  "server",
  "bff",
  "cockpit",
  "pulse",
  "migrate",
  "seed",
]) {
  compose = compose.replace(
    new RegExp(`(^  ${service}:\\r?\\n)    build: \\./[^\\r\\n]+`, "m"),
    `$1    image: avia-${service}:latest`,
  );
}
if (/^    build:/m.test(compose)) throw new Error("Unpackaged build context");
fs.writeFileSync(destination + "/docker-compose.yml", compose);
fs.cpSync("docker/postgres/init", destination + "/docker/postgres/init", {
  recursive: true,
});
fs.cpSync("model files", destination + "/model files", { recursive: true });
const result = spawnSync(
  "docker",
  ["image", "save", "-o", destination + "/avia-images.tar", ...images],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(1);
fs.writeFileSync(
  destination + "/README.txt",
  "On a machine with Docker Compose installed: docker load -i avia-images.tar\nCopy .env.example to .env and configure secrets before storing private entries.\nRun docker compose up -d --no-build --pull never\nCockpit: http://localhost:8080\nPulse: http://localhost:8081\nKeep your JOURNAL_KEY with encrypted journal backups.\n",
);
console.log("Offline distribution prepared in " + destination);
