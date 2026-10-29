'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const OUT_ICON = path.join(ROOT, 'build', 'icon.png');


const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.']
};


class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 4);
  }

  blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    const ia = 1 - a;
    d[i] = d[i] * ia + r * a;
    d[i + 1] = d[i + 1] * ia + g * a;
    d[i + 2] = d[i + 2] * ia + b * a;
    d[i + 3] = d[i + 3] * ia + a;
  }

  fill(r, g, b) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.blend(x, y, r, g, b, 1);
  }

  rect(x0, y0, w, h, r, g, b, a = 1) {
    for (let y = Math.floor(y0); y < y0 + h; y++)
      for (let x = Math.floor(x0); x < x0 + w; x++) this.blend(x, y, r, g, b, a);
  }

  rounded(x0, y0, w, h, rad, r, g, b, a = 1) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = Math.min(x, w - 1 - x);
        const dy = Math.min(y, h - 1 - y);
        if (dx < rad && dy < rad) {
          const d = Math.hypot(rad - dx, rad - dy);
          if (d > rad) continue;
          const edge = Math.min(1, rad - d + 0.5);
          this.blend(x0 + x, y0 + y, r, g, b, a * edge);
        } else {
          this.blend(x0 + x, y0 + y, r, g, b, a);
        }
      }
    }
  }

  glow(cx, cy, rad, r, g, b, strength = 1) {
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const d = Math.hypot(x - cx, y - cy) / rad;
        if (d >= 1) continue;
        const a = Math.pow(1 - d, 2.2) * strength;
        this.blend(x, y, r, g, b, a);
      }
    }
  }

  circle(cx, cy, rad, r, g, b, a = 1) {
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) {
      for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const edge = rad - d;
        if (edge < 0) continue;
        this.blend(x, y, r, g, b, a * Math.min(1, edge + 0.5));
      }
    }
  }

  ring(cx, cy, rad, width, r, g, b, a = 1) {
    const outer = rad + width / 2;
    for (let y = Math.floor(cy - outer - 1); y <= cy + outer + 1; y++) {
      for (let x = Math.floor(cx - outer - 1); x <= cx + outer + 1; x++) {
        const d = Math.abs(Math.hypot(x - cx, y - cy) - rad);
        const edge = width / 2 - d;
        if (edge < 0) continue;
        this.blend(x, y, r, g, b, a * Math.min(1, edge + 0.5));
      }
    }
  }

  line(x1, y1, x2, y2, width, r, g, b, a = 1) {
    const minX = Math.floor(Math.min(x1, x2) - width);
    const maxX = Math.ceil(Math.max(x1, x2) + width);
    const minY = Math.floor(Math.min(y1, y2) - width);
    const maxY = Math.ceil(Math.max(y1, y2) + width);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let t = ((x - x1) * dx + (y - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = x1 + t * dx;
        const py = y1 + t * dy;
        const d = Math.hypot(x - px, y - py);
        const edge = width / 2 - d;
        if (edge < 0) continue;
        this.blend(x, y, r, g, b, a * Math.min(1, edge + 0.5));
      }
    }
  }

  text(x, y, str, scale, r, g, b, a = 1, spacing = 1) {
    let cx = x;
    for (const raw of String(str)) {
      const ch = raw.toUpperCase();
      const glyph = FONT[ch];
      if (!glyph) {
        cx += (5 + spacing) * scale;
        continue;
      }
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] !== '#') continue;
          this.rect(cx + gx * scale, y + gy * scale, scale, scale, r, g, b, a);
        }
      }
      cx += (5 + spacing) * scale;
    }
    return cx;
  }

  textWidth(str, scale, spacing = 1) {
    return String(str).length * (5 + spacing) * scale - spacing * scale;
  }

  drawImage(img, x0, y0, w, h, mode = 'luma') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor((x / w) * img.width));
        const sy = Math.min(img.height - 1, Math.floor((y / h) * img.height));
        const i = (sy * img.width + sx) * 4;
        const r = img.rgba[i];
        const g = img.rgba[i + 1];
        const b = img.rgba[i + 2];
        const a0 = img.rgba[i + 3] / 255;
        let a = a0;
        if (mode === 'luma') {
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          a = Math.max(0, Math.min(1, (luma - 8) / 42)) * a0;
        }
        if (a <= 0.002) continue;
        this.blend(x0 + x, y0 + y, r, g, b, a);
      }
    }
  }

  downscale(factor) {
    const w = Math.floor(this.w / factor);
    const h = Math.floor(this.h / factor);
    const out = new Canvas(w, h);
    const n = factor * factor;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const i = ((y * factor + dy) * this.w + (x * factor + dx)) * 4;
            r += this.d[i];
            g += this.d[i + 1];
            b += this.d[i + 2];
            a += this.d[i + 3];
          }
        }
        const i = (y * w + x) * 4;
        out.d[i] = r / n;
        out.d[i + 1] = g / n;
        out.d[i + 2] = b / n;
        out.d[i + 3] = a / n;
      }
    }
    return out;
  }
  resized(w, h) {
    const out = new Canvas(w, h);
    const sx = this.w / w;
    const sy = this.h / h;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const i = (yy * this.w + xx) * 4;
            r += this.d[i];
            g += this.d[i + 1];
            b += this.d[i + 2];
            a += this.d[i + 3];
            n++;
          }
        }
        const i = (y * w + x) * 4;
        out.d[i] = r / n;
        out.d[i + 1] = g / n;
        out.d[i + 2] = b / n;
        out.d[i + 3] = a / n;
      }
    }
    return out;
  }

  toRGBA() {
    const out = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      out[i * 4] = Math.max(0, Math.min(255, Math.round(this.d[i * 4])));
      out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(this.d[i * 4 + 1])));
      out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(this.d[i * 4 + 2])));
      out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(this.d[i * 4 + 3])));
    }
    return out;
  }
}

function writeICO(file, canvas, sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = sizes.map((s) => {
    const c = s === canvas.w ? canvas : canvas.resized(s, s);
    const rgba = c.toRGBA();
    const w = c.w;
    const h = c.h;

    const xor = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcY = h - 1 - y;
      for (let x = 0; x < w; x++) {
        const s2 = (srcY * w + x) * 4;
        const d = (y * w + x) * 4;
        xor[d] = rgba[s2 + 2];
        xor[d + 1] = rgba[s2 + 1];
        xor[d + 2] = rgba[s2];
        xor[d + 3] = rgba[s2 + 3];
      }
    }

    const maskRow = Math.floor((w + 31) / 32) * 4;
    const and = Buffer.alloc(maskRow * h, 0);

    const info = Buffer.alloc(40);
    info.writeUInt32LE(40, 0);
    info.writeInt32LE(w, 4);
    info.writeInt32LE(h * 2, 8);
    info.writeUInt16LE(1, 12);
    info.writeUInt16LE(32, 14);
    info.writeUInt32LE(0, 16);
    info.writeUInt32LE(xor.length + and.length, 20);

    return Buffer.concat([info, xor, and]);
  });

  const dir = Buffer.alloc(6 + 16 * images.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);
  let offset = dir.length;
  images.forEach((img, i) => {
    const p = 6 + i * 16;
    dir[p] = images[i].w >= 256 ? 0 : images[i].w;
    dir[p + 1] = images[i].h >= 256 ? 0 : images[i].h;
    dir[p + 2] = 0;
    dir[p + 3] = 0;
    dir.writeUInt16LE(1, p + 4);
    dir.writeUInt16LE(32, p + 6);
    dir.writeUInt32LE(img.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += img.length;
  });

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([dir, ...images]));
}


function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function writePNG(file, canvas) {
  const rgba = canvas.toRGBA();
  const raw = Buffer.alloc((canvas.w * 4 + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y++) {
    raw[y * (canvas.w * 4 + 1)] = 0;
    rgba.copy(raw, y * (canvas.w * 4 + 1) + 1, y * canvas.w * 4, (y + 1) * canvas.w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.w, 0);
  ihdr.writeUInt32BE(canvas.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}


const INK = [11, 11, 13];
const PAPER = [232, 230, 221];
const RED = [211, 47, 47];
const RED2 = [255, 92, 62];
const MUTED = [140, 139, 128];

let LOGO = null;
const LOGO_PATH = path.join(ROOT, 'assets', 'logo.png');
if (fs.existsSync(LOGO_PATH)) {
  const { decodePNG, resize } = require('./imglib');
  LOGO = decodePNG(LOGO_PATH);
}

function drawGlyph(c, x, y, scale, opts = {}) {
  const lw = Math.max(1, Math.round(2.2 * scale));
  const node = (cx, cy, rad, filled) => {
    if (filled) {
      c.circle(cx, cy, rad, RED[0], RED[1], RED[2], 1);
      c.circle(cx, cy, rad * 0.45, PAPER[0], PAPER[1], PAPER[2], 1);
    } else {
      c.ring(cx, cy, rad, lw, PAPER[0], PAPER[1], PAPER[2], 0.95);
    }
  };
  const rootX = x + 4 * scale;
  const rootY = y + 17 * scale;
  const kids = [
    [x + 15 * scale, y + 6 * scale],
    [x + 15 * scale, y + 17 * scale],
    [x + 15 * scale, y + 28 * scale]
  ];
  for (const [kx, ky] of kids) {
    c.line(rootX + 3 * scale, rootY, kx - 3 * scale, ky, lw, PAPER[0], PAPER[1], PAPER[2], 0.8);
  }
  node(rootX, rootY, 3.4 * scale, true);
  for (const [kx, ky] of kids) node(kx, ky, 3.0 * scale, false);
  if (opts.extra) opts.extra(c, scale);
}


function buildIcon() {
  const S = 1024;
  const c = new Canvas(S, S);
  c.fill(INK[0], INK[1], INK[2]);

  if (LOGO) {
    c.drawImage(LOGO, 0, 0, S, S, 'raw');
    return c.downscale(2);
  }

  c.glow(S * 0.5, S * 0.42, S * 0.52, RED[0], RED[1], RED[2], 0.32);
  c.glow(S * 0.72, S * 0.78, S * 0.34, RED2[0], RED2[1], RED2[2], 0.18);

  for (let i = 1; i < 14; i++) {
    const p = Math.round((S / 14) * i);
    c.rect(p, 0, 1, S, 255, 255, 255, 0.035);
    c.rect(0, p, S, 1, 255, 255, 255, 0.035);
  }

  c.rounded(S * 0.06, S * 0.06, S * 0.88, S * 0.88, S * 0.2, 0, 0, 0, 0.35);

  drawGlyph(c, S * 0.2, S * 0.28, S * 0.0225);

  const scale = Math.round(S / 100);
  const t1 = 'INFINITE';
  const t2 = 'WEB';
  const w1 = c.textWidth(t1, scale * 2, 1);
  const w2 = c.textWidth(t2, scale, 1);
  c.text(S / 2 - w1 / 2, S * 0.68, t1, scale * 2, PAPER[0], PAPER[1], PAPER[2], 1);
  c.text(S / 2 - w2 / 2, S * 0.82, t2, scale, MUTED[0], MUTED[1], MUTED[2], 1);

  c.rect(S / 2 - w1 / 2, S * 0.655, w1, Math.max(2, S / 340), RED[0], RED[1], RED[2], 0.95);

  return c.downscale(2);
}


const icon = buildIcon();
writePNG(OUT_ICON, icon);
writeICO(path.join(ROOT, 'build', 'icon.ico'), icon);

console.log('icon     ->', path.relative(ROOT, OUT_ICON), icon.w + 'x' + icon.h);
console.log('ico      ->', path.relative(ROOT, path.join(ROOT, 'build', 'icon.ico')));

const preview = new Canvas(200, 24);
preview.text(0, 2, 'INFINITEWEB', 2, 255, 255, 255, 1);
const rows = [];
for (let y = 0; y < 24; y += 2) {
  let row = '';
  for (let x = 0; x < 200; x++) {
    const v = preview.d[(y * preview.w + x) * 4];
    row += v > 120 ? '#' : v > 30 ? '+' : '.';
  }
  rows.push(row);
}
console.log(rows.join('\n'));
