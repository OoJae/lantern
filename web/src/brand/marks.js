// Lantern's mark as data. One source for the React components in this folder and the
// brand kit files (web/scripts/brand.mjs writes web/public/brand-kit/ from it).
//
// Plain JS, no React. A drawing is a small tree of { tag, attrs, children } nodes with
// SVG presentation attributes only: no style attributes, no <style> blocks (the CSP
// covers SVG files too). The seal lives in seal.js, the pictograms in pictograms.js, so
// the header's mark carries none of their data.
//
// The mark (design spec, "Brand identity"): a 24-unit grid with a 1u margin; hook (48px
// and up), cap with a roof eave (32px and up), an open body with a 1.5u stroke, an Ember
// teardrop flame leaning 0.3u right, a foot; a separate optical drawing for 16px.

/** The six tokens and the derived colours the kit uses. */
export const COLOR = {
  night: '#090A0F',
  hanji: '#ECE4D2',
  ash: '#948E83',
  ember: '#FF8A3D',
  lacquer: '#14151B',
  rib: '#2C2D35',
  edge: '#686661',
  emberDeep: '#B84A16',
  mutedOnPaper: '#5C574E',
};

/**
 * Colour roles per variant: ink (structure), flame (the only Ember), muted (Ash roles).
 * "night" means drawn for a Night ground, "paper" for a Hanji ground.
 */
export const VARIANTS = {
  primary: { ink: COLOR.hanji, flame: COLOR.ember, muted: COLOR.ash, ground: COLOR.night },
  'mono-hanji': { ink: COLOR.hanji, flame: COLOR.hanji, muted: COLOR.hanji, ground: COLOR.night },
  'mono-night': { ink: COLOR.night, flame: COLOR.night, muted: COLOR.night, ground: COLOR.hanji },
  reversed: { ink: COLOR.night, flame: COLOR.emberDeep, muted: COLOR.mutedOnPaper, ground: COLOR.hanji },
  // follows the CSS colour of its parent; the flame is Ember on Night, ember-deep on paper
  current: { ink: 'currentColor', flame: COLOR.ember, muted: 'currentColor', ground: null },
};
const CURRENT_ON_PAPER = { ...VARIANTS.current, flame: COLOR.emberDeep };

/**
 * @param {string} [variant]
 * @param {'night'|'paper'} [ground] only changes `current`: inside an inverted (Hanji) scope
 *   its ink follows the CSS colour to Night, so the flame turns ember-deep (never Ember on Hanji)
 */
export function variantColors(variant = 'primary', ground = 'night') {
  const v = VARIANTS[variant];
  if (!v) throw new Error(`unknown variant "${variant}"`);
  return variant === 'current' && ground === 'paper' ? CURRENT_ON_PAPER : v;
}

// ---------------------------------------------------------------------------------
// tiny tree helpers

export const el = (tag, attrs, ...children) => ({
  tag,
  attrs: attrs || {},
  children: children.flat(Infinity).filter(Boolean),
});

/** round to 0.001 (no -0) */
export const r3 = (v) => {
  const n = Math.round(v * 1000) / 1000;
  return Object.is(n, -0) ? 0 : n;
};
export const pt = (x, y) => `${r3(x)} ${r3(y)}`;

// ---------------------------------------------------------------------------------
// the flame: a teardrop 3.5u x 6.5u centred at (12, 12.75), tip leaning 0.3u right.
// Stored as cubic segments so it can be placed at any scale (the seal's knock-out,
// the pictograms) without an SVG transform.

const FLAME_SEGMENTS = [
  // start at the tip (12.3, 9.5); the right side sweeps out to the widest point
  [12.3, 10.5, 13.75, 11.9, 13.75, 14.25],
  // the round foot of the drop (radius 1.75 about (12, 14.25))
  [13.75, 15.2165, 12.9665, 16, 12, 16],
  [11.0335, 16, 10.25, 15.2165, 10.25, 14.25],
  // the left side rises and bends back to the tip: the lean
  [10.25, 12.7, 11.1, 11.9, 11.7, 11.1],
  [12.05, 10.65, 12.28, 10.15, 12.3, 9.5],
];
const FLAME_TIP = [12.3, 9.5];
/** the flame's box in mark units */
export const FLAME_BOX = { x: 10.25, y: 9.5, width: 3.5, height: 6.5, cx: 12, cy: 12.75 };

/**
 * The flame path, mapped so that its box centre lands at (cx, cy) with the given height.
 * Defaults reproduce the mark's own flame.
 */
export function flamePath({ cx = FLAME_BOX.cx, cy = FLAME_BOX.cy, height = FLAME_BOX.height } = {}) {
  const k = height / FLAME_BOX.height;
  const X = (x) => cx + (x - FLAME_BOX.cx) * k;
  const Y = (y) => cy + (y - FLAME_BOX.cy) * k;
  let d = `M${pt(X(FLAME_TIP[0]), Y(FLAME_TIP[1]))}`;
  for (const [a, b, c, e, f, g] of FLAME_SEGMENTS) {
    d += `C${pt(X(a), Y(b))} ${pt(X(c), Y(e))} ${pt(X(f), Y(g))}`;
  }
  return `${d}Z`;
}

// ---------------------------------------------------------------------------------
// the mark

/** The 24u construction. Coordinates in grid units; the body rect is its stroke's centre line. */
export const MARK = {
  grid: 24,
  hook: { cx: 12, cy: 2, r: 1.25, strokeWidth: 1 },
  // a 1u collar closes the 0.25u between the hook's ring and the cap
  neck: { x: 11.5, y: 3.5, width: 1, height: 0.75 },
  cap: 'M7 4H17L18 6H6Z',
  // the bottom edge's tips lift 0.5u: a roof eave
  capEave: 'M7 4H17L18 5.5Q17.1 6 15.6 6H8.4Q6.9 6 6 5.5Z',
  body: { x: 7, y: 6.5, width: 10, height: 12.5, rx: 3, strokeWidth: 1.5 },
  flame: flamePath(),
  foot: { x: 9, y: 19.75, width: 6, height: 1.5, rx: 0.75 },
  // the foot's top meets the body stroke's outer edge exactly (y 19.75), which antialiases
  // to a faint seam; this join spans the stroke's lower half and the foot's upper half
  // along the body's straight bottom (x 10-14), so it adds no shape, only closes the seam
  // (as the neck does at the hook): one shape covers the joint's pixel row at every size
  footJoin: { x: 10, y: 19, width: 4, height: 1.5 },
};

/** The 16px optical drawing, on a 16px grid: no hook, no eave, whole-pixel edges. */
export const MARK_16 = {
  grid: 16,
  cap: { x: 4, y: 2, width: 8, height: 1.5 },
  // stroke centre line: the 1px stroke covers x 4-5 and 11-12, y 3-4 and 12-13, leaving
  // one clear pixel row above the foot; rx 1.5 keeps the corners from going grey
  body: { x: 4.5, y: 3.5, width: 7, height: 9, rx: 1.5, strokeWidth: 1 },
  // 3 x 5px, centred across the body; set half a pixel low so its tip (y 6) and its
  // foot (y 11) both land on pixel edges
  flame: flamePath({ cx: 8, cy: 8.5, height: 5 }),
  foot: { x: 6, y: 14, width: 4, height: 1, rx: 0.5 },
};

/** Which drawing a rendered size gets: optical below 24px, eave from 32, hook from 48. */
export function markDetail(size) {
  if (size == null) return 'eave';
  if (size < 24) return 'optical';
  if (size < 32) return 'plain';
  if (size < 48) return 'eave';
  return 'hook';
}

/**
 * The mark's nodes.
 * @param {object} o
 * @param {string} [o.variant] primary | mono-hanji | mono-night | reversed | current
 * @param {'optical'|'plain'|'eave'|'hook'} [o.detail]
 * @param {'night'|'paper'} [o.ground] for `current`: the flame's colour (see variantColors)
 * @returns {{ viewBox: string, size: number, nodes: object[] }}
 */
export function markNodes({ variant = 'primary', detail = 'eave', ground = 'night' } = {}) {
  const { ink, flame } = variantColors(variant, ground);
  if (detail === 'optical') {
    const m = MARK_16;
    return {
      viewBox: '0 0 16 16',
      size: 16,
      nodes: [
        el('rect', { class: 'lm-cap', ...m.cap, fill: ink }),
        el('rect', {
          class: 'lm-body', x: m.body.x, y: m.body.y, width: m.body.width, height: m.body.height, rx: m.body.rx,
          fill: 'none', stroke: ink, 'stroke-width': m.body.strokeWidth,
        }),
        el('path', { class: 'lm-flame flame', d: m.flame, fill: flame }),
        el('rect', { class: 'lm-foot', ...m.foot, fill: ink }),
      ],
    };
  }
  const m = MARK;
  return {
    viewBox: '0 0 24 24',
    size: 24,
    nodes: [
      detail === 'hook' &&
        el('g', { class: 'lm-hook' },
          el('circle', { cx: m.hook.cx, cy: m.hook.cy, r: m.hook.r, fill: 'none', stroke: ink, 'stroke-width': m.hook.strokeWidth }),
          el('rect', { ...m.neck, fill: ink })),
      el('path', { class: 'lm-cap', d: detail === 'plain' ? m.cap : m.capEave, fill: ink }),
      el('rect', {
        class: 'lm-body', x: m.body.x, y: m.body.y, width: m.body.width, height: m.body.height, rx: m.body.rx,
        fill: 'none', stroke: ink, 'stroke-width': m.body.strokeWidth,
      }),
      el('path', { class: 'lm-flame flame', d: m.flame, fill: flame }),
      el('rect', { class: 'lm-join', ...m.footJoin, fill: ink }),
      el('rect', { class: 'lm-foot', ...m.foot, fill: ink }),
    ].filter(Boolean),
  };
}

/** The mark's ink box in grid units, per detail (for lockup arithmetic). */
export const MARK_INK = {
  top: 4, // the cap
  hookTop: 0.25,
  bottom: 21.25, // the foot
  left: 6,
  right: 18,
  bodyCentre: 12.75,
};
