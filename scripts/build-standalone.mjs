import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const output = path.resolve("state/standalone/AVIA-Standalone");
await fs.mkdir(output, { recursive: true });
const bundles = {};
for (const app of ["cockpit", "pulse"]) {
  const client = path.resolve(`client-${app}`);
  const require = createRequire(path.join(client, "package.json"));
  const { build } = await import(pathToFileURL(require.resolve("vite")));
  const { default: react } = await import(
    pathToFileURL(require.resolve("@vitejs/plugin-react"))
  );
  const result = await build({
    configFile: false,
    root: client,
    publicDir: false,
    base: "./",
    plugins: [
      react(),
      {
        name: "avia-standalone-copy",
        transform(code, file) {
          if (!file.includes("/src/") && !file.includes("\\src\\")) return;
          if (!/\.[jt]sx?$/.test(file)) return;
          let updated = code
            .replaceAll(
              "mission clock UTC",
              "LOCAL DEMO · browser data · no live inference",
            )
            .replaceAll("Local models available", "Local demo data")
            .replaceAll("server acknowledged", "saved in this browser")
            .replaceAll("acknowledged by the server", "saved in this browser")
            .replaceAll("acknowledged by server", "saved in this browser")
            .replaceAll(
              "Action acknowledged by the server.",
              "Action saved in this browser.",
            )
            .replaceAll(
              "Observation saved and assessed. Stored evidence has been refreshed.",
              "Observation saved with a simulated assessment. Local evidence has been refreshed.",
            )
            .replaceAll(
              "Entries are encrypted in the local server database.",
              "Entries are stored in this browser demo database without encryption. Do not enter private information.",
            )
            .replaceAll(
              "Cloud processing is optional; local guidance remains available.",
              "This standalone demo uses local templates only.",
            )
            .replace("if (draining || !navigator.onLine)", "if (draining)");
          // Keep cloud consent visibly unavailable instead of implying API access.
          if (file.endsWith("Assistant.tsx"))
            updated = updated.replace(
              "checked={cloud}",
              'disabled title="Cloud AI is unavailable in the standalone demo" checked={cloud}',
            );
          return updated === code ? null : { code: updated, map: null };
        },
      },
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "import.meta.env.PROD": "false",
      "import.meta.env.VITE_COCKPIT_URL": JSON.stringify("./index.html"),
    },
    build: {
      write: false,
      copyPublicDir: false,
      minify: true,
      cssCodeSplit: false,
      assetsInlineLimit: Infinity,
      lib: {
        entry: path.resolve(`scripts/standalone/${app}-entry.ts`),
        name: `AVIAStandalone${app}`,
        formats: ["iife"],
        fileName: () => `${app}.js`,
      },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (r) => r.output ?? [],
  );
  bundles[app] = {
    js: outputs
      .filter((o) => o.type === "chunk")
      .map((o) => o.code)
      .join("\n"),
    css: outputs
      .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
      .map((o) => o.source)
      .join("\n"),
  };
  if (!bundles[app].js || !bundles[app].css)
    throw Error(`Missing ${app} bundle`);
  if (
    outputs.some(
      (o) =>
        o.type === "chunk" &&
        (o.imports.some((i) => !i.endsWith(".css")) ||
          o.dynamicImports.some((i) => i !== o.fileName)),
    )
  )
    throw Error("Standalone bundle still has external script dependencies");
}
const safe = (value) => value.replace(/<\/script/gi, "<\\/script");
const css = JSON.stringify({
  cockpit: bundles.cockpit.css,
  pulse: bundles.pulse.css,
}).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A.V.I.A. — Standalone Local Demo</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%231d4ed8'/%3E%3Ctext x='20' y='28' text-anchor='middle' fill='white' font-size='26'%3EA%3C/text%3E%3C/svg%3E"></head>
<body><div id="root"></div>
<script id="avia-cockpit" type="application/octet-stream">${safe(bundles.cockpit.js)}</script>
<script id="avia-pulse" type="application/octet-stream">${safe(bundles.pulse.js)}</script>
<script>
const selected=new URLSearchParams(location.search).get('app')==='pulse'?'pulse':'cockpit';
const styles=${css};
const style=document.createElement('style');style.textContent=styles[selected];document.head.append(style);
const executable=document.createElement('script');executable.textContent=document.getElementById('avia-'+selected).textContent;document.body.append(executable);
</script></body></html>`;
await fs.writeFile(path.join(output, "index.html"), html);
await fs.copyFile(
  "scripts/standalone/reference-data.json",
  path.join(output, "demo-data.json"),
);
await fs.writeFile(
  path.join(output, "START-HERE.txt"),
  `A.V.I.A. — STANDALONE LOCAL DEMO

1. Extract the entire ZIP.
2. Double-click index.html in Chrome or Microsoft Edge.
3. Cockpit opens automatically with fictional demo data. No server, Docker,
   npm installation, internet connection or backend is required.
4. Use Open Pulse / Open Cockpit in the top bar to switch applications.
   Both views use the same index.html file and browser-local database.

The actual React UI, CSS, animations, charts and Three.js renderer are bundled
inside index.html. WebGL/hardware acceleration must be available for the 3D twin.

LOCAL DATA
The database is initialized automatically on first open and saved in this
browser's local storage. Changes to observations, tasks, alerts, journals,
configuration and mood check-ins survive reload in that browser/profile.
Use Export local data in the top bar to download a JSON database copy.
demo-data.json is the embedded reference fixture, not your editable database;
editing that separate file does not change the already bundled index.html.
Moving/renaming index.html or changing browser/profile may create a fresh store.
If browser storage is blocked, an in-memory fallback is shown and does not
persist after closing. This package is a local demo, not a secure shared database.

ACCOUNTS
Starts as operator. Sign out to use operator / avia-demo-operator or
okafor, brandt, sato, diaz / avia-demo-crew. Demo login is local UI scoping,
not server authentication. Journal data is local and unencrypted: use fictional
information only. Cloud options are disabled.

TO RESET
Open index.html?reset=1 once, then reopen index.html without the reset parameter.
Only this demo's browser database is regenerated.

MODEL BOUNDARY
Initial assessments use saved outputs produced from fictional seed inputs.
New inputs use illustrative local rules and templates, not trained PyTorch
inference or a cloud LLM. Suit scenarios use reference presets and local tiers;
bone/analytics calculations are illustrative. The top bar labels local mode.
No physical sensors are connected. Clinical validation is not established.
Educational-source links require internet when clicked.

PROJECT
https://github.com/feedofmri/A.V.I.A./
`,
);
const zip = path.resolve("state/standalone/AVIA-Standalone.zip");
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const packed = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -LiteralPath ${quote(path.join(output, "index.html"))},${quote(path.join(output, "demo-data.json"))},${quote(path.join(output, "START-HERE.txt"))} -DestinationPath ${quote(zip)} -Force`,
  ],
  { stdio: "inherit", windowsHide: true },
);
if (packed.status !== 0) throw Error("ZIP creation failed");
console.log(`Created ${zip} (${(await fs.stat(zip)).size} bytes)`);
