// The landing page: "Night watch". One job: make a visitor understand the sentence, feel the loss,
// and press "Watch a recovery".
//
// section.night holds two things in one grid cell:
//  - the stage: sticky, one large viewport tall, aria-hidden and deaf to the pointer. It shows the
//    lantern: the poster (an inline SVG, ../landing/LanternPoster.jsx) and the WebGL scene
//    (../landing/scene/lantern-scene.js), which draws into .canvas-host and fades in over it;
//  - the story: eight text blocks in the page's own flow ([data-step] 0 to 7), always real DOM, never
//    faded. The tracker (../landing/tracker.js) reads their centres as the page scrolls and writes
//    data-stage on the section; the poster's layers follow it.
//
// data-scene says what draws the lantern: pending (the poster, while the scene would load),
// webgl, poster (no WebGL, or the scene failed), or still (reduced motion: no stage, no tracker, no
// three.js; each block is followed by its pictogram, like an illustrated essay).
//
// Text reveals (styles/landing.css) are clip-path and transform only, and only under html.motion
// (main.jsx), so without script, in print and under reduced motion every word is simply there.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { afterRouteChange, Link } from '../lib/router.jsx';
import LanternPoster from '../landing/LanternPoster.jsx';
import { createTracker } from '../landing/tracker.js';

// The pictograms are drawn below the fold (and in the stacked story), never in the first paint: they
// load as a chunk of their own after it, into boxes CSS has already sized, so nothing moves. So does
// everything after "Now watch the contract do it" (the designs, the facts, what is real): far below
// the first screen, and out of the first load's budget.
const Pictogram = lazy(() => import('../brand/Pictogram.jsx'));
const AfterStory = lazy(() => import('../landing/AfterStory.jsx'));

const REDUCE = '(prefers-reduced-motion: reduce)';
const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCE).matches);

// Each [data-reveal] block under root that matches selector unmasks once, the first time it comes
// into view: it gets data-shown. styles/landing.css does nothing with either attribute unless
// html.motion is set (main.jsx), so without motion every word is simply there. Returns the
// disconnect function. Without IntersectionObserver every block opens at once.
function observeReveals(root, selector) {
  if (typeof IntersectionObserver === 'undefined') {
    root.querySelectorAll(selector).forEach((el) => el.setAttribute('data-shown', ''));
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.setAttribute('data-shown', '');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  root.querySelectorAll(selector).forEach((el) => io.observe(el));
  return () => io.disconnect();
}

// Links carry their arrow as an aria-hidden span, so the name read out is the words alone.
const Arrow = ({ down }) => <span className="arrow" aria-hidden="true">{down ? '↓' : '→'}</span>;

// The seven blocks after the hero, in story order (design-spec, "The landing page"). Block 3 is the
// blackout, drawn apart.
const CHAPTERS = [
  {
    kicker: '01 · Thirty days earlier',
    title: <>Seal the <em>secret.</em></>,
    body: 'Hana’s identity secret lives on her laptop: a flame on one device. Of that secret, the public record keeps only a seal, a commitment that nothing but the same secret opens. A second secret, for vetoes, goes on a card she keeps apart.',
    art: '01-seal',
  },
  {
    kicker: '02 · Three guardians',
    title: <>Give three people one <em>light</em> each.</>,
    body: <>She splits the secret into three shares, one each for <span className="nowrap">Seo-yeon</span>, Mum and Jihoon. Any two rebuild it; one alone reveals nothing. The public record holds a salted commitment for each guardian and the rule, two of three. It never says who they are.</>,
    art: '02-three-lights',
  },
  { blackout: true, kicker: '03 · Loss', title: <>The laptop is <em>gone.</em></>, art: '03-dark' },
  {
    kicker: '04 · A new phone',
    title: <>Ask for the light <em>back.</em></>,
    body: <>Her new phone holds no secret yet. Anyone can open a recovery for it. <span className="nowrap">Seo-yeon</span> and Mum check the phone’s fingerprint, then approve. The record gains two opaque nullifiers and a count of two, but not who gave them.</>,
    links: [['/demo?beat=4', 'Run beat 4']],
    art: '04-return',
  },
  {
    kicker: '05 · Seventy-two hours',
    title: <>Wait in plain <em>sight.</em></>,
    body: 'Every recovery waits 72 hours where anyone can see it. When Jihoon turns and opens one of his own, Hana’s veto card cancels it. He can act as her until her recovery finishes, but he can’t veto, or add or remove guardians: those need the card.',
    links: [['/demo?beat=7', 'Run beat 7']],
    art: '05-window',
  },
  {
    kicker: '06 · The right one',
    title: <>Prove it’s the right <em>one.</em></>,
    body: 'Once the wait is over, the phone rebuilds the secret from two shares and proves, in a zero-knowledge circuit, that it opens the original seal. Change one byte of one share and the secret no longer fits: the contract refuses it.',
    links: [['/demo?beat=8', 'Run beat 8'], ['/demo#break', 'Tamper with a share yourself']],
    art: '06-lock',
  },
  {
    kicker: '07 · The DApp never noticed',
    title: <>The apps never <em>notice.</em></>,
    body: 'A DApp stores one value, Hana’s identity root, and asks whether the caller is its current owner. The recovery retires the old secret there too, and the DApp has nothing to update.',
    art: '07-apps',
  },
];

// What the public record holds after each stage: the stage's ledger strip (storyboard). Stage 0 has
// none; the blackout (3) leaves stage 2's standing.
const LEDGER = [
  null,
  'identity commitments 1 · veto commitment 1',
  'guardian leaves 3 · threshold 2',
  'guardian leaves 3 · threshold 2',
  'recoveries opened 1 · approvals 2 of 2',
  'timelock 72 h · vetoed recoveries 1',
  'finalized · old commitment retired',
  'identity root unchanged',
];

function Ctas({ className = '' }) {
  return (
    <div className={`cta ${className}`.trim()}>
      <Link to="/demo" className="button primary">Watch a recovery <Arrow /></Link>
      <Link to="/demo#break" className="button">Try to break it</Link>
    </div>
  );
}

function Chapter({ chapter, step, still }) {
  const { kicker, title, body, links, art, blackout } = chapter;
  return (
    <div className={`chapter${blackout ? ' blackout' : ''}`} data-step={step}>
      <div className="chapter-text" data-text-safe="" data-reveal="">
        <p className="kicker rv">{kicker}</p>
        <h2 className="rv">{title}</h2>
        {blackout ? (
          <>
            <figure className="quote rv">
              <blockquote><p>“You cannot recover a witness secret from the chain.”</p></blockquote>
              <figcaption>— Midnight’s security guide</figcaption>
            </figure>
            <p className="rv">A wallet seed restores keys, not private state. The identity went with the laptop.</p>
          </>
        ) : (
          <p className="rv">{body}</p>
        )}
        {links && (
          <p className="chapter-links rv">
            {links.map(([to, label], i) => (
              <span key={to}>
                {i > 0 && <span className="sep" aria-hidden="true"> · </span>}
                <Link to={to}>{label}<Arrow /></Link>
              </span>
            ))}
          </p>
        )}
      </div>
      {still && (
        <div className="chapter-art" aria-hidden="true">
          <Suspense fallback={null}><Pictogram name={art} className="pictogram" /></Suspense>
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const rootRef = useRef(null);
  const sectionRef = useRef(null);
  const hostRef = useRef(null);
  const [mode, setMode] = useState(() => (reducedMotion() ? 'still' : 'pending'));
  const still = mode === 'still';

  // Reduced motion can change while the page is open: follow it.
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCE);
    if (!mq?.addEventListener) return undefined;
    const follow = () => setMode((m) => (mq.matches ? 'still' : m === 'still' ? 'pending' : m));
    mq.addEventListener('change', follow);
    return () => mq.removeEventListener('change', follow);
  }, []);

  // The story's clock: the tracker writes data-stage on the section. Then, once the hero has landed
  // (any route change that brought the page finished, and its lines risen: 640ms, the last one
  // 280ms late) and at idle, the WebGL scene loads (a chunk of its own, three.js inside it: never on
  // the first load) and fades in over the poster once its first frame is up. Until then the poster
  // is the lantern: the words rise, then the lantern comes alive, one thing after the other, and
  // the scene's setup never lands in the middle of the reveal. If it cannot run (no WebGL2, a
  // shader that fails, a lost context, a device too slow for it), it has already torn itself down
  // when it says so, and the poster stays: data-scene poster.
  useEffect(() => {
    if (still) return undefined;
    const section = sectionRef.current;
    const tracker = createTracker(section);
    const ac = new AbortController();
    const poster = () => ac.signal.aborted || setMode('poster');
    let scene = null;
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1));
    const cancelIdle = window.cancelIdleCallback ?? clearTimeout;
    let idleId = null;
    let wait = 0;
    const load = async () => {
      try {
        const { createLanternScene } = await import('../landing/scene/lantern-scene.js');
        if (ac.signal.aborted) return;
        // Resolves after the scene's first frame, or at once (a no-op) when it could not start,
        // having called onFail first: then the mode is already poster and stays so.
        scene = await createLanternScene({ host: hostRef.current, tracker, tier: 'auto', onFail: poster, signal: ac.signal });
        if (!ac.signal.aborted) setMode((m) => (m === 'pending' ? 'webgl' : m));
      } catch {
        poster();
      }
    };
    const cancelRoute = afterRouteChange(() => {
      wait = setTimeout(() => { idleId = idle(load, { timeout: 1500 }); }, 1000);
    });
    return () => {
      // StrictMode runs this between its two mounts: a scene still setting up hears the abort and
      // tears itself down; one already drawing is disposed (its context released, its canvas gone).
      ac.abort();
      cancelRoute();
      clearTimeout(wait);
      if (idleId != null) cancelIdle(idleId);
      scene?.dispose();
      tracker.dispose();
      section.removeAttribute('data-stage');
    };
  }, [still]);

  // Each text block unmasks once, the first time it comes into view (CSS does nothing with this
  // unless html.motion is set).
  useEffect(() => {
    if (still) return undefined;
    const root = rootRef.current;
    const disconnect = observeReveals(root, '.story [data-reveal]:not(.hero [data-reveal]), .after [data-reveal]');
    // The hero is the first screen, down to its foot on the fold: it all opens on arrival, a frame
    // after its masked state is first drawn. Arriving by a route change, it waits for the change to
    // finish: the page is revealed (the lantern already hanging in it), then its lines rise.
    let raf = 0;
    const cancel = afterRouteChange(() => {
      raf = requestAnimationFrame(() => {
        root.querySelectorAll('.hero [data-reveal]').forEach((el) => el.setAttribute('data-shown', ''));
      });
    });
    return () => { cancel(); cancelAnimationFrame(raf); disconnect(); };
  }, [still]);

  return (
    <div className="landing" ref={rootRef}>
      <section className="night" ref={sectionRef} data-scene={mode} aria-labelledby="landing-title">
        {!still && (
          <div className="stage" aria-hidden="true">
            <LanternPoster />
            <div className="canvas-host" ref={hostRef} />
            <p className="ledger-strip" data-text-safe="">
              {LEDGER.map((line, i) => line && <span key={i} data-at={i}>{line}</span>)}
            </p>
          </div>
        )}

        <div className="story">
          <div className="chapter hero" data-step="0">
            {still && (
              <div className="hero-poster" aria-hidden="true"><LanternPoster stage={0} /></div>
            )}
            <div className="hero-text" data-text-safe="" data-reveal="">
              <p className="eyebrow rv">
                <span lang="ko">등불</span><span className="eyebrow-rule" aria-hidden="true" /> Social recovery for Midnight private state
              </p>
              <h1 id="landing-title">
                <span className="rv">Lose the device.</span> <span className="rv">Keep the <em>identity.</em></span>
              </h1>
              <p className="lede rv">
                Lantern lets hidden guardians restore a lost Midnight identity secret, and proves it is the right one.
              </p>
              <Ctas className="rv" />
            </div>
            <div className="hero-foot" data-text-safe="" data-reveal="">
              <p className="scroll-cue rv">Scroll to follow the light</p>
              <a className="skip-story rv" href="#after-story">Skip the story <Arrow down /></a>
            </div>
          </div>

          {CHAPTERS.map((c, i) => <Chapter key={c.kicker} chapter={c} step={i + 1} still={still} />)}
        </div>
      </section>

      <section id="after-story" className="after" aria-labelledby="after-title">
        <div className="after-text" data-reveal="">
          <h2 id="after-title" className="rv">Now watch the contract <em>do it.</em></h2>
          <p className="rv">
            The demo runs all 74 steps of this story with Lantern’s compiled contract, in your browser: no wallet,
            no chain, no proofs. Every accept and every refusal is the contract’s own.
          </p>
          <Ctas className="rv" />
        </div>
      </section>

      <Suspense fallback={null}><AfterStory reveal={observeReveals} /></Suspense>
    </div>
  );
}
