import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { ChunkBoundary } from './lib/ChunkBoundary.jsx';
import { afterRouteChange, Link, pageReady, takeFocusRequest, takeHashRequest, usePath } from './lib/router.jsx';
// The brand kit's own files, each imported directly: the header is in the entry chunk, and these
// carry only the mark and the wordmark's outlines (not 등불, the seal or the pictograms).
import { CompactLockup } from './brand/CompactLockup.jsx';
import { LanternMark as Mark } from './brand/LanternMark.jsx';
import Landing from './pages/Landing.jsx';

// The two pages that run circuits are split out, so the landing page never loads the runtime. The
// brand kit and the 404 are split out too: they draw the seal, the pictograms and 등불, which the
// first load never needs. So is About: every page downloads the first load, and only one shows it.
const About = lazy(() => import('./pages/About.jsx'));
const Demo = lazy(() => import('./pages/Demo.jsx'));
const Attacks = lazy(() => import('./pages/Attacks.jsx'));
const Brand = lazy(() => import('./pages/Brand.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Live = lazy(() => import('./pages/Live.jsx'));
const Rehearse = lazy(() => import('./pages/Rehearse.jsx'));
const Kit = lazy(() => import('./pages/Kit.jsx'));

const PAGES = { '/': Landing, '/demo': Demo, '/attacks': Attacks, '/about': About, '/brand': Brand, '/live': Live, '/rehearse': Rehearse, '/kit': Kit };
// What a lazy page says while it loads: nothing, where there is nothing worth saying.
// /rehearse and /kit say, while their chunk loads, the line they then show while the contract loads.
const LOADING = {
  '/demo': 'Loading the contract…', '/attacks': 'Loading the contract…', '/brand': 'Opening the brand kit…',
  '/rehearse': 'Loading the compiled contract into your browser…', '/kit': 'Loading the contract…',
};

// The Preprod page is named in the nav where it fits on the one row, from 640px (the header's own
// breakpoint); on a phone the footer and the landing lead to it.
const NAV = [['/demo', 'The recovery'], ['/attacks', 'Attack it'], ['/live', 'On Preprod', 'nav-wide'], ['/about', 'What is real']];

// A page whose chunk did not arrive (a tab opened before a redeploy asks for files the new one no
// longer serves; a dropped connection): the header and footer stay, and it says so, with a way back.
// React keeps a failed lazy page failed for the tab's life, so the way back is a reload.
const PAGE_FAILED = (
  <div className="page page-failed">
    <header className="page-head"><h1>This page did not load</h1></header>
    <p className="meta warn" role="alert">
      Check your connection, then <button type="button" className="linkish" onClick={() => window.location.reload()}>reload the page</button>.
      The site may have been updated since this tab opened.
    </p>
  </div>
);

// Each page's title, so history, tabs and a screen reader's page change name the page: its name in the
// nav, then "· Lantern" ("Nothing here · Lantern" for an address with no page). The landing keeps
// index.html's.
const TITLES = Object.fromEntries([...NAV, ['/brand', 'Brand kit'], ['/rehearse', 'Rehearse a recovery'], ['/kit', 'Recovery kits'], ['', 'Nothing here']].map(([to, name]) => [to, `${name} · Lantern`]));
TITLES['/'] = document.title;

export default function App() {
  const path = usePath().replace(/\/+$/, '') || '/';
  const Page = PAGES[path] ?? NotFound;
  const header = useRef(null);

  // The sticky header's height, kept in --header-h: its nav wraps onto more lines as the window
  // narrows, and an in-page jump such as /demo#break must stop clear of it at every width.
  useEffect(() => {
    const el = header.current;
    const set = () => document.documentElement.style.setProperty('--header-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const watch = new ResizeObserver(set);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // A new page has committed. It is ready to be drawn once it is the page itself (not the lazy page's
  // stand-in, .page-loading) and shows no loading line of its own (/demo loads the contract, /attacks
  // runs the attack): then a route change waiting on it is released (router.jsx), and a change asked
  // for from the keyboard moves focus to it, so a screen reader announces the new page rather than
  // staying on the link. The address's #target (/live#watch, /demo#break) is scrolled into view, on a
  // fresh load and after a link to it, for the pointer and the keyboard alike: the window went to the
  // top first, and a lazy page draws after the browser's own jump. #id=… (/live's watched identity)
  // names no element: its place is the watch. Focus goes to that target if the page has one, else to
  // the page's h1, without scrolling again.
  const main = useRef(null);
  const firstLoad = useRef(true);
  useLayoutEffect(() => {
    document.title = TITLES[Page === NotFound ? '' : path];
    const focus = takeFocusRequest();
    const toHash = takeHashRequest() || firstLoad.current;
    firstLoad.current = false;
    const ready = () => {
      pageReady();
      const hash = window.location.hash.slice(1);
      const hashTarget = !hash ? null : hash.startsWith('id=') ? document.getElementById('watch') : document.getElementById(hash);
      if (hashTarget && toHash) {
        hashTarget.scrollIntoView();
        // Firefox puts the window back at the top when the new page grows above the target while a
        // view transition is drawn (the indexer's answer, say): again once it is over, unless the
        // reader has scrolled since.
        afterRouteChange(() => { if (hashTarget.isConnected && window.scrollY === 0) hashTarget.scrollIntoView(); });
      }
      // (a page whose contract did not load before it drew its h1, /demo's, has only the line that says so)
      const target = focus && (hashTarget || main.current.querySelector('h1') || main.current.querySelector('.load-failed'));
      if (!target) return;
      // a heading or a section: focusable from script only (a control keeps its place in the tab order)
      if (target.tabIndex < 0) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    };
    const loading = () => main.current.querySelector('.loading, .page-loading') !== null;
    if (!loading()) { ready(); return undefined; }
    const watch = new MutationObserver(() => { if (!loading()) { watch.disconnect(); ready(); } });
    watch.observe(main.current, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [path]);

  // The landing is laid out on a wider frame than the app's pages; the header and footer follow it.
  const route = path === '/' ? 'home' : undefined;

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site frame" ref={header} data-route={route}>
        <Link to="/" className="brand" aria-label="Lantern home">
          <CompactLockup capHeight={17} className="lockup" />
          <Mark size={32} className="mark-alone" />
        </Link>
        <nav aria-label="Primary">
          {NAV.map(([to, label, only]) => (
            <Link key={to} to={to} className={only ? `nav ${only}` : 'nav'} aria-current={path === to ? 'page' : undefined}>
              {label}
              {path === to && <span className="wick" aria-hidden="true" />}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" ref={main}>
        {/* On the page's frame, as the page's own first state will be, a page tall (motion.css), so the
            footer waits below the fold. A route change holds the old page rather than show it; a direct
            load, or a chunk slower than the hold, shows it. */}
        <ChunkBoundary resetKey={path} fallback={PAGE_FAILED}>
          <Suspense fallback={<div className="page page-loading">{LOADING[path] && <p className="loading">{LOADING[path]}</p>}</div>}>
            <Page />
          </Suspense>
        </ChunkBoundary>
      </main>
      <footer className="site frame grid" data-route={route}>
        <p className="footer-lockup"><CompactLockup capHeight={17} className="lockup" title="Lantern" /></p>
        <div className="footer-lines">
          <p>Social recovery for Midnight private state · <span className="nowrap">Midnight Korea Hackathon 2026</span></p>
          {/* A plain link, not the app's: the browser fetches the file (web/public, made by scripts/notices.mjs). */}
          <p className="colophon"><span>Apache-2.0</span> · <a href="/THIRD-PARTY-NOTICES.txt">third-party licences</a> · <span>Compact 0.31.1</span> · <span>compact-runtime 0.16.0</span></p>
          <p>Source code: <a href="https://github.com/OoJae/lantern">github.com/OoJae/lantern</a> · <Link to="/brand" aria-current={path === '/brand' ? 'page' : undefined}>Brand kit</Link></p>
          <p><Link to="/live" aria-current={path === '/live' ? 'page' : undefined}>On Preprod</Link> · <Link to="/rehearse" aria-current={path === '/rehearse' ? 'page' : undefined}>Rehearse a recovery</Link> · <Link to="/kit" aria-current={path === '/kit' ? 'page' : undefined}>Recovery kits</Link></p>
          <p className="fiction">The people in the story are fictional.</p>
        </div>
      </footer>
    </>
  );
}
