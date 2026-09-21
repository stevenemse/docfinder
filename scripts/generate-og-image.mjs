// ==============================================================================
// generate-og-image.mjs — Image Open Graph DocFinder (aucune dépendance)
// Rend 1200×630 : fond dégradé de marque + logo + titre + sous-titre.
// Usage : node scripts/generate-og-image.mjs
// ==============================================================================
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// ── Encodage PNG minimal (RGB 8 bits) ────────────────────────────────────────
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Palette ──────────────────────────────────────────────────────────────────
const GREEN = [13, 92, 58];      // #0d5c3a
const GREEN_DARK = [10, 63, 40]; // #0a3f28
const WHITE = [255, 255, 255];
const FOLD = [207, 232, 219];    // #cfe8db

const W = 1200, H = 630;

// ── Logo (même géométrie que generate-icons.mjs, viewBox 64) ────────────────
function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function insideDoc(x, y) {
  if (!insideRoundedRect(x, y, 16, 12, 46, 54, 4)) return false;
  if (x >= 36 && y <= x - 24) return false;
  return true;
}
function insideFold(x, y) {
  return x >= 36 && x <= 46 && y >= 12 && y <= 22 && y <= x - 24;
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function logoPixel(x, y) {
  if (insideDoc(x, y)) {
    if (insideFold(x, y)) return FOLD;
    if (x >= 22 && x <= 34 && y >= 28 && y <= 31) return GREEN;
    if (x >= 22 && x <= 31 && y >= 35 && y <= 38) return GREEN;
    return WHITE;
  }
  const dc = Math.hypot(x - 40, y - 40);
  if (Math.abs(dc - 7.5) <= 1.75) return GREEN;
  if (distSeg(x, y, 45.6, 45.6, 51, 51) <= 2) return GREEN;
  return null;
}

// ── Police bitmap 5×7 (lettres utilisées) ───────────────────────────────────
const FONT = {
  'A': ["01110","10001","10001","11111","10001","10001","10001"],
  'C': ["01110","10001","10000","10000","10000","10001","01110"],
  'D': ["11110","10001","10001","10001","10001","10001","11110"],
  'E': ["11111","10000","10000","11110","10000","10000","11111"],
  'F': ["11111","10000","10000","11110","10000","10000","10000"],
  'I': ["01110","00100","00100","00100","00100","00100","01110"],
  'N': ["10001","11001","10101","10011","10001","10001","10001"],
  'O': ["01110","10001","10001","10001","10001","10001","01110"],
  'R': ["11110","10001","10001","11110","10100","10010","10001"],
  'T': ["11111","00100","00100","00100","00100","00100","00100"],
  'd': ["01110","00001","00001","01111","10001","10001","01110"],
  'e': ["01110","10001","11111","10000","01110","00000","00000"],
  'm': ["11010","10101","10101","10101","10101","00000","00000"],
  'n': ["10010","11010","10100","10010","10010","00000","00000"],
  'o': ["01110","10001","10001","10001","01110","00000","00000"],
  'p': ["11110","10001","10001","11110","10000","10000","10000"],
  's': ["01111","10000","10000","01110","00001","00001","11110"],
  'c': ["01110","10001","10000","10000","10000","10001","01110"],
  'r': ["10110","11000","10000","10000","10000","00000","00000"],
  't': ["01100","01010","00100","00100","00100","00110","00000"],
  'u': ["10001","10001","10001","10001","01101","00000","00000"],
  'v': ["10001","10001","10001","01010","00100","00000","00000"],
  ' ': ["00000","00000","00000","00000","00000","00000","00000"]
};

function drawText(buf, text, x0, y0, scale, color) {
  let x = x0;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) { x += 4 * scale; continue; }
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === '1') {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = x + gx * scale + sx;
              const py = y0 + gy * scale + sy;
              if (px >= 0 && px < W && py >= 0 && py < H) {
                const i = (py * W + px) * 3;
                buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2];
              }
            }
          }
        }
      }
    }
    x += 6 * scale;
  }
}

// ── Rendu ────────────────────────────────────────────────────────────────────
const buf = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    const i = (y * W + x) * 3;
    buf[i] = Math.round(GREEN[0] + (GREEN_DARK[0] - GREEN[0]) * t);
    buf[i + 1] = Math.round(GREEN[1] + (GREEN_DARK[1] - GREEN[1]) * t);
    buf[i + 2] = Math.round(GREEN[2] + (GREEN_DARK[2] - GREEN[2]) * t);
  }
}

// Logo agrandi (×3 → 192 px) à gauche, centré verticalement
const LOGO_SCALE = 3;
const LOGO_SIZE = 64 * LOGO_SCALE;
for (let y = 0; y < LOGO_SIZE; y++) {
  for (let x = 0; x < LOGO_SIZE; x++) {
    const col = logoPixel(x / LOGO_SCALE, y / LOGO_SCALE);
    if (!col) continue;
    const px = 140 + x;
    const py = Math.floor((H - LOGO_SIZE) / 2) + y;
    const i = (py * W + px) * 3;
    buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2];
  }
}

// Titre + sous-titre à droite du logo
drawText(buf, 'DOCFINDER', 420, 230, 10, WHITE);
for (let x = 420; x < 420 + 9 * 60; x++) {
  const y0 = 320;
  if (x < W) {
    const i = (y0 * W + x) * 3;
    buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255;
    const i2 = ((y0 + 1) * W + x) * 3;
    buf[i2] = 255; buf[i2 + 1] = 255; buf[i2 + 2] = 255;
  }
}
drawText(buf, 'Retrouvez vos documents', 420, 360, 4, FOLD);
drawText(buf, 'perdus en securite', 420, 400, 4, FOLD);

const out = path.resolve('public/og-image.png');
fs.writeFileSync(out, encodePNG(W, H, buf));
console.log(`og-image.png: ${(fs.statSync(out).size / 1024).toFixed(1)} Ko`);
