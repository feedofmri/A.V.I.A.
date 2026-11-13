import { spawnSync } from 'node:child_process';
if (!process.argv.includes('--confirm-demo')) {
  console.error(
    'Use npm run demo:reset -- --confirm-demo to regenerate seed-generated readings and alerts. User-entered readings and journals are retained.',
  );
  process.exit(1);
}
const r = spawnSync(
  'docker',
  ['compose', 'run', '--rm', 'seed', 'node', 'dist/db/seed.js', '--reseed'],
  { stdio: 'inherit' },
);
process.exitCode = r.status ?? 1;
