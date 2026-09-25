// Every shader in the scene. GLSL ES 3.00 through three's ShaderMaterial prefix (texture2D and
// gl_FragColor are mapped for us). Colours arrive as linear uniforms; the palette lives in
// materials.js. Nothing here samples an image file: the only texture is the seeded fibre tile.

// ---------------------------------------------------------------------------------------------
// Shared fragment chunk.
//  - capText(c, lmax): the glow limit behind text (uTextSafe: up to two text rectangles in
//    drawing-buffer px, x0 y0 x1 y1 with y up). Inside a rectangle a light layer keeps at most a
//    quarter of itself and is compressed toward lmax luminance (a soft knee, so a lit rib still
//    reads darker than the paper beside it); it eases back to full over uFeather px, measured as a
//    true distance so the limit's edge is a rounded rectangle, never a straight seam. Applied in
//    linear light, after tone mapping, before the sRGB encode. Layers still stack (additive
//    blending happens on encoded values), so the SAFE pass below is the hard ceiling that keeps
//    Hanji text at 7:1 or better; this limit is what keeps that ceiling from ever showing.
//  - closeMask(): the vignette that closes to Night as the page continues after the story: an
//    iris shutting on the last lit lantern (uCloseAt), 1 exactly until it starts.
//  - dither(): +-1.5/255, static (grain that crawls would read as noise, not paper).
//  - Blending happens on sRGB-encoded values (no float target, no post-processing), so an
//    additive layer adds display light: a linear 0.01 lands as about +25/255. Glow intensities
//    are tuned for that, which is what keeps the darkness disciplined.
//  - shoulder(): a soft highlight roll-off for materials that skip the Neutral tone mapper,
//    whose toe would crush the dark, quiet tones this scene is built from.
export const COMMON = /* glsl */ `
uniform vec4 uTextSafe[2];
uniform float uFeather;
uniform float uClose;
uniform vec2 uCloseAt;  // px, drawing buffer: where the closing vignette shuts (the lit phone)
uniform vec2 uRes;
uniform vec2 uLiftAt;   // px, drawing buffer: where the air is faintly lit (behind the subject)
uniform float uLift;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// Signed distance from p to a rectangle (negative inside).
float rectDist(vec4 r, vec2 p) {
  vec2 q = abs(p - 0.5 * (r.xy + r.zw)) - 0.5 * (r.zw - r.xy);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
// 1 inside a text rectangle, easing to 0 over uFeather px outside it.
float textInside() {
  float k = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 r = uTextSafe[i];
    if (r.z > r.x) k = max(k, 1.0 - smoothstep(0.0, uFeather, rectDist(r, gl_FragCoord.xy)));
  }
  return k;
}
vec3 capText(vec3 c, float lmax) {
  float k = textInside();
  if (k <= 0.0) return c;
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c * mix(1.0, 0.25 / (1.0 + L * 0.25 / lmax), k);
}
float closeMask() {
  if (uClose <= 0.0) return 1.0;
  vec2 q = (gl_FragCoord.xy - uCloseAt) / uRes.y;
  float R = mix(1.9, -0.3, uClose);
  return 1.0 - smoothstep(R - 0.6, R, length(q));
}
// The air: Night, lifted a breath behind the subject by the lanterns' own warm light (Hanji in
// hue: the scene has no second colour), closing with the vignette.
vec3 airLift() {
  vec2 q = (gl_FragCoord.xy - uLiftAt) / uRes.y;
  return vec3(0.00061, 0.00056, 0.00047) * exp(-dot(q, q) * 1.4) * uLift;
}
vec3 dither() { return vec3((hash12(gl_FragCoord.xy) - 0.5) * (3.0 / 255.0)); }
vec3 shoulder(vec3 c) {
  vec3 over = max(c - 0.6, 0.0);
  return min(c, vec3(0.6)) + 0.4 * (1.0 - exp(-over / 0.4));
}
// The brand flame's half-width at height y (-1 base, +1 tip): a teardrop, round below, pointed above.
float flameHalfWidth(float y) {
  float t = acos(clamp(y, -1.0, 1.0));
  return sin(t) * pow(sin(0.5 * t), 1.6);
}
`;

// ---------------------------------------------------------------------------------------------
// Background: one full-screen triangle. Exactly Night at the edges (so the stage meets the page
// with no seam), a faint warm lift behind the subject, dither.
export const BG_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const BG_FRAG = /* glsl */ `
${COMMON}
uniform vec3 cNight;
void main() {
  gl_FragColor = vec4(cNight + capText(airLift() * closeMask(), 0.02), 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += dither();
}
`;

// ---------------------------------------------------------------------------------------------
// Hanji paper. Two draws per lantern: the inside of the far wall (BackSide), then the outer
// surface (FrontSide), premultiplied, depthWrite off. Light is the flame's, transmitted through
// fibre-thick paper; the hoops inside cast the darker rib bands; panel seams are double paper.
export const PAPER_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNrm;
varying vec2 vUv;
varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vY = position.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const PAPER_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uFibre;
uniform vec3 uFlame;      // world position of this lantern's flame
uniform float uFlameI;    // 0 unlit .. 1 lit (flicker folded in)
uniform float uBloomH;    // local height the light has risen to (B's bloom); large = all lit
uniform float uOpacity;   // A fades to about 6% after the blackout
uniform float uCool;      // 0 warm .. 1 cooled to grey
uniform float uRim;       // moonlight rim strength (unlit paper)
uniform float uSide;      // 1 outer surface, -1 inner surface of the far wall
uniform float uRibs;      // hoops along the profile
uniform float uAlpha;     // how much of what lies behind the paper it hides
uniform float uDetail;    // 1 high, 0 low tier (one fibre octave)
uniform vec3 uMoonDir;
uniform vec3 cLit;
uniform vec3 cCore;
uniform vec3 cEmber;
uniform vec3 cWarm;
uniform vec3 cHanji;
uniform vec3 cMoon;
varying vec3 vPos;
varying vec3 vNrm;
varying vec2 vUv;
varying float vY;

void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vPos);
  float cv = clamp(abs(dot(N, V)), 0.0, 1.0);

  // ---- The sheet: mulberry fibre thickness, double paper at the six panel seams.
  vec2 fuv = vec2(vUv.x * 3.0, vUv.y * 1.35);
  float f1 = texture2D(uFibre, fuv).r;
  float f2 = uDetail > 0.5 ? texture2D(uFibre, fuv * 2.37 + vec2(0.31, 0.17)).r : 0.5;
  float thick = 0.8 + 0.62 * (f1 - 0.5) + 0.22 * (f2 - 0.5);
  float sx = fract(vUv.x * 6.0 + 0.013);
  float sd = min(sx, 1.0 - sx);
  float sfw = fwidth(vUv.x * 6.0);
  float seam = 1.0 - smoothstep(0.011, 0.011 + sfw * 1.5, sd);
  thick += 0.35 * seam;

  // ---- The hoops: hand-bent bamboo inside the paper, each a little off true. They block the
  // light (a crisp dark band) and the paper spreads their shadow (a soft penumbra).
  float hv = vUv.y * uRibs;
  float hk = floor(hv + 0.5);
  float hj = hash12(vec2(hk, 7.0)) - 0.5;
  float hd = abs(hv - hk - hj * 0.07 - 0.018 * sin(vUv.x * 6.2831 + hk * 1.7));
  float hfw = fwidth(hv);
  float hw = 0.016 + 0.008 * hash12(vec2(hk, 3.0));
  float hoop = 1.0 - smoothstep(hw, hw + hfw * 1.2 + 0.012, hd);
  float pen = 1.0 - smoothstep(0.0, 0.2, hd);
  // As optical depth: the band is dark, and warm, since what light gets round it has come a
  // long way through the sheet.
  float ribOd = 0.9 * hoop + 0.2 * pen;
  float ribShade = (1.0 - 0.6 * hoop) * (1.0 - 0.12 * pen);

  // ---- Light reaching the inside of the paper: the flame (inverse square, by incidence),
  // shaded below by its cup, plus the glow bouncing round inside.
  vec3 toF = uFlame - vPos;
  float d2 = dot(toF, toF);
  vec3 L = toF * inversesqrt(d2);
  float cosIn = max(dot(-N, L), 0.0);
  float dd = d2 + 0.03;
  float direct = (0.2 + 0.8 * cosIn) / (dd * dd * dd);
  float cup = smoothstep(uFlame.y - 0.06, uFlame.y - 0.3, vPos.y);
  direct *= 1.0 - 0.62 * cup;
  float bloom = 1.0 - smoothstep(uBloomH - 0.3, uBloomH, vY);
  float lit = uFlameI * bloom;
  float E = (direct * 0.0165 + 0.02) * lit;
  // Unlit paper is a thin sheet in the dark: it veils what lies behind it rather than blotting
  // it out, so an unlit lantern reads as paper, not as a hole in the night.
  float dark = 1.0 - clamp(lit * 4.0, 0.0, 1.0);
  float veil = mix(uAlpha, uAlpha * 0.55, dark);

  vec3 hot;
  float alpha;
  if (uSide > 0.0) {
    // Seen from outside: transmitted light. The longer the path through the sheet (thicker
    // fibre, doubled seams, grazing views at the silhouette) the dimmer and the warmer it gets:
    // Beer-Lambert with the lit paper's own colour as the absorption spectrum.
    float path = mix(1.0, 1.0 / max(cv, 0.14), 0.55);
    float od = thick * path + ribOd;
    vec3 T = pow(cLit, vec3(2.0 * od)) * exp(-0.42 * od);
    // Bamboo is opaque: behind a hoop only light scattered round it through the sheet arrives.
    hot = E * T * (1.0 - 0.62 * hoop);
    // The flame itself, seen through the sheet: forward scattering makes a soft bright drop
    // on the paper where the view ray passes the flame, in the brand flame's proportions
    // (3.5 : 6.5): a white-hot heart inside an Ember body. Ember is the flame.
    // The paper round the flame takes the flame's own colour (a multiplicative tint, so the
    // hottest paper turns Ember instead of washing to white), and its heart shows through.
    vec3 rd = -V;
    float t = max(dot(toF, rd), 0.0);
    vec3 m = toF - rd * t;
    m.y *= 0.54;
    float m2 = dot(m, m);
    float body = exp(-m2 / 0.0065) * lit;
    hot *= mix(vec3(1.0), cEmber, 0.78 * body);
    float fl = exp(-m2 / 0.0022) + 0.35 * exp(-m2 / 0.03);
    vec3 flameC = mix(cEmber, cCore, exp(-m2 / 0.0012));
    hot += flameC * fl * lit * 0.3 * (0.55 + 0.45 * ribShade) * exp(-0.9 * (od - 0.8));
    alpha = mix(veil, 0.98, pow(1.0 - cv, 3.0));
  } else {
    // The inside of the far wall, seen through the near one: reflected light, dimmer.
    float refl = 0.55 + 0.25 * (f1 - 0.5);
    hot = E * refl * cLit * ribShade * 0.32;
    alpha = veil;
  }
  // Cooling: the warm light drains to the paper's own grey.
  float luma = dot(hot, vec3(0.2126, 0.7152, 0.0722));
  hot = mix(hot, cHanji * luma * 0.6, uCool);
  hot *= closeMask() * uOpacity;

  // ---- Unlit paper in moonlight: a rim, and the sheet itself faintly catching the night: a
  // body a shade lighter than the air, its fibre mottled, the hoops inside it darker bands.
  // Kept out of the tone mapper's toe, which would crush it.
  float unlit = uRim * dark;
  float fres = pow(1.0 - cv, 3.5);
  float moon = 0.35 + 0.65 * max(dot(N, uMoonDir), 0.0);
  vec3 cold = cMoon * fres * 0.09 * moon * unlit;
  cold += cHanji * 0.0085 * (0.7 + 0.6 * f1) * (0.55 + 0.45 * ribShade) * moon * unlit * (uSide > 0.0 ? 1.0 : 0.35);
  cold *= (uSide > 0.0 ? 1.0 : 0.2) * closeMask() * uOpacity;

  float a = alpha * uOpacity * closeMask();
  gl_FragColor = vec4(hot, a);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = capText(gl_FragColor.rgb + cold, 0.035);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// Lacquered frame: cap, foot, rims, staves, bail handle, hook and cord. Near-black wood that
// catches the paper's glow on the faces that look at it, with a lacquer sheen.
export const FRAME_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNrm;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const FRAME_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uCenter;
uniform float uGlow;
uniform float uOpacity;
uniform float uRim;
uniform float uCord;      // how far up the cord shows above the hook before it fades into the dark
uniform vec3 uMoonDir;
uniform vec3 cLacquer;
uniform vec3 cLit;
uniform vec3 cMoon;
varying vec3 vPos;
varying vec3 vNrm;
void main() {
  float cord = 1.0 - smoothstep(uCord - 0.7, uCord, vPos.y - uCenter.y - 0.99);
  if (cord <= 0.0) discard;
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  // The lit paper is a broad, round emitter at the body's centre.
  vec3 toC = uCenter - vPos;
  float dc = length(toC);
  vec3 Lc = toC / dc;
  // Everything above the roof is in the roof's shadow.
  float roof = 1.0 - smoothstep(0.66, 0.72, vPos.y - uCenter.y);
  float wrap = max(dot(N, Lc) * 0.7 + 0.3, 0.0);
  float E = uGlow * wrap * 0.2 / (dc * dc + 0.02) * roof;
  // The light it gets is the paper's: warm, having come through the sheet.
  vec3 paper = cLit * cLit;
  vec3 col = cLacquer * (0.12 + E * 2.2 * paper / max(paper.g, 1e-3));
  // Lacquer is glossy: it mirrors the glowing body where the reflected ray finds it.
  vec3 R = reflect(-V, N);
  float ang = asin(min(0.44 / dc, 0.999));
  float hit = smoothstep(cos(ang + 0.06), cos(ang * 0.8), dot(R, Lc));
  float F = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  col += paper * uGlow * hit * F * 0.06 * roof;
  // A cool breath of moonlight on the edges, so the silhouette holds in the dark.
  float moon = 0.3 + 0.7 * max(dot(N, uMoonDir), 0.0);
  col += cMoon * pow(1.0 - ndv, 4.0) * (0.012 + 0.03 * uRim) * moon;
  // and the lacquer's long, soft sheen of moonlight on the faces that turn to it, and the
  // night sky itself in any face that looks up (the roof, seen from the crane)
  col += cMoon * pow(max(dot(R, uMoonDir), 0.0), 24.0) * 0.035 * (0.3 + 0.7 * F);
  col += cMoon * smoothstep(0.0, 0.9, R.y) * F * 0.045;
  // Closing, the wood goes with its light into the Night behind it, not to black.
  float close = closeMask();
  col = capText(shoulder(col * close), 0.035);
  gl_FragColor = vec4(col * uOpacity * cord, uOpacity * cord * close);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// The flame: a billboard teardrop kept upright in view space, with 2-octave rising noise.
// uNotch carves the tampered share's one-notch-off silhouette; uGutter makes it sputter.
// Premultiplied: its air adds light (alpha 0), its body covers lit paper (alpha by uBehind).
export const FLAME_VERT = /* glsl */ `
uniform vec3 uPos;
uniform vec2 uSize;
varying vec2 vQ;
void main() {
  vec4 mv = viewMatrix * vec4(uPos, 1.0);
  vec3 upV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  vec2 up = length(upV.xy) > 1e-3 ? normalize(upV.xy) : vec2(0.0, 1.0);
  vec2 right = vec2(up.y, -up.x);
  mv.xy += right * position.x * uSize.x + up * position.y * uSize.y;
  vQ = position.xy;
  gl_Position = projectionMatrix * mv;
}
`;
export const FLAME_FRAG = /* glsl */ `
${COMMON}
uniform float uTime;
uniform float uI;
uniform float uNotch;
uniform float uGutter;
uniform float uSeed;
uniform float uLean;
uniform float uBehind;  // 0 in the open .. 1 wholly behind lit paper
uniform vec3 cCore;
uniform vec3 cEmber;
uniform vec3 cDeep;
varying vec2 vQ;
void main() {
  // Flame space: y -1 base .. +1 tip, inside a padded quad.
  vec2 F = vec2(vQ.x / 0.62, (vQ.y - 0.02) / 0.78);
  float rise = clamp(F.y * 0.5 + 0.5, 0.0, 1.0);
  float t = uTime;
  float n1 = vnoise(vec2(F.y * 2.1 - t * 3.3, uSeed + t * 0.6));
  float n2 = vnoise(vec2(F.y * 4.6 - t * 5.9, uSeed * 1.7 + 3.1 + t * 1.3));
  float sway = (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.22;
  float wild = 1.0 + uGutter * 2.2;
  F.x -= sway * rise * rise * wild;
  F.x -= uLean * rise * rise;
  // Height breathes with the lower octave.
  F.y = (F.y + 1.0) / (0.94 + 0.12 * n1 - 0.3 * uGutter) - 1.0;

  float w = flameHalfWidth(F.y) * 0.8;
  // The tampered share: a square bite out of the right flank, like a seal notch cut in the
  // wrong place. Deep enough to read at a glance: this flame does not fit.
  float cut = uNotch * step(0.0, F.x) * (1.0 - smoothstep(0.06, 0.22, abs(F.y - 0.08)));
  w *= 1.0 - 0.95 * cut;
  float r = abs(F.x) / max(w, 1e-3);
  float inY = smoothstep(-1.04, -0.9, F.y) * (1.0 - smoothstep(0.86, 1.0, F.y));
  float body = (1.0 - smoothstep(0.62, 1.0, r)) * inY;

  vec2 C = vec2(F.x, (F.y + 0.36) / 0.6);
  float wc = flameHalfWidth(C.y) * 0.8 * 0.56;
  float rc = abs(C.x) / max(wc, 1e-3);
  float core = (1.0 - smoothstep(0.15, 1.0, rc)) * smoothstep(-1.02, -0.85, C.y) * (1.0 - smoothstep(0.7, 1.0, C.y));
  core *= 1.0 - cut;

  vec2 G = F * vec2(1.25, 0.72) + vec2(0.0, 0.15);
  float win = (1.0 - smoothstep(0.55, 1.0, abs(vQ.x))) * (1.0 - smoothstep(0.6, 1.0, abs(vQ.y)));
  float glow = exp(-dot(G, G) * 2.4) * win;

  vec3 base = mix(cEmber, cDeep, smoothstep(0.3, 1.0, r) * 0.55);
  // Behind lit paper the flame's own air is the paper's business (it draws the diffused drop),
  // but the flame itself still shows as the brand's Ember teardrop with a white heart: its body
  // covers the glowing paper rather than adding to it, so it never washes out to white.
  vec3 flame = base * body * 1.5 + cCore * core * 3.4;
  vec3 col = (flame * (1.0 - 0.25 * uBehind) + cEmber * glow * 0.22 * (1.0 - uBehind)) * uI * closeMask();
  float cover = body * uBehind * 0.85 * clamp(uI, 0.0, 1.0) * closeMask();
  gl_FragColor = vec4(col, 0.0);
  #include <tonemapping_fragment>
  gl_FragColor = vec4(capText(gl_FragColor.rgb, 0.02), cover);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// Additive glow sprites, instanced: halos, the three shares, the seal's lock glow, falling marks.
export const GLOW_VERT = /* glsl */ `
attribute vec4 iPos;    // xyz, world radius
attribute vec4 iCol;    // linear rgb (intensity folded in), kind: 0 halo, 1 spark
varying vec2 vQ;
varying vec4 vCol;
void main() {
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
  mv.xy += position.xy * iPos.w;
  vQ = position.xy;
  vCol = iCol;
  gl_Position = projectionMatrix * mv;
}
`;
export const GLOW_FRAG = /* glsl */ `
${COMMON}
varying vec2 vQ;
varying vec4 vCol;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 >= 1.0) discard;
  float edge = (1.0 - r2) * (1.0 - r2);
  float f;
  if (vCol.a < 0.5) {
    f = exp(-r2 * 6.0) * edge;
  } else {
    f = (exp(-r2 * 80.0) * 3.0 + exp(-r2 * 16.0) * 0.28 + exp(-r2 * 4.0) * 0.012) * edge;
  }
  vec3 col = capText(shoulder(vCol.rgb * f) * closeMask(), 0.02);
  gl_FragColor = vec4(col, 0.0);
  #include <colorspace_fragment>
  // Wide, faint gradients band in 8 bits: dither wherever the glow is at least a level.
  gl_FragColor.rgb += dither() * step(1.0 / 255.0, max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)));
}
`;

// ---------------------------------------------------------------------------------------------
// Trails behind the shares: one Points draw, a ring buffer of samples with an age attribute.
export const TRAIL_VERT = /* glsl */ `
attribute float aAge;
attribute float aI;
uniform float uPx;
varying float vA;
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float life = 1.0 - clamp(aAge, 0.0, 1.0);
  vA = life * life * aI;
  gl_PointSize = max(uPx * (0.018 + 0.03 * life) / -mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;
export const TRAIL_FRAG = /* glsl */ `
${COMMON}
uniform vec3 cEmber;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 >= 1.0 || vA <= 0.001) discard;
  float f = exp(-r2 * 3.5) * (1.0 - r2);
  gl_FragColor = vec4(capText(shoulder(cEmber * f * vA * 0.9) * closeMask(), 0.02), 0.0);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// The ledger: every public mark is a flat, instanced quad on y = -1.5 drawn with an SDF.
// Kinds: 0 seal (the notched dojang ring), 1 ring (leaf / recovery / rogue, with arc, 72 ticks
// and dashes), 2 dot (nullifier or root knot), 3 DApp window, 4 hairline, 5 stamp ripple.
export const MARK_VERT = /* glsl */ `
attribute vec4 iA;   // shapes: cx, cz, radius, rotation | hairline: ax, az, bx, bz
attribute vec4 iP;   // per-kind parameters
attribute vec4 iK;   // kind, alpha, half stroke, extra
attribute vec3 iC;   // linear colour
uniform float uY;
varying vec2 vL;
varying vec4 vP;
varying vec4 vK;
varying vec3 vC;
varying float vLen;
varying vec2 vF;
void main() {
  vec3 wp;
  vP = iP; vK = iK; vC = iC; vLen = 0.0; vF = vec2(0.0);
  if (iK.x > 3.5 && iK.x < 4.5) {
    vec2 a = iA.xy;
    vec2 b = iA.zw;
    vec2 d = b - a;
    float len = max(length(d), 1e-4);
    vec2 t = d / len;
    vec2 n = vec2(-t.y, t.x);
    vec2 mid = 0.5 * (a + b);
    float pad = 0.02 + 0.014 * length(cameraPosition - vec3(mid.x, uY, mid.y));
    float along = mix(-pad, len + pad, position.x * 0.5 + 0.5);
    float across = position.y * pad;
    vec2 p = a + t * along + n * across;
    vL = vec2(along, across);
    vLen = len;
    wp = vec3(p.x, uY, p.y);
  } else {
    float s = iA.z * 1.4;
    float c = cos(iA.w);
    float sn = sin(iA.w);
    vec2 q = position.xy * s;
    vec2 r = vec2(c * q.x - sn * q.y, sn * q.x + c * q.y);
    wp = vec3(iA.x + r.x, uY, iA.y + r.y);
    vL = position.xy * 1.4;
    // The seal's flame is drawn upright as the viewer sees it, whichever way the seal has
    // turned: (across, away from the camera) on the ledger, in radius units.
    vec2 toC = iA.xy - cameraPosition.xz;
    vec2 away = dot(toC, toC) > 1e-8 ? normalize(toC) : vec2(0.0, -1.0);
    vF = vec2(dot(r, vec2(-away.y, away.x)), dot(r, away)) / max(iA.z, 1e-4);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const MARK_FRAG = /* glsl */ `
${COMMON}
uniform vec3 cEmber;
uniform vec3 cNight;
uniform vec3 cLit;
varying vec2 vL;
varying vec4 vP;
varying vec4 vK;
varying vec3 vC;
varying float vLen;
varying vec2 vF;

const float TAU = 6.28318530718;
const float DEPTH[12] = float[12](2.0, 1.0, 3.0, 1.0, 2.0, 3.0, 1.0, 2.0, 1.0, 3.0, 2.0, 1.0);

// One pixel's footprint in the mark's local units, from a smooth coordinate. (fwidth() of an
// absolute distance collapses where a pixel pair straddles the line, which dashes hairlines.)
float PX;
// Coverage of a band |d| < w, antialiased; lines thinner than a pixel fade rather than shimmer.
float band(float d, float w) {
  float we = max(w, 0.5 * PX);
  return clamp((we - abs(d)) / PX + 0.5, 0.0, 1.0) * min(1.0, w / we);
}
float inside(float sd) {
  return clamp(0.5 - sd / PX, 0.0, 1.0);
}
// Clockwise from 12 o'clock, where 12 o'clock is away from the viewer (-z).
float clockAngle(vec2 p) {
  float a = atan(p.x, -p.y);
  return a < 0.0 ? a + TAU : a;
}
float dashes(float a, float count, float r) {
  float x = a / TAU * count;
  float fw = max(PX / max(r, 0.2) / TAU * count, 1e-4);
  float f = fract(x);
  return smoothstep(0.0, fw, f) * (1.0 - smoothstep(0.55 - fw, 0.55, f));
}

void main() {
  float kind = vK.x;
  vec3 rgb = vec3(0.0);
  vec3 lit = vec3(0.0);   // the lock's Ember, kept exact (no shoulder)
  float a = 0.0;
  vec2 p = vL;
  PX = max(length(fwidth(p)) * 0.75, 1e-5);
  float r = length(p);
  float ang = clockAngle(p);
  float aaA = PX / max(r, 0.1);

  if (kind < 0.5) {
    // The seal, after the brand kit (src/brand/seal.js) at radius 1 (D = 2, u = D/48): a ring
    // of stroke D/14 whose inner edge carries twelve slots 2u wide at 15 + 30k degrees, depths
    // [2,1,3,1,2,3,1,2,1,3,2,1]u. open: a 60 degree gap at one o'clock. closed: a centre dot of
    // radius D/12. lit: an Ember disc set 1u inside the ring, the flame knocked out in Night.
    // retired: 12 dashes of 18 degrees centred on 30k (every slot falls in a gap).
    float gap = vP.x;      // 0 closed .. 1 open
    float dotA = vP.y;     // the closed seal's centre dot
    float fill = vP.z;     // the light, filling from the centre
    float dash = vP.w;     // retired
    const float U = 2.0 / 48.0;
    const float STEP = TAU / 12.0;
    float stroke = 2.0 / 14.0;
    float rin = 1.0 - stroke;
    float k = floor((ang - 0.5 * STEP) / STEP + 0.5);
    float s = r * (ang - 0.5 * STEP - k * STEP);
    float slot = 1.0 - smoothstep(U - 0.5 * PX, U + 0.5 * PX, abs(s));
    // The brand's depths exactly (the deepest leaves an eighth of the stroke): the bitting is
    // the point of the seal. Capped only so a slot can never cut the ring through.
    float depth = min(DEPTH[int(mod(k, 12.0))] * U, stroke * 0.9) * slot * (1.0 - dash);
    float ring = inside(max(r - 1.0, rin + depth - r));
    float g = gap * STEP;
    float inGap = smoothstep(STEP - g - aaA, STEP - g, ang) * (1.0 - smoothstep(STEP + g, STEP + g + aaA, ang));
    ring *= 1.0 - inGap * step(0.001, gap);
    float fd = fract(ang / STEP + 0.5);
    float fwd = PX / max(r, 0.2) / STEP;
    ring *= mix(1.0, smoothstep(0.2 - fwd, 0.2 + fwd, fd) * (1.0 - smoothstep(0.8 - fwd, 0.8 + fwd, fd)), dash);
    float lightC = inside(r - fill * (rin - U)) * step(0.001, fill);
    float dotC = inside(r - 1.0 / 6.0) * dotA * (1.0 - lightC);
    // The flame, 0.4D tall with the mark's lean, knocked out once the light has spread.
    vec2 F = vF / 0.4;
    F.x -= 0.09 * pow(clamp(F.y * 0.5 + 0.5, 0.0, 1.0), 2.0);
    float fwf = flameHalfWidth(F.y) * 0.8;
    float knock = inside((abs(F.x) - fwf) * 0.4) * (1.0 - smoothstep(0.97, 1.0, abs(F.y))) * smoothstep(0.55, 0.85, fill);
    rgb = vC * max(ring, dotC);
    lit = mix(cEmber, cNight, knock) * lightC * (1.0 - ring);
    a = max(max(ring, dotC), lightC);
  } else if (kind < 1.5) {
    // Ring: leaf, recovery or rogue. P: arc (0..1), ticks (0/1), tick fill, dash.
    float hs = vK.z;
    float ring = band(r - 1.0, hs);
    float arc = vP.x;
    float arcM = 1.0 - smoothstep(arc * TAU - aaA, arc * TAU + aaA, ang);
    ring *= arc >= 0.999 ? 1.0 : arcM;
    ring *= mix(1.0, dashes(ang, 36.0, r), vP.w);
    float ticks = 0.0;
    float on = 0.0;
    if (vP.y > 0.5) {
      float j = floor(ang / (TAU / 72.0) + 0.5);
      float s = r * (ang - j * TAU / 72.0);
      float radial = smoothstep(1.07, 1.08, r) * (1.0 - smoothstep(1.2, 1.21, r));
      ticks = band(s, 0.011) * radial * arcM;
      on = step(mod(j, 72.0) + 0.5, vP.z * 72.0);
    }
    rgb = vC * ring + vC * ticks * mix(0.22, 1.0, on);
    a = max(ring, ticks * mix(0.22, 1.0, on));
  } else if (kind < 2.5) {
    // Dot. P.x 1 hollow (nullifier), P.y knot (root: a filled centre in a thin ring).
    float hollow = band(r - 0.78, 0.2) * vP.x;
    float knot = max(inside(r - 0.42), band(r - 1.0, 0.075)) * vP.y;
    float solid = inside(r - 1.0) * (1.0 - vP.x) * (1.0 - vP.y);
    float c = max(max(hollow, knot), solid);
    rgb = vC * c;
    a = c;
  } else if (kind < 3.5) {
    // DApp window: a rounded square with a title bar, lit from within. P.x lit.
    vec2 q = abs(p) - vec2(1.0 - 0.18);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.18;
    float hs = vK.z;
    float edge = band(sd, hs);
    float bar = band(p.y + 0.52, hs) * inside(sd + hs);
    float fillC = inside(sd) * vP.x * (0.55 + 0.45 * smoothstep(-0.52, 0.9, p.y));
    float stroke = max(edge, bar);
    rgb = vC * stroke + cLit * fillC * 0.035 * (1.0 - stroke);
    a = max(stroke, fillC * 0.12);
  } else if (kind < 4.5) {
    // Hairline, drawn on from a towards b. P.x grow.
    float L = vLen * vP.x;
    float t = clamp(p.x, 0.0, L);
    float d = length(vec2(p.x - t, p.y));
    float c = band(d, vK.z) * step(0.0005, vP.x);
    rgb = vC * c;
    a = c;
  } else {
    // Stamp ripple.
    float c = band(r - 1.0, vK.z);
    rgb = vC * c;
    a = c;
  }
  // The record dissolves into the dark toward the frame's sides and foot, as the plane does
  // toward the horizon: a mark the frame cuts fades out rather than ending in a hard sliver
  // (wider screens see further along the ledger than the shots are composed for).
  float E = 0.05 * uRes.y;
  vec2 fc = gl_FragCoord.xy;
  float edge = smoothstep(0.0, E, fc.x) * smoothstep(0.0, E, uRes.x - fc.x) * smoothstep(0.0, E, fc.y);
  float m = vK.y * closeMask() * edge;
  gl_FragColor = vec4(capText((shoulder(rgb) + lit) * m, 0.035), a * m);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// The ledger plane: Night lacquer that takes pools of warm light and a soft glossy reflection
// of each light, fogged out to Night at the horizon.
export const PLANE_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const PLANE_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uLightPos[3];
uniform vec3 uLightCol[3];
uniform vec3 cNight;
uniform float uFog;
uniform float uPlane;   // 0 in the hero (the ledger is not yet in the story) .. 1
varying vec3 vPos;
void main() {
  vec3 I = normalize(vPos - cameraPosition);
  vec3 R = reflect(I, vec3(0.0, 1.0, 0.0));
  float cosV = max(-I.y, 0.0);
  float F = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 toL = uLightPos[i] - vPos;
    float d2 = dot(toL, toL);
    vec3 L = toL * inversesqrt(d2);
    // A soft pool of light under each light, kept local so it never smears into a band at
    // the horizon.
    col += uLightCol[i] * max(L.y, 0.0) * 0.045 / (d2 * d2 * 0.45 + 0.35);
  }
  // The lacquer's gloss: a faint, soft streak of each lantern's light where the reflected ray
  // passes it (no mirrored body: the ledger is for marks, not for doubles of the lanterns).
  for (int i = 0; i < 2; i++) {
    vec3 c = uLightPos[i];
    vec2 o = vPos.xz - c.xz;
    vec2 rh = R.xz;
    float ts = max(-dot(o, rh) / max(dot(rh, rh), 1e-6), 0.0);
    float dh = length(o + rh * ts);
    col += uLightCol[i] * exp(-dh * dh * 9.0) * F * 0.02 / (1.0 + ts);
  }
  float dist = length(vPos - cameraPosition);
  float fog = exp(-pow(uFog * dist, 2.0));
  col = shoulder(col * fog * closeMask() * uPlane);
  // Near the viewer the lacquer is as dark as the air; toward the horizon it melts into it.
  vec3 air = airLift() * closeMask();
  gl_FragColor = vec4(cNight + capText(air * (1.0 - 0.85 * fog) + col, 0.02), 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += dither();
}
`;

// ---------------------------------------------------------------------------------------------
// Guardians: three small low-poly lanterns in one instanced draw, exp2 fog to Night, never named.
export const GUARD_VERT = /* glsl */ `
attribute float aPart;      // 0 paper, 1 frame
attribute vec4 iOffset;     // xyz, scale
attribute float iGlow;
varying vec3 vPos;
varying vec3 vNrm;
varying float vPart;
varying float vGlow;
varying float vY;
void main() {
  vec3 p = position * iOffset.w + iOffset.xyz;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  vPart = aPart;
  vGlow = iGlow;
  vY = position.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const GUARD_FRAG = /* glsl */ `
${COMMON}
uniform vec3 cLit;
uniform vec3 cCore;
uniform vec3 cWarm;
uniform vec3 cLacquer;
uniform float uFog;
varying vec3 vPos;
varying vec3 vNrm;
varying float vPart;
varying float vGlow;
varying float vY;
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vPos);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float dist = length(vPos - cameraPosition);
  float fog = exp(-pow(uFog * dist, 2.0));
  float mask = closeMask();
  // Far off and small: A's lit paper reduced to what carries at a distance. Hottest round the
  // light it holds (the share hovers a little below the middle), falling off to the cap and the
  // foot; creamy where the paper faces the viewer, a deep amber where the view grazes it (the
  // long path through the sheet); nine faint hoop shadows.
  float heat = exp(-pow((vY + 0.09) / 0.3, 2.0));
  float hv = (vY + 0.51) / 1.02 * 9.0;
  float rib = 1.0 - 0.45 * smoothstep(0.03, 0.09, abs(fract(hv) - 0.5) - 0.38);
  vec3 face = mix(cLit * cLit * cLit, cLit * cLit, heat * heat);
  vec3 tint = mix(cWarm * 7.0, face, pow(ndv, 1.2));
  vec3 paper = tint * (0.14 + 0.86 * heat) * (0.25 + 0.75 * ndv) * rib * vGlow * 0.9;
  // Premultiplied (rgb, coverage): the lit paper mostly hides the Night and the halo behind it,
  // as A's does; the lacquered cap and foot are solid, so they cut a roof out of the halo.
  vec3 frame = cLacquer * 0.4 + (cLit * cLit) * vGlow * 0.06 * max(-N.y, 0.0);
  float lit = smoothstep(0.0, 0.08, vGlow);
  if (vPart < 0.5) {
    gl_FragColor = vec4(capText(shoulder(paper * fog * mask), 0.035), 0.85 * lit * closeMask());
  } else {
    gl_FragColor = vec4(capText(frame * fog * mask * lit, 0.035), lit * closeMask());
  }
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// The veto card: the only solid paper object. Lit by whatever light is near, a cool breath of
// moonlight, and a small printed ring (its commitment) in ink.
export const CARD_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNrm;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const CARD_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uFibre;
uniform vec3 uLightPos[3];
uniform vec3 uLightCol[3];
uniform vec3 uMoonDir;
uniform vec3 cHanji;
uniform vec3 cMoon;
uniform vec3 cNight;
uniform float uOpacity;
varying vec3 vPos;
varying vec3 vNrm;
varying vec2 vUv;
void main() {
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vPos);
  float f = texture2D(uFibre, vUv * vec2(0.9, 0.6) + 0.21).r;
  vec3 alb = cHanji * (0.86 + 0.14 * (1.0 - f));
  vec3 light = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 toL = uLightPos[i] - vPos;
    float d2 = dot(toL, toL);
    vec3 L = toL * inversesqrt(d2);
    light += uLightCol[i] * (abs(dot(N, L)) * 0.7 + 0.3) * 0.3 / (d2 + 0.2);
  }
  light += cMoon * (0.012 + 0.024 * max(dot(N, uMoonDir), 0.0)) + vec3(0.008);
  vec3 col = alb * light;
  // The printed ring: a small closed seal in ink, left of centre.
  vec2 q = (vUv - vec2(0.27, 0.5)) * vec2(1.5, 1.0);
  float rr = length(q);
  float fw = max(fwidth(rr), 1e-4);
  float ink = clamp((0.022 - abs(rr - 0.16)) / fw + 0.5, 0.0, 1.0) + clamp((0.04 - rr) / fw + 0.5, 0.0, 1.0);
  // Two faint ruled lines to its right.
  float ly = min(abs(vUv.y - 0.58), abs(vUv.y - 0.42));
  float rule = clamp((0.01 - ly) / max(fwidth(vUv.y), 1e-4) + 0.5, 0.0, 1.0) * step(0.48, vUv.x) * step(vUv.x, 0.86);
  col = mix(col, col * 0.18, clamp(ink, 0.0, 1.0) * 0.85);
  col = mix(col, col * 0.55, rule * 0.6);
  float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
  col += cMoon * fres * 0.03;
  col = capText(shoulder(col * closeMask()), 0.035);
  gl_FragColor = vec4(col * uOpacity, uOpacity * closeMask());
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// The beam from the phone's flame to the seal: a camera-facing ribbon between two points.
export const BEAM_VERT = /* glsl */ `
uniform vec2 uRes;
uniform vec3 uA;
uniform vec3 uB;
uniform float uWidth;   // px
varying float vT;
varying float vS;
void main() {
  float t = position.x;
  vec4 ca = projectionMatrix * viewMatrix * vec4(uA, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(uB, 1.0);
  vec4 c = mix(ca, cb, t);
  vec2 sa = ca.xy / ca.w;
  vec2 sb = cb.xy / cb.w;
  vec2 dir = normalize((sb - sa) * uRes + vec2(1e-5));
  vec2 n = vec2(-dir.y, dir.x);
  c.xy += n * position.y * uWidth / uRes * 2.0 * c.w;
  vT = t;
  vS = position.y;
  gl_Position = c;
}
`;
export const BEAM_FRAG = /* glsl */ `
${COMMON}
uniform float uHead;
uniform float uTail;
uniform float uBreak;
uniform float uI;
uniform vec3 cEmber;
uniform vec3 cCore;
varying float vT;
varying float vS;
void main() {
  float across = exp(-vS * vS * 6.0);
  float core = exp(-vS * vS * 60.0);
  float along = smoothstep(uTail - 0.02, uTail + 0.02, vT) * (1.0 - smoothstep(uHead - 0.03, uHead, vT));
  // Breaking: the beam comes apart into fading pieces.
  float piece = smoothstep(0.25, 0.45, fract(vT * 9.0 + uBreak * 1.7));
  along *= mix(1.0, piece, clamp(uBreak * 3.0, 0.0, 1.0)) * (1.0 - uBreak);
  vec3 col = (cEmber * across * 0.5 + cCore * core * 0.9) * along * uI;
  gl_FragColor = vec4(capText(shoulder(col) * closeMask(), 0.02), 0.0);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
// The text ceiling: drawn last, over each text rectangle only (never full screen), with MIN
// blending, so no pixel behind the story's text can be brighter than cCap whatever stacked
// above it. cCap is sRGB-encoded, written as is: luminance 0.057, so Hanji text (0.78) keeps
// 7.7:1. It eases off over uPad px outside the rectangle. The glow limit (capText) already
// holds nearly everything below it; this is the guarantee, not the look.
export const SAFE_VERT = /* glsl */ `
uniform vec4 uTextSafe[2];
uniform vec2 uRes;
uniform float uPad;
varying vec4 vR;
void main() {
  vec4 r = position.z < 0.5 ? uTextSafe[0] : uTextSafe[1];
  vR = r;
  if (r.z <= r.x) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 p = mix(r.xy - uPad, r.zw + uPad, position.xy * 0.5 + 0.5);
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
}
`;
export const SAFE_FRAG = /* glsl */ `
uniform vec3 cCap;
uniform float uPad;
varying vec4 vR;
void main() {
  vec2 q = abs(gl_FragCoord.xy - 0.5 * (vR.xy + vR.zw)) - 0.5 * (vR.zw - vR.xy);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  gl_FragColor = vec4(mix(cCap, vec3(1.0), smoothstep(0.0, uPad, d)), 1.0);
}
`;
