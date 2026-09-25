// The storyboard as a pure function: choreograph(u, layout) -> scene state.
//
// u runs 0..8. u = i exactly when story step i is centred in the viewport (the tracker), and the
// scene has finished segment i's action by then: each segment plays while its text rises into
// view, then holds while it is read. u 7..8 is the page continuing after the story (the closing
// vignette). Time appears nowhere here; the scene adds only the flame's flicker and the resting
// embers' drift on top. Scrolling back replays; reloading mid-page is exact.
//
// Rule 3 (one moving thing at a time): inside every segment the camera moves first, then each
// element group acts in turn. Nothing overlaps but the flame's flicker.

// ---------------------------------------------------------------------------------------------
// World (design-spec "World coordinates"; lantern height 1.4u, FOV 30, ledger plane y = -1.5).
export const PLANE_Y = -1.5;
export const WORLD = {
  A: [0, 0, 0],
  B: [1.1, 0, 1.4],
  C: [-2.0, -0.2, -1.5],
  G: [[-2.4, 0.5, -6], [1.6, 1.0, -9], [3.8, -0.1, -12]],
  guardianScale: 0.7,
  flame: [0, -0.06, 0], // inside the body, a little below its centre, like a candle
  // On the ledger (x, z). The spec fixes the seal and the DApp windows. The root knot sits just
  // behind the seal with the guardian leaves fanned behind it and the successor to its right,
  // so from K7 (high, in front) the record reads as one small tree: the knot, two seals hanging
  // from it, three leaves above, a window at each side. Every hairline clears every ring by
  // 0.1u or more, and nothing hides in B's shadow from K7.
  seal: [0, 0.3],
  successor: [-0.66, 0.12],
  root: [-0.6, 0.66],
  leaves: [[-1.2, 0.95], [-0.55, 1.5], [0.05, 1.4]],
  windows: [[-1.6, 1.8], [2.6, 0.9]],
  ringB: [1.1, 1.4],
  ringC: [-2.0, -1.5],
  nullifiers: [[0.42, 1.76], [1.95, 1.7]],
  // Where returning lights hover, beside B and C: clear of B's silhouette from every camera
  // that sees them (K4 to K6a).
  hoverB: [[0.42, 0.12, 1.76], [1.95, 0.06, 1.7]],
  hoverC: [-1.62, -0.12, -1.3],
  // The veto card's resting place in the air, then on C's ring.
  cardAir: [-0.98, -0.62, 0.72],
  // Over C's ring it hovers low and leans toward the viewer: private things float (rule 2),
  // and a card seen edge-on reads as nothing.
  cardDown: [-2.0, -1.37, -1.46],
};
export const SIZE = { seal: 0.27, leaf: 0.14, root: 0.075, nullifier: 0.055, ringB: 0.42, ringC: 0.34, window: 0.2 };

// ---------------------------------------------------------------------------------------------
// Camera keyframes. pos, target, lens shift [sx, sy] (setViewOffset: the target lands at
// (0.5 + sx, 0.5 - sy) of the frame), and zoom (camera.zoom, 1 unless given). Wide: the story
// text holds the left columns, so the subject is shifted right, except in the blackout, whose
// text is centred. Tall (phones): the subject sits in the upper part of the frame and the text
// scrolls beneath it; the widest shots open the lens, because a portrait frame cannot hold the
// guardians' spread at 30 degrees without shrinking the lanterns to specks.
// Segment 6 has two: K6a, close on the phone's flame and the seal for the refusal (the flame
// must be big enough to show its wrong notch), then K6b, drawn back for the lock and the bloom.
const WIDE = {
  // The hero: the lantern centred on columns 8 to 11 of the 1440 grid (design-spec, "The landing
  // page"), 0.23 of the frame right of centre, where the h1 ends 20px short of its paper.
  K0: { pos: [0.9, -0.35, 4.6], tgt: [0, 0.05, 0], shift: [0.23, 0] },
  K1: { pos: [1.0, 0.1, 5.7], tgt: [-0.12, -0.4, 0.2], shift: [0.2, -0.035], zoom: 0.86 },
  K2: { pos: [0.85, 2.09, 8.57], tgt: [0.47, -1.2, -3.46], shift: [0.19, 0.03], zoom: 0.834 },
  // The blackout: K2 pushed in and re-centred for the centred text, the lens easing in as the
  // flame dies, and the camera drifting 6 degrees round the target as it does, so the seal comes
  // to rest on the text's axis, under the last line, and the three embers above the kicker
  // (centred on the same axis).
  K3: { pos: [-0.459, 2.041, 8.359], tgt: [0.47, -1.2, -3.46], shift: [0.025, -0.035], zoom: 1.075 },
  // The new phone, large and unlit, the guardians round it, their two lights coming back to it.
  K4: { pos: [1.92, 0.69, 5.72], tgt: [1.55, -0.14, 1.63], shift: [0.245, 0.02], zoom: 0.697 },
  // Jihoon: his lantern, his ring, the card coming down on it; his guardian's light in the air.
  K5: { pos: [-3.53, 1.42, 7.22], tgt: [-1.45, -0.7, -1.7], shift: [0.22, -0.115], zoom: 1.176 },
  // Close on the phone's flame and the seal, the seal clear of the phone's foot.
  K6a: { pos: [3.16, 1.95, 7.32], tgt: [-0.04, -1.79, -0.94], shift: [0.24, 0.02], zoom: 1.176 },
  // Drawn back for the lock and the bloom: the phone whole, the seal and the tree below it, the
  // vetoed card to one side, a guardian off its shoulder (never stacked over it).
  K6b: { pos: [3, 1.76, 10.03], tgt: [-0.99, -0.84, -0.97], shift: [0.19, -0.01], zoom: 1.3 },
  // Crane up. Low enough that the root's hairline to the right window passes clear in front of
  // B's foot instead of grazing it.
  K7: { pos: [0.6, 3.4, 7.6], tgt: [0.5, -1.5, 0.6], shift: [0.24, 0.04], zoom: 0.68 },
};
const TALL = {
  K0: { pos: [0.75, -0.45, 8.3], tgt: [0, 0.05, 0], shift: [0, 0.16] },
  K1: { pos: [0.1, 0.4, 9.6], tgt: [-0.45, -0.5, 0.2], shift: [0, 0.12], zoom: 0.8 },
  K2: { pos: [1.3, 2.4, 13.5], tgt: [0.5, -0.2, -4.6], shift: [0, 0.2], zoom: 0.62 },
  // the blackout: the same drift round the target, the seal on the centred text's axis
  K3: { pos: [-1.03, 2.361, 13.181], tgt: [0.5, -0.2, -4.6], shift: [0.015, 0.205], zoom: 0.59 },
  K4: { pos: [2.1, 0.55, 7.42], tgt: [0.07, -1.08, -0.81], shift: [0, 0.15], zoom: 0.464 },
  // Jihoon's lantern and ring, seen from 14 degrees further round to his side, so the left DApp
  // window (near the lens, right of the frame) stays wholly out of every portrait frame rather
  // than showing a sliver at its edge behind the text.
  K5: { pos: [-5.197, 2.6, 4.846], tgt: [-2.1, -0.75, -1.5], shift: [0, 0.18], zoom: 0.78 },
  K6a: { pos: [1.6, 1.6, 7.4], tgt: [0.5, -0.85, 0.8], shift: [-0.08, 0.14], zoom: 0.74 },
  K6b: { pos: [2.13, 0.68, 8.63], tgt: [0.11, -0.28, -0.44], shift: [0, 0.2], zoom: 0.55 },
  K7: { pos: [0.11, 4.61, 10.23], tgt: [0.42, -1.44, 1.01], shift: [0, 0.2], zoom: 0.518 },
};
export const KEYFRAMES = { wide: WIDE, tall: TALL };
// Camera moves in u: [start, end, from, to, slow]. The camera always moves alone (rule 3).
export const MOVES = [
  [0.2, 0.45, 'K0', 'K1'],
  [1.15, 1.45, 'K1', 'K2'],
  [2.2, 2.95, 'K2', 'K3', true],
  [3.15, 3.42, 'K3', 'K4'],
  [4.4, 4.54, 'K4', 'K5'],
  [5.12, 5.26, 'K5', 'K6a'],
  [5.62, 5.69, 'K6a', 'K6b'],
  [6.12, 6.45, 'K6b', 'K7'],
];

// Where the camera really stands for a viewport, from a keyframe pose (pure: the scene and the
// framing checks share it). Between the two layouts, wide shots pull back so they still fit a
// squarer window, and the lens shift narrows with them; past the 1440 grid the shift stays in
// grid pixels, so the subject stays over columns 8 to 11 on an ultrawide screen.
// Returns { pos, tgt, zoom, ox, oy }: ox, oy are setViewOffset's x and y in CSS px.
//
// room (optional, px from the top of the stage) is where the hero's words start on the first
// screen (the tracker's room). On a short portrait screen the words, anchored to the fold, start
// higher than the tall hero frame's lantern foot (51% of the stage): there the hero lantern
// shrinks about a point near the top of the frame (8% down, so its cord still runs out of it)
// until its foot ends 16px above the words, at no less than 0.35 of its size. Only in K0, fading
// out over the first move (cam.k0). The poster's tall drawing does the same (styles/landing.css,
// --room).
export function cameraPose(cam, w, h, layout, out = { pos: [0, 0, 0], tgt: [0, 0, 0], zoom: 1, ox: 0, oy: 0 }, room = 0) {
  const aspect = w / h;
  const t = cam.tgt;
  let k = 1;
  let sx = cam.shift[0];
  if (layout === 'wide' && aspect < 1.5) {
    k = Math.pow(1.5 / aspect, 0.75);
    sx *= Math.sqrt(aspect / 1.5);
  }
  for (let i = 0; i < 3; i++) {
    out.tgt[i] = t[i];
    out.pos[i] = t[i] + (cam.pos[i] - t[i]) * k;
  }
  out.zoom = cam.zoom;
  out.ox = -sx * Math.min(w, 1440);
  out.oy = cam.shift[1] * h;
  const foot = (room - 16) / h;
  if (layout === 'tall' && room > 0 && cam.k0 > 0 && foot < 0.51) {
    const s = Math.max(0.35, (foot - 0.08) / 0.43);
    out.zoom *= 1 + (s - 1) * cam.k0;
    out.oy += ((0.5 - foot + 0.17 * s) * h - out.oy) * cam.k0;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Easing. The ignite spring is the brand's --ease-ignite linear() curve, stop for stop.
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const W = (u, a, b) => clamp01((u - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const settle = (t) => 1 - (1 - t) ** 3; // arrivals
export const snuff = (t) => t * t * t; // exits
export const carry = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // travel
const IGNITE = [[0, 0], [0.12, 0.35], [0.25, 0.8], [0.4, 1.06], [0.55, 1.02], [0.7, 0.995], [1, 1]];
export function ignite(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  for (let i = 1; i < IGNITE.length; i++) {
    const [x1, y1] = IGNITE[i];
    if (t <= x1) {
      const [x0, y0] = IGNITE[i - 1];
      return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}
const bump = (t) => Math.sin(Math.PI * clamp01(t)); // 0 -> 1 -> 0
const lerp = (a, b, t) => a + (b - a) * t;
function lerp3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
// A cubic Bezier through four points.
function bezier(out, p0, p1, p2, p3, t) {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  for (let i = 0; i < 3; i++) out[i] = a * p0[i] + b * p1[i] + c * p2[i] + d * p3[i];
  return out;
}
// An arc between two points that rises `lift` above the higher end at its middle.
const P1 = [0, 0, 0];
const P2 = [0, 0, 0];
function arc(out, from, to, t, lift, side = 0) {
  const top = Math.max(from[1], to[1]) + lift;
  P1[0] = lerp(from[0], to[0], 0.2) + side; P1[1] = top; P1[2] = lerp(from[2], to[2], 0.2);
  P2[0] = lerp(from[0], to[0], 0.8) + side * 0.5; P2[1] = top; P2[2] = lerp(from[2], to[2], 0.8);
  return bezier(out, from, P1, P2, to, t);
}
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
// Fixed points, made once (choreograph() runs every frame and allocates nothing).
const FLAME_A = add(WORLD.A, WORLD.flame);
const FLAME_B = add(WORLD.B, WORLD.flame);
const HOME = WORLD.G.map((g) => add(g, [0, -0.06, 0])); // where each guardian holds its light
const BUD = [0, 1, 2].map((i) => add(FLAME_A, [0.02 * (i - 1), 0.16, 0]));
const DROP_FROM = [FLAME_A[0], -0.66, FLAME_A[2] + 0.04];
const DROP_TO = [WORLD.seal[0], PLANE_Y + 0.02, WORLD.seal[1]];
const CARD_OUT = [-0.12, -0.22, 0.05];
const CARD_C1 = [-1.42, -1.33, 0.25];
const CARD_C2 = [-2.0, -1.38, -0.9];
const TMP = [0, 0, 0];

// ---------------------------------------------------------------------------------------------
// Segment windows in u. Each is [start, end]; the camera takes the first part (MOVES).
export const SEGMENTS = [
  [0, 0.2],
  [0.2, 0.95],
  [1.15, 1.95],
  [2.2, 2.95],
  [3.15, 3.95],
  [4.15, 4.97],
  [5.12, 5.97],
  [6.12, 6.95],
];

export function createState() {
  const v3 = () => [0, 0, 0];
  return {
    cam: { pos: v3(), tgt: v3(), shift: [0, 0], zoom: 1, k0: 1 },
    bgLift: 1,
    plane: 0,
    close: 0,
    ledger: 1,
    A: { flameI: 1, flameDip: 0, flameScale: 1, gutter: 0, notch: 0, paper: 1, bloomH: 9, opacity: 1, cool: 0, rim: 0.5 },
    // B's cord fades into the dark a short way above its hook: a full cord would run up past a
    // guardian in the wider shots and seem to hang the phone from it.
    B: { opacity: 0, flameI: 0, flameScale: 1, gutter: 0, notch: 0, paper: 0, bloomH: -1, cool: 0, rim: 1, cord: 0.9 },
    C: { opacity: 0, rim: 1 },
    G: [0, 0, 0],
    shares: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], // x y z intensity drift
    drop: [0, 0, 0, 0],
    nDrops: [[0, 0, 0, 0], [0, 0, 0, 0]],
    seal: { a: 0, scale: 1, rot: 0, gap: 0, dot: 1, fill: 0, dash: 0, flash: 0 },
    succ: { a: 0, scale: 1 },
    ripples: [[0, 0], [0, 0]], // radius factor, alpha
    lock: 0,
    root: 0,
    leaves: [0, 0, 0],
    leafLines: [0, 0, 0],
    sealLine: 0,
    sealLineA: 1,
    succLine: 0,
    windows: [0, 0],
    windowLines: [0, 0],
    ringB: { a: 0, arc: 0, fill: 0 },
    nulls: [0, 0],
    ringC: { a: 0, arc: 0, dash: 0 },
    card: { pos: v3(), rot: v3(), a: 0 },
    beam: { head: 0, tail: 0, brk: 0, I: 0 },
  };
}

function camera(s, u, K) {
  let from = K.K0;
  let to = K.K0;
  let e = 0;
  for (const [a, b, f, g, slow] of MOVES) {
    if (u < a) break;
    from = K[f];
    to = K[g];
    const t = W(u, a, b);
    e = slow ? smooth(t) : carry(t);
  }
  lerp3(s.cam.pos, from.pos, to.pos, e);
  lerp3(s.cam.tgt, from.tgt, to.tgt, e);
  s.cam.shift[0] = lerp(from.shift[0], to.shift[0], e);
  s.cam.shift[1] = lerp(from.shift[1], to.shift[1], e);
  s.cam.zoom = lerp(from.zoom ?? 1, to.zoom ?? 1, e);
  // how much of the hero frame is left (cameraPose's hero fit): all of it until the first move
  s.cam.k0 = from === K.K0 ? (to === K.K0 ? 1 : 1 - e) : 0;
}

// ---------------------------------------------------------------------------------------------
export function choreograph(uIn, layout = 'wide', s = createState()) {
  const u = Math.max(0, Math.min(8, uIn));
  camera(s, u, KEYFRAMES[layout] ?? WIDE);
  const tmp = TMP;

  // ---- Lantern A ------------------------------------------------------------------------------
  // Seg 1: the flame dips to press the seal, then rises.
  const dip = carry(W(u, 0.42, 0.52)) - settle(W(u, 0.62, 0.74));
  // Seg 3: it gutters, then snuffs.
  const gut = W(u, 2.35, 2.62);
  const sn = W(u, 2.6, 2.7);
  const sputter = gut > 0 && sn < 1 ? 0.22 * gut * (0.5 + 0.5 * Math.sin(u * 211) * Math.sin(u * 97)) : 0;
  s.A.flameDip = -0.09 * dip;
  s.A.flameScale = (1 + 0.12 * dip) * (1 - 0.8 * snuff(sn));
  s.A.gutter = gut * (1 - sn);
  s.A.flameI = (1 + 0.15 * dip) * (1 - 0.3 * gut - sputter) * (1 - sn);
  s.A.notch = 0;
  s.A.paper = s.A.flameI;
  s.A.bloomH = 9;
  s.A.cool = smooth(W(u, 2.62, 2.8));
  // Its cold ghost holds through the blackout, then goes as the new phone comes.
  s.A.opacity = (1 - 0.94 * smooth(W(u, 2.65, 2.85))) * (1 - smooth(W(u, 3.3, 3.42)));
  // Moonlight only shows on paper that is not lit from within.
  s.A.rim = 0.12 + 0.5 * s.A.cool;

  s.bgLift = 1 - smooth(W(u, 2.6, 2.8));
  // The ledger's lacquer takes the light only once the camera has tilted down to it: in the
  // hero there is nothing below the lantern but Night.
  s.plane = smooth(W(u, 0.2, 0.5));

  // ---- The seal (seg 1 stamp; seg 6 the refusal and the lock; seg 7 retired) ------------------
  const drop = W(u, 0.5, 0.6);
  lerp3(tmp, DROP_FROM, DROP_TO, drop * drop);
  s.drop[0] = tmp[0]; s.drop[1] = tmp[1]; s.drop[2] = tmp[2];
  s.drop[3] = drop > 0 && drop < 1 ? smooth(W(u, 0.5, 0.53)) : 0;

  const stamp = W(u, 0.6, 0.69);
  s.seal.a = smooth(W(u, 0.598, 0.615));
  s.seal.scale = 1.25 - 0.25 * ignite(stamp);
  s.ripples[0][0] = 1 + 1.5 * settle(stamp);
  s.ripples[0][1] = stamp > 0 && stamp < 1 ? 0.55 * (1 - stamp) : 0;

  // Seg 6(a): the tampered flame's beam arrives and the seal tries to turn. It gets a third of
  // the way, hits the wrong notch hard, shudders, and falls back: refused. At the stop it flashes
  // Edge and opens, the brand's own open seal (a 60 degree gap at one o'clock), then closes again.
  const jam = W(u, 5.46, 5.53);
  let jamRot = 0;
  if (jam > 0 && jam < 1) {
    if (jam < 0.3) jamRot = 0.18 * (jam / 0.3) ** 2;
    else if (jam < 0.7) jamRot = 0.18 - 0.025 * Math.abs(Math.sin((jam - 0.3) * 45)) * (1 - (jam - 0.3) / 0.4);
    else jamRot = 0.18 * (1 - smooth((jam - 0.7) / 0.3));
  }
  s.seal.flash = bump(W(u, 5.478, 5.55));
  s.seal.gap = smooth(W(u, 5.478, 5.49)) * (1 - smooth(W(u, 5.535, 5.56)));
  // Seg 6(b): the true flame's beam turns it 30 degrees; it locks and fills Ember.
  const turn = W(u, 5.78, 5.84);
  s.seal.rot = jamRot + (Math.PI / 6) * ignite(turn);
  const fill = settle(W(u, 5.83, 5.88));
  const retire = smooth(W(u, 6.45, 6.58));
  s.seal.fill = fill * (1 - retire);
  s.seal.dot = 1 - smooth(W(u, 5.83, 5.86));
  s.seal.dash = retire;
  s.lock = fill * (1 - retire);

  // Seg 7: the successor stamps beside it, under the same root.
  const st2 = W(u, 6.6, 6.7);
  s.succ.a = smooth(W(u, 6.598, 6.615));
  s.succ.scale = 1.25 - 0.25 * ignite(st2);
  s.ripples[1][0] = 1 + 1.5 * settle(st2);
  s.ripples[1][1] = st2 > 0 && st2 < 1 ? 0.55 * (1 - st2) : 0;

  // ---- The veto card: out to the left (seg 1), down onto C's ring (seg 5) ---------------------
  const cOut = settle(W(u, 0.72, 0.92));
  const cDown = carry(W(u, 4.77, 4.89));
  if (cDown <= 0) {
    lerp3(s.card.pos, CARD_OUT, WORLD.cardAir, cOut);
    s.card.rot[0] = lerp(0, -0.16, cOut);
    s.card.rot[1] = lerp(0.2, 0.42, cOut);
    s.card.rot[2] = lerp(0, 0.1, cOut);
  } else {
    bezier(s.card.pos, WORLD.cardAir, CARD_C1, CARD_C2, WORLD.cardDown, cDown);
    s.card.rot[0] = lerp(-0.16, -1.2, smooth(W(u, 4.77, 4.85)));
    s.card.rot[1] = lerp(0.42, 0.26, cDown);
    s.card.rot[2] = lerp(0.1, 0, cDown);
  }
  // Private and unlit: it goes dark with everything else in the blackout and stays out of the
  // way until Hana uses it in seg 5.
  s.card.a = smooth(W(u, 0.72, 0.78)) * Math.max(1 - smooth(W(u, 2.55, 2.75)), smooth(W(u, 4.73, 4.77)));

  // ---- Seg 2: three shares, three guardians, three leaves knotted to a root -------------------
  for (let i = 0; i < 3; i++) {
    const t0 = 1.45 + i * 0.06;
    const bud = W(u, t0, t0 + 0.04);
    const go = W(u, t0 + 0.04, t0 + 0.2);
    const sh = s.shares[i];
    if (go <= 0) {
      // Budding: a copy swells off the top of A's flame.
      lerp3(tmp, FLAME_A, BUD[i], settle(bud));
    } else {
      arc(tmp, BUD[i], HOME[i], carry(go), 0.9 + 0.35 * i, (i - 1) * 0.6);
    }
    sh[0] = tmp[0]; sh[1] = tmp[1]; sh[2] = tmp[2];
    sh[3] = bud > 0 ? 0.35 + 0.65 * settle(bud) : 0;
    sh[4] = go >= 1 ? 1 : 0; // resting: it drifts
    s.G[i] = 0.55 * smooth(W(u, t0 + 0.18, t0 + 0.26));
  }
  for (let i = 0; i < 3; i++) {
    s.leaves[i] = smooth(W(u, 1.76 + i * 0.03, 1.81 + i * 0.03));
    s.leafLines[i] = settle(W(u, 1.84 + i * 0.02, 1.9 + i * 0.02));
  }
  s.root = smooth(W(u, 1.74, 1.79));
  s.sealLine = settle(W(u, 1.88, 1.94));
  // The DApp windows are lit, and joined to the root, from the moment the root is on the record:
  // the crane in seg 7 only shows that they were there all along. They never change or flicker.
  s.windows[0] = s.windows[1] = s.root;
  s.windowLines[0] = s.windowLines[1] = s.sealLine;

  // ---- Seg 3: the blackout. Only the seal and the three embers stay --------------------------
  const dark = smooth(W(u, 2.6, 2.8));
  const back = smooth(W(u, 3.3, 3.45));
  // everything on the line but the seal; faint after the blackout, whole again for the crane
  s.ledger = 1 - dark + 0.6 * back + 0.4 * smooth(W(u, 6.12, 6.4));
  // In the dark only their embers carry; a guardian whose light has gone to the new phone (or,
  // Jihoon's, to his own recovery) keeps only a trace.
  const gone = [smooth(W(u, 3.58, 3.66)), smooth(W(u, 3.76, 3.84)), smooth(W(u, 4.6, 4.68))];
  for (let i = 0; i < 3; i++) s.G[i] *= (1 - dark + 0.45 * back) * (1 - 0.55 * gone[i]);

  // ---- Seg 4: a new phone; two guardians approve --------------------------------------------
  s.B.opacity = smooth(W(u, 3.42, 3.52));
  s.B.rim = 1;
  s.ringB.a = s.B.opacity;
  s.ringB.arc = carry(W(u, 3.5, 3.6));
  const ret = [W(u, 3.58, 3.72), W(u, 3.76, 3.88)];
  for (let i = 0; i < 2; i++) {
    if (ret[i] > 0) {
      const sh = s.shares[i];
      arc(tmp, HOME[i], WORLD.hoverB[i], carry(ret[i]), 0.7, i ? 0.4 : -0.4);
      sh[0] = tmp[0]; sh[1] = tmp[1]; sh[2] = tmp[2];
      sh[3] = 1;
      sh[4] = ret[i] >= 1 ? 1 : 0;
    }
    const d = W(u, 3.72 + i * 0.16, 3.77 + i * 0.16);
    const hv = WORLD.hoverB[i];
    const n = s.nDrops[i];
    n[0] = hv[0]; n[2] = hv[2];
    n[1] = lerp(hv[1] - 0.05, PLANE_Y + 0.02, d * d);
    n[3] = d > 0 && d < 1 ? 0.8 : 0;
    s.nulls[i] = d >= 1 ? 1 : 0;
  }

  // ---- Seg 5: seventy-two hours; Jihoon turns; the veto card covers his ring -----------------
  // The wait starts on the phone's shot: most of the ring's 72 ticks fill. The camera turns to
  // Jihoon's lantern for the veto; the last ticks fill in seg 6, where the text says the wait is
  // over.
  s.ringB.fill = 0.62 * smooth(W(u, 4.17, 4.38)) + 0.38 * smooth(W(u, 5.26, 5.31));
  // Vetoed, Jihoon's lantern and his light leave the picture as the camera turns back to the
  // phone; his cancelled ring stays on the record, under the card.
  const gone5 = smooth(W(u, 5.12, 5.26));
  s.C.opacity = smooth(W(u, 4.55, 4.6)) * (1 - gone5);
  const toC = W(u, 4.6, 4.71);
  if (toC > 0) {
    const sh = s.shares[2];
    arc(tmp, HOME[2], WORLD.hoverC, carry(toC), 0.8, -0.6);
    sh[0] = tmp[0]; sh[1] = tmp[1]; sh[2] = tmp[2];
    sh[3] = (1 - 0.72 * smooth(W(u, 4.88, 4.94))) * (1 - gone5);
    sh[4] = toC >= 1 ? 1 : 0;
  }
  s.C.rim = 1 - 0.6 * smooth(W(u, 4.88, 4.94));
  s.ringC.a = smooth(W(u, 4.71, 4.73)) * (1 - 0.5 * gone5);
  s.ringC.arc = carry(W(u, 4.71, 4.76));
  s.ringC.dash = smooth(W(u, 4.88, 4.93));

  // ---- Seg 6: the lock -------------------------------------------------------------------------
  // (a) Close on the phone: the two lights enter B and fuse into a flame one notch off.
  const enter = W(u, 5.31, 5.37);
  if (enter > 0) {
    for (let i = 0; i < 2; i++) {
      const sh = s.shares[i];
      lerp3(tmp, WORLD.hoverB[i], FLAME_B, carry(enter));
      sh[0] = tmp[0]; sh[1] = tmp[1]; sh[2] = tmp[2];
      sh[3] = 1 - smooth(W(u, 5.35, 5.38));
      sh[4] = 0;
    }
  }
  const formA = settle(W(u, 5.36, 5.41));
  const gutB = W(u, 5.56, 5.62);
  // (b) Drawn back: the true flame forms.
  const formB = settle(W(u, 5.69, 5.74));
  const phaseB = u >= 5.69;
  s.B.notch = phaseB ? 1 - formB : 1;
  s.B.gutter = phaseB ? 0 : 0.18 + 0.6 * gutB;
  const sputB = gutB > 0 && gutB < 1 ? 0.3 * (0.5 + 0.5 * Math.sin(u * 190) * Math.sin(u * 83)) : 0;
  s.B.flameI = phaseB ? 0.14 + 0.86 * formB : formA * (1 - 0.86 * smooth(gutB) - sputB);
  s.B.flameScale = phaseB ? 0.35 + 0.65 * formB : 0.35 + 0.65 * formA - 0.5 * smooth(gutB);
  // The beam: out, refused, broken; then out again, accepted.
  if (!phaseB) {
    s.beam.head = carry(W(u, 5.41, 5.46));
    s.beam.tail = 0;
    s.beam.brk = W(u, 5.52, 5.58);
    s.beam.I = s.beam.head > 0 ? 1 : 0;
  } else {
    s.beam.head = carry(W(u, 5.74, 5.78));
    s.beam.tail = carry(W(u, 5.88, 5.94));
    s.beam.brk = 0;
    s.beam.I = s.beam.head > 0 && s.beam.tail < 1 ? 1 : 0;
  }
  // Light blooms up through B's paper as the beam draws back into it: B is now lit exactly as A
  // was in the hero.
  const bloom = smooth(W(u, 5.88, 5.96));
  s.B.bloomH = lerp(-0.85, 1.4, bloom);
  s.B.paper = bloom > 0 ? s.B.flameI : 0;
  s.B.rim = 1 - 0.5 * bloom;
  s.ringB.a *= 1 - 0.45 * smooth(W(u, 5.9, 5.96));

  // ---- Seg 7: the DApp never noticed ---------------------------------------------------------
  s.sealLineA = 1 - 0.6 * retire;
  s.succLine = settle(W(u, 6.68, 6.8));
  // The vignette closes to Night as the page moves on, an iris shutting on the phone's flame, and
  // is shut before the stage scrolls away (u 7.63, styles/landing.css, the story's tail): the
  // tracker marks data-closed at 7.56, and the canvas hands over to the page's own Night there, so
  // its edge never shows.
  s.close = smooth(W(u, 7.05, 7.55));
  return s;
}

// The integer stage for a given u, as the tracker writes it to data-stage.
export const stageOf = (u) => Math.max(0, Math.min(7, Math.round(u)));
