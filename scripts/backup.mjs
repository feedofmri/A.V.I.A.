import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
const verify = process.argv.includes('--verify-test');
const project = verify ? 'avia-platform-test' : 'avia';
const envFile = verify ? 'state/platform-test.env' : null;
const compose = [
  'compose',
  '-p',
  project,
  ...(envFile ? ['--env-file', envFile] : []),
];
const db = verify ? 'avia_platform_test' : (process.env.POSTGRES_DB ?? 'avia');
const user = process.env.POSTGRES_USER ?? 'avia_admin';
const target = verify ? 'avia_restore_verification' : null;
fs.mkdirSync('state/backups', { recursive: true });
const filename =
  'state/backups/' +
  (verify ? 'test-backup' : new Date().toISOString().replaceAll(/[:.]/g, '-')) +
  '.dump';
async function command(args, input, output) {
  const child = spawn('docker', args, {
    stdio: [input ? 'pipe' : 'ignore', output ? 'pipe' : 'inherit', 'inherit'],
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Docker command failed: ' + code)),
    );
  });
  const work = [];
  if (input) work.push(pipeline(input, child.stdin));
  if (output) work.push(pipeline(child.stdout, output));
  await Promise.all([...work, done]);
}
await command(
  [
    ...compose,
    'exec',
    '-T',
    'postgres',
    'pg_dump',
    '-U',
    user,
    '-d',
    db,
    '-Fc',
  ],
  null,
  fs.createWriteStream(filename),
);
console.log('Backup saved:', filename);
if (verify) {
  // Only the disposable test project and the explicitly named verification database can be modified.
  if (
    project !== 'avia-platform-test' ||
    target !== 'avia_restore_verification'
  )
    throw Error('Unsafe restore target');
  await command([
    ...compose,
    'exec',
    '-T',
    'postgres',
    'createdb',
    '-U',
    user,
    target,
  ]);
  try {
    await command(
      [
        ...compose,
        'exec',
        '-T',
        'postgres',
        'pg_restore',
        '-U',
        user,
        '-d',
        target,
        '--exit-on-error',
      ],
      fs.createReadStream(filename),
    );
    await command([
      ...compose,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      user,
      '-d',
      target,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      "DO $$ BEGIN IF (SELECT count(*) FROM crew_members)<>4 OR (SELECT count(*) FROM vitals)=0 THEN RAISE EXCEPTION 'Incomplete restore'; END IF; END $$;",
    ]);
    console.log('Restored database contains crew and telemetry.');
  } finally {
    await command([
      ...compose,
      'exec',
      '-T',
      'postgres',
      'dropdb',
      '-U',
      user,
      target,
    ]);
  }
}
