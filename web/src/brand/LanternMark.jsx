import { markDetail, markNodes } from './marks.js';
import { a11y, renderNodes } from './render.js';

/**
 * The lantern mark as inline SVG.
 *
 * @param {object} props
 * @param {string} [props.className]
 * @param {'primary'|'mono-hanji'|'mono-night'|'reversed'|'current'} [props.variant]
 *   primary: Hanji with the Ember flame, for Night; reversed: Night with the deep flame,
 *   for Hanji paper; current: follows the CSS colour (the flame follows `ground`).
 * @param {'night'|'paper'} [props.ground] for variant="current" inside an inverted (Hanji)
 *   scope, pass "paper": the flame turns ember-deep, never Ember on Hanji
 * @param {number} [props.size] rendered size in px. Picks the drawing: the 16px optical
 *   version below 24, the eave from 32, the hook from 48. Sets width and height.
 * @param {'optical'|'plain'|'eave'|'hook'} [props.detail] force a drawing
 * @param {string} [props.title] gives it role="img" and this name; otherwise aria-hidden
 *
 * The parts carry classes for motion: .lm-hook .lm-cap .lm-body .lm-flame .lm-join .lm-foot
 * (the flame is also .flame; to scale it, give it transform-box: fill-box and
 * transform-origin: 50% 100%). Colours are presentation attributes, so any CSS fill rule
 * on these parts (or on `path`) overrides them.
 */
export function LanternMark({ className = 'lantern-mark', variant = 'primary', ground = 'night', size, detail, title }) {
  const m = markNodes({ variant, ground, detail: detail || markDetail(size) });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={m.viewBox}
      width={size}
      height={size}
      className={className}
      {...a11y(title)}
    >
      {renderNodes(m.nodes)}
    </svg>
  );
}

export default LanternMark;
