// Seeded generator for web/public/grain.png, and the colour of the ground under it.
//
// The grain is Hanji specks at a few alpha levels over a ground a little darker than Night, chosen
// so that the page, averaged the way the eye averages a fine texture (in linear light), is exactly
// Night. Half the texels sit below Night and half above: the solid Night of the 3D stage, the poster
// and the header's scrim meet the page with no step in tone. (Hanji specks over Night itself could
// only ever lift the page: Night is too near black for darker specks to pull it back.)
//
//   node web/scripts/grain.mjs web/public/grain.png [meanAlphaPercent=3] [levels=9] [seed]
// Prints the PNG's size, the alpha statistics, and the ground colour to put in tokens.css.
// zlib level 9, no ancillary chunks, a fixed seed: the same bytes every run on the same Node.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const [out, meanPct = '3', levelsArg = '9', seedArg = '0x1a3e7f'] = process.argv.slice(2);
let a = Number(seedArg);
const rand = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const N = 256;
const HANJI = [0xec, 0xe4, 0xd2];
const NIGHT = [0x09, 0x0a, 0x0f];
const LEVELS = Number(levelsArg);        // alpha levels 0 .. LEVELS-1, symmetric about the middle one
const target = Number(meanPct) / 100;    // mean alpha
const step = Math.round((2 * target * 255) / (LEVELS - 1)); // alpha step in /255
const alpha = Array.from({ length: LEVELS }, (_, i) => i * step);

// A triangular distribution (the sum of two uniforms) over the levels: symmetric about the mean,
// most texels near it, the extremes rare. No texel is a lone bright star.
const px = new Uint8Array(N * N);
for (let i = 0; i < px.length; i++) px[i] = Math.min(LEVELS - 1, Math.floor(((rand() + rand()) / 2) * LEVELS));

// 4-bit indexed PNG (LEVELS <= 16)
if (LEVELS > 16) throw new Error('at most 16 levels');
const rowBytes = N / 2;
const raw = Buffer.alloc((rowBytes + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (rowBytes + 1)] = 0;
  for (let x = 0; x < N; x += 2) raw[y * (rowBytes + 1) + 1 + x / 2] = (px[y * N + x] << 4) | px[y * N + x + 1];
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 4; ihdr[9] = 3;
const plte = Buffer.alloc(LEVELS * 3);
for (let i = 0; i < LEVELS; i++) plte.set(HANJI, i * 3);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', Buffer.from(alpha)),
  chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(out, png);

// The ground: per channel, the integer under the grain whose composite (8-bit, as a browser blends
// it) averages to Night in linear light.
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const counts = new Array(LEVELS).fill(0);
for (const v of px) counts[v]++;
const meanLin = (base, ch) => counts.reduce((s, n, i) => s + n * lin(Math.round(base + (alpha[i] / 255) * (HANJI[ch] - base))), 0) / px.length;
const ground = [0, 1, 2].map((ch) => {
  let best = 0;
  for (let b = 0; b <= NIGHT[ch]; b++) if (Math.abs(meanLin(b, ch) - lin(NIGHT[ch])) < Math.abs(meanLin(best, ch) - lin(NIGHT[ch]))) best = b;
  return best;
});
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
const mean = px.reduce((s, v) => s + alpha[v], 0) / px.length / 255;
const err = [0, 1, 2].map((ch) => ((meanLin(ground[ch], ch) - lin(NIGHT[ch])) / lin(NIGHT[ch]) * 100).toFixed(1));
const spread = [0, alpha.at(-1)].map((al) => hex([0, 1, 2].map((ch) => Math.round(ground[ch] + (al / 255) * (HANJI[ch] - ground[ch])))));
console.log(`${out}: ${png.length} bytes, alpha levels ${alpha.join(',')}/255, mean ${(mean * 100).toFixed(2)}%`);
console.log(`ground ${hex(ground)} (linear error vs Night per channel: ${err.join('%, ')}%), texels span ${spread[0]}..${spread[1]}`);
