import { WORDMARK } from './glyphs.js';
import { HANGUL } from './hangul.js';
import { LOCKUP, lockupMarkDetail, lockupNodes } from './lockup.js';
import { variantColors } from './marks.js';
import { a11y, renderNodes } from './render.js';

const r2 = (v) => Math.round(v * 100) / 100;
// never wider than its container (no side-scroll at 320px); the drawing keeps its ratio.
// A React style prop is set through the CSSOM, which the CSP's style-src allows.
export const FLUID = { maxWidth: '100%', height: 'auto' };

/**
 * A lockup as inline SVG. For the header and footer, CompactLockup.jsx draws the same
 * compact lockup without carrying the 등불 outlines.
 *
 * @param {object} props
 * @param {'compact'|'primary'} [props.kind] compact: mark + wordmark (header, footer);
 *   primary: mark + wordmark + 등불 hanging like a tag (OG image, /brand, end cards; never the header)
 * @param {'primary'|'reversed'|'mono-hanji'|'mono-night'|'current'} [props.variant]
 *   primary: Hanji with the Ember flame; reversed: Night with the deep flame, on Hanji;
 *   current: follows the CSS colour (the flame follows `ground`)
 * @param {'night'|'paper'} [props.ground] for variant="current" inside an inverted (Hanji)
 *   scope, pass "paper": the flame turns ember-deep
 * @param {number} [props.capHeight] H, the wordmark's cap height in px. Sets the size and
 *   picks the mark's drawing (the thresholds LanternMark uses: eave from a 32px mark box,
 *   hook from 48px). Minimums: H 16px compact (89px wide), H 19px primary (125px wide).
 * @param {boolean} [props.clear] include the 1H clear space
 * @param {boolean} [props.fluid] default true: max-width 100% and height auto, so a large
 *   capHeight shrinks to fit a narrow column. Pass false to size it with a CSS height.
 * @param {string} [props.className]
 * @param {string} [props.title] gives it role="img" and this name; otherwise aria-hidden
 *   (a home link keeps its own aria-label)
 */
export function Lockup({ kind = 'compact', variant = 'primary', ground = 'night', capHeight, clear = false, fluid = true, className = 'lockup', title }) {
  const L = lockupNodes({ kind, variant, ground, detail: lockupMarkDetail(capHeight), clear, hangul: HANGUL });
  const height = capHeight ? r2((L.height / LOCKUP.H) * capHeight) : undefined;
  const width = capHeight ? r2((L.width / LOCKUP.H) * capHeight) : undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={L.viewBox}
      width={width}
      height={height}
      className={className}
      style={fluid ? FLUID : undefined}
      data-kind={kind}
      {...a11y(title)}
    >
      {renderNodes(L.nodes)}
    </svg>
  );
}

/**
 * The wordmark alone (outlined Fraunces). Below 18px tall use the mark alone.
 * @param {object} props
 * @param {number} [props.height] px
 * @param {boolean} [props.fluid] max-width 100% and height auto (default false: in a flex
 *   header a percentage max-width lets the word be squeezed)
 */
export function Wordmark({ variant = 'primary', height, fluid = false, className = 'wordmark', title }) {
  const { ink } = variantColors(variant);
  const h = WORDMARK.bottom - WORDMARK.top;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 ${WORDMARK.top} ${WORDMARK.width} ${h}`}
      height={height}
      width={height ? r2((WORDMARK.width / h) * height) : undefined}
      className={className}
      style={fluid ? FLUID : undefined}
      {...a11y(title)}
    >
      <path d={WORDMARK.d} fill={ink} />
    </svg>
  );
}

export default Lockup;
