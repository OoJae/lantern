import { startTransition, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
// The route change being drawn, if one is.
let changing = null;
// Route changes whose new page is not ready yet: each is released by pageReady() (App.jsx), or by
// its own cap.
const waiting = new Set();
// How long a route change may hold the old page for the new one to be ready. Past it, the page is
// revealed as it is: the lazy page's loading line (a direct load shows the same), or the page's own.
const HOLD_MAX = 1500;
// Whether the link just taken was taken from the keyboard (App.jsx then moves focus to the new page).
let focusRequest = false;

// A route change carries the light (styles/motion.css): the old page snuffs out, the new one is
// revealed under a header that never moves, and the wick travels to the new item. The browser
// snapshots the old page and holds that frame while the update runs. The update puts the window at
// the top, then renders the new page as a React transition, so React keeps the old page in place
// while a lazy page's chunk arrives, rather than showing a loading line; the update ends once the new
// page is ready (App.jsx calls pageReady(): committed, with no loading line of its own). The snapshot
// of the new page is then the page, never "Loading…" with the real page cutting in mid-reveal. If it
// is not ready within HOLD_MAX, it is drawn as it is, at once.
// A change of the query alone (/demo?beat=) keeps the page: it is drawn at once.
// Without view transitions, under reduced motion, or in a hidden tab, the change is instant.
// Back and forward (popstate) and in-page hash links never come through here: they stay instant.
// Nothing is fetched ahead on hover: /demo promises no request after it has loaded.
export function navigate(to, { fromKeyboard = false } = {}) {
  if (to === window.location.pathname) return;
  focusRequest = fromKeyboard;
  const samePage = new URL(to, window.location.href).pathname === window.location.pathname;
  window.history.pushState({}, '', to);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce || document.visibilityState !== 'visible') {
    notify();
    window.scrollTo(0, 0);
    return;
  }
  const t = document.startViewTransition(() => {
    // Rendering is held on the old page's snapshot from here until the update is done: the window
    // can go to the top now, unseen, and the new page mounts there, as it would on a fresh load.
    window.scrollTo(0, 0);
    if (samePage) { flushSync(notify); return undefined; }
    return new Promise((resolve) => {
      let cap = 0;
      const done = () => { clearTimeout(cap); waiting.delete(done); resolve(); };
      waiting.add(done);
      cap = setTimeout(() => {
        // Still loading: show what there is (a lazy page's loading line, on a page's height).
        flushSync(notify);
        done();
      }, HOLD_MAX);
      startTransition(notify);
    });
  });
  // A transition the browser skips (a second click before this one is drawn) still runs its update.
  t.ready.catch(() => {});
  changing = t;
  const settle = () => { if (changing === t) changing = null; };
  t.finished.then(settle, settle);
}

// The page a route change leads to is ready to be drawn: App.jsx calls this once the new page has
// committed and shows no loading line. Releases every change waiting for it (a change the browser
// skipped included).
export function pageReady() {
  for (const done of [...waiting]) done();
}

// Whether the last route change was asked for from the keyboard. Asking clears it.
export function takeFocusRequest() {
  const asked = focusRequest;
  focusRequest = false;
  return asked;
}

// Calls back once no route change is being drawn: at once (next microtask) if none is. A page's own
// entrance waits for the change that brought it, so one thing moves at a time (the landing's hero
// lines rise after the page has been revealed, not inside the reveal). Returns a cancel function.
// Never make a page's readiness (its loading line going away) wait on this: the change waits on the
// page, so the two would wait on each other until HOLD_MAX.
export function afterRouteChange(fn) {
  let live = true;
  const run = () => { if (live) fn(); };
  (changing ? changing.finished : Promise.resolve()).then(run, run);
  return () => { live = false; };
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => { listeners.delete(update); window.removeEventListener('popstate', update); };
  }, []);
  return path;
}

export function Link({ to, className, children, ...rest }) {
  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    // A jump within the page already open is the browser's own, and instant.
    const target = new URL(to, window.location.href);
    if (target.hash && target.pathname + target.search === window.location.pathname + window.location.search) return;
    e.preventDefault();
    // A click with no pointer behind it came from the keyboard (Enter on the link): no pointer type
    // (Firefox counts it as a single click, detail 1), or, where click is no pointer event, detail 0.
    navigate(to, { fromKeyboard: e.nativeEvent.pointerType === '' || e.detail === 0 });
  };
  return <a href={to} className={className} onClick={onClick} {...rest}>{children}</a>;
}
