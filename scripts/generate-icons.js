#!/usr/bin/env node
/**
 * Generate icon-192.png and icon-512.png for PWA.
 * Run: node scripts/generate-icons.js
 * Requires: npm install pngjs
 */

const fs = require('fs');
const path = require('path');

try {
  const { PNG } = require('pngjs');
  const dir = path.join(__dirname, '..', 'icons');
  const sizes = [192, 512];
  const color = { r: 13, g: 13, b: 13 }; // #0d0d0d

  sizes.forEach((size) => {
    const png = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (size * y + x) << 2;
        png.data[i] = color.r;
        png.data[i + 1] = color.g;
        png.data[i + 2] = color.b;
        png.data[i + 3] = 255;
      }
    }
    const out = path.join(dir, `icon-${size}.png`);
    png.pack().pipe(fs.createWriteStream(out));
    console.log('Written', out);
  });
} catch (e) {
  console.warn('Run: npm install pngjs');
  console.warn('Or add icons/icon-192.png and icons/icon-512.png manually.');
}
