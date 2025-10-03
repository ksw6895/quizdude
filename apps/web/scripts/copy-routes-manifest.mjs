import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const cwd = process.cwd();
const source = resolve(cwd, '.next/routes-manifest.json');
const target = resolve(cwd, '.vercel/output/routes-manifest.json');

if (!existsSync(source)) {
  console.warn('[copy-routes-manifest] No routes manifest found at', source);
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
cpSync(source, target);
console.log('[copy-routes-manifest] Copied to', target);
