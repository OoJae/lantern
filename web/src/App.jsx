import { lazy, Suspense } from 'react';
import { Link, usePath } from './lib/router.jsx';
import Landing from './pages/Landing.jsx';
import About from './pages/About.jsx';

// The two pages that run circuits are split out, so the landing page never loads the runtime.
const Demo = lazy(() => import('./pages/Demo.jsx'));
const Attacks = lazy(() => import('./pages/Attacks.jsx'));

const NAV = [['/demo', 'The recovery'], ['/attacks', 'Attack it'], ['/about', 'What is real']];

export default function App() {
  const path = usePath().replace(/\/+$/, '') || '/';
  const Page = { '/': Landing, '/demo': Demo, '/attacks': Attacks, '/about': About }[path] ?? NotFound;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site">
        <Link to="/" className="brand" aria-label="Lantern home">
          <LanternMark />
          <span>Lantern</span>
        </Link>
        <nav aria-label="Primary">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} className="nav" aria-current={path === to ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
      </header>
      <main id="main">
        <Suspense fallback={<p className="loading">Loading the contract…</p>}>
          <Page />
        </Suspense>
      </main>
      <footer className="site">
        <p>Lantern · social recovery for Midnight private state · Midnight Korea Hackathon 2026</p>
        <p>Apache-2.0. Built on Compact 0.31.1 and compact-runtime 0.16.0.</p>
        <p>Source code: <a href="https://github.com/OoJae/lantern">github.com/OoJae/lantern</a></p>
      </footer>
    </>
  );
}

function NotFound() {
  return (
    <section className="page narrow">
      <h1>Nothing here</h1>
      <p><Link to="/">Back to the start</Link></p>
    </section>
  );
}

export function LanternMark({ className = 'mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M12 6h8l-1 3h-6z" />
      <rect x="10" y="9.5" width="12" height="14" rx="3" className="frame" />
      <circle cx="16" cy="16.5" r="3.2" className="flame" />
      <path d="M12 26h8" className="base" />
    </svg>
  );
}
