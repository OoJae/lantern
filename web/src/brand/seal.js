// The seal, the commitment motif, as data (plain JS, no React): a round seal (a nod to
// the Korean dojang) of diameter D, ring stroke D/14. Its inner edge carries 12 notches
// at 30 degree intervals, depths [2,1,3,1,2,3,1,2,1,3,2,1] x D/48: the bitting that only
// the right flame's silhouette fits. sealPaths() gives plain path strings, so the 3D
// scene can draw the same seal with Path2D.
//
// Each notch is a key cut, not a slot: a flat floor, walls opening at 30 degrees, so a
// deeper cut is also a wider one. Twelve equal slots round a centre dot read as a clock
// face; cuts of three widths read as a key's bitting.
//
// The deepest cut leaves D/112 of ring (the spec's own numbers), so the notches are drawn
// only where that is still a line: 64px and up (SEAL.notchMin), with the depths eased
// just enough below 112px that the thinnest bridge of ring stays a whole pixel. Below
// 64px the seal is a plain ring, and the four states stay apart by shape: a gap, a dot,
// a light, dashes.

import { COLOR, VARIANTS, el, flamePath, pt, r3 } from './marks.js';

export const SEAL = {
  D: 48,
  stroke: 48 / 14,
  /** notch depths in D/48, clockwise, the first at 15 degrees past twelve */
  depths: [2, 1, 3, 1, 2, 3, 1, 2, 1, 3, 2, 1],
  firstNotch: 15,
  /** the open state's gap: 60 degrees centred on one o'clock */
  gap: [0, 60],
  /** each notch is a key cut: floor half-width and corner radius in D/48, wall angle from the radius in degrees */
  cut: { floor: 0.7, wall: 30, round: 0.35 },
  /** the smallest rendered size, in px, that keeps its notches */
  notchMin: 64,
  /** lit: the gap between the ring and the light, in D/48 units (and never under 1px) */
  lightGap: 1,
};

/** The light's gap from the ring in D/48 units for a seal drawn `px` wide: 1u, and at least 1px. */
export function lightGap(px) {
  return px ? Math.max(SEAL.lightGap, 48 / px) : SEAL.lightGap;
}

/**
 * How much of the spec's depth the cuts take for a seal drawn `px` wide: all of it from
 * 112px, a little less below, so the ring left behind the deepest cut is never under 1px.
 */
export function notchDepthScale(px) {
  if (!px) return 1;
  const deepest = Math.max(...SEAL.depths);
  return Math.min(1, (SEAL.stroke - 48 / px) / deepest);
}

export const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
// angle clockwise from twelve o'clock
export const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

function notchList(rIn, unit, depthScale) {
  const { floor, wall, round } = SEAL.cut;
  return SEAL.depths.map((depth, k) => {
    const d = depth * depthScale * unit;
    const f = floor * unit;
    const m = f + d * Math.tan(rad(wall)); // the half-width where the cut meets the ring's inner edge
    return { a: rad(SEAL.firstNotch + 30 * k), d, f, m, r: Math.min(round * unit, d / 2), open: Math.asin(m / rIn) };
  });
}

/**
 * The inner edge walked counter-clockwise from angle `from` down to `to` (from > to),
 * as path commands continuing from the point at `from`. Each notch inside the range is a
 * key cut into the ring: walls opening at SEAL.cut.wall, a flat floor, round floor corners.
 */
function innerEdge(cx, cy, rIn, notches, from, to) {
  let d = '';
  const inRange = notches
    .filter((n) => n.a - n.open > to && n.a + n.open < from)
    .sort((p, q) => q.a - p.a);
  let at = from;
  const arcTo = (a) => {
    const [x, y] = polar(cx, cy, rIn, a);
    const large = Math.abs(at - a) > Math.PI ? 1 : 0;
    d += `A${r3(rIn)} ${r3(rIn)} 0 ${large} 0 ${pt(x, y)}`;
    at = a;
  };
  for (const n of inRange) {
    // local frame: t out along the notch's radius, e along the clockwise tangent
    const u = [Math.sin(n.a), -Math.cos(n.a)];
    const v = [Math.cos(n.a), Math.sin(n.a)];
    const P = (t, e) => [t * u[0] + e * v[0], t * u[1] + e * v[1]];
    const A = (p) => [cx + p[0], cy + p[1]];
    const tMouth = Math.sqrt(rIn * rIn - n.m * n.m);
    const tFloor = rIn + n.d;
    // a floor corner, rounded: from the wall (r before the corner) to the floor (r after)
    const corner = (side) => {
      const c = P(tFloor, side * n.f);
      const mouth = P(tMouth, side * n.m);
      const len = Math.hypot(mouth[0] - c[0], mouth[1] - c[1]);
      const onWall = [c[0] + ((mouth[0] - c[0]) * n.r) / len, c[1] + ((mouth[1] - c[1]) * n.r) / len];
      return { c, onWall, onFloor: P(tFloor, side * (n.f - n.r)) };
    };
    const cw = corner(1);
    const ccw = corner(-1);
    arcTo(n.a + n.open);
    d += `L${pt(...A(cw.onWall))}Q${pt(...A(cw.c))} ${pt(...A(cw.onFloor))}`;
    d += `L${pt(...A(ccw.onFloor))}Q${pt(...A(ccw.c))} ${pt(...A(ccw.onWall))}`;
    d += `L${pt(...A(P(tMouth, -n.m)))}`;
    at = n.a - n.open;
  }
  arcTo(to);
  return d;
}

/**
 * Path strings for a seal of diameter D centred at (cx, cy). `depthScale` eases the cuts
 * for small drawings (see notchDepthScale); `gap` is the lit light's inset (see lightGap).
 * - ring: the full notched ring (evenodd not needed: the inner edge winds the other way)
 * - ringOpen: the ring with its 60 degree gap at one o'clock
 * - interior: the notched keyway, the whole inside of the ring
 * - light: what Ember fills when lit, a disc set `gap` (D/48 units) inside the ring, so the
 *   bitting stays Hanji on the ground and the light never touches the ring
 * - dashes: the retired ring, 12 dashes set between the notches
 * - plainRing / plainOpen: without notches (for drawings under SEAL.notchMin px)
 * - flame: the flame drawn in Night over the lit light
 * - dot: the closed seal's centre dot radius
 */
export function sealPaths({ D = SEAL.D, cx = D / 2, cy = D / 2, gap = SEAL.lightGap, depthScale = 1 } = {}) {
  const unit = D / 48;
  const rOut = D / 2;
  const rIn = rOut - (SEAL.stroke * D) / 48;
  const notches = notchList(rIn, unit, depthScale);
  const circle = (r, sweep) => {
    const [x0, y0] = polar(cx, cy, r, 0);
    const [x1, y1] = polar(cx, cy, r, Math.PI);
    return `M${pt(x0, y0)}A${r3(r)} ${r3(r)} 0 1 ${sweep} ${pt(x1, y1)}A${r3(r)} ${r3(r)} 0 1 ${sweep} ${pt(x0, y0)}Z`;
  };
  // full ring: the outer circle clockwise, then the notched inner edge counter-clockwise
  const [ix, iy] = polar(cx, cy, rIn, TAU);
  const inner = `M${pt(ix, iy)}${innerEdge(cx, cy, rIn, notches, TAU, Math.PI)}${innerEdge(cx, cy, rIn, notches, Math.PI, 0)}Z`;
  const ring = circle(rOut, 1) + inner;

  // a sector of the notched ring, clockwise from a0 to a1 (radians)
  const sector = (a0, a1, withNotches = true) => {
    const [ox0, oy0] = polar(cx, cy, rOut, a0);
    const [ox1, oy1] = polar(cx, cy, rOut, a1);
    const [jx, jy] = polar(cx, cy, rIn, a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    let d = `M${pt(ox0, oy0)}A${r3(rOut)} ${r3(rOut)} 0 ${large} 1 ${pt(ox1, oy1)}L${pt(jx, jy)}`;
    if (withNotches) {
      // split long walks so every arc stays under 180 degrees
      const mid = (a0 + a1) / 2;
      d += innerEdge(cx, cy, rIn, notches, a1, mid) + innerEdge(cx, cy, rIn, notches, mid, a0);
    } else {
      const [kx, ky] = polar(cx, cy, rIn, a0);
      d += `A${r3(rIn)} ${r3(rIn)} 0 ${large} 0 ${pt(kx, ky)}`;
    }
    return `${d}Z`;
  };
  const ringOpen = sector(rad(SEAL.gap[1]), rad(360 + SEAL.gap[0]));
  const plainOpen = sector(rad(SEAL.gap[1]), rad(360 + SEAL.gap[0]), false);
  const plainRing = circle(rOut, 1) + circle(rIn, 0);
  // 12 dashes of 18 degrees centred on 30k: every notch falls in a gap
  let dashes = '';
  for (let k = 0; k < 12; k += 1) dashes += sector(rad(30 * k - 9), rad(30 * k + 9), false);

  // the keyway is the ring's own inner edge
  const interior = inner;
  const light = circleD(cx, cy, rIn - gap * unit);
  const flame = flamePath({ cx, cy, height: D * 0.4 });
  return { ring, ringOpen, interior, light, dashes, plainRing, plainOpen, flame, dot: D / 12, rIn, rOut, unit };
}

export const SEAL_STATES = ['open', 'closed', 'lit', 'retired'];

/**
 * The seal's nodes, drawn in a D x D box.
 * @param {object} o
 * @param {'open'|'closed'|'lit'|'retired'} o.state
 * @param {'night'|'paper'} [o.ground] night (Hanji ring, Ember light) or paper (Night ring,
 *   ember-deep light). The lit flame is Night on both.
 * @param {boolean} [o.notches] false below SEAL.notchMin px
 * @param {number} [o.px] the rendered size of the D box in px, if known: keeps the lit gap
 *   and the ring behind the deepest cut at 1px or more
 */
export function sealNodes({ state = 'closed', ground = 'night', notches = true, px, D = SEAL.D, cx = D / 2, cy = D / 2 } = {}) {
  const c = ground === 'paper' ? VARIANTS.reversed : VARIANTS.primary;
  const p = sealPaths({ D, cx, cy, gap: lightGap(px), depthScale: notchDepthScale(px) });
  const ring = notches ? p.ring : p.plainRing;
  switch (state) {
    case 'open':
      return [el('path', { class: 'seal-ring', d: notches ? p.ringOpen : p.plainOpen, fill: c.ink })];
    case 'closed':
      return [
        el('path', { class: 'seal-ring', d: ring, fill: c.ink, 'fill-rule': 'evenodd' }),
        el('circle', { class: 'seal-dot', cx, cy, r: r3(p.dot), fill: c.ink }),
      ];
    case 'lit':
      return [
        el('path', { class: 'seal-ring', d: ring, fill: c.ink, 'fill-rule': 'evenodd' }),
        // the light, inset from the ring: the ground shows between them, so the bitting
        // reads ring-on-ground and the light never meets the ring
        el('path', { class: 'seal-light', d: p.light, fill: c.flame }),
        // the flame in Night, on any ground (a hole would show Hanji through it on paper)
        el('path', { class: 'seal-flame', d: p.flame, fill: COLOR.night }),
      ];
    case 'retired':
      return [el('path', { class: 'seal-ring', d: p.dashes, fill: c.muted })];
    default:
      throw new Error(`unknown seal state "${state}"`);
  }
}

function circleD(cx, cy, r) {
  return `M${pt(cx, cy - r)}A${r3(r)} ${r3(r)} 0 1 1 ${pt(cx, cy + r)}A${r3(r)} ${r3(r)} 0 1 1 ${pt(cx, cy - r)}Z`;
}
