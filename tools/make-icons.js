/*
 * Membuat ikon PNG (192, 512, apple-touch, maskable) dari desain logo SIPAJAGA.
 * Tidak membutuhkan dependensi: hanya fs, path, dan zlib bawaan Node.js.
 * Jalankan: node tools/make-icons.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "assets", "icons");
fs.mkdirSync(OUT, { recursive: true });

const NAVY = [15, 47, 85];
const WHITE = [255, 255, 255];
const AMBER = [242, 182, 50];
const SKY = [74, 163, 224];
const SS = 3; // supersampling untuk antialias

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = d => clamp(d + 0.5);

function roundRect(x, y, x0, y0, w, h, r) {
  const dx = Math.max(x0 + r - x, 0, x - (x0 + w - r));
  const dy = Math.max(y0 + r - y, 0, y - (y0 + h - r));
  return r - Math.hypot(dx, dy);
}
function rect(x, y, x0, y0, w, h) {
  return Math.min(x - x0, x0 + w - x, y - y0, y0 + h - y);
}
function circle(x, y, cx, cy, r) {
  return r - Math.hypot(x - cx, y - cy);
}
function segment(x, y, ax, ay, bx, by, w) {
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy));
  return w - Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
}
function blend(dst, color, alpha) {
  if (alpha <= 0) return dst;
  const a = clamp(alpha);
  return [
    Math.round(dst[0] * (1 - a) + color[0] * a),
    Math.round(dst[1] * (1 - a) + color[1] * a),
    Math.round(dst[2] * (1 - a) + color[2] * a),
    Math.round(dst[3] * (1 - a) + 255 * a)
  ];
}

function pixel(px, py, size, fullBleed) {
  const s = size / 512;
  const bg = fullBleed
    ? rect(px, py, 0, 0, size, size)
    : roundRect(px, py, 0, 0, size, size, size * 0.21875);
  let out = [0, 0, 0, 0];
  const mask = smooth(bg);
  if (mask <= 0) return out;
  out = blend(out, NAVY, mask);

  const put = (d, color) => { out = blend(out, color, clamp(d) * mask); };

  put(circle(px, py, 256 * s, 214 * s, 112 * s), WHITE);
  const ring = smooth(circle(px, py, 256 * s, 214 * s, 112 * s)) - smooth(circle(px, py, 256 * s, 214 * s, 104 * s));
  put(ring, NAVY);

  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    put(circle(px, py, 256 * s + Math.sin(a) * 88 * s, 214 * s - Math.cos(a) * 88 * s, 5 * s), NAVY);
  }
  put(segment(px, py, 256 * s, 214 * s, 206 * s, 176 * s, 9 * s), NAVY);
  put(segment(px, py, 256 * s, 214 * s, 322 * s, 150 * s, 7 * s), AMBER);
  put(circle(px, py, 256 * s, 214 * s, 15 * s), NAVY);
  put(circle(px, py, 256 * s, 214 * s, 8 * s), AMBER);

  put(roundRect(px, py, 156 * s, 360 * s, 200 * s, 18 * s, 9 * s), SKY);
  put(roundRect(px, py, 176 * s, 392 * s, 160 * s, 16 * s, 8 * s), AMBER);
  put(roundRect(px, py, 196 * s, 424 * s, 120 * s, 14 * s, 7 * s), WHITE);
  return out;
}

function render(size, fullBleed) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = pixel(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, fullBleed);
          r += c[0]; g += c[1]; b += c[2]; a += c[3];
        }
      }
      const n = SS * SS;
      raw[p++] = Math.round(r / n);
      raw[p++] = Math.round(g / n);
      raw[p++] = Math.round(b / n);
      raw[p++] = Math.round(a / n);
    }
  }
  return png(size, raw);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

[
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["apple-touch-icon.png", 180, false],
  ["maskable-icon-512.png", 512, true]
].forEach(([name, size, fullBleed]) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, render(size, fullBleed));
  console.log("Dibuat:", file);
});
