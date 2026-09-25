// Materials for the lantern scene. Every colour is a brand token or one of the four scene-only
// shader colours in design-spec.md (flame core, lit paper, warm transmission, lacquered wood).
// Color() converts the sRGB hex to the linear working space; the shaders write sRGB back out.
import {
  ShaderMaterial, Color, Vector2, Vector3, Vector4,
  FrontSide, BackSide, DoubleSide, AdditiveBlending, NormalBlending, CustomBlending, MinEquation,
} from 'three';
import * as S from './shaders.js';

export const HEX = {
  night: '#090A0F',
  hanji: '#ECE4D2',
  ash: '#948E83',
  ember: '#FF8A3D',
  edge: '#686661',
  core: '#FFE2B8',
  lit: '#F6D9A6',
  warm: '#3A2616',
  lacquer: '#1E1712',
  deep: '#B84A16',
};

export const C = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, new Color(v)]));
// Moonlight on unlit paper and lacquer: not a hue of its own (the scene has no second colour),
// just the palette's neutral, Ash lifted a quarter of the way toward Hanji.
C.moon = C.ash.clone().lerp(C.hanji, 0.25);

// Uniforms shared by reference across every material: the text-safe rectangles, the closing
// vignette, the drawing-buffer size, time, the moon, and the three scene lights.
export function sharedUniforms() {
  return {
    uTextSafe: { value: [new Vector4(), new Vector4()] },
    uFeather: { value: 40 },
    uClose: { value: 0 },
    uCloseAt: { value: new Vector2() },
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uLiftAt: { value: new Vector2() },
    uLift: { value: 1 },
    uPlane: { value: 0 },
    uMoonDir: { value: new Vector3(-0.45, 0.75, 0.5).normalize() },
    uLightPos: { value: [new Vector3(), new Vector3(), new Vector3()] },
    uLightCol: { value: [new Vector3(), new Vector3(), new Vector3()] },
  };
}

const colour = (c) => ({ value: c.clone() });

function mat(shared, own, vert, frag, opts) {
  return new ShaderMaterial({
    uniforms: { ...pick(shared, frag + vert), ...own },
    vertexShader: vert,
    fragmentShader: frag,
    premultipliedAlpha: true,
    ...opts,
  });
}

// Only hand a material the shared uniforms its source actually names.
function pick(shared, src) {
  const out = {};
  for (const k of Object.keys(shared)) if (src.includes(k)) out[k] = shared[k];
  return out;
}

export function backgroundMaterial(shared) {
  return mat(shared, {
    cNight: colour(C.night),
  }, S.BG_VERT, S.BG_FRAG, { depthTest: false, depthWrite: false, toneMapped: false });
}

// Per-lantern uniforms, shared by that lantern's two paper passes, its frame and its flame.
export function lanternUniforms() {
  return {
    uFlame: { value: new Vector3() },
    uFlameI: { value: 0 },
    uBloomH: { value: 9 },
    uOpacity: { value: 1 },
    uCool: { value: 0 },
    uRim: { value: 0.6 },
    uCenter: { value: new Vector3() },
    uGlow: { value: 0 },
    uCord: { value: 20 },
  };
}

export function paperMaterial(shared, lan, fibre, side, detail) {
  const own = {
    uFibre: { value: fibre },
    uFlame: lan.uFlame,
    uFlameI: lan.uFlameI,
    uBloomH: lan.uBloomH,
    uOpacity: lan.uOpacity,
    uCool: lan.uCool,
    uRim: lan.uRim,
    uSide: { value: side === 'back' ? -1 : 1 },
    uRibs: { value: 11 },
    uAlpha: { value: side === 'back' ? 0.5 : 0.8 },
    uDetail: { value: detail ? 1 : 0 },
    cLit: colour(C.lit),
    cCore: colour(C.core),
    cEmber: colour(C.ember),
    cWarm: colour(C.warm),
    cHanji: colour(C.hanji),
    cMoon: colour(C.moon),
  };
  return mat(shared, own, S.PAPER_VERT, S.PAPER_FRAG, {
    side: side === 'back' ? BackSide : FrontSide,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: true,
  });
}

export function frameMaterial(shared, lan) {
  return mat(shared, {
    uCenter: lan.uCenter,
    uGlow: lan.uGlow,
    uOpacity: lan.uOpacity,
    uRim: lan.uRim,
    uCord: lan.uCord,
    cLacquer: colour(C.lacquer),
    cLit: colour(C.lit),
    cMoon: colour(C.moon),
  }, S.FRAME_VERT, S.FRAME_FRAG, { transparent: true, depthWrite: true, toneMapped: false });
}

export function flameMaterial(shared) {
  return mat(shared, {
    uPos: { value: new Vector3() },
    uSize: { value: new Vector2(0.07, 0.15) },
    uI: { value: 1 },
    uNotch: { value: 0 },
    uGutter: { value: 0 },
    uSeed: { value: 0 },
    uLean: { value: 0.09 },
    uBehind: { value: 0 },
    cCore: colour(C.core),
    cEmber: colour(C.ember),
    cDeep: colour(C.deep),
  }, S.FLAME_VERT, S.FLAME_FRAG, {
    // premultiplied: additive where alpha is 0, covering where the body sits behind lit paper
    transparent: true, depthWrite: false, depthTest: false, blending: NormalBlending, toneMapped: true,
  });
}

export function glowMaterial(shared) {
  return mat(shared, {}, S.GLOW_VERT, S.GLOW_FRAG, {
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, toneMapped: false,
  });
}

export function trailMaterial(shared) {
  return mat(shared, { uPx: { value: 800 }, cEmber: colour(C.ember) }, S.TRAIL_VERT, S.TRAIL_FRAG, {
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, toneMapped: false,
  });
}

export function markMaterial(shared, y) {
  return mat(shared, {
    uY: { value: y },
    cEmber: colour(C.ember),
    cNight: colour(C.night),
    cLit: colour(C.lit),
  }, S.MARK_VERT, S.MARK_FRAG, {
    // The quad is laid from XY onto the ground, which mirrors its winding: draw both sides.
    // Ordered by draw order, not depth: they sit on the plane (which would z-fight at grazing
    // angles), and everything that can stand over them is drawn after them.
    side: DoubleSide, transparent: true, depthWrite: false, depthTest: false, blending: NormalBlending, toneMapped: false,
  });
}

export function planeMaterial(shared) {
  return mat(shared, { cNight: colour(C.night), uFog: { value: 0.072 } }, S.PLANE_VERT, S.PLANE_FRAG, {
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

// Premultiplied normal blending, drawn after the halos: the paper and the solid cap and foot
// cover what lies behind them, as a near lantern's do.
export function guardMaterial(shared) {
  return mat(shared, {
    cLit: colour(C.lit),
    cCore: colour(C.core),
    cWarm: colour(C.warm),
    cLacquer: colour(C.lacquer),
    uFog: { value: 0.058 },
  }, S.GUARD_VERT, S.GUARD_FRAG, {
    transparent: true, depthWrite: false, blending: NormalBlending, toneMapped: false,
  });
}

export function cardMaterial(shared, fibre) {
  return mat(shared, {
    uFibre: { value: fibre },
    cHanji: colour(C.hanji),
    cMoon: colour(C.moon),
    cNight: colour(C.night),
    uOpacity: { value: 0 },
  }, S.CARD_VERT, S.CARD_FRAG, { side: DoubleSide, transparent: true, depthWrite: true, toneMapped: false });
}

export function beamMaterial(shared) {
  return mat(shared, {
    uA: { value: new Vector3() },
    uB: { value: new Vector3() },
    uWidth: { value: 6 },
    uHead: { value: 0 },
    uTail: { value: 0 },
    uBreak: { value: 0 },
    uI: { value: 0 },
    cEmber: colour(C.ember),
    cCore: colour(C.core),
  }, S.BEAM_VERT, S.BEAM_FRAG, {
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, toneMapped: false,
  });
}

// The text ceiling (see SAFE_VERT): MIN blending, drawn last, over the text rectangles only.
export function safeMaterial(shared) {
  return new ShaderMaterial({
    uniforms: {
      uTextSafe: shared.uTextSafe,
      uRes: shared.uRes,
      uPad: { value: 24 },
      cCap: { value: new Vector3(0.29, 0.26, 0.22) },
    },
    vertexShader: S.SAFE_VERT,
    fragmentShader: S.SAFE_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: CustomBlending,
    blendEquation: MinEquation,
    blendEquationAlpha: MinEquation,
  });
}
