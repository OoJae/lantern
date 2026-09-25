import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, usePath } from './lib/router.jsx';
// The brand kit's own files, each imported directly: the header is in the entry chunk, and these
// carry only the mark and the wordmark's outlines (not 등불, the seal or the pictograms).
import { CompactLockup } from './brand/CompactLockup.jsx';
import { LanternMark as Mark } from './brand/LanternMark.jsx';
import Landing from './pages/Landing.jsx';
import About from './pages/About.jsx';

// The two pages that run circuits are split out, so the landing page never loads the runtime. The
// brand kit and the 404 are split out too: they draw the seal, the pictograms and 등불, which the
// first load never needs.
const Demo = lazy(() => import('./pages/Demo.jsx'));
const Attacks = lazy(() => import('./pages/Attacks.jsx'));
const Brand = lazy(() => import('./pages/Brand.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const PAGES = { '/': Landing, '/demo': Demo, '/attacks': Attacks, '/about': About, '/brand': Brand };
// What a lazy page says while it loads: nothing, where there is nothing worth saying.
const LOADING = { '/demo': 'Loading the contract…', '/attacks': 'Loading the contract…', '/brand': 'Opening the brand kit…' };

const NAV = [['/demo', 'The recovery'], ['/attacks', 'Attack it'], ['/about', 'What is real']];

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
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} className="nav" aria-current={path === to ? 'page' : undefined}>
              {label}
              {path === to && <span className="wick" aria-hidden="true" />}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main">
        {/* On the page's frame, as the page's own first state will be: a route change reveals it. */}
        <Suspense fallback={<div className="page">{LOADING[path] && <p className="loading">{LOADING[path]}</p>}</div>}>
          <Page />
        </Suspense>
      </main>
      <footer className="site frame grid" data-route={route}>
        <p className="footer-lockup"><CompactLockup capHeight={17} className="lockup" title="Lantern" /></p>
        <div className="footer-lines">
          <p>Social recovery for Midnight private state · <span className="nowrap">Midnight Korea Hackathon 2026</span></p>
          <p className="colophon"><span>Apache-2.0</span> · <span>Compact 0.31.1</span> · <span>compact-runtime 0.16.0</span></p>
          <p>Source code: <a href="https://github.com/OoJae/lantern">github.com/OoJae/lantern</a> · <Link to="/brand">Brand kit</Link></p>
          <p className="fiction">The people in the story are fictional.</p>
        </div>
      </footer>
    </>
  );
}
