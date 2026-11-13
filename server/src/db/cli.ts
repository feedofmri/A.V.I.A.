import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when the module at `metaUrl` is the script node was started with (works for tsx and compiled JS). */
export function isMain(metaUrl: string): boolean {
  if (!process.argv[1]) return false;
  const norm = (p: string) => path.resolve(p).replace(/\.(ts|js)$/, '').toLowerCase();
  return norm(fileURLToPath(metaUrl)) === norm(process.argv[1]);
}
