import { LOCKUP, lockupMarkDetail, lockupNodes } from './lockup.js';
import { a11y, renderNodes } from './render.js';

const r2 = (v) => Math.round(v * 100) / 100;
const FLUID = { maxWidth: '100%', height: 'auto' };

/**
 * The compact lockup (mark + wordmark) for the header and footer. The same drawing as
 * <Lockup kind="compact">, without the 등불 outlines in the bundle.
 *
 * @param {object} props
 * @param {'primary'|'reversed'|'mono-hanji'|'mono-night'|'current'} [props.variant]
 *   current follows the CSS colour (the flame follows `ground`)
 * @param {'night'|'paper'} [props.ground] for variant="current" inside an inverted (Hanji)
 *   scope, pass "paper": the flame turns ember-deep
 * @param {number} [props.capHeight] H in px: sets the size and the mark's drawing (plain
 *   below H 16.9, the eave below H 25.3, the hook from there). Keep H at 16px or more (89px
 *   wide); below that use the mark alone.
 * @param {boolean} [props.fluid] max-width 100% and height auto. Default false: in a flex
 *   header a percentage max-width lets the logo be squeezed.
 * @param {string} [props.className]
 * @param {string} [props.title] role="img" with this name; otherwise aria-hidden (the home
 *   link keeps aria-label="Lantern home")
 *
 * Parts: .lockup-mark (with the mark's .lm-* parts) and .lockup-word
 */
export function CompactLockup({ variant = 'primary', ground = 'night', capHeight, fluid = false, className = 'lockup', title }) {
  const L = lockupNodes({ kind: 'compact', variant, ground, detail: lockupMarkDetail(capHeight) });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={L.viewBox}
      width={capHeight ? r2((L.width / LOCKUP.H) * capHeight) : undefined}
      height={capHeight ? r2((L.height / LOCKUP.H) * capHeight) : undefined}
      className={className}
      style={fluid ? FLUID : undefined}
      data-kind="compact"
      {...a11y(title)}
    >
      {renderNodes(L.nodes)}
    </svg>
  );
}

export default CompactLockup;
