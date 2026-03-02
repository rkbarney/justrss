#!/usr/bin/env node
/**
 * Build static output for Cloudflare Pages. Copies only app files, excludes node_modules.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT = '.pages-output';
const ROOT = path.resolve(__dirname, '..');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function build() {
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const copy = [
    'index.html',
    'manifest.json',
    'service-worker.js',
    'css',
    'js',
    'icons',
  ];

  for (const item of copy) {
    const src = path.join(ROOT, item);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(ROOT, OUT, item));
    }
  }

  console.log('Built to .pages-output');
}

build();
