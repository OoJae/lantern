import { pictogramNodes } from './pictograms.js';
import { a11y, renderNodes } from './render.js';

/**
 * One of the brand pictograms (48u grid, 1.5u strokes) as inline SVG.
 *
 * @param {object} props
 * @param {string} props.name 01-seal, 02-three-lights, 03-dark, 04-return, 05-window,
 *   06-lock, 07-apps, attacks-named (the designs that broke: lanterns with name tags),
 *   attacks-held (the design that held: unlabelled lights)
 * @param {'night'|'paper'} [props.ground]
 * @param {number} [props.size] px (sets width and height)
 * @param {string} [props.className]
 * @param {string} [props.title] gives it role="img" and this name; otherwise aria-hidden
 *
 * Parts: .pg-ledger .pg-body .pg-flame .pg-share .pg-light .pg-elapsed .pg-tag .pg-card .pg-root
 */
export function Pictogram({ name, ground = 'night', size, className = 'pictogram', title }) {
  const p = pictogramNodes(name, { ground });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={p.viewBox}
      width={size}
      height={size}
      className={className}
      data-name={name}
      {...a11y(title)}
    >
      {renderNodes(p.nodes)}
    </svg>
  );
}

export default Pictogram;
