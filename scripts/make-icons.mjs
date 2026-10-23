// Generates the app icon (an original neon buzzer) with no image dependencies.
//   node scripts/make-icons.mjs            -> build/icon.png, build/icon.ico
//   import { renderPng } from ...          -> used by scripts/android-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const NIGHT = hex('#080D22'), INDIGO = hex('#1A2A78'), CYAN = hex('#22D3EE'), GOLD = hex('#FFD166'), DEEP = hex('#C98A00'), WHITE = [255, 255, 255];

/**
 * shape: 'rounded' (app icon), 'round', 'full' (square, no mask - iOS), 'foreground' (transparent, art scaled
 * into the Android adaptive-icon safe zone).
 */
function pixel(u, v, shape) {
  // u,v in 0..1. Returns [r,g,b,a 0..1]
  let x = u - 0.5, y = v - 0.5;
  let alpha = 1;
  let bg = null;
  if (shape !== 'foreground') {
    const r = Math.hypot(x, y);
    if (shape === 'round') alpha = r <= 0.5 ? 1 : 0;
    else if (shape === 'rounded') {
      const q = 0.22, dx = Math.max(Math.abs(x) - (0.5 - q), 0), dy = Math.max(Math.abs(y) - (0.5 - q), 0);
      alpha = Math.hypot(dx, dy) <= q ? 1 : 0;
    }
    bg = mix(NIGHT, INDIGO, Math.min(1, Math.max(0, (y + 0.5) * 0.9 + (0.5 - x) * 0.25)));
  } else {
    x /= 0.62; // shrink art into the safe zone
    y /= 0.62;
  }
  const r = Math.hypot(x, y);
  let col = bg ?? [0, 0, 0];
  let a = bg ? 1 : 0;
  const over = (c, k) => {
    col = a === 0 ? c : mix(col, c, k);
    a = Math.max(a, k);
  };
  // soft cyan glow
  if (r < 0.5) over(CYAN, Math.max(0, 0.35 * (1 - r / 0.5) ** 2));
  // cyan ring
  if (r > 0.37 && r < 0.415) over(CYAN, 1);
  // buzzer body with a simple top-left light
  if (r <= 0.31) {
    const hl = Math.max(0, 1 - Math.hypot(x + 0.1, y + 0.12) / 0.3);
    over(mix(DEEP, GOLD, 0.55 + 0.45 * Math.min(1, r / 0.31 < 0.5 ? 1 : 1 - (r / 0.31 - 0.5))), 1);
    over(mix(GOLD, WHITE, 0.75), hl * 0.8);
  } else if (r <= 0.335) over(DEEP, 1); // rim
  return [col[0], col[1], col[2], bg ? alpha : a * alpha];
}

export function renderPng(size, shape = 'rounded') {
  const SS = size >= 256 ? 2 : 3; // supersampling for smooth edges
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const p = pixel((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, shape);
          r += p[0] * p[3];
          g += p[1] * p[3];
          b += p[2] * p[3];
          a += p[3];
        }
      const n = SS * SS, o = (py * size + px) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, size, out);
}


/** Splash screen: solid midnight with the buzzer centred (art height = 38% of the short side). */
export function renderSplash(w, h) {
  const side = Math.min(w, h) * 0.38;
  const out = Buffer.alloc(w * h * 4);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5 - (w - side) / 2) / side;
      const v = (py + 0.5 - (h - side) / 2) / side;
      let c = NIGHT;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const p = pixel(u, v, 'foreground');
        c = mix(NIGHT, p, p[3]);
      }
      const o = (py * w + px) * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  return encodePng(w, h, out);
}

function ico(sizes) {
  const pngs = sizes.map((s) => renderPng(s, 'rounded'));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head[e] = s >= 256 ? 0 : s;
    head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8);
    head.writeUInt32LE(off, e + 12);
    off += pngs[i].length;
  });
  return Buffer.concat([head, ...pngs]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync('build', { recursive: true });
  writeFileSync('build/icon.png', renderPng(1024, 'rounded'));
  writeFileSync('build/icon-ios.png', renderPng(1024, 'full'));
  writeFileSync('build/icon.ico', ico([16, 32, 48, 64, 128, 256]));
  console.log('wrote build/icon.png, build/icon-ios.png, build/icon.ico');
}
