// Quality tiers, the WebGL2 probe and the frame-time watchdog.
//
// high: a desktop GPU. mid: a touch device (pixel ratio capped at 1.5). low: a software
// rasteriser (SwiftShader in CI, llvmpipe, Microsoft Basic Render): ratio 1, scale 0.75,
// 30 fps, no MSAA, one halo per lantern, one fibre octave.

const SOFTWARE = /SwiftShader|llvmpipe|Software|Basic Render/i;
const MAX_PIXELS = 3.7e6;

export const TIERS = {
  high: { name: 'high', scales: [1, 0.85, 0.7], fps: 60, idleFps: 30, msaa: true, halos: 2, detail: true, anisotropy: 4 },
  mid: { name: 'mid', scales: [1, 0.85, 0.7], fps: 60, idleFps: 30, msaa: true, halos: 2, detail: true, anisotropy: 2 },
  low: { name: 'low', scales: [0.75, 0.62, 0.5], fps: 30, idleFps: 20, msaa: false, halos: 1, detail: false, anisotropy: 1 },
};

// Look at the GPU before committing to a context: a throwaway WebGL2 context is created, read
// and released. Returns null when WebGL2 is unavailable. Once per page when it succeeds: the GPU
// does not change between visits to the landing, and every context released is one more notice
// in some consoles (Firefox reports each one lost).
let probed = null;
export function probe() {
  probed ??= look();
  return probed;
}
function look() {
  let gl = null;
  try {
    gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: false });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let renderer = '';
  try {
    renderer = String(gl.getParameter(gl.RENDERER) || '');
    // Chromium masks RENDERER; Firefox unmasks it (and warns if asked through the extension).
    if (/^WebKit WebGL$|^Mozilla$/i.test(renderer) || !renderer) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || renderer);
    }
  } catch {
    // keep what we have
  }
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // nothing to release
  }
  return { renderer, software: SOFTWARE.test(renderer) };
}

export function isCoarse() {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function resolveTier(requested, info, coarse) {
  if (requested && TIERS[requested]) return TIERS[requested];
  if (info?.software) return TIERS.low;
  return coarse ? TIERS.mid : TIERS.high;
}

// min(devicePixelRatio, 1.5 touch / 1.75 desktop) x the adaptive scale; ratio 1 on the low tier;
// the drawing buffer is held to about 3.7 megapixels.
export function pixelRatio(tier, step, w, h, coarse, dpr = window.devicePixelRatio || 1) {
  const base = tier.name === 'low' ? 1 : Math.min(dpr, coarse ? 1.5 : 1.75);
  let pr = base * tier.scales[Math.min(step, tier.scales.length - 1)];
  const px = Math.max(1, w * h);
  if (px * pr * pr > MAX_PIXELS) pr = Math.sqrt(MAX_PIXELS / px);
  return pr;
}

// Watches rendered frames for the whole session, 90 at a time. A sample is the time from a
// rendered frame's callback to the next callback: about 16.7 ms when the frame fits in one vsync,
// longer when it does not. A median above 22 ms steps the scale down; at the lowest step, above
// 34 ms, it gives up. It only ever steps down, and it never stops looking: the hero is the
// cheapest shot in the story (9 draws), the lock the dearest (19 draws and the most overdraw),
// so a pass in the hero proves nothing about segment 6. reset() drops a partial window (the
// loop restarted, or the story moved to a new stage, whose cost is different).
export function createWatchdog({ steps, onStep, onFail, window: size = 90, stepMs = 22, failMs = 34 }) {
  let step = 0;
  let done = false;
  let samples = [];
  return {
    get step() { return step; },
    get done() { return done; },
    sample(ms) {
      if (done) return;
      samples.push(ms);
      if (samples.length < size) return;
      const sorted = samples.slice().sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      samples = [];
      if (step < steps - 1 && median > stepMs) {
        step += 1;
        onStep(step, median);
      } else if (step >= steps - 1 && median > failMs) {
        done = true;
        onFail(median);
      }
    },
    reset() { samples = []; },
  };
}
