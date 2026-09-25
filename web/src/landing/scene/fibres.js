// Hanji is made from the inner bark of the paper mulberry (dak): long, curling fibres laid in a
// crisscross, with cloudy flocs where the pulp settled thicker, and the odd fleck of bark. This
// builds one 256x256 tile of that thickness at startup, seeded, so every visitor gets the same
// sheet and nothing is fetched. Tileable in both directions (the lathe wraps it round the body).
import { DataTexture, RedFormat, UnsignedByteType, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter } from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fibreData(size = 256, seed = 0x5eed1a7) {
  const rand = mulberry32(seed);
  const n = size * size;
  const floc = new Float32Array(n);
  const fibre = new Float32Array(n);
  const wrap = (v) => ((v % size) + size) % size;

  // 1. Flocs: where the pulp settled thicker. Three octaves of tileable value noise, weighted
  // to the middle frequencies: the cloudy mottling that is most of what backlit hanji shows.
  for (const [cells, amp] of [[5, 0.35], [11, 0.4], [23, 0.25]]) {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const iy = Math.floor(fy);
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      const y0 = iy % cells;
      const y1 = (iy + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const ix = Math.floor(fx);
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const a = g[y0 * cells + x0] + (g[y0 * cells + x1] - g[y0 * cells + x0]) * tx;
        const b = g[y1 * cells + x0] + (g[y1 * cells + x1] - g[y1 * cells + x0]) * tx;
        floc[y * size + x] += amp * (a + (b - a) * ty);
      }
    }
  }

  // 2. Fibres: many short, gently curling strands (a few centimetres at the lantern's scale)
  // and a sparse set of long ones, splatted bilinearly so they stay smooth.
  const splat = (x, y, w) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const x0 = wrap(ix);
    const x1 = wrap(ix + 1);
    const y0 = wrap(iy) * size;
    const y1 = wrap(iy + 1) * size;
    fibre[y0 + x0] += w * (1 - fx) * (1 - fy);
    fibre[y0 + x1] += w * fx * (1 - fy);
    fibre[y1 + x0] += w * (1 - fx) * fy;
    fibre[y1 + x1] += w * fx * fy;
  };
  const strand = (len, w, curl) => {
    let x = rand() * size;
    let y = rand() * size;
    let a = rand() * Math.PI * 2;
    for (let s = 0; s < len; s++) {
      a += curl + (rand() - 0.5) * 0.12;
      x += Math.cos(a) * 0.7;
      y += Math.sin(a) * 0.7;
      splat(x, y, w * (0.3 + 0.7 * Math.sin((s / len) * Math.PI)));
    }
  };
  for (let f = 0; f < 1500; f++) strand(10 + rand() * 30, 0.05 + rand() * 0.1, (rand() - 0.5) * 0.06);
  for (let f = 0; f < 70; f++) strand(60 + rand() * 70, 0.08 + rand() * 0.12, (rand() - 0.5) * 0.025);
  // 3. Bark flecks: a few small, dense knots.
  for (let k = 0; k < 18; k++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 0.5 + rand() * 0.9;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d < 1.6) fibre[wrap(Math.floor(cy) + dy) * size + wrap(Math.floor(cx) + dx)] += 1.2 * Math.exp(-d * d * 1.5);
      }
    }
  }

  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    // Flocs carry the broad cloudiness; fibres saturate softly where they cross.
    const v = 0.72 * floc[i] + 0.34 * (1 - Math.exp(-fibre[i] * 1.3));
    out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return out;
}

export function fibreTexture({ anisotropy = 1 } = {}) {
  const size = 256;
  const tex = new DataTexture(fibreData(size), size, size, RedFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}
