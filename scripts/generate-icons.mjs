// ==============================================================================
// generate-icons.mjs — Icônes PWA DocFinder (aucune dépendance externe)
// Rasterise le logo (favicon.svg) en PNG 192 / 512 / maskable-512.
// Usage : node scripts/generate-icons.mjs
// ==============================================================================
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// ── Encodage PNG minimal (RGBA 8 bits) ───────────────────────────────────────
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
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filtre "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Palette du logo ──────────────────────────────────────────────────────────
const GREEN = [13, 92, 58];     // #0d5c3a
const GREEN_DARK = [10, 63, 40]; // #0a3f28
const WHITE = [255, 255, 255];
const FOLD = [207, 232, 219];   // #cfe8db

// ── Géométrie (viewBox 64) ───────────────────────────────────────────────────
function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function insideDoc(x, y) {
  // Corps du document : rect arrondi (16,12)-(46,54) r=4, coin haut-droit coupé
  if (!insideRoundedRect(x, y, 16, 12, 46, 54, 4)) return false;
  if (x >= 36 && y <= x - 24) return false; // pli diagonal (36,12)→(46,22)
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
/** Couverture + couleur du logo au point (x, y) en coords viewBox (0..64). */
function logoPixel(x, y) {
  if (insideDoc(x, y)) {
    if (insideFold(x, y)) return FOLD;
    if (x >= 22 && x <= 34 && y >= 28 && y <= 31) return GREEN;   // ligne 1
    if (x >= 22 && x <= 31 && y >= 35 && y <= 38) return GREEN;   // ligne 2
    return WHITE;
  }
  const dc = Math.hypot(x - 40, y - 40);
  if (Math.abs(dc - 7.5) <= 1.75) return GREEN;                    // cercle loupe
  if (distSeg(x, y, 45.6, 45.6, 51, 51) <= 2) return GREEN;        // poignée
  return null;
}

/**
 * Rend l'icône en PNG. size = taille finale ; maskable = fond plein + logo
 * réduit (zone de sécurité 80 %) ; rounded = coins arrondis + fond transparent.
 */
function renderIcon(size, { maskable = false } = {}) {
  const SS = 3; // supersampling
  const S = size * SS;
  const k = S / 64;
  const buf = Buffer.alloc(size * size * 4);
  const center = 64 / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const vx = (px * SS + sx + 0.5) / k;
          const vy = (py * SS + sy + 0.5) / k;
          let cr, cg, cb, ca;
          if (maskable) {
            // Fond dégradé plein cadre + logo centré réduit à 60 %
            const t = (vx + vy) / 128;
            const scale = 0.6;
            const lx = center + (vx - center) / scale;
            const ly = center + (vy - center) / scale;
            const logo = logoPixel(lx, ly);
            const col = logo || [
              Math.round(GREEN[0] + (GREEN_DARK[0] - GREEN[0]) * t),
              Math.round(GREEN[1] + (GREEN_DARK[1] - GREEN[1]) * t),
              Math.round(GREEN[2] + (GREEN_DARK[2] - GREEN[2]) * t)
            ];
            [cr, cg, cb] = col; ca = 255;
          } else {
            const logo = logoPixel(vx, vy);
            if (logo) {
              [cr, cg, cb] = logo; ca = 255;
            } else if (insideRoundedRect(vx, vy, 0, 0, 64, 64, 14)) {
              // Fond dégradé, coins arrondis (transparent à l'extérieur)
              const t = (vx + vy) / 128;
              cr = Math.round(GREEN[0] + (GREEN_DARK[0] - GREEN[0]) * t);
              cg = Math.round(GREEN[1] + (GREEN_DARK[1] - GREEN[1]) * t);
              cb = Math.round(GREEN[2] + (GREEN_DARK[2] - GREEN[2]) * t);
              ca = 255;
            } else {
              cr = cg = cb = 0; ca = 0;
            }
          }
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        buf[i] = Math.round(r / a);
        buf[i + 1] = Math.round(g / a);
        buf[i + 2] = Math.round(b / a);
        buf[i + 3] = Math.round(a / (SS * SS));
      }
    }
  }
  return encodePNG(size, size, buf);
}

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), renderIcon(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), renderIcon(512));
fs.writeFileSync(path.join(outDir, 'maskable-512.png'), renderIcon(512, { maskable: true }));
for (const f of fs.readdirSync(outDir)) {
  const st = fs.statSync(path.join(outDir, f));
  console.log(`${f}: ${(st.size / 1024).toFixed(1)} Ko`);
}
