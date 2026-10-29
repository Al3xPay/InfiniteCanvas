'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { decodePNG, encodePNG, resize } = require('./imglib');

const ROOT = path.join(__dirname, '..');
const src = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'logo.png');

if (!fs.existsSync(src)) {
  console.error('not found:', src);
  process.exit(1);
}

const img = decodePNG(src);
const out = resize(img, 512, 512);
const dest = path.join(ROOT, 'assets', 'logo.png');
fs.mkdirSync(path.dirname(dest), { recursive: true });
encodePNG(dest, out.width, out.height, out.rgba);
console.log('assets/logo.png <-', src, `${img.width}x${img.height} -> 512x512`, (fs.statSync(dest).size / 1024).toFixed(0) + ' KB');
