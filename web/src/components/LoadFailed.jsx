// The compiled contract's chunk (its runtime and WebAssembly) did not arrive, or cannot run here: said,
// with a way back, rather than "Loading…" for ever. Its class is not `.loading`, so App.jsx counts the
// page as ready and moves the focus to it after a route change from the keyboard.
export function LoadFailed() {
  // WebAssembly turned off (iOS Lockdown Mode, some managed browsers): reloading would not help.
  if (typeof WebAssembly === 'undefined') {
    return (
      <p className="load-failed warn" role="alert">
        The compiled contract cannot run in this browser: WebAssembly is turned off here (as in iOS Lockdown Mode).
        Another browser, or this one with WebAssembly allowed for this site, can run it.
      </p>
    );
  }
  return (
    <p className="load-failed warn" role="alert">
      The compiled contract did not load. Check your connection, then{' '}
      <button type="button" className="linkish" onClick={() => window.location.reload()}>reload the page</button>.
    </p>
  );
}
