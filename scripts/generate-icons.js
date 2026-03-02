#!/usr/bin/env node
/**
 * Generate PNG icons from the pirate flag SVG for PWA manifest.
 * Run: node scripts/generate-icons.js
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'icons');
const svgPath = join(iconsDir, 'icon.svg');

const svg = readFileSync(svgPath);

for (const size of [192, 512]) {
  const outPath = join(iconsDir, `icon-${size}.png`);
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`Generated ${outPath}`);
}
