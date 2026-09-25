// The pictograms as data (plain JS, no React): a 48u grid, Hanji structure, Ember only for
// flames and shares, built from the mark's parts. The ledger is one unbroken horizon line at
// y 40, the near edge of the public record: what is public rests on it (a ring lying flat is
// an ellipse, ry = 0.3 rx, its near side on the line), what is private floats clear of it,
// and names never touch it. The line is never cut at a ring: rings cut into a line read as
// chain links, and the record is not a chain of anything.
//
// Weights: 1.5u for the lantern body at full size and for the seal, 1.2u for small
// lanterns (at 1.5u a 6u-wide body reads as a jar), 1u for everything else. Nothing is
// drawn under 1u except the dotted trails, so every line holds a pixel at 48px.

import { FLAME_BOX, MARK, VARIANTS, el, flamePath, pt, r3 } from './marks.js';
import { TAU } from './seal.js';

const SW = 1.5; // the lantern body, the seal
const SW_SMALL = 1.2; // the body of a lantern drawn at s < 0.8
const THIN = 1; // everything else
const LINE_Y = 40;
const FLAT = 0.3; // ry / rx of a ring lying on the ledger

const rectD = (x, y, w, h) => `M${pt(x, y)}H${r3(x + w)}V${r3(y + h)}H${r3(x)}Z`;
const circleD = (x, y, r) => `M${pt(x - r, y)}A${r3(r)} ${r3(r)} 0 1 0 ${pt(x + r, y)}A${r3(r)} ${r3(r)} 0 1 0 ${pt(x - r, y)}Z`;

/**
 * A dashed rounded rectangle whose dashes fit it exactly: one dash centred on each corner,
 * the rest spaced evenly down the sides and across the bottom (a gap at the bottom centre),
 * none across the top, which the cap covers. The path starts at the top centre, in a gap,
 * so no dash is ever split. Round caps; `dash` is the visible length.
 */
function dashedBody(x, y, w, h, r, { dash, pitch, sw }) {
  const top = w - 2 * r;
  const side = h - 2 * r;
  const q = (Math.PI * r) / 2; // a corner's arc length
  // spans between corner midpoints, clockwise from the top-right corner
  const spans = [side + q, top + q, side + q, top + q];
  // the path starts at the top centre: the first corner midpoint is top/2 + q/2 along
  const P = 2 * top + 2 * side + 4 * q;
  const centres = [];
  let at = top / 2 + q / 2;
  spans.forEach((L, i) => {
    // the top span (last) sits under the cap: only its corner dashes, already placed
    if (i === 3) return;
    let m = Math.max(1, Math.round(L / pitch));
    // across the bottom, an odd count puts a gap at the centre
    if (i === 1 && m % 2 === 0) m += m * pitch < L ? 1 : -1;
    for (let k = 0; k < m; k += 1) centres.push(at + (k * L) / m);
    at += L;
  });
  centres.push(at); // the top-left corner
  const vis = dash - sw; // round caps add sw/2 at each end
  const arr = [0];
  let pos = 0;
  for (const cpos of centres.map((cc) => cc % P).sort((a, b) => a - b)) {
    arr.push(r3(cpos - vis / 2 - pos), r3(vis));
    pos = cpos + vis / 2;
  }
  arr.push(r3(P - pos));
  const d = `M${pt(x + w / 2, y)}H${r3(x + w - r)}A${r3(r)} ${r3(r)} 0 0 1 ${pt(x + w, y + r)}V${r3(y + h - r)}`
    + `A${r3(r)} ${r3(r)} 0 0 1 ${pt(x + w - r, y + h)}H${r3(x + r)}A${r3(r)} ${r3(r)} 0 0 1 ${pt(x, y + h - r)}`
    + `V${r3(y + r)}A${r3(r)} ${r3(r)} 0 0 1 ${pt(x + r, y)}Z`;
  return { d, dasharray: arr.join(' ') };
}

/**
 * A lantern from the mark's parts, placed so its body centre sits at (cx, cy), scaled by s
 * (mark units to pictogram units). The body keeps a fixed stroke (1.5u, or 1.2u when
 * small), so the foot is set against the stroke's real outer edge and joined to it.
 */
function lantern(c, { cx, cy, s, lit = false, dark = false, hook = true, cord = false, tag = false }) {
  const X = (x) => cx + (x - 12) * s;
  const Y = (y) => cy + (y - 12.75) * s;
  const ink = dark ? c.muted : c.ink;
  const sw = s < 0.8 ? SW_SMALL : SW;
  const b = MARK.body;
  const f = MARK.foot;
  const bodyBottom = Y(b.y + b.height) + sw / 2; // the stroke's outer edge
  const nodes = [];
  if (cord) {
    nodes.push(el('path', {
      d: `M${pt(X(12), 0)}V${r3(Y(4) - Math.max(1.25 * s + 0.5 + 0.25 * s, 2 * s) - Math.max(1.25 * s, 1))}`, stroke: ink, 'stroke-width': THIN, fill: 'none',
      ...(dark ? { 'stroke-dasharray': '1.5 2' } : {}),
    }));
  }
  // the hook: the mark's ring (r 1.25, never under 1u, where it closes up into a dot),
  // a short neck showing between it and the cap
  const hr = Math.max(1.25 * s, 1);
  const hy = Y(4) - Math.max(hr + 0.5 + 0.25 * s, 2 * s);
  if (hook) {
    nodes.push(el('circle', { cx: r3(X(12)), cy: r3(hy), r: r3(hr), fill: 'none', stroke: ink, 'stroke-width': THIN }));
    // the neck runs from inside the ring's stroke into the cap: overlapping, never abutting
    nodes.push(el('path', { d: `M${pt(X(12), hy + hr)}V${r3(Y(4) + 0.4)}`, stroke: ink, 'stroke-width': THIN, fill: 'none' }));
  }
  const capD = `M${pt(X(7), Y(4))}H${r3(X(17))}L${pt(X(18), Y(5.5))}Q${pt(X(17.1), Y(6))} ${pt(X(15.6), Y(6))}H${r3(X(8.4))}Q${pt(X(6.9), Y(6))} ${pt(X(6), Y(5.5))}Z`;
  nodes.push(dark
    ? el('path', { d: capD, fill: 'none', stroke: ink, 'stroke-width': THIN, 'stroke-linejoin': 'round' })
    : el('path', { d: capD, fill: ink }));
  if (dark) {
    const db = dashedBody(X(b.x), Y(b.y), b.width * s, b.height * s, b.rx * s, { dash: 2.3, pitch: 4.3, sw });
    nodes.push(el('path', {
      class: 'pg-body', d: db.d, fill: 'none', stroke: ink, 'stroke-width': sw,
      'stroke-linecap': 'round', 'stroke-dasharray': db.dasharray,
    }));
  } else {
    nodes.push(el('rect', {
      class: 'pg-body', x: r3(X(b.x)), y: r3(Y(b.y)), width: r3(b.width * s), height: r3(b.height * s), rx: r3(b.rx * s),
      fill: 'none', stroke: ink, 'stroke-width': sw,
    }));
  }
  if (lit) nodes.push(el('path', { class: 'pg-flame', d: flamePath({ cx, cy, height: FLAME_BOX.height * s }), fill: c.flame }));
  const fh = f.height * s;
  if (dark) {
    // outlined, and set a hair lower: the dark lantern has come apart a little
    nodes.push(el('rect', { x: r3(X(f.x) + 0.5), y: r3(bodyBottom + 0.9), width: r3(f.width * s - 1), height: r3(Math.max(fh - 1, 0.6)), rx: r3(Math.max(fh - 1, 0.6) / 2), fill: 'none', stroke: ink, 'stroke-width': THIN }));
  } else {
    // the join: the stroke's lower half and the foot's upper half, as in the mark
    nodes.push(el('rect', { x: r3(X(10)), y: r3(bodyBottom - sw / 2), width: r3(4 * s), height: r3(sw / 2 + fh / 2), fill: ink }));
    nodes.push(el('rect', { x: r3(X(f.x)), y: r3(bodyBottom), width: r3(f.width * s), height: r3(fh), rx: r3(fh / 2), fill: ink }));
  }
  if (tag) {
    // a name tag tied to the hook, hanging beside the body: the guardian is named.
    // Its hole and its two lines of name are cut out, so it sits on any ground.
    const hx = X(12) + hr + 0.5;
    const tx = X(18) + 2.6; // the tag's hole
    const ty = Y(8);
    nodes.push(el('path', { d: `M${pt(hx, hy)}Q${pt(tx, hy)} ${pt(tx, ty - 1.1)}`, stroke: c.ink, 'stroke-width': THIN, fill: 'none', 'stroke-linecap': 'round' }));
    nodes.push(el('path', {
      class: 'pg-tag',
      d: `M${pt(tx, ty - 1.3)}L${pt(tx + 2.1, ty + 0.4)}V${r3(ty + 6.6)}H${r3(tx - 2.1)}V${r3(ty + 0.4)}Z`
        + circleD(tx, ty + 0.7, 0.55)
        + rectD(tx - 1.1, ty + 2.4, 2.2, 0.8)
        + rectD(tx - 1.1, ty + 4.2, 2.2, 0.8),
      fill: c.ink,
      'fill-rule': 'evenodd',
    }));
  }
  return nodes;
}

/** A ring lying flat on the ledger: an ellipse resting on the line, its near side on it. */
const flatRing = (c, x, rx, { dashed = false, stroke = THIN } = {}) => el('ellipse', {
  cx: r3(x), cy: r3(LINE_Y - rx * FLAT), rx: r3(rx), ry: r3(rx * FLAT),
  fill: 'none', stroke: c.ink, 'stroke-width': stroke,
  ...(dashed ? { 'stroke-dasharray': dashFit(rx, 16) } : {}),
});
// a dash pattern that fits an ellipse's perimeter n times (Ramanujan's approximation)
function dashFit(rx, n) {
  const a = rx;
  const b = rx * FLAT;
  const P = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const period = P / n;
  return `${r3(period * 0.55)} ${r3(period * 0.45)}`;
}
/** the seal lying on the ledger: a heavier ring */
const flatSeal = (c, x, rx) => flatRing(c, x, rx, { stroke: SW });

/** The ledger: one unbroken horizon line. */
const ledger = (c) => el('path', {
  class: 'pg-ledger', d: `M3 ${LINE_Y}H45`,
  stroke: c.ink, 'stroke-width': THIN, 'stroke-linecap': 'round', fill: 'none',
});

const share = (c, x, y, r = 1.6) => el('circle', { class: 'pg-share', cx: r3(x), cy: r3(y), r, fill: c.flame });
const trail = (c, d) => el('path', { d, fill: 'none', stroke: c.muted, 'stroke-width': THIN, 'stroke-linecap': 'round', 'stroke-dasharray': '0 2.3' });
// a point on a quadratic curve
const qAt = ([x0, y0], [x1, y1], [x2, y2], t) => [
  (1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t * t * x2,
  (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2,
];
// a light on its way along a dotted arc: the arc drawn up to the light
function travelling(c, p0, p1, p2, t) {
  const [x, y] = qAt(p0, p1, p2, t);
  // the sub-curve from 0 to t (de Casteljau)
  const m = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
  return [trail(c, `M${pt(...p0)}Q${pt(...m)} ${pt(x, y)}`), share(c, x, y)];
}

/**
 * The 72-hour window: the recovery ring lying on the ledger, filled clockwise from the far
 * side. The hours gone are a solid Hanji arc; the hours to run are Ash dots on the rest of
 * the ring, the dotted language of things still on their way. (Radial ticks, foreshortened
 * this flat, turn into a saw-edge; the /demo clock carries the 72 ticks face on.)
 */
function windowRing(c, cx, rx, fraction) {
  const ry = rx * FLAT;
  const cy = LINE_Y - ry; // resting on the line
  const P = (a) => [cx + rx * Math.sin(a), cy - ry * Math.cos(a)];
  const a0 = fraction * TAU;
  const arc = (from, to) => {
    const [x0, y0] = P(from);
    const [x1, y1] = P(to);
    return `M${pt(x0, y0)}A${r3(rx)} ${r3(ry)} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(x1, y1)}`;
  };
  return [
    el('path', {
      d: arc(a0 + 0.12, TAU - 0.06),
      stroke: c.muted, 'stroke-width': THIN, 'stroke-linecap': 'round', 'stroke-dasharray': '0 2.3', fill: 'none',
    }),
    el('path', { class: 'pg-elapsed', d: arc(0, a0), stroke: c.ink, 'stroke-width': SW, 'stroke-linecap': 'round', fill: 'none' }),
  ];
}

// the veto card: solid paper with one corner folded over, floating low over a ring. The
// fold's gap and the line on the card are cut out, so it sits on any ground.
function card(c, x, y, w, h, angle) {
  const k = 1.8; // the fold
  const g = 0.5; // the gap around the folded flap
  return el('g', { class: 'pg-card', transform: `rotate(${angle} ${r3(x + w / 2)} ${r3(y + h / 2)})` },
    el('path', {
      d: `M${pt(x, y)}H${r3(x + w - k - g)}V${r3(y + k + g)}H${r3(x + w)}V${r3(y + h)}H${r3(x)}Z` + rectD(x + 1.6, y + h - 2.5, w - 5, 1),
      fill: c.ink,
      'fill-rule': 'evenodd',
    }),
    el('path', { d: `M${pt(x + w - k, y)}L${pt(x + w, y + k)}H${r3(x + w - k)}Z`, fill: c.ink }));
}

// the lit seal lying on the ledger: the ring, and inside it (never touching it) the light
function litSeal(c, x, rx) {
  const gap = 1;
  const lx = rx - SW / 2 - gap;
  const ly = rx * FLAT - SW / 2 - gap * 0.6;
  return [
    flatSeal(c, x, rx),
    el('ellipse', { class: 'pg-light', cx: r3(x), cy: r3(LINE_Y - rx * FLAT), rx: r3(lx), ry: r3(ly), fill: c.flame }),
  ];
}

const PICTOGRAMS = {
  // a lit lantern and the seal on a horizon line
  '01-seal': (c) => [
    ledger(c),
    flatSeal(c, 24, 8),
    lantern(c, { cx: 24, cy: 19.5, s: 1.2, lit: true, cord: true }),
  ],
  // one light splits three ways: three shares on dotted arcs from one flame to three small
  // outline lanterns; three salted rings on the line. The flame stays lit: shares are copies.
  '02-three-lights': (c) => {
    const src = [6, 31];
    const h = 7.5;
    const tip = [src[0] + 0.35, src[1] - h / 2];
    const guardians = [[19, 13.5], [29.5, 9.5], [40, 12.5]];
    return [
      ledger(c),
      guardians.map(([x]) => flatRing(c, x, 3.6)),
      guardians.map(([x, y]) => lantern(c, { cx: x, cy: y, s: 0.6 })),
      el('path', { class: 'pg-flame', d: flamePath({ cx: src[0], cy: src[1], height: h }), fill: c.flame }),
      // the three arcs leave the tip at clearly different angles (steep, 30 degrees, flat),
      // and each share is partway to its lantern, clear of every lantern on the way
      travelling(c, tip, [8, 18.5], [17, 18.8], 0.7),
      travelling(c, tip, [17, 23], [29.5, 16], 0.8),
      travelling(c, tip, [19, 27.5], [40, 19], 0.72),
    ];
  },
  // a dashed Ash lantern with no flame; the seal still on the line
  '03-dark': (c) => [
    ledger(c),
    flatSeal(c, 24, 8),
    lantern(c, { cx: 24, cy: 19.5, s: 1.2, dark: true, cord: true }),
  ],
  // an outline lantern with two ember dots beside it; a recovery ring and two hollow dots
  '04-return': (c) => [
    ledger(c),
    flatRing(c, 18, 7.5),
    flatRing(c, 32.5, 2.2),
    flatRing(c, 39.5, 2.2),
    lantern(c, { cx: 18, cy: 20, s: 1.1 }),
    travelling(c, [46, 6], [38, 8], [31, 15.5], 1),
    travelling(c, [46, 30], [40, 22], [34, 22.5], 1),
  ],
  // the new phone waits over its recovery ring: 72 ticks lying on the line, part filled;
  // a second ring, Jihoon's, dashed under the veto card that glides in low over it
  '05-window': (c) => [
    ledger(c),
    windowRing(c, 16, 10.5, 0.64),
    lantern(c, { cx: 16, cy: 20.5, s: 1.05 }),
    flatRing(c, 38.5, 5.8, { dashed: true }),
    card(c, 33.2, 28, 10.6, 6, -4),
  ],
  // the lock: the lantern lit again, exactly as in 01, and its seal lit on the line
  '06-lock': (c) => [
    ledger(c),
    litSeal(c, 24, 8),
    lantern(c, { cx: 24, cy: 19.5, s: 1.2, lit: true, cord: true }),
  ],
  // a root knot on the line joined to two small windows (apps read the record; they are
  // not in it, so they stand off the line, joined to the one value they keep)
  '07-apps': (c) => [
    ledger(c),
    el('path', { d: 'M12 26L24 40M36 26L24 40', stroke: c.ink, 'stroke-width': THIN, fill: 'none', 'stroke-linecap': 'round' }),
    el('circle', { class: 'pg-root', cx: 24, cy: LINE_Y, r: 2, fill: c.ink }),
    [12, 36].map((x) => [
      el('rect', { x: x - 5.25, y: 15.25, width: 10.5, height: 10.5, rx: 1, fill: 'none', stroke: c.ink, 'stroke-width': SW }),
      el('path', { d: `M${r3(x - 5.25)} 18.75H${r3(x + 5.25)}`, stroke: c.ink, 'stroke-width': THIN }),
    ]),
  ],
  // /attacks, the designs that broke: guardians with name tags, the names well above the line
  'attacks-named': (c) => [
    ledger(c),
    [[9, 20], [24, 15], [39, 21.5]].map(([x, y]) => [flatRing(c, x, 3.6), lantern(c, { cx: x - 2.4, cy: y, s: 0.6, tag: true })]),
  ],
  // /attacks, the design that held: unlabelled lights; only salted rings on the line
  'attacks-held': (c) => [
    ledger(c),
    [[9, 20], [24, 15], [39, 21.5]].map(([x, y]) => [share(c, x, y, 1.9), flatRing(c, x, 3.6)]),
  ],
};

export const PICTOGRAM_NAMES = Object.keys(PICTOGRAMS);

/**
 * A pictogram's nodes in a 48 x 48 box.
 * @param {string} name 01-seal ... 07-apps, attacks-named, attacks-held
 * @param {object} [o]
 * @param {'night'|'paper'} [o.ground]
 */
export function pictogramNodes(name, { ground = 'night' } = {}) {
  const draw = PICTOGRAMS[name];
  if (!draw) throw new Error(`unknown pictogram "${name}"`);
  const c = ground === 'paper' ? VARIANTS.reversed : VARIANTS.primary;
  return { viewBox: '0 0 48 48', nodes: [draw(c)].flat(Infinity).filter(Boolean) };
}
