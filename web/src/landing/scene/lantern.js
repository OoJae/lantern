// The lantern, built procedurally after the brand mark (24u grid): a rounded paper body 10u x
// 12.5u (rx 3u), a roof cap 12u -> 10u with lifted eaves, a small foot, a hook. At 1.4 world
// units tall. Six paper panels overlap at their seams; nine hand-bent hoops inside the paper
// cast the rib bands, and the paper sags very slightly between them. Lacquered rims hold the
// paper to the cap and the foot.
import {
  LatheGeometry, TorusGeometry, CylinderGeometry, PlaneGeometry,
  Vector2, BufferGeometry, Float32BufferAttribute, Mesh, Group,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lanternUniforms, paperMaterial, frameMaterial, flameMaterial } from './materials.js';

export const RIBS = 9;
export const BODY = { H: 1.02, R: 0.41, rc: 0.22 };

// The body's profile, sampled evenly by arc length so the lathe's v is proportional to it.
function bodyProfile(n, sag = 0.011) {
  const { H, R, rc } = BODY;
  const yb = -H / 2;
  const yt = H / 2;
  const arcLen = (Math.PI / 2) * rc;
  const wall = H - 2 * rc;
  const total = 2 * arcLen + wall;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1);
    const s = v * total;
    let r;
    let y;
    if (s < arcLen) {
      const th = -Math.PI / 2 + s / rc;
      r = R - rc + rc * Math.cos(th);
      y = yb + rc + rc * Math.sin(th);
    } else if (s < arcLen + wall) {
      r = R;
      y = yb + rc + (s - arcLen);
    } else {
      const th = (s - arcLen - wall) / rc;
      r = R - rc + rc * Math.cos(th);
      y = yt - rc + rc * Math.sin(th);
    }
    const yy = y / (H / 2);
    r += 0.014 * (1 - yy * yy) * (r / R); // a breath of barrel
    r *= 1 - sag * (0.5 - 0.5 * Math.cos(2 * Math.PI * v * RIBS)); // sag between hoops
    pts.push(new Vector2(r, y));
  }
  return pts;
}

function lathe(points, segments) {
  return new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), segments);
}

function frameGeometry(hi) {
  const seg = hi ? 44 : 28;
  const parts = [];
  // Cap: a roof, 12u at the eaves narrowing to 10u, the eave tips lifted.
  parts.push(lathe([
    [0.15, 0.518], [0.36, 0.516], [0.44, 0.512], [0.49, 0.515], [0.513, 0.531], [0.502, 0.546],
    [0.462, 0.582], [0.432, 0.628], [0.416, 0.651], [0.396, 0.664], [0.3, 0.669], [0.001, 0.671],
  ], seg));
  // Knob on the roof.
  const knob = new CylinderGeometry(0.03, 0.038, 0.05, hi ? 12 : 8, 1);
  knob.translate(0, 0.69, 0);
  parts.push(knob);
  // Foot: a short, rounded base.
  parts.push(lathe([
    [0.001, -0.641], [0.19, -0.639], [0.226, -0.631], [0.242, -0.614], [0.244, -0.56],
    [0.236, -0.527], [0.21, -0.514], [0.001, -0.509],
  ], seg));
  // Bail handle over the roof, the hook at its apex, and the cord up out of frame.
  const bail = new TorusGeometry(0.29, 0.0085, 6, hi ? 32 : 20, Math.PI);
  bail.translate(0, 0.64, 0);
  parts.push(bail);
  const hook = new TorusGeometry(0.034, 0.007, 6, hi ? 20 : 12);
  hook.rotateY(Math.PI / 2);
  hook.translate(0, 0.96, 0);
  parts.push(hook);
  // Only the hanging lanterns (A and B, the high level of detail) carry a cord: A's runs up out of
  // frame; B's fades into the dark a little above its hook (the frame shader's uCord). Jihoon's
  // stands off in the dark on nothing, like the guardians'.
  if (hi) {
    const cord = new CylinderGeometry(0.0045, 0.0045, 14, 5, 1, true);
    cord.translate(0, 0.99 + 7, 0);
    parts.push(cord);
  }
  // Rims: lacquered hoops where the paper meets the cap and the foot.
  for (const [r, y] of [[0.2, 0.505], [0.205, -0.5]]) {
    const rim = new TorusGeometry(r, 0.011, 6, seg);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, y, 0);
    parts.push(rim);
  }
  // Every part has position, normal and uv; drop uv so the merge is uniform and small.
  for (const p of parts) p.deleteAttribute('uv');
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export function lanternGeometries(lod = 'high') {
  const hi = lod === 'high';
  return {
    paper: new LatheGeometry(bodyProfile(hi ? 60 : 36), hi ? 44 : 30),
    frame: frameGeometry(hi),
  };
}

// A quad in [-1, 1]^2: flames, glows and ledger marks are all drawn on it.
export function quadGeometry() {
  return new PlaneGeometry(2, 2);
}

// The guardians' lanterns: low poly, one merged geometry tagged paper (0) or frame (1).
export function guardianGeometry() {
  const body = new LatheGeometry(bodyProfile(12, 0), 12);
  const cap = lathe([[0.15, 0.518], [0.5, 0.515], [0.42, 0.63], [0.001, 0.671]], 12);
  const foot = lathe([[0.001, -0.64], [0.24, -0.62], [0.24, -0.53], [0.001, -0.51]], 12);
  const tag = (g, part) => {
    g.deleteAttribute('uv');
    g.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
    return g;
  };
  const merged = mergeGeometries([tag(body, 0), tag(cap, 1), tag(foot, 1)], false);
  body.dispose();
  cap.dispose();
  foot.dispose();
  return merged;
}

// The veto card, gently curled: a small paper card (about the size of a business card beside the
// 1.4u lantern), large enough to cover Jihoon's ring and still read as a card on a phone.
export function cardGeometry() {
  const g = new PlaneGeometry(0.56, 0.38, 8, 4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 0.28;
    pos.setZ(i, 0.026 * x * x);
  }
  g.computeVertexNormals();
  return g;
}

// A strip for the beam: x = t along it (0..1), y = side (-1..1).
export function beamGeometry(n = 32) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    pos.push(i / n, -1, 0, i / n, 1, 0);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// One lantern: its frame, the two paper passes and (optionally) its flame. The flame is placed
// in world space by its uniforms, so it lives beside the group rather than in it.
export function createLantern({ shared, fibre, geo, quad, detail, withFlame }) {
  const lan = lanternUniforms();
  const frame = new Mesh(geo.frame, frameMaterial(shared, lan));
  const back = new Mesh(geo.paper, paperMaterial(shared, lan, fibre, 'back', detail));
  const front = new Mesh(geo.paper, paperMaterial(shared, lan, fibre, 'front', detail));
  for (const m of [back, front]) m.material.uniforms.uRibs.value = RIBS;
  const group = new Group();
  group.add(frame, back, front);
  let flame = null;
  if (withFlame) {
    flame = new Mesh(quad, flameMaterial(shared));
    flame.frustumCulled = false;
    flame.material.depthTest = true;
  }
  return {
    group,
    lan,
    frame,
    back,
    front,
    flame,
    // Transparent passes are drawn far to near across lanterns: frame, far wall, near wall, then
    // the flame, which shows crisply only while the paper is unlit (lit hanji diffuses it into
    // the soft drop the paper shader draws).
    order(base) {
      frame.renderOrder = base;
      back.renderOrder = base + 1;
      front.renderOrder = base + 2;
      if (flame) flame.renderOrder = base + 3;
    },
    set visible(v) {
      group.visible = v;
      if (flame) flame.visible = v;
    },
  };
}
