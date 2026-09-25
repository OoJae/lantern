// Lockup geometry as data (plain JS, no React), shared by Lockup.jsx and brand.mjs.
//
// H is the wordmark's cap height. In the design spec's terms:
// - the mark's body centre (the flame) sits on the wordmark's x-height centre, and the mark
//   is 0.45H before the wordmark. The spec sizes it "1.55H tall"; here two alignments set
//   the size instead, so the construction drawing has no near-misses: the flame on the
//   x-height centre and the cap's top on the cap line. That makes it 1.66H from hook to
//   foot (1.36H from cap to foot), with the hook rising like an ascender and the foot
//   dropping like a descender. (For the spec's literal 1.55H hook to foot, set
//   LOCKUP.markHeight to 1.55 * H: the cap then sits 0.045H under the cap line.)
// - 등불 hangs vertically like a lantern tag: two stacked glyphs at 0.6H each, a 1.3H
//   column, its top on the ascender line, 0.5H after the "n"; Hanji, never Ember;
// - clear space is 1H on every side.
// Every length below is in the wordmark's font units (2000 per em, H = 1400).
//
// The 등불 outlines are passed in (lockupNodes({ hangul: HANGUL })), so code that only
// draws the compact lockup, like the header, never carries them.

import { WORDMARK } from './glyphs.js';
import { MARK, MARK_INK, markDetail, markNodes, variantColors, el } from './marks.js';

const r2 = (v) => Math.round(v * 100) / 100;

// H, the cap height, in font units (the wordmark's L): 1400 of 2000
const H = 1400;

// mark units to font units: (cap line to x-height centre) over (cap top to body centre)
const MARK_SCALE = (H - WORDMARK.xHeight / 2) / (MARK_INK.bodyCentre - MARK_INK.top);

export const LOCKUP = {
  H,
  /** hook to foot, in font units (about 1.66H) */
  markHeight: MARK_SCALE * (MARK_INK.bottom - MARK_INK.hookTop),
  gap: 0.45 * H,
  tagGlyph: 0.6 * H,
  tagColumn: 1.3 * H,
  tagGap: 0.5 * H,
  clear: 1 * H,
  minWidth: { primary: 120, compact: 88 },
};

// the mark: LOCKUP.markHeight from the hook's top to the foot's bottom, its body centre on
// the x-height centre; the wordmark 0.45H after the mark's widest point (the eave)
function place() {
  if (WORDMARK.capHeight !== H) throw new Error('glyphs.js cap height changed: update LOCKUP.H');
  const s = LOCKUP.markHeight / (MARK_INK.bottom - MARK_INK.hookTop);
  return {
    s,
    x0: -MARK_INK.left * s, // the mark's left ink at x = 0
    y0: -WORDMARK.xHeight / 2 - MARK_INK.bodyCentre * s, // the mark's grid y = 0
    wordX: (MARK_INK.right - MARK_INK.left) * s + LOCKUP.gap,
  };
}

// 등불: em boxes of 0.6H, stacked in a 1.3H column; the top of 등's ink sits on the
// ascender line (the ink, not the em box: the line is drawn through what you see)
function tagLayout(hangul, WORD_X) {
  const glyphs = [hangul.deung, hangul.bul];
  const scale = LOCKUP.tagGlyph / (hangul.deung.emTop - hangul.deung.emBottom);
  const step = LOCKUP.tagColumn - LOCKUP.tagGlyph; // from one em top to the next
  const inkLeft = Math.min(...glyphs.map((g) => g.ink[0])) * scale;
  const x = WORD_X + WORDMARK.width + LOCKUP.tagGap - inkLeft;
  const firstBase = -WORDMARK.ascender + hangul.deung.ink[3] * scale;
  let top = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;
  const placed = glyphs.map((g, i) => {
    // this glyph's baseline: em tops step down by the column's rhythm from 등's
    const base = firstBase + i * step + (g.emTop - hangul.deung.emTop) * scale;
    top = Math.min(top, base - g.ink[3] * scale);
    bottom = Math.max(bottom, base - g.ink[1] * scale);
    right = Math.max(right, x + g.ink[2] * scale);
    return { d: g.d, y: base };
  });
  return { x, scale, placed, top, bottom, right };
}

/** The size in px of the mark's 24u box inside a lockup of cap height capPx. */
export function lockupMarkBox(capPx) {
  return (MARK.grid * place().s * capPx) / H;
}

/**
 * Which mark drawing a lockup gets at a cap height in px: the same thresholds LanternMark
 * applies to its 24u box (eave from 32, hook from 48), with the optical drawing (a
 * different grid) replaced by the plain one.
 */
export function lockupMarkDetail(capPx) {
  if (capPx == null) return 'hook';
  const d = markDetail(lockupMarkBox(capPx));
  return d === 'optical' ? 'plain' : d;
}

/**
 * A lockup's nodes and its ink box.
 * @param {object} o
 * @param {'primary'|'compact'} [o.kind]
 * @param {string} [o.variant] primary (Hanji, Ember flame) | reversed (Night, deep flame) | mono-hanji | mono-night | current
 * @param {'night'|'paper'} [o.ground] for `current`: the flame's colour (see variantColors)
 * @param {'plain'|'eave'|'hook'} [o.detail] the mark's drawing (see lockupMarkDetail)
 * @param {boolean} [o.clear] include the 1H clear space in the viewBox
 * @param {object} [o.hangul] HANGUL from hangul.js: required for the primary lockup
 */
export function lockupNodes({ kind = 'primary', variant = 'primary', ground = 'night', detail = 'hook', clear = false, hangul } = {}) {
  const c = variantColors(variant, ground);
  const mark = markNodes({ variant, ground, detail });
  const p = place();
  const nodes = [
    el('g', { class: 'lockup-mark', transform: `translate(${r2(p.x0)} ${r2(p.y0)}) scale(${Math.round(p.s * 1e4) / 1e4})` }, mark.nodes),
    el('path', { class: 'lockup-word', d: WORDMARK.d, fill: c.ink, transform: `translate(${r2(p.wordX)} 0)` }),
  ];
  const markTop = p.y0 + (detail === 'hook' ? MARK_INK.hookTop : MARK_INK.top) * p.s;
  const markBottom = p.y0 + MARK_INK.bottom * p.s;
  let top = Math.min(markTop, WORDMARK.top);
  let bottom = Math.max(markBottom, WORDMARK.bottom);
  let right = p.wordX + WORDMARK.width;
  if (kind === 'primary') {
    if (!hangul) throw new Error('the primary lockup needs the 등불 outlines: pass { hangul: HANGUL }');
    // Hanji (or the ink colour of a one-colour variant), never Ember
    const t = tagLayout(hangul, p.wordX);
    for (const g of t.placed) {
      nodes.push(el('path', {
        class: 'lockup-tag',
        d: g.d,
        fill: c.ink,
        transform: `translate(${r2(t.x)} ${r2(g.y)}) scale(${Math.round(t.scale * 1e4) / 1e4})`,
      }));
    }
    top = Math.min(top, t.top);
    bottom = Math.max(bottom, t.bottom);
    right = t.right;
  }
  const pad = clear ? LOCKUP.clear : 0;
  const x = -pad;
  const y = top - pad;
  const w = right + 2 * pad;
  const h = bottom - top + 2 * pad;
  return {
    viewBox: `${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}`,
    width: w,
    height: h,
    /** where the baseline and the cap line sit, as fractions of the viewBox height */
    baseline: (0 - y) / h,
    nodes,
  };
}


