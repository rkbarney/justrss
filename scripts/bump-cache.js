#!/usr/bin/env node
/**
 * Bump the service worker cache version so browsers fetch fresh files on deploy.
 * Run before committing: npm run deploy (or npm run bump-cache)
 * Uses git short hash when available, otherwise timestamp.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const swPath = join(root, 'service-worker.js');

let version;
try {
  version = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: root }).trim();
} catch {
  version = Date.now().toString(36);
}

const content = readFileSync(swPath, 'utf8');
const updated = content.replace(/CACHE_NAME = 'justrss-[^']+'/, `CACHE_NAME = 'justrss-${version}'`);
writeFileSync(swPath, updated);
console.log(`Cache bumped to justrss-${version}`);

// Stage the file so it's included in the next commit
try {
  execSync('git add service-worker.js', { cwd: root, stdio: 'inherit' });
} catch {
  // Not a git repo or git add failed - ignore
}
