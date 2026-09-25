import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
// The route change being drawn, if one is.
let changing = null;

// A route change carries the light (styles/motion.css): the old page snuffs out, the new one is
// revealed under a header that never moves, and the wick travels to the new item. The browser
// snapshots the old page, then calls the update, in which React renders the new page at once
// (flushSync) and the window returns to the top, so the snapshot of the new page is the right one.
// Without view transitions, under reduced motion, or in a hidden tab, the change is instant.
// Back and forward (popstate) and in-page hash links never come through here: they stay instant.
// Nothing is fetched ahead on hover: /demo promises no request after it has loaded.
export function navigate(to) {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce || document.visibilityState !== 'visible') {
    notify();
    window.scrollTo(0, 0);
    return;
  }
  const t = document.startViewTransition(() => { flushSync(notify); window.scrollTo(0, 0); });
  // A transition the browser skips (a second click before this one is drawn) still runs its update.
  t.ready.catch(() => {});
  changing = t;
  const done = () => { if (changing === t) changing = null; };
  t.finished.then(done, done);
}

// Calls back once no route change is being drawn: at once (next microtask) if none is. A page's own
// entrance waits for the change that brought it, so one thing moves at a time (the landing's hero
// lines rise after the page has been revealed, not inside the reveal). Returns a cancel function.
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
    navigate(to);
  };
  return <a href={to} className={className} onClick={onClick} {...rest}>{children}</a>;
}
