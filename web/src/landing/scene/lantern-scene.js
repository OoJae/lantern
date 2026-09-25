// The landing page's WebGL scene: a hanji lantern and the story of its secret.
//
//   const scene = await createLanternScene({ host, tracker, tier: 'auto', onFail });
//   ...
//   scene.dispose();
//
// host     the sticky stage element; the scene appends its own canvas to it (never reused).
// tracker  { u, textRects?(out) } from ../tracker.js: u is the scroll position in story steps.
// tier     'auto' | 'high' | 'mid' | 'low'.
// onFail   (reason) => void: 'no-webgl2' | 'compile' | 'context-lost' | 'slow' | 'error'. Called at
//          most once, never after dispose(). The scene has already torn itself down; show the poster.
// signal   optional AbortSignal: aborting during setup tears down and resolves a no-op handle.
//
// The promise resolves after the first frame is on screen (fade the canvas in then) and never
// rejects. host.dataset.loop reports running | idle | paused for tests.
//
// Imports nothing from the app, so it stays a chunk of its own.
//
// Where this departs from the engineering spec, on purpose:
//  - The seal is a signed-distance mark in the ledger shader (shaders.js, MARK_FRAG kind 0), not
//    RingGeometry plus a Path2D texture: it stays exact at any size, needs no canvas or texture,
//    and draws in the one instanced ledger call.
//  - Text over the stage: besides the glow limit (uTextSafe), a last draw over the text
//    rectangles only, with MIN blending, caps every pixel behind the text at luminance 0.057,
//    so Hanji text keeps 7.7:1 whatever stacks beneath it. One extra draw call, never full
//    screen.
//  - The watchdog keeps watching for the whole session (quality.js), stepping down only.
//  - Idle (the flicker alone) runs at 30 fps, 20 once nothing has moved for 10 s.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, Points, BufferGeometry, InstancedBufferGeometry,
  InstancedBufferAttribute, Float32BufferAttribute, PlaneGeometry, NeutralToneMapping, SRGBColorSpace,
  Vector3,
} from 'three';
import { fibreTexture } from './fibres.js';
import * as M from './materials.js';
import { createLantern, lanternGeometries, quadGeometry, guardianGeometry, cardGeometry, beamGeometry } from './lantern.js';
import { choreograph, createState, cameraPose, WORLD, SIZE, PLANE_Y } from './choreography.js';
import { probe, isCoarse, resolveTier, pixelRatio, createWatchdog } from './quality.js';

const MAX_MARKS = 32;
const MAX_HALOS = 10;
const MAX_SPARKS = 8;
const TRAIL_N = 24;
const TRAIL_LIFE = 0.5; // s
// How far lit hanji stands between the viewer and the flame: the flame's own air is left to the
// paper shader (which draws the diffused drop), while its Ember body covers the lit paper.
const FLAME_BEHIND_PAPER = 0.7;
// After this long with nothing to catch up to, the idle loop (the flicker alone) slows further.
const DEEP_IDLE_S = 10;

export async function createLanternScene({ host, tracker, tier: requested = 'auto', onFail, signal } = {}) {
  const noop = { dispose() {}, stats: () => null };
  let failed = false;
  let disposed = false;
  const report = (reason) => {
    if (failed || disposed) return;
    failed = true;
    try {
      onFail?.(reason);
    } catch {
      // the caller's problem
    }
  };
  if (!host || signal?.aborted) return noop;

  const info = probe();
  if (!info) {
    report('no-webgl2');
    return noop;
  }
  const coarse = isCoarse();
  const tier = resolveTier(requested === 'auto' ? null : requested, info, coarse);
  const dpr = window.devicePixelRatio || 1;

  // ---- Renderer, on a canvas of our own ------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.className = 'lantern-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  host.appendChild(canvas);
  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: false,
      stencil: false,
      antialias: tier.msaa && dpr < 2,
      powerPreference: 'default',
    });
  } catch {
    canvas.remove();
    report('no-webgl2');
    return noop;
  }
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.toneMapping = NeutralToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(M.C.night, 1);

  // ---- Scene --------------------------------------------------------------------------------
  const shared = M.sharedUniforms();
  const fibre = fibreTexture({ anisotropy: Math.min(tier.anisotropy, renderer.capabilities.getMaxAnisotropy()) });
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 140);
  const quad = quadGeometry();
  const owned = { geometries: [quad], materials: [], textures: [fibre] };
  const own = (mesh) => {
    owned.materials.push(mesh.material);
    if (!owned.geometries.includes(mesh.geometry)) owned.geometries.push(mesh.geometry);
    return mesh;
  };

  // Background: one full-screen triangle, exactly Night at the edges.
  const bgGeo = new BufferGeometry();
  bgGeo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const bg = own(new Mesh(bgGeo, M.backgroundMaterial(shared)));
  bg.frustumCulled = false;
  bg.renderOrder = -100;
  scene.add(bg);

  // The ledger plane.
  const planeGeo = new PlaneGeometry(90, 90);
  planeGeo.rotateX(-Math.PI / 2);
  planeGeo.translate(0, PLANE_Y, -30);
  const plane = own(new Mesh(planeGeo, M.planeMaterial(shared)));
  plane.renderOrder = -50;
  scene.add(plane);

  // Marks on the ledger.
  const markGeo = instanced(quad, { iA: 4, iP: 4, iK: 4, iC: 3 }, MAX_MARKS);
  const marks = own(new Mesh(markGeo, M.markMaterial(shared, PLANE_Y + 0.002)));
  marks.frustumCulled = false;
  marks.renderOrder = 2;
  scene.add(marks);

  // Lanterns A (the laptop), B (the phone), C (Jihoon's), sharing geometry by level of detail.
  const hiGeo = lanternGeometries('high');
  const loGeo = lanternGeometries('low');
  owned.geometries.push(hiGeo.paper, hiGeo.frame, loGeo.paper, loGeo.frame);
  const mk = (geo, withFlame) => {
    const l = createLantern({ shared, fibre, geo, quad, detail: tier.detail, withFlame });
    for (const m of [l.frame, l.back, l.front, l.flame]) if (m) owned.materials.push(m.material);
    scene.add(l.group);
    if (l.flame) scene.add(l.flame);
    return l;
  };
  const A = mk(hiGeo, true);
  const B = mk(hiGeo, true);
  const Cl = mk(loGeo, false);
  A.group.position.fromArray(WORLD.A);
  B.group.position.fromArray(WORLD.B);
  Cl.group.position.fromArray(WORLD.C);
  Cl.group.scale.setScalar(0.86);
  const lanterns = [A, B, Cl];

  // Guardians: three low-poly lanterns in one instanced draw.
  const gBase = guardianGeometry();
  owned.geometries.push(gBase);
  const gGeo = instanced(gBase, { iOffset: 4, iGlow: 1 }, 3);
  const guardians = own(new Mesh(gGeo, M.guardMaterial(shared)));
  guardians.frustumCulled = false;
  guardians.renderOrder = 6; // after the halos, so each roof cuts its own halo
  for (let i = 0; i < 3; i++) gGeo.attributes.iOffset.array.set([...WORLD.G[i], WORLD.guardianScale], i * 4);
  scene.add(guardians);

  // The veto card.
  const card = own(new Mesh(cardGeometry(), M.cardMaterial(shared, fibre)));
  card.renderOrder = 3; // after the marks: it covers Jihoon's ring
  scene.add(card);

  // The beam.
  const beam = own(new Mesh(beamGeometry(), M.beamMaterial(shared)));
  beam.frustumCulled = false;
  beam.renderOrder = 80;
  scene.add(beam);

  // Glows. Halos are the lit air round a light: drawn before the lanterns, so the paper hides
  // what lies behind it and the halo reads round the lantern, not over it. Sparks (the shares,
  // the falling marks) float in front of everything.
  const glowMat = M.glowMaterial(shared);
  owned.materials.push(glowMat);
  const haloGeo = instanced(quad, { iPos: 4, iCol: 4 }, MAX_HALOS);
  const halos = new Mesh(haloGeo, glowMat);
  owned.geometries.push(haloGeo);
  halos.frustumCulled = false;
  halos.renderOrder = 5;
  scene.add(halos);
  const sparkGeo = instanced(quad, { iPos: 4, iCol: 4 }, MAX_SPARKS);
  const sparks = new Mesh(sparkGeo, glowMat);
  owned.geometries.push(sparkGeo);
  sparks.frustumCulled = false;
  sparks.renderOrder = 90;
  scene.add(sparks);

  // Trails: 3 shares x 24 samples, one Points draw.
  const trailGeo = new BufferGeometry();
  trailGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(3 * TRAIL_N * 3), 3));
  trailGeo.setAttribute('aAge', new Float32BufferAttribute(new Float32Array(3 * TRAIL_N).fill(2), 1));
  trailGeo.setAttribute('aI', new Float32BufferAttribute(new Float32Array(3 * TRAIL_N), 1));
  const trails = own(new Points(trailGeo, M.trailMaterial(shared)));
  trails.frustumCulled = false;
  trails.renderOrder = 91;
  scene.add(trails);
  const trailBuf = [0, 1, 2].map(() => ({ pts: [], last: null }));
  const resetTrails = () => {
    for (const b of trailBuf) {
      b.pts.length = 0;
      b.last = null;
    }
  };

  // The text ceiling: two quads (one per text rectangle), drawn last with MIN blending.
  const safeGeo = new BufferGeometry();
  safeGeo.setAttribute('position', new Float32BufferAttribute([
    -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
  ], 3));
  safeGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const safe = own(new Mesh(safeGeo, M.safeMaterial(shared)));
  safe.frustumCulled = false;
  safe.renderOrder = 1000;
  scene.add(safe);

  // ---- State -> scene -------------------------------------------------------------------------
  const state = createState();
  let layout = 'wide';
  let size = { w: 1, h: 1, pr: 1 };
  const rects = new Float32Array(8);
  const flick = [0, 0, 0];
  const pose = { pos: [0, 0, 0], tgt: [0, 0, 0], zoom: 1, ox: 0, oy: 0 };
  const flamePos = [0, 0, 0];
  const closeAt = new Vector3();
  const lanOpts = {};
  const byDistance = lanterns.map((l) => ({ l, d: 0 }));

  function flicker(t, seed) {
    const n1 = noise1(t * 7.3 + seed);
    const n2 = noise1(t * 17.9 + seed * 3.1);
    flick[0] = 1 + 0.12 * (n1 - 0.5) + 0.06 * (n2 - 0.5); // intensity
    flick[1] = 1 + 0.07 * (n1 - 0.5); // height
    flick[2] = 0.006 * (noise1(t * 2.3 + seed * 7) - 0.5); // sway
    return flick;
  }

  function applyCamera(s) {
    const { w, h } = size;
    cameraPose(s.cam, w, h, layout, pose);
    camera.position.fromArray(pose.pos);
    camera.lookAt(pose.tgt[0], pose.tgt[1], pose.tgt[2]);
    camera.aspect = w / h;
    camera.zoom = pose.zoom;
    camera.setViewOffset(w, h, pose.ox, pose.oy, w, h);
    // Trails are sized in world units: follow the lens.
    trails.material.uniforms.uPx.value = size.h * size.pr / (2 * Math.tan((camera.fov * Math.PI) / 360)) * pose.zoom;
  }

  function update(u, t) {
    const s = choreograph(u, layout, state);
    applyCamera(s);
    shared.uTime.value = t;
    shared.uClose.value = s.close;
    // The closing vignette shuts on the phone's flame, the story's last light.
    if (s.close > 0) {
      camera.updateMatrixWorld();
      closeAt.set(WORLD.B[0] + WORLD.flame[0], WORLD.B[1] + WORLD.flame[1], WORLD.B[2] + WORLD.flame[2]).project(camera);
      shared.uCloseAt.value.set((closeAt.x * 0.5 + 0.5) * size.w * size.pr, (closeAt.y * 0.5 + 0.5) * size.h * size.pr);
    }

    // Text-safe rectangles (drawing-buffer px, y up).
    const tr = shared.uTextSafe.value;
    tr[0].set(0, 0, 0, 0);
    tr[1].set(0, 0, 0, 0);
    const n = tracker?.textRects ? tracker.textRects(rects) : 0;
    safe.visible = n > 0;
    if (n > 0) {
      const r = canvas.getBoundingClientRect();
      for (let i = 0; i < Math.min(n, 2); i++) {
        const l = rects[i * 4];
        const tp = rects[i * 4 + 1];
        const rt = rects[i * 4 + 2];
        const bt = rects[i * 4 + 3];
        tr[i].set((l - r.left) * size.pr, (r.bottom - bt) * size.pr, (rt - r.left) * size.pr, (r.bottom - tp) * size.pr);
      }
    }
    // A wide, soft limit: its edge is a rounded rectangle 48 to 140 CSS px out from the text.
    shared.uFeather.value = Math.min(140, Math.max(48, 0.1 * Math.max(size.w, size.h))) * size.pr;
    safe.material.uniforms.uPad.value = 24 * size.pr;

    shared.uLift.value = s.bgLift;
    shared.uPlane.value = s.plane;
    shared.uLiftAt.value.set((0.5 + s.cam.shift[0]) * size.w * size.pr, (0.5 + s.cam.shift[1]) * size.h * size.pr);

    // Lantern A.
    const fA = flicker(t, 0.0);
    A.visible = s.A.opacity > 0.001;
    const o = lanOpts;
    flamePos[0] = WORLD.A[0] + WORLD.flame[0] + fA[2];
    flamePos[1] = WORLD.A[1] + WORLD.flame[1] + s.A.flameDip;
    flamePos[2] = WORLD.A[2] + WORLD.flame[2];
    o.flame = flamePos; o.I = s.A.flameI * fA[0]; o.paper = s.A.paper * fA[0]; o.bloomH = s.A.bloomH;
    o.opacity = s.A.opacity; o.cool = s.A.cool; o.rim = s.A.rim; o.scale = s.A.flameScale * fA[1];
    o.notch = s.A.notch; o.gutter = s.A.gutter; o.seed = 1.7; o.cord = 20;
    setLantern(A, o);
    // Lantern B.
    const fB = flicker(t, 5.3);
    B.visible = s.B.opacity > 0.001;
    flamePos[0] = WORLD.B[0] + WORLD.flame[0] + fB[2];
    flamePos[1] = WORLD.B[1] + WORLD.flame[1];
    flamePos[2] = WORLD.B[2] + WORLD.flame[2];
    o.I = s.B.flameI * fB[0] * s.B.opacity; o.paper = s.B.paper * fB[0]; o.bloomH = s.B.bloomH;
    o.opacity = s.B.opacity; o.cool = 0; o.rim = s.B.rim; o.scale = s.B.flameScale * fB[1];
    o.notch = s.B.notch; o.gutter = s.B.gutter; o.seed = 9.1; o.cord = s.B.cord;
    setLantern(B, o);
    // Lantern C: rim-lit, never lit.
    Cl.visible = s.C.opacity > 0.001;
    flamePos[0] = WORLD.C[0];
    flamePos[1] = WORLD.C[1] - 0.12;
    flamePos[2] = WORLD.C[2];
    o.I = 0; o.paper = 0; o.bloomH = 9; o.opacity = s.C.opacity; o.cool = 0; o.rim = s.C.rim; o.cord = 0;
    setLantern(Cl, o);
    // Draw lanterns far to near.
    const cp = camera.position;
    for (const e of byDistance) e.d = e.l.group.position.distanceToSquared(cp);
    byDistance.sort((a, b) => b.d - a.d);
    for (let i = 0; i < byDistance.length; i++) byDistance[i].l.order(10 + i * 10);

    // Guardians.
    const gl = gGeo.attributes.iGlow;
    for (let i = 0; i < 3; i++) gl.array[i] = s.G[i];
    gl.needsUpdate = true;

    // Lights for the plane and the card: A, B, and the lock (or Jihoon's light by his ring).
    const lp = shared.uLightPos.value;
    const lc = shared.uLightCol.value;
    lp[0].set(WORLD.A[0], WORLD.A[1] + WORLD.flame[1], WORLD.A[2]);
    lc[0].set(M.C.lit.r, M.C.lit.g, M.C.lit.b).multiplyScalar(s.A.paper * s.A.opacity);
    lp[1].set(WORLD.B[0], WORLD.B[1] + WORLD.flame[1], WORLD.B[2]);
    lc[1].set(M.C.lit.r, M.C.lit.g, M.C.lit.b).multiplyScalar(s.B.paper * Math.max(0, Math.min(1, (s.B.bloomH + 0.8) / 1.6)));
    const j = s.shares[2];
    const jihoon = s.C.opacity > 0.01 ? j[3] * 0.35 : 0;
    if (s.lock >= jihoon) {
      lp[2].set(WORLD.seal[0], PLANE_Y + 0.12, WORLD.seal[1]);
      lc[2].set(M.C.ember.r, M.C.ember.g, M.C.ember.b).multiplyScalar(0.35 * s.lock);
    } else {
      lp[2].set(j[0], j[1], j[2]);
      lc[2].set(M.C.ember.r, M.C.ember.g, M.C.ember.b).multiplyScalar(jihoon);
    }

    // The card.
    card.visible = s.card.a > 0.002;
    card.position.fromArray(s.card.pos);
    card.rotation.set(s.card.rot[0], s.card.rot[1], s.card.rot[2]);
    card.material.uniforms.uOpacity.value = s.card.a;

    // The beam, from B's flame to the seal.
    const bu = beam.material.uniforms;
    beam.visible = s.beam.I > 0;
    bu.uA.value.set(WORLD.B[0], WORLD.B[1] + WORLD.flame[1] - 0.02, WORLD.B[2]);
    bu.uB.value.set(WORLD.seal[0], PLANE_Y + 0.01, WORLD.seal[1]);
    bu.uHead.value = s.beam.head;
    bu.uTail.value = s.beam.tail;
    bu.uBreak.value = s.beam.brk;
    bu.uI.value = s.beam.I;
    bu.uWidth.value = 7 * size.pr;

    writeMarks(s);
    writeGlows(s);
    writeTrails(s, t);
  }

  function setLantern(l, o) {
    const U = l.lan;
    U.uFlame.value.fromArray(o.flame);
    U.uFlameI.value = o.paper;
    U.uBloomH.value = o.bloomH;
    U.uOpacity.value = o.opacity;
    U.uCool.value = o.cool;
    U.uRim.value = o.rim;
    U.uCenter.value.copy(l.group.position);
    U.uGlow.value = o.paper * o.opacity;
    U.uCord.value = o.cord;
    if (l.flame) {
      const f = l.flame.material.uniforms;
      const litK = Math.min(1, o.paper * 1.4) * Math.max(0, Math.min(1, (o.bloomH + 0.3) / 0.6));
      l.flame.visible = o.I > 0.002;
      f.uPos.value.fromArray(o.flame);
      f.uSize.value.set(0.085 * o.scale, 0.16 * o.scale);
      f.uI.value = o.I;
      f.uBehind.value = FLAME_BEHIND_PAPER * litK;
      f.uNotch.value = o.notch;
      f.uGutter.value = o.gutter;
      f.uSeed.value = o.seed;
    }
  }

  // ---- Ledger marks -----------------------------------------------------------------------------
  const mA = markGeo.attributes.iA.array;
  const mP = markGeo.attributes.iP.array;
  const mK = markGeo.attributes.iK.array;
  const mC = markGeo.attributes.iC.array;
  let mN = 0;
  // One mark: kind, its shape (a0..a3), its parameters (p0..p3), half stroke, colour, alpha.
  function mark(kind, a0, a1, a2, a3, p0, p1, p2, p3, k, col, alpha) {
    if (alpha <= 0.002 || mN >= MAX_MARKS) return;
    const i4 = mN * 4;
    const i3 = mN * 3;
    mA[i4] = a0; mA[i4 + 1] = a1; mA[i4 + 2] = a2; mA[i4 + 3] = a3;
    mP[i4] = p0; mP[i4 + 1] = p1; mP[i4 + 2] = p2; mP[i4 + 3] = p3;
    mK[i4] = kind; mK[i4 + 1] = alpha; mK[i4 + 2] = k; mK[i4 + 3] = 0;
    mC[i3] = col[0]; mC[i3 + 1] = col[1]; mC[i3 + 2] = col[2];
    mN++;
  }
  // Hanji at the few strengths the ledger uses, made once.
  const hanjiAt = new Map();
  const hanji = (k) => {
    let c = hanjiAt.get(k);
    if (!c) hanjiAt.set(k, (c = [M.C.hanji.r * k, M.C.hanji.g * k, M.C.hanji.b * k]));
    return c;
  };
  const sealCol = [0, 0, 0];
  function line(from, to, rFrom, rTo, grow, alpha, k = 0.4) {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    mark(4, from[0] + ux * rFrom, from[1] + uz * rFrom, to[0] - ux * rTo, to[1] - uz * rTo, grow, 0, 0, 0, 0.0045, hanji(k), alpha);
  }
  const ring = (c, r, rot, p0, p1, p2, p3, k, col, alpha, kind = 1) => mark(kind, c[0], c[1], r, rot, p0, p1, p2, p3, k, col, alpha);
  function writeMarks(s) {
    mN = 0;
    const L = s.ledger;
    const W_ = WORLD;
    // Hairlines first, rings over them.
    for (let i = 0; i < 3; i++) line(W_.leaves[i], W_.root, SIZE.leaf, SIZE.root * 1.2, s.leafLines[i], L);
    line(W_.seal, W_.root, SIZE.seal, SIZE.root * 1.2, s.sealLine, L * s.sealLineA);
    line(W_.successor, W_.root, SIZE.seal, SIZE.root * 1.2, s.succLine, L);
    for (let i = 0; i < 2; i++) line(W_.windows[i], W_.root, SIZE.window * 1.05, SIZE.root * 1.2, s.windowLines[i], L * 0.9);
    for (let i = 0; i < 3; i++) ring(W_.leaves[i], SIZE.leaf, 0, 1, 0, 0, 0, 0.07, hanji(0.62), s.leaves[i] * L);
    ring(W_.root, SIZE.root, 0, 0, 1, 0, 0, 0, hanji(0.75), s.root * L, 2);
    for (let i = 0; i < 2; i++) ring(W_.windows[i], SIZE.window, i ? -0.35 : 0.3, 1, 0, 0, 0, 0.03, hanji(0.55), s.windows[i] * L, 3);
    ring(W_.ringB, SIZE.ringB, 0, s.ringB.arc, 1, s.ringB.fill, 0, 0.022, hanji(0.62), s.ringB.a);
    for (let i = 0; i < 2; i++) ring(W_.nullifiers[i], SIZE.nullifier, 0, 1, 0, 0, 0, 0, hanji(0.7), s.nulls[i], 2);
    ring(W_.ringC, SIZE.ringC, 0, s.ringC.arc, 0, 0, s.ringC.dash, 0.03, hanji(0.6), s.ringC.a);
    // Stamp ripples.
    ring(W_.seal, SIZE.seal * s.ripples[0][0], 0, 0, 0, 0, 0, 0.012 / s.ripples[0][0], hanji(0.8), s.ripples[0][1], 5);
    ring(W_.successor, SIZE.seal * s.ripples[1][0], 0, 0, 0, 0, 0, 0.012 / s.ripples[1][0], hanji(0.8), s.ripples[1][1], 5);
    // The seal: Hanji closed; Edge when it refuses; Ash when retired.
    const H = M.C.hanji;
    const E = M.C.edge;
    const Ash = M.C.ash;
    const f = s.seal.flash;
    const d = s.seal.dash;
    sealCol[0] = 0.85 * (H.r + (E.r - H.r) * f + (Ash.r - (H.r + (E.r - H.r) * f)) * d);
    sealCol[1] = 0.85 * (H.g + (E.g - H.g) * f + (Ash.g - (H.g + (E.g - H.g) * f)) * d);
    sealCol[2] = 0.85 * (H.b + (E.b - H.b) * f + (Ash.b - (H.b + (E.b - H.b) * f)) * d);
    ring(W_.seal, SIZE.seal * s.seal.scale, s.seal.rot, s.seal.gap, s.seal.dot, s.seal.fill, s.seal.dash, 0, sealCol, s.seal.a, 0);
    ring(W_.successor, SIZE.seal * s.succ.scale, 0, 0, 1, 0, 0, 0, hanji(0.85), s.succ.a, 0);
    markGeo.instanceCount = mN;
    markGeo.attributes.iA.needsUpdate = true;
    markGeo.attributes.iP.needsUpdate = true;
    markGeo.attributes.iK.needsUpdate = true;
    markGeo.attributes.iC.needsUpdate = true;
  }

  // ---- Glows ------------------------------------------------------------------------------------
  const G = {
    halo: { geo: haloGeo, P: haloGeo.attributes.iPos.array, C: haloGeo.attributes.iCol.array, n: 0, max: MAX_HALOS },
    spark: { geo: sparkGeo, P: sparkGeo.attributes.iPos.array, C: sparkGeo.attributes.iCol.array, n: 0, max: MAX_SPARKS },
  };
  function glow(buf, x, y, z, radius, col, k, kind) {
    if (k <= 0.0005 || buf.n >= buf.max) return;
    const i = buf.n++;
    buf.P[i * 4] = x;
    buf.P[i * 4 + 1] = y;
    buf.P[i * 4 + 2] = z;
    buf.P[i * 4 + 3] = radius;
    buf.C[i * 4] = col[0] * k;
    buf.C[i * 4 + 1] = col[1] * k;
    buf.C[i * 4 + 2] = col[2] * k;
    buf.C[i * 4 + 3] = kind;
  }
  const warm = [
    M.C.lit.r * 0.8 + M.C.ember.r * 0.2, M.C.lit.g * 0.8 + M.C.ember.g * 0.2, M.C.lit.b * 0.8 + M.C.ember.b * 0.2,
  ];
  // Fog and distance leave a guardian's halo deeper and warmer than the near lanterns'.
  const far = [
    M.C.lit.r * 0.55 + M.C.ember.r * 0.45, M.C.lit.g * 0.55 + M.C.ember.g * 0.45, M.C.lit.b * 0.55 + M.C.ember.b * 0.45,
  ];
  const ember = [M.C.ember.r, M.C.ember.g, M.C.ember.b];
  const hanjiC = [M.C.hanji.r, M.C.hanji.g, M.C.hanji.b];
  // The lit air round a lantern: a close aura that hugs the paper, and a wide, faint spill.
  function lanternHalo(p, k) {
    glow(G.halo, p[0], p[1] - 0.02, p[2], 1.2, warm, 0.03 * k, 0);
    if (tier.halos > 1) glow(G.halo, p[0], p[1] - 0.02, p[2], 3.2, warm, 0.0034 * k, 0);
  }
  function writeGlows(s) {
    G.halo.n = 0;
    G.spark.n = 0;
    lanternHalo(WORLD.A, s.A.paper * s.A.opacity);
    const bloomK = Math.max(0, Math.min(1, (s.B.bloomH + 0.8) / 1.8));
    lanternHalo(WORLD.B, s.B.paper * s.B.opacity * bloomK);
    // Guardians' faint halos.
    for (let i = 0; i < 3; i++) {
      const g = WORLD.G[i];
      glow(G.halo, g[0], g[1] - 0.04, g[2], 1.25, far, 0.005 * s.G[i], 0);
    }
    // The lock's glow on the ledger.
    glow(G.halo, WORLD.seal[0], PLANE_Y + 0.05, WORLD.seal[1], 1.0, ember, 0.02 * s.lock, 0);
    // Shares, the three embers: resting ones drift.
    const t = shared.uTime.value;
    for (let i = 0; i < 3; i++) {
      const sh = s.shares[i];
      const d = sh[4];
      const x = sh[0] + d * 0.035 * Math.sin(t * 0.83 + i * 2.1);
      const y = sh[1] + d * 0.045 * Math.sin(t * 1.21 + i * 1.3);
      const z = sh[2] + d * 0.02 * Math.sin(t * 0.67 + i * 0.7);
      driftPos[i][0] = x;
      driftPos[i][1] = y;
      driftPos[i][2] = z;
      glow(G.spark, x, y, z, 0.42, ember, 1.1 * sh[3], 1);
    }
    // The seal's drop, and the nullifier marks falling.
    glow(G.spark, s.drop[0], s.drop[1], s.drop[2], 0.34, ember, 0.9 * s.drop[3], 1);
    for (let i = 0; i < 2; i++) {
      const n = s.nDrops[i];
      glow(G.spark, n[0], n[1], n[2], 0.16, hanjiC, 0.45 * n[3], 1);
    }
    for (const b of [G.halo, G.spark]) {
      b.geo.instanceCount = b.n;
      b.geo.attributes.iPos.needsUpdate = true;
      b.geo.attributes.iCol.needsUpdate = true;
    }
  }
  const driftPos = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  // ---- Trails: a ring buffer of real positions, so a stopped share's trail runs back into it ---
  let trailLive = 0;
  function writeTrails(s, t) {
    const pos = trailGeo.attributes.position.array;
    const age = trailGeo.attributes.aAge.array;
    const inten = trailGeo.attributes.aI.array;
    trailLive = 0;
    for (let i = 0; i < 3; i++) {
      const buf = trailBuf[i];
      const p = driftPos[i];
      const I = s.shares[i][3];
      const moving = s.shares[i][4] === 0 && I > 0.01;
      if (moving) {
        const last = buf.last;
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 0.012) {
          // Fill long jumps so fast scrolls leave a line, not dots.
          const steps = last ? Math.min(4, Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) / 0.05)) : 1;
          for (let k = 1; k <= steps; k++) {
            const f = k / steps;
            const q = last ? [last[0] + (p[0] - last[0]) * f, last[1] + (p[1] - last[1]) * f, last[2] + (p[2] - last[2]) * f] : p.slice();
            buf.pts.push([q[0], q[1], q[2], t, I]);
            if (buf.pts.length > TRAIL_N) buf.pts.shift();
          }
          buf.last = p.slice();
        }
      } else {
        buf.last = null;
      }
      for (let k = 0; k < TRAIL_N; k++) {
        const o = i * TRAIL_N + k;
        const e = buf.pts[k];
        if (e) {
          pos[o * 3] = e[0];
          pos[o * 3 + 1] = e[1];
          pos[o * 3 + 2] = e[2];
          const a = (t - e[3]) / TRAIL_LIFE;
          age[o] = a;
          inten[o] = e[4];
          if (a < 1) trailLive++;
        } else {
          age[o] = 2;
        }
      }
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.aAge.needsUpdate = true;
    trailGeo.attributes.aI.needsUpdate = true;
    trails.visible = trailLive > 0;
  }

  // ---- Size ---------------------------------------------------------------------------------------
  let step = 0;
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return false;
    const pr = pixelRatio(tier, step, w, h, coarse);
    size = { w, h, pr };
    layout = w / h < 0.8 ? 'tall' : 'wide';
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    const bw = Math.round(w * pr);
    const bh = Math.round(h * pr);
    shared.uRes.value.set(bw, bh);
    return true;
  }

  // ---- Loop ----------------------------------------------------------------------------------------
  const tau = coarse ? 0.09 : 0.12;
  let shown = clampU(tracker?.u ?? 0);
  let time = 0;
  let raf = 0;
  let running = false;
  let onScreen = true;
  let pageVisible = document.visibilityState !== 'hidden';
  let lastCb = 0;
  let lastRender = 0;
  let pending = 0;
  let stillFor = 0; // s without scroll movement
  let loopState = '';
  const setLoop = (v) => {
    if (loopState !== v) {
      loopState = v;
      host.dataset.loop = v;
    }
  };
  const watchdog = createWatchdog({
    steps: tier.scales.length,
    onStep: (s) => {
      step = s;
      resize();
    },
    onFail: () => {
      report('slow');
      dispose();
    },
  });

  function render() {
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (pending) {
      watchdog.sample(now - pending);
      pending = 0;
      if (disposed) return;
    }
    const target = clampU(tracker?.u ?? 0);
    const moving = Math.abs(target - shown) >= 1e-4 || trailLive > 0;
    // Idle is the flicker alone: 30 fps (20 on the low tier), and 20 once nothing has moved for
    // a while.
    const fps = moving ? tier.fps : stillFor > DEEP_IDLE_S ? Math.min(tier.idleFps, 20) : tier.idleFps;
    if (lastRender && now - lastRender < 1000 / fps - 2) {
      lastCb = now;
      return;
    }
    const dt = lastRender ? Math.min((now - lastRender) / 1000, 0.1) : 1 / 60;
    lastRender = now;
    lastCb = now;
    time += dt;
    stillFor = moving ? 0 : stillFor + dt;
    // A long jump (Home, End, a fling, a hash link) cuts rather than racing through every
    // segment in between: land a quarter step short and settle from there.
    const gap = target - shown;
    if (Math.abs(gap) > 1.25) {
      shown = target - Math.sign(gap) * 0.25;
      resetTrails();
    }
    shown += (target - shown) * (1 - Math.exp(-dt / tau));
    if (Math.abs(target - shown) < 1e-4) shown = target;
    setLoop(moving ? 'running' : 'idle');
    try {
      update(shown, time);
      render();
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      report('error');
      dispose();
      return;
    }
    pending = now;
  }
  function start() {
    if (running || disposed) return;
    running = true;
    lastRender = 0;
    pending = 0;
    stillFor = 0;
    watchdog.reset();
    // Coming back on screen (or to a visible tab) after the page moved on: the frame still in
    // the canvas is from wherever the loop stopped. Jump to where the reader is now and draw it
    // before the next paint, so the stale frame never shows and nothing replays.
    const tgt = clampU(tracker?.u ?? 0);
    if (Math.abs(tgt - shown) > 0.35) {
      shown = tgt;
      resetTrails();
    }
    try {
      update(shown, time);
      render();
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      report('error');
      dispose();
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pending = 0;
    if (!disposed) setLoop('paused');
  }
  const sync = () => (onScreen && pageVisible ? start() : stop());

  const onVisibility = () => {
    pageVisible = document.visibilityState !== 'hidden';
    sync();
  };
  const onLost = (e) => {
    e.preventDefault();
    stop();
    report('context-lost');
    dispose();
  };
  const ro = new ResizeObserver(() => {
    if (disposed) return;
    if (resize() && !running) {
      update(shown, time);
      render();
    }
  });
  const io = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    sync();
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    // 1. listeners
    canvas.removeEventListener('webglcontextlost', onLost);
    document.removeEventListener('visibilitychange', onVisibility);
    signal?.removeEventListener('abort', dispose);
    // 2. loop and observers
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    io.disconnect();
    // 3. geometries, materials, textures
    for (const g of owned.geometries) g.dispose();
    for (const m of owned.materials) m.dispose();
    for (const t of owned.textures) t.dispose();
    // 4. the renderer, then the context, then the canvas
    renderer.dispose();
    // Release the context now rather than when the collector finds it (StrictMode and route
    // changes create scenes back to back); a context already lost has nothing to release.
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    canvas.remove();
    delete host.dataset.loop;
  }

  canvas.addEventListener('webglcontextlost', onLost);
  signal?.addEventListener('abort', dispose);

  // ---- First frame -----------------------------------------------------------------------------
  resize();
  update(shown, 0);
  try {
    // compileAsync polls the driver where KHR_parallel_shader_compile lets it; where it cannot
    // (software GL, some browsers) three warns in the console on asking, so ask quietly (has(),
    // not get()) and compile directly there: the link check below waits for the driver anyway.
    const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
    await Promise.race([
      parallel ? renderer.compileAsync(scene, camera) : Promise.resolve().then(() => renderer.compile(scene, camera)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
  } catch {
    report('compile');
    dispose();
    return noop;
  }
  if (disposed) return noop;
  // compileAsync resolves when compiling is done, not when it succeeded, and production skips
  // three's shader error checks: a program that failed to link would draw nothing, silently.
  // Ask the driver, once, now that compiling has finished (so the query does not stall).
  try {
    const gl = renderer.getContext();
    if (renderer.info.programs.some((p) => !gl.getProgramParameter(p.program, gl.LINK_STATUS))) throw new Error('link');
  } catch {
    report('compile');
    dispose();
    return noop;
  }
  try {
    update(shown, 0);
    render();
  } catch {
    report('error');
    dispose();
    return noop;
  }
  await new Promise((r) => requestAnimationFrame(() => r()));
  if (disposed) return noop;

  document.addEventListener('visibilitychange', onVisibility);
  ro.observe(host);
  io.observe(host);
  setLoop('idle');
  sync();

  const handle = {
    dispose,
    stats: () => ({
      tier: tier.name,
      renderer: info.renderer,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: size.pr,
      step,
      layout,
      u: shown,
    }),
  };
  // Development only: the harness inspects the scene graph.
  if (import.meta.env.DEV) {
    handle.debug = {
      scene, camera, renderer, lanterns: { A, B, C: Cl },
      render: () => { update(shown, time); render(); },
      // render one exact u (no smoothing) and report its cost
      renderAt: (u) => {
        shown = clampU(u);
        update(shown, time);
        render();
        return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      },
    };
  }
  return handle;
}

function clampU(u) {
  return Number.isFinite(u) ? Math.max(0, Math.min(8, u)) : 0;
}

// Instanced copy of a base geometry, with the named per-instance float attributes.
function instanced(base, attrs, count) {
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  for (const [k, v] of Object.entries(base.attributes)) g.setAttribute(k, v);
  for (const [k, n] of Object.entries(attrs)) g.setAttribute(k, new InstancedBufferAttribute(new Float32Array(count * n), n));
  g.instanceCount = count;
  return g;
}

// Smooth 1D value noise for the flicker.
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * u;
}
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
