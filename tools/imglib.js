'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

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

function encodePNG(file, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      pngChunk('IEND', Buffer.alloc(0))
    ])
  );
}

function decodePNG(file) {
  const b = fs.readFileSync(file);
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a png');
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.slice(off + 4, off + 8).toString('ascii');
    const data = b.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (depth !== 8) throw new Error('only 8-bit png supported, got ' + depth);
  if (interlace !== 0) throw new Error('interlaced png not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error('unsupported color type ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b2 = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b2;
      else if (filter === 3) v += (a + b2) >> 1;
      else if (filter === 4) {
        const p = a + b2 - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b2);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b2 : c;
      }
      cur[x] = v & 0xff;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    rgba[d] = out[s];
    rgba[d + 1] = channels === 1 ? out[s] : out[s + 1];
    rgba[d + 2] = channels === 1 ? out[s] : out[s + 2];
    rgba[d + 3] = channels === 4 ? out[s + 3] : 255;
  }
  return { width, height, rgba };
}

function resize(img, w, h) {
  const sx = img.width / w;
  const sy = img.height / h;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.rgba[i];
          g += img.rgba[i + 1];
          b += img.rgba[i + 2];
          a += img.rgba[i + 3];
          n++;
        }
      }
      const d = (y * w + x) * 4;
      out[d] = r / n;
      out[d + 1] = g / n;
      out[d + 2] = b / n;
      out[d + 3] = a / n;
    }
  }
  return { width: w, height: h, rgba: out };
}

function writeBMP(file, img) {
  const w = img.width;
  const h = img.height;
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const pixels = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (srcY * w + x) * 4;
      const d = y * rowSize + x * 3;
      pixels[d] = img.rgba[s + 2];
      pixels[d + 1] = img.rgba[s + 1];
      pixels[d + 2] = img.rgba[s];
    }
  }
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(w, 18);
  header.writeInt32LE(h, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  header.writeInt32LE(2835, 38);
  header.writeInt32LE(2835, 42);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([header, pixels]));
}

function writeICO(file, img, sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = sizes.map((s) => {
    const c = s === img.width ? img : resize(img, s, s);
    const w = c.width;
    const h = c.height;
    const xor = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcY = h - 1 - y;
      for (let x = 0; x < w; x++) {
        const s2 = (srcY * w + x) * 4;
        const d = (y * w + x) * 4;
        xor[d] = c.rgba[s2 + 2];
        xor[d + 1] = c.rgba[s2 + 1];
        xor[d + 2] = c.rgba[s2];
        xor[d + 3] = c.rgba[s2 + 3];
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
  images.forEach((imgData, i) => {
    const p = 6 + i * 16;
    dir[p] = imgData.w >= 256 ? 0 : imgData.w;
    dir[p + 1] = imgData.h >= 256 ? 0 : imgData.h;
    dir.writeUInt16LE(1, p + 4);
    dir.writeUInt16LE(32, p + 6);
    dir.writeUInt32LE(imgData.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += imgData.length;
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([dir, ...images]));
}

module.exports = { decodePNG, encodePNG, writeBMP, writeICO, resize };
