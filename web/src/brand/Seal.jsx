import { SEAL, sealNodes } from './seal.js';
import { a11y, renderNodes } from './render.js';

/**
 * The seal (the commitment motif) as inline SVG.
 *
 * @param {object} props
 * @param {'open'|'closed'|'lit'|'retired'} props.state
 *   open: refused (a 60 degree gap at one o'clock); closed: accepted (full ring and a
 *   centre dot); lit: the lock (an Ember light inside the ring, the flame in Night);
 *   retired: an old commitment (a dashed Ash ring)
 * @param {number} [props.size] px. From 64 the notches are key cuts at the spec's depths,
 *   eased a little below 112 so the ring behind the deepest cut keeps a whole pixel; below
 *   64 they are dropped (the spec's depths leave D/112 of ring, which reads as a broken ring).
 * @param {boolean} [props.notches] force the notches on or off. A seal sized by CSS (no
 *   size) keeps them, so pass notches={false} when CSS draws it under 64px.
 * @param {'night'|'paper'} [props.ground] the ground it sits on: night (Hanji ring, Ember
 *   light) or paper (Night ring, ember-deep light)
 * @param {string} [props.className]
 * @param {string} [props.title] gives it role="img" and this name; otherwise aria-hidden
 *
 * Parts: .seal-ring .seal-dot .seal-light .seal-flame
 */
export function Seal({ state = 'closed', size, notches, ground = 'night', className = 'seal', title }) {
  const nodes = sealNodes({
    state,
    ground,
    notches: notches ?? (size == null || size >= SEAL.notchMin),
    px: size,
  });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${SEAL.D} ${SEAL.D}`}
      width={size}
      height={size}
      className={className}
      data-state={state}
      {...a11y(title)}
    >
      {renderNodes(nodes)}
    </svg>
  );
}

export default Seal;
