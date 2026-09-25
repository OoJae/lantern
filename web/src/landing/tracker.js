// The scroll tracker for the landing story. Tiny, no dependencies, never takes over the scroll.
//
//   const tracker = createTracker(section);        // steps: section.querySelectorAll('[data-step]')
//   tracker.u                                       // 0 .. steps (float)
//   tracker.stage                                   // round(u), 0 .. steps - 1
//   tracker.subscribe((u) => ...)                   // returns an unsubscribe function
//   tracker.refresh();                              // re-measure (the observers normally do)
//   tracker.dispose();
//
// Steps are the story blocks in document order: the hero is step 0, then one per segment (the
// landing has 8). Measured with a ResizeObserver on the section (and on window resize), so
// fonts loading or text reflowing re-measure; scrolling only reads scrollY.
//
// u = i exactly when step i's centre is on the viewport's centre line; between centres it is
// interpolated, past the last one it keeps going (one step's spacing per unit) up to `steps`,
// so the scene can close its vignette as the page continues. The section's data-stage is
// round(u), clamped to the steps, written only when it changes; data-closed is present once u is
// past steps - 0.44, where the scene's vignette has shut over the story's last frame
// (choreography.js, s.close) and the stage is about to scroll away.
//
// textRects(out) fills out (Float32Array(8)) with up to two viewport rectangles
// [left, top, right, bottom] of the on-screen text nearest the centre line, for the scene's glow
// limit (as many as out holds, four numbers each).
// A step's text rectangles are its [data-text-safe] elements (the hero has two: its words, and
// the scroll cue's row), else the step itself. A [data-text-safe] element in the section but in no
// step (the stage's ledger strip) takes whatever slot is left over.

export function createTracker(section, { steps: selector = '[data-step]' } = {}) {
  let steps = [];
  let safes = [];
  let loose = [];
  let centres = [];
  let u = 0;
  let stage = -1;
  let closed = false;
  const listeners = new Set();

  function measure() {
    steps = Array.from(section.querySelectorAll(selector));
    // Each step's text boxes, looked up once here rather than on every frame.
    safes = steps.map((el) => {
      const own = el.querySelectorAll('[data-text-safe]');
      return own.length ? Array.from(own) : [el];
    });
    loose = Array.from(section.querySelectorAll('[data-text-safe]')).filter((el) => !el.closest(selector));
    const y = window.scrollY;
    centres = steps.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + y + r.height / 2;
    });
    compute();
  }

  function compute() {
    const n = centres.length;
    if (!n) return;
    const line = window.scrollY + window.innerHeight / 2;
    let next;
    if (n === 1 || line <= centres[0]) {
      const gap = n > 1 ? centres[1] - centres[0] : window.innerHeight;
      next = (line - centres[0]) / (gap || 1);
    } else if (line >= centres[n - 1]) {
      const gap = centres[n - 1] - centres[n - 2];
      next = n - 1 + (line - centres[n - 1]) / (gap || 1);
    } else {
      let i = 0;
      while (i < n - 2 && line >= centres[i + 1]) i++;
      next = i + (line - centres[i]) / (centres[i + 1] - centres[i] || 1);
    }
    next = Math.max(0, Math.min(n, next));
    const moved = next !== u;
    u = next;
    const s = Math.max(0, Math.min(n - 1, Math.round(u)));
    if (s !== stage) {
      stage = s;
      section.dataset.stage = String(s);
    }
    const c = u > n - 0.44;
    if (c !== closed) {
      closed = c;
      section.toggleAttribute('data-closed', c);
    }
    if (moved) for (const fn of listeners) fn(u);
  }

  const onScroll = () => compute();
  const ro = new ResizeObserver(measure);
  ro.observe(section);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  measure();

  return {
    get u() {
      return u;
    },
    get stage() {
      return stage;
    },
    get steps() {
      return centres.length;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    textRects(out) {
      const n = steps.length;
      if (!n) return 0;
      const i = Math.max(0, Math.min(n - 1, Math.round(u)));
      const d = u >= i ? 1 : -1;
      let k = 0;
      // The current step's text, then the neighbour the reader is heading for, then the one
      // behind (on a short screen the last lines of the block just read are still in view).
      for (let m = 0; m < 4; m++) {
        const at = m === 0 ? i : m === 1 ? i + d : i - d;
        if (m < 3 && (at < 0 || at >= n)) continue;
        const own = m < 3 ? safes[at] : loose;
        for (let e = 0; e < own.length; e++) {
          if (k * 4 >= out.length) return k;
          const r = own[e].getBoundingClientRect();
          if (r.bottom <= 0 || r.top >= window.innerHeight || r.width === 0) continue;
          out[k * 4] = r.left;
          out[k * 4 + 1] = r.top;
          out[k * 4 + 2] = r.right;
          out[k * 4 + 3] = r.bottom;
          k++;
        }
      }
      return k;
    },
    refresh: measure,
    dispose() {
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      listeners.clear();
      section.removeAttribute('data-closed');
    },
  };
}
