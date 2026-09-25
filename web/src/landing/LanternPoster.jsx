// The landing scene's poster: the story drawn as one inline SVG. It shows while the WebGL scene
// loads (data-scene="pending"; the canvas fades in over it), instead of the scene ("poster": no
// WebGL2, a failed renderer, context loss, the frame-time watchdog), and as the stacked hero.
//
//   <LanternPoster />            layers follow data-stage on an ancestor (section.night, which
//                                the tracker writes)
//   <LanternPoster stage={3} />  carries its own data-stage (standalone use; do not also put one
//                                on an ancestor)
//
// Each story stage shows or hides whole layers (.lp-*) through finite CSS opacity transitions
// keyed on [data-stage] (poster.css). No filters, no style attributes, no images: radial
// gradients carry the glow. Stage 0 matches the scene's hero frame (keyframe K0): the lantern
// centred on columns 8 to 11 of the 1440 grid, 50% down, on wide screens (73% across up to 1440px
// wide; past that 331px right of centre, as the scene's lens shift keeps it: poster.css) and at
// 50% x 32% below a 4:5 aspect ratio, at the scene's size, so the canvas fading in over it does
// not jump.
//
// After the blackout the same place holds the new phone's lantern, dark and then lit: "B is now
// lit exactly as A was in the hero". Ember appears only on flames, lights and the lit seal.
//
// It lays no ground of its own: the page's Night and its grain (body::before) show through, so
// the stage it hangs in meets the page below with no seam when it scrolls away.
import { useId } from 'react';

const NIGHT = '#090A0F';
const HANJI = '#ECE4D2';
const ASH = '#948E83';
const EMBER = '#FF8A3D';
const EDGE = '#686661';
// scene-only colours (design-spec: flame core, lit paper, warm transmission, lacquered wood)
const CORE = '#FFE2B8';
const LIT = '#F6D9A6';
const WARM = '#3A2616';
const LACQUER = '#1E1712';
// lit paper seen through its own thickness, as the scene's paper shader transmits it: LIT^2 and
// LIT^4 in linear light
const AMBER = '#EDB86A';
const DEEP = '#DC8428';
// lacquered wood turned away from the light (lacquer x 0.25)
const SHADE = '#070605';

// The brand flame (src/brand/marks.js), 100 units tall, centred on its box, tip leaning right.
const FLAME = 'M4.6 -50C4.6 -34.6 26.9 -13.1 26.9 23.1C26.9 37.9 14.9 50 0 50C-14.9 50 -26.9 37.9 -26.9 23.1C-26.9 -0.8 -13.8 -13.1 -4.6 -25.4C0.8 -32.3 4.3 -40 4.6 -50Z';
// The lantern, measured off the scene's hero frame (units: px of the 1440 x 900 frame; 0,0 is
// the frame's centre moved to the lantern's axis).
const BODY = 'M-151 -96C-151 -150 -124 -178 -74 -178H74C124 -178 151 -150 151 -96V120C151 174 124 202 74 202H-74C-124 202 -151 174 -151 120Z';
const ROOF = 'M-145 -245H145L179 -212Q185 -203 176 -200H-176Q-185 -203 -179 -212Z';
// the roof's underside, seen from below, over the top of the paper
const EAVE = 'M-176 -200H176Q174 -186 150 -176Q84 -150 0 -150Q-84 -150 -150 -176Q-174 -186 -176 -200Z';
const BAIL = 'M-95 -245C-95 -330 95 -330 95 -245';
const FOOT = 'M-88 214Q-88 202 -76 202H76Q88 202 88 214V236Q88 250 74 250H-74Q-88 250 -88 236Z';
const RIBS = [-130, -76, -22, 38, 92, 146]
  .map((y) => `M-160 ${y}Q0 ${y + (y < 12 ? -4 : 4)} 160 ${y}`)
  .join('');
const SEAMS = 'M-92 -178Q-99 12 -92 202M97 -178Q104 12 97 202';

// Rings on the ledger are drawn as circles and laid flat (scale y 0.3), like the scene's marks.
const FLAT = 0.3;
const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};
const f1 = (v) => Math.round(v * 10) / 10;
// The seal's twelve slots at 15 + 30k degrees, depths [2,1,3,1,2,3,1,2,1,3,2,1] x D/48 (D 104).
const SLOTS = [2, 1, 3, 1, 2, 3, 1, 2, 1, 3, 2, 1]
  .map((d, k) => {
    const [x0, y0] = polar(43.5, 15 + 30 * k);
    // the round cap (radius 2.15, the slot's half width) carries the cut to exactly d x D/48
    const [x1, y1] = polar(44 + d * 2.17 - 2.15, 15 + 30 * k);
    return `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
  })
  .join('');
// 72 ticks round the recovery ring (r 100): the 72 hours.
const TICKS = Array.from({ length: 72 }, (_, k) => {
  const [x0, y0] = polar(107, k * 5);
  const [x1, y1] = polar(116, k * 5);
  return `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
}).join('');

// Where things stand in the drawing.
const AT = {
  seal: [-40, 286],
  succ: [-128, 267],
  root: [-205, 306],
  leaves: [[-322, 272], [-266, 260], [-206, 254]],
  ringB: [70, 334],
  nulls: [[214, 318], [252, 342]],
  windows: [[-338, 320], [-108, 344]],
  c: [-292, 40],
  ringC: [-292, 338],
  guards: [[-250, -290, 0.2], [80, -366, 0.15], [270, -300, 0.12]],
};
const leafEdge = (p, q, r) => {
  // the hairline from knot q to ring p stops at the ring's (flattened) edge
  const dx = p[0] - q[0];
  const dy = (p[1] - q[1]) / FLAT;
  const len = Math.hypot(dx, dy) || 1;
  return [f1(p[0] - (dx / len) * r), f1(p[1] - ((dy / len) * r) * FLAT)];
};
const hair = (to, r) => {
  const [x, y] = leafEdge(to, AT.root, r);
  const [x0, y0] = leafEdge(AT.root, to, 12);
  return `M${x0} ${y0}L${x} ${y}`;
};
const TREE = AT.leaves.map((p) => hair(p, 20)).join('') + hair(AT.seal, 52);

function Lantern({ id, lit }) {
  if (!lit) {
    // The new phone's lantern before it holds a secret: unlit, a cool rim in the dark.
    return (
      <g fill="none" stroke={EDGE} strokeWidth="1.5">
        <path d="M0 -2000V-326" stroke="#2C2D35" strokeWidth="2" />
        <circle cx="0" cy="-318" r="8" strokeOpacity="0.5" strokeWidth="2.5" />
        <path d={BAIL} strokeOpacity="0.45" strokeWidth="3" />
        <path d={BODY} fill={`url(#${id('rim')})`} strokeOpacity="0.5" />
        <path d={ROOF} fill={SHADE} strokeOpacity="0.55" />
        <path d={EAVE} fill={NIGHT} strokeOpacity="0.3" />
        <path d={FOOT} fill={SHADE} strokeOpacity="0.45" />
      </g>
    );
  }
  return (
    <g>
      <path d="M0 -2000V-326" stroke={SHADE} strokeWidth="2.5" />
      <circle cx="0" cy="-318" r="8" fill="none" stroke={SHADE} strokeWidth="3.5" />
      <path d={BAIL} fill="none" stroke={SHADE} strokeWidth="5" />
      <path d={BODY} fill={WARM} />
      <path d={BODY} fill={`url(#${id('paper')})`} />
      <path d={BODY} fill={`url(#${id('ends')})`} />
      <g clipPath={`url(#${id('body')})`} fill="none" stroke={WARM}>
        <path d={SEAMS} strokeWidth="2" strokeOpacity="0.3" />
        <path d={RIBS} stroke={DEEP} strokeWidth="9" strokeOpacity="0.35" />
        <path d={RIBS} strokeWidth="3.5" strokeOpacity="0.8" />
        <path d="M-160 198H160" strokeWidth="9" strokeOpacity="0.85" />
      </g>
      <ellipse cx="0" cy="40" rx="42" ry="96" fill={`url(#${id('drop')})`} />
      <path d={FLAME} transform="translate(0 38) scale(0.2 0.85)" fill={CORE} />
      <path d={ROOF} fill={SHADE} />
      <path d={EAVE} fill={`url(#${id('eave')})`} />
      <path d={FOOT} fill={SHADE} />
      <path d="M-84 203H84" stroke={WARM} strokeWidth="3" />
    </g>
  );
}

function Ember({ id, x, y, k = 1 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={34 * k} fill={`url(#${id('ember')})`} />
      <circle r={4.5 * k} fill={CORE} />
    </g>
  );
}

function Seal({ at, state }) {
  const [x, y] = at;
  const ring = state === 'retired' ? ASH : HANJI;
  return (
    <g transform={`translate(${x} ${y}) scale(1 ${FLAT})`}>
      {state === 'lit' && <circle r="41.8" fill={EMBER} />}
      {state === 'lit' && <path d={FLAME} transform="scale(0.416)" fill={NIGHT} />}
      <circle
        r="48"
        fill="none"
        stroke={ring}
        strokeWidth="8"
        strokeDasharray={state === 'retired' ? '15.08 10.05' : undefined}
        strokeDashoffset={state === 'retired' ? '7.54' : undefined}
      />
      {state !== 'retired' && <path d={SLOTS} stroke={NIGHT} strokeWidth="4.3" strokeLinecap="round" />}
      {state === 'closed' && <circle r="8.7" fill={HANJI} />}
    </g>
  );
}

const flat = (at) => `translate(${at[0]} ${at[1]}) scale(1 ${FLAT})`;

function Tableau({ id }) {
  return (
    <>
      <defs>
        <radialGradient id={id('halo')}>
          <stop offset="0" stopColor={LIT} stopOpacity="0.2" />
          <stop offset="0.3" stopColor={EMBER} stopOpacity="0.075" />
          <stop offset="0.62" stopColor={EMBER} stopOpacity="0.022" />
          <stop offset="1" stopColor={EMBER} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('paper')} cx="0" cy="40" r="250" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 40) scale(1 0.7) translate(0 -40)">
          <stop offset="0" stopColor={CORE} />
          <stop offset="0.2" stopColor={CORE} stopOpacity="0.97" />
          <stop offset="0.5" stopColor={AMBER} stopOpacity="0.96" />
          <stop offset="0.78" stopColor={DEEP} stopOpacity="0.74" />
          <stop offset="1" stopColor={DEEP} stopOpacity="0.52" />
        </radialGradient>
        <linearGradient id={id('ends')} x1="0" y1="-178" x2="0" y2="202" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={WARM} stopOpacity="0.6" />
          <stop offset="0.3" stopColor={WARM} stopOpacity="0" />
          <stop offset="0.66" stopColor={WARM} stopOpacity="0" />
          <stop offset="1" stopColor={WARM} stopOpacity="0.66" />
        </linearGradient>
        <radialGradient id={id('drop')}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="0.5" stopColor={CORE} stopOpacity="0.25" />
          <stop offset="1" stopColor={CORE} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('eave')} x1="0" y1="-200" x2="0" y2="-150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={SHADE} />
          <stop offset="1" stopColor={WARM} />
        </linearGradient>
        <radialGradient id={id('rim')} cx="0" cy="0" r="200" gradientUnits="userSpaceOnUse">
          <stop offset="0.6" stopColor={NIGHT} />
          <stop offset="1" stopColor="#15161C" />
        </radialGradient>
        <radialGradient id={id('ember')}>
          <stop offset="0" stopColor={EMBER} stopOpacity="0.75" />
          <stop offset="0.25" stopColor={EMBER} stopOpacity="0.28" />
          <stop offset="1" stopColor={EMBER} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('lock')}>
          <stop offset="0" stopColor={EMBER} stopOpacity="0.4" />
          <stop offset="1" stopColor={EMBER} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('guard')} cx="0" cy="10" r="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={LIT} stopOpacity="0.5" />
          <stop offset="0.6" stopColor={EMBER} stopOpacity="0.28" />
          <stop offset="1" stopColor={WARM} stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id={id('line')} x1="-720" y1="0" x2="720" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={HANJI} stopOpacity="0" />
          <stop offset="0.5" stopColor={HANJI} stopOpacity="0.26" />
          <stop offset="1" stopColor={HANJI} stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('body')}>
          <path d={BODY} />
        </clipPath>
      </defs>

      {/* the air round the lit lantern */}
      <circle className="lp-l lp-halo" r="480" cy="10" fill={`url(#${id('halo')})`} />

      {/* the guardians: three small lanterns far off in the fog, never named */}
      <g className="lp-l lp-guards">
        {AT.guards.map(([x, y, s]) => (
          <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d={BODY} fill={`url(#${id('guard')})`} />
            <path d={ROOF} fill={WARM} fillOpacity="0.5" />
          </g>
        ))}
      </g>

      {/* the public record: the ledger line and what lies on it */}
      <path className="lp-l lp-line" d="M-1100 300H800" stroke={`url(#${id('line')})`} strokeWidth="1" />
      <g className="lp-l lp-tree" fill="none" stroke={HANJI}>
        <path d={TREE} strokeWidth="1.2" strokeOpacity="0.55" />
        {AT.leaves.map((p) => (
          <circle key={p[0]} transform={flat(p)} r="20" strokeWidth="8" strokeOpacity="0.75" />
        ))}
        <g transform={flat(AT.root)}>
          <circle r="12" strokeWidth="5" />
          <circle r="5.5" fill={HANJI} stroke="none" />
        </g>
      </g>
      <g className="lp-l lp-windows" fill="none" stroke={HANJI}>
        <path d={hair(AT.windows[0], 26) + hair(AT.windows[1], 26)} strokeWidth="1.2" strokeOpacity="0.55" />
        {AT.windows.map((p) => (
          <g key={p[0]} transform={`translate(${p[0]} ${p[1]}) scale(1 0.45)`}>
            <rect x="-24" y="-24" width="48" height="48" rx="6" fill={LIT} fillOpacity="0.12" strokeWidth="3.5" />
            <path d="M-24 -11H24" strokeWidth="3" />
          </g>
        ))}
      </g>
      <g className="lp-l lp-ring" fill="none" stroke={HANJI} transform={flat(AT.ringB)}>
        <circle r="100" strokeWidth="6" />
      </g>
      <path className="lp-l lp-ticks-dim" transform={flat(AT.ringB)} d={TICKS} stroke={HANJI} strokeOpacity="0.22" strokeWidth="2.4" />
      <path className="lp-l lp-ticks" transform={flat(AT.ringB)} d={TICKS} stroke={HANJI} strokeWidth="2.4" />
      <g className="lp-l lp-nulls" fill="none" stroke={HANJI}>
        {AT.nulls.map((p) => (
          <circle key={p[0]} transform={flat(p)} r="9" strokeWidth="6" />
        ))}
      </g>
      <ellipse className="lp-l lp-lockglow" cx={AT.seal[0]} cy={AT.seal[1]} rx="170" ry="58" fill={`url(#${id('lock')})`} />
      <g className="lp-l lp-seal"><Seal at={AT.seal} state="closed" /></g>
      <g className="lp-l lp-seal-lit"><Seal at={AT.seal} state="lit" /></g>
      <g className="lp-l lp-seal-old"><Seal at={AT.seal} state="retired" /></g>
      <g className="lp-l lp-succ">
        <path d={hair(AT.succ, 52)} fill="none" stroke={HANJI} strokeWidth="1.2" strokeOpacity="0.55" />
        <Seal at={AT.succ} state="closed" />
      </g>

      {/* Jihoon's recovery: his lantern, rim-lit and never lit, over his own ring */}
      <g className="lp-l lp-c">
        <g transform={`translate(${AT.c[0]} ${AT.c[1]}) scale(0.42)`}>
          <Lantern id={id} />
        </g>
        <circle transform={flat(AT.ringC)} r="32" fill="none" stroke={HANJI} strokeWidth="6" strokeDasharray="12 9" />
      </g>

      {/* the lantern: the laptop's (stages 0-2), then the new phone's (4-7) */}
      <g className="lp-l lp-dark"><Lantern id={id} /></g>
      <g className="lp-l lp-lit"><Lantern id={id} lit /></g>

      {/* the veto card: out to the side, then low over Jihoon's ring */}
      <g className="lp-l lp-card" transform="translate(-232 64) rotate(-7)">
        <rect x="-42" y="-28" width="84" height="56" rx="2" fill={HANJI} fillOpacity="0.78" />
        <circle cx="-20" cy="0" r="9" fill="none" stroke={NIGHT} strokeWidth="2.5" strokeOpacity="0.7" />
        <path d="M-2 -6H28M-2 6H22" stroke={NIGHT} strokeWidth="2" strokeOpacity="0.35" />
      </g>
      <g className="lp-l lp-veto" transform={`translate(${AT.ringC[0]} ${AT.ringC[1] - 14}) rotate(-4)`}>
        <rect x="-40" y="-24" width="80" height="48" rx="2" fill={HANJI} fillOpacity="0.72" />
        <circle cx="-19" cy="0" r="8" fill="none" stroke={NIGHT} strokeWidth="2.5" strokeOpacity="0.7" />
        <path d="M-2 -5H26M-2 6H20" stroke={NIGHT} strokeWidth="2" strokeOpacity="0.35" />
      </g>

      {/* the lights: shares at the guardians, then two back at the phone, one at Jihoon's */}
      <g className="lp-l lp-g12">
        <Ember id={id} x={AT.guards[0][0]} y={AT.guards[0][1] + 4} k={0.8} />
        <Ember id={id} x={AT.guards[1][0]} y={AT.guards[1][1] + 4} k={0.7} />
      </g>
      <g className="lp-l lp-g3">
        <Ember id={id} x={AT.guards[2][0]} y={AT.guards[2][1] + 4} k={0.62} />
      </g>
      <g className="lp-l lp-bembers">
        <Ember id={id} x={-180} y={-34} />
        <Ember id={id} x={186} y={6} />
      </g>
      <g className="lp-l lp-cember">
        <Ember id={id} x={AT.c[0] + 56} y={AT.c[1] + 26} k={0.66} />
      </g>
    </>
  );
}

export default function LanternPoster({ stage, className = '' }) {
  const base = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const tall = (name) => `lp${base}t-${name}`;
  const wide = (name) => `lp${base}w-${name}`;
  return (
    <svg
      className={`lantern-poster ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A paper lantern glowing in the dark"
      data-stage={stage == null ? undefined : String(stage)}
      width="100%"
      height="100%"
    >
      {/* wide: the lantern at 73% across, 50% down, sized by the stage's height (K0) */}
      <svg className="lp-wide" x="23%" y="0" width="100%" height="100%" viewBox="-720 -450 1440 900" preserveAspectRatio="xMidYMid meet" overflow="visible">
        <Tableau id={wide} />
      </svg>
      {/* tall (below 4:5): the lantern centred, its middle at 32% down */}
      <svg className="lp-tall" x="0" y="0" width="100%" height="100%" viewBox="-370 -570 741 1605" preserveAspectRatio="xMidYMid meet" overflow="visible">
        <Tableau id={tall} />
      </svg>
    </svg>
  );
}
