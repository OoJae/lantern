// /brand: Lantern's brand kit, as a page (design spec, "Other pages: /brand"). Lazy (App.jsx):
// nothing here is in the first load.
//
// It cannot drift from the site it describes. Every drawing comes from the same data as the files
// it offers (src/brand/); every colour, curve, duration and type size is read from the stylesheet
// the site runs on; every contrast ratio is worked out here, in the browser, from those values; and
// the downloads are listed from the manifest brand.mjs writes beside the files (src/brand/kit.js).
//
// Motion, one thing at a time and all of it finite: the lockup's construction lines draw in once
// the page has arrived; the seal stamps when pressed; a curve plays when asked. Under reduced
// motion each arrives at once.
import { lazy, Suspense, useRef, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { LanternMark } from '../brand/LanternMark.jsx';
import { CompactLockup } from '../brand/CompactLockup.jsx';
import { Lockup } from '../brand/Lockup.jsx';
import { Seal } from '../brand/Seal.jsx';
import { WORDMARK } from '../brand/glyphs.js';
import { HANGUL } from '../brand/hangul.js';
import { KIT } from '../brand/kit.js';
import { LOCKUP, lockupNodes } from '../brand/lockup.js';
import { MARK, flamePath, markNodes } from '../brand/marks.js';
import { SEAL } from '../brand/seal.js';
import { renderNodes } from '../brand/render.js';
import '../styles/brand-page.css';

// The pictograms are the landing's lazy chunk, far down this page. (Loading a chunk the way /demo and
// /attacks do also keeps the router in the chunk they share, rather than a first-load chunk of its own.)
const Pictogram = lazy(() => import('../brand/Pictogram.jsx'));

// ---- what the stylesheet says ------------------------------------------------------------------

const COLOURS = [
  ['night', 'Night', 'The page.'],
  ['hanji', 'Hanji', 'Ink, the primary button, accepted chips.'],
  ['ash', 'Ash', 'Muted text, eyebrows, meta. Never over the scene.'],
  ['ember', 'Ember', 'The flame, and nothing else.'],
  ['lacquer', 'Lacquer', 'Raised surfaces: panels, cards, tables, code.'],
  ['rib', 'Rib', 'Hairlines. Never the only edge of a control.'],
];
const DERIVED = [
  ['edge', 'Edge', 'Control outlines: Hanji at 42% over Night.'],
  ['muted-on-paper', 'Muted on paper', 'Muted text inside a Hanji scope.'],
  ['ember-deep', 'Ember deep', 'The flame on paper. The brand kit only.'],
  ['hanji-hover', 'Hanji, hovered', 'The primary button under the pointer.'],
];
// [foreground, ground, what the pair is for]
const PAIRS = [
  ['hanji', 'night', 'text'],
  ['hanji', 'lacquer', 'text'],
  ['ash', 'night', 'text'],
  ['ash', 'lacquer', 'text'],
  ['night', 'hanji', 'text'],
  ['night', 'hanji-hover', 'text'],
  ['muted-on-paper', 'hanji', 'text'],
  ['night', 'ember', 'text'],
  ['ember', 'night', 'graphic'],
  ['ember', 'lacquer', 'graphic'],
  ['ember-deep', 'hanji', 'graphic'],
  ['edge', 'night', 'control'],
  ['edge', 'lacquer', 'control'],
  ['ember', 'hanji', 'never'],
];
const USE = {
  text: ['Text', 'at least 4.5:1'],
  graphic: ['The flame', 'drawn, never set as text'],
  control: ['Control outlines', 'at least 3:1'],
  never: ['Never', 'side by side'],
};
const EASES = [
  ['settle', 'Arrivals and reveals.'],
  ['carry', 'Things that travel: the nav’s wick, the page change.'],
  ['snuff', 'Exits and dimming.'],
  ['ignite', 'The one overshoot: press-release, the stamp, the lock.'],
  ['press', 'A pointer going down.'],
];
const DURATIONS = ['press', 'hover', 'stamp', 'release', 'card', 'route', 'reveal', 'lock'];
const STEPS = [
  ['6', 'The landing’s h1', 'identity.', 'display-italic'],
  ['5', 'A story block’s h2', 'Seal the secret.', 'display'],
  ['4', 'A page’s h1', 'Brand kit', 'display'],
  ['3', 'A section’s h2', 'How it holds', 'display'],
  ['2', 'Panel titles; the clock, in mono', 'Simulated clock', 'display'],
  ['1', 'The lede, captions', 'Keep the identity.', 'sans'],
  ['0', 'Body text', 'Any two rebuild it; one alone reveals nothing.', 'sans'],
  ['-1', 'Meta, the nav, chips', 'Runs in your browser', 'sans'],
  ['-2', 'Eyebrows and labels', 'Social recovery', 'label'],
];
const ROOT_NAMES = [
  ...COLOURS.map(([k]) => k),
  ...DERIVED.map(([k]) => k),
  ...EASES.map(([k]) => `ease-${k}`),
  ...DURATIONS.map((k) => `dur-${k}`),
  'stagger-line',
  'stagger-card',
  ...STEPS.map(([k]) => `step-${k}`),
];

// The values as written in tokens.css. The built stylesheet is minified (#FF8A3D becomes #ff8a3d,
// 0.16 becomes .16, 160ms becomes .16s): each is put back in the form the spec and tokens.css use.
const tidy = {
  hex: (v) => v.toUpperCase(),
  number: (v) => v.replace(/(^|[^\d])\.(\d)/g, '$10.$2'),
  ms: (v) => `${Math.round(v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000)}ms`,
};
function readRoot() {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(ROOT_NAMES.map((n) => {
    const v = cs.getPropertyValue(`--${n}`).trim();
    if (v.startsWith('#')) return [n, tidy.hex(v)];
    if (/^(dur|stagger)-/.test(n)) return [n, tidy.ms(v)];
    return [n, tidy.number(v)];
  }));
}

// WCAG 2 relative luminance and contrast ratio, from #rrggbb.
function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// A CSS easing as points on its curve: cubic-bezier() sampled, linear() as its own stops.
function easePoints(value) {
  const bez = value.match(/^cubic-bezier\(([^)]+)\)$/);
  if (bez) {
    const [x1, y1, x2, y2] = bez[1].split(',').map(Number);
    const at = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    return Array.from({ length: 49 }, (_, i) => [at(i / 48, x1, x2), at(i / 48, y1, y2)]);
  }
  const lin = value.match(/^linear\((.+)\)$/);
  if (!lin) return [[0, 0], [1, 1]];
  const stops = lin[1].split(',').map((s) => s.trim().split(/\s+/)).map(([y, x]) => [x ? parseFloat(x) / 100 : null, Number(y)]);
  stops[0][0] ??= 0;
  stops[stops.length - 1][0] ??= 1;
  // a stop with no position sits halfway between its neighbours'
  for (let i = 1; i < stops.length - 1; i += 1) stops[i][0] ??= (stops[i - 1][0] + (stops[i + 1][0] ?? 1)) / 2;
  return stops;
}

// clamp(a rem, …, b rem) as "a–b px"
function stepRange(value) {
  const m = value.match(/clamp\(\s*([\d.]+)rem.*,\s*([\d.]+)rem\s*\)$/);
  if (!m) return '';
  const px = (r) => String(Math.round(Number(r) * 16 * 10) / 10);
  return `${px(m[1])}–${px(m[2])}`;
}

// Korean in running text: set in Lantern KR (styles.css, :lang(ko)), never a system face.
const Ko = ({ children }) => <span lang="ko">{children}</span>;

const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const deg = '°';

// ---- the page --------------------------------------------------------------------------------------

const SECTIONS = [
  ['mark', 'The mark'],
  ['lockups', 'Wordmark and lockups'],
  ['colour', 'Colour'],
  ['type', 'Type'],
  ['seal', 'The seal'],
  ['motion', 'Motion'],
  ['voice', 'Voice'],
  ['downloads', 'Downloads'],
];

export default function Brand() {
  const [css] = useState(readRoot);
  return (
    <section className="page brand-kit">
      <header className="bk-top">
        <div className="bk-intro">
          <p className="eyebrow">The brand, and every file of it</p>
          <h1>Brand <em>kit</em></h1>
          <p className="lede">
            A hanji lantern glowing in midnight dark. The flame is the secret, the paper round it is everything that keeps
            it private, and the ground below is the public record.
          </p>
          <p className="bk-note">
            Every drawing here comes from one set of path data, so this page, the files and the 3D scene agree to the unit.
          </p>
        </div>
        <nav className="bk-contents" aria-label="On this page">
          <ol>
            {SECTIONS.map(([id, title], i) => (
              <li key={id}><a href={`#${id}`}><span className="bk-contents-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{title}</a></li>
            ))}
          </ol>
        </nav>
      </header>

      <HeroPlate />
      <Rules />

      <Section n={1} id="mark" title={<>The <em>mark</em></>} dek="A lantern on a 24-unit grid. The cap keeps the rain off, the body is the paper, the flame is the secret.">
        <Construction />
        <h3>Sizes</h3>
        <p>
          Below 24px the mark is redrawn on its own 16px grid, so every edge lands on a whole pixel: no hook, no eave. The eave
          comes in at 32px and the hook at 48px. <code>LanternMark</code> picks the drawing from the size.
        </p>
        <Sizes />
        <h3>Variants</h3>
        <Variants />
        <p className="bk-never">
          Never add a moon or a crescent (Midnight is the network’s brand), recolour the flame, fill the body, or set the mark
          on Ember.
        </p>
      </Section>

      <Section n={2} id="lockups" title={<>Wordmark and <em>lockups</em></>} dek="“Lantern” in Fraunces at its largest optical size, outlined, with two changes to the type.">
        <WordmarkFigure />
        <h3>Lockups</h3>
        <p>
          The primary lockup sets the mark, the wordmark and <Ko>등불</Ko> on one construction: the flame on the x-height’s centre,
          the cap on the cap line, <Ko>등</Ko> hanging from the ascender. It is for the social card, this page, the README and the video’s
          end card, never the site header. Clear space is 1H all round, where H is the wordmark’s cap height.
        </p>
        <ClearSpace />
        <Lockups />
        <h3><Ko>등불</Ko></h3>
        <Deungbul />
      </Section>

      <Section n={3} id="colour" title={<><em>Colour</em></>} dek="Six tokens, each with one job. The values are read from this page’s own stylesheet, and every ratio is worked out in your browser.">
        <Swatches css={css} />
        <h3>Contrast</h3>
        <ContrastTable css={css} />
        <p className="bk-never">Never set Ash over the 3D scene, and never put Ember on Hanji or Hanji on Ember.</p>
      </Section>

      <Section n={4} id="type" title={<><em>Type</em></>} dek="Four families in five files, all under the SIL Open Font License, served from this site under our own names.">
        <Families />
        <h3>The scale</h3>
        <p>Nine steps, fluid from a 360px window to a 1440px one. The display type grows from 40 to 144px while body text grows only from 16 to 17.</p>
        <Scale css={css} />
        <p className="bk-meta">
          Licences: <a href="/fonts/OFL-Fraunces.txt">Fraunces</a> · <a href="/fonts/OFL-InstrumentSans.txt">Instrument Sans</a> ·{' '}
          <a href="/fonts/OFL-FragmentMono.txt">Fragment Mono</a> · <a href="/fonts/OFL-GowunBatang.txt">Gowun Batang</a>
        </p>
      </Section>

      <Section n={5} id="seal" title={<>The <em>seal</em></>} dek="The commitment, drawn as a round seal: a nod to the Korean dojang. Its inner edge is cut like a key, and only the right flame fits.">
        <SealStates />
        <SealPress />
        <h3>Pictograms</h3>
        <p>
          Built from the mark’s parts on a 48-unit grid. The ledger is one unbroken line: what is public rests on it, what is
          private floats clear of it, and names never touch it.
        </p>
        <Pictograms />
      </Section>

      <Section n={6} id="motion" title={<><em>Motion</em></>} dek="Five curves and eight durations. Every animation ends, and under reduced motion every state arrives at once.">
        <Eases css={css} />
        <h3>Durations</h3>
        <Durations css={css} />
        <h3>Staggers</h3>
        <p>
          Lines follow each other {css['stagger-line']} apart, five at most; cards {css['stagger-card']} apart, six at most, and
          none when a batch has more than eight. Never word by word. Text is revealed with a mask and a rise, never faded.
        </p>
      </Section>

      <Section n={7} id="voice" title={<><em>Voice</em></>} dek="Calm, warm, a little wry. Plain verbs, concrete nouns, and exactly what runs where.">
        <Voice />
      </Section>

      <Section n={8} id="downloads" title={<><em>Downloads</em></>} dek="Drawn from the same data as this page. No SVG carries a style, so each one opens under the strictest content policy.">
        <Downloads />
        <p className="bk-meta">
          The full guide, with the reasons behind every departure from the drawings’ first spec, is{' '}
          <a href="https://github.com/OoJae/lantern/blob/main/brand/README.md"><code>brand/README.md</code></a>. See it all at
          work in <Link to="/demo">the recovery</Link>.
        </p>
      </Section>
    </section>
  );
}

function Section({ n, id, title, dek, children }) {
  return (
    <section className="bk-section" id={id} aria-labelledby={`${id}-title`}>
      <header className="bk-head">
        <p className="bk-num" aria-hidden="true">{String(n).padStart(2, '0')}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p className="bk-dek">{dek}</p>
      </header>
      <div className="bk-body">{children}</div>
    </section>
  );
}

// ---- the lockup on its construction lines ---------------------------------------------------------

function HeroPlate() {
  const L = lockupNodes({ kind: 'primary', variant: 'primary', detail: 'hook', hangul: HANGUL });
  const [, y0, w, h] = L.viewBox.split(' ').map(Number);
  const pad = 0.3 * LOCKUP.H;
  const top = y0 - pad;
  const height = h + 2 * pad;
  const width = w / 0.7; // the lockup takes 70% of the plate; the lines run on to its right edge
  const at = (y) => `${(((y - top) / height) * 100).toFixed(3)}%`;
  const lines = [
    ['ascender', -WORDMARK.ascender, 'ascender · cap height, H', 'above'],
    ['cap', -WORDMARK.capHeight, null, 'below'],
    ['x', -WORDMARK.xHeight, 'x-height', 'above'],
    ['centre', -WORDMARK.xHeight / 2, 'x-height centre: the flame', 'above'],
    ['base', 0, 'baseline', 'above'],
  ];
  return (
    <figure className="bk-hero" aria-labelledby="bk-hero-cap">
      <div className="bk-hero-plate">
        <svg viewBox={`0 ${top} ${width} ${height}`} className="bk-hero-lockup" role="img" aria-label="Lantern 등불, the primary lockup">
          {renderNodes(L.nodes)}
        </svg>
        <div className="bk-guides" aria-hidden="true">
          {lines.map(([k, y, label, side]) => (
            <span key={k} className="bk-guide" data-line={k} data-side={side} style={{ '--y': at(y) }}>
              {label && <span className="bk-guide-label">{label}</span>}
            </span>
          ))}
        </div>
      </div>
      <figcaption id="bk-hero-cap" className="bk-caption">
        The primary lockup on its construction. The mark’s flame sits on the x-height’s centre and its cap on the cap line;{' '}
        <Ko>등불</Ko> hangs from the ascender, 0.5H after the n.
      </figcaption>
    </figure>
  );
}

function Rules() {
  const rules = [
    ['Ember is the flame.', 'The only accent, and only where the secret or its light is: the mark’s flame, the scene’s flames and shares, the demo’s share dots, the current beat, the design that held, and the lock. Never on buttons, links, focus rings or decoration.'],
    ['Above the line is private, on the line is public.', 'What is private floats: the flame, the shares, the veto card. What the public record holds lies flat on one horizon, the ledger: the seal, the guardian leaves, the nullifiers, the counts. Names never touch the line.'],
    ['One moving thing at a time.', 'Beyond the flame’s flicker, only one group moves at any moment.'],
  ];
  return (
    <section className="bk-rules" aria-labelledby="bk-rules-title">
      <h2 id="bk-rules-title" className="bk-rules-title">Three <em>rules</em></h2>
      <ol>
        {rules.map(([title, body], i) => (
          <li key={title}>
            <span className="bk-numeral" aria-hidden="true">{['I', 'II', 'III'][i]}</span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- 01 the mark -----------------------------------------------------------------------------------

function Construction() {
  const m = markNodes({ variant: 'primary', detail: 'hook' });
  const grid = [];
  for (let i = 0; i <= 24; i += 1) {
    grid.push(<line key={`v${i}`} x1={i} y1={0} x2={i} y2={24} />, <line key={`h${i}`} x1={0} y1={i} x2={24} y2={i} />);
  }
  const { hook, body, foot } = MARK;
  const parts = [
    ['hook', 'Hook', `A ring of radius ${hook.r}u at (12, 2), a ${hook.strokeWidth}u stroke, joined to the cap by a collar. From 48px.`],
    ['cap', 'Cap', 'A trapezoid, 10u across the top and 12u below, its lower tips lifted 0.5u: a roof eave. The eave from 32px.'],
    ['body', 'Body', `${body.width} × ${body.height}u, corner radius ${body.rx}u, a ${body.strokeWidth}u stroke, open: the paper.`],
    ['flame', 'Flame', 'A teardrop 3.5 × 6.5u centred at (12, 12.75), its tip leaning 0.3u right. The only Ember.'],
    ['foot', 'Foot', `${foot.width} × ${foot.height}u, fully rounded, joined to the body along its straight bottom.`],
  ];
  return (
    <figure className="bk-construct">
      <div className="bk-construct-art">
        <svg viewBox="-0.5 -0.5 25 25" aria-hidden="true">
          <g className="bk-grid">{grid}</g>
          <rect className="bk-margin" x={1} y={1} width={22} height={22} />
          <g className="bk-axes">
            <line x1={12} y1={-0.5} x2={12} y2={24.5} />
            <line x1={-0.5} y1={12.75} x2={24.5} y2={12.75} />
          </g>
          <g className="bk-construct-mark">{renderNodes(m.nodes)}</g>
        </svg>
      </div>
      <figcaption>
        <ol className="bk-parts">
          {parts.map(([k, name, text]) => (
            <li key={k} data-part={k}>
              <span className="bk-part-name">{name}</span>
              <span className="bk-part-text">{text}</span>
            </li>
          ))}
        </ol>
        <p className="bk-caption">The grid is 24 units with a 1u margin (dashed). The flame’s centre sits on the axes.</p>
      </figcaption>
    </figure>
  );
}

function Sizes() {
  const sizes = [[16, 'optical'], [24, 'grid'], [32, 'eave'], [64, 'hook'], [128, 'hook']];
  return (
    <ul className="bk-sizes" aria-label="The mark at five sizes">
      {sizes.map(([px, detail]) => (
        <li key={px}>
          <LanternMark size={px} title={`The mark at ${px}px`} />
          <span className="bk-size"><span>{px}</span> {detail}</span>
        </li>
      ))}
    </ul>
  );
}

function Variants() {
  const variants = [
    ['primary', 'Primary', 'Hanji, the Ember flame. On Night.', 'night'],
    ['mono-hanji', 'Mono Hanji', 'One colour. On Night.', 'night'],
    ['reversed', 'Reversed', 'Night, the flame in ember-deep. On Hanji.', 'paper'],
    ['mono-night', 'Mono Night', 'One colour. On Hanji.', 'paper'],
  ];
  return (
    <ul className="bk-variants">
      {variants.map(([v, name, note, ground]) => (
        <li key={v}>
          <div className={`bk-tile${ground === 'paper' ? ' paper' : ''}`}>
            <LanternMark variant={v} size={64} title={`${name} mark`} />
          </div>
          <p className="bk-tile-name">{name}</p>
          <p className="bk-tile-note">{note}</p>
        </li>
      ))}
    </ul>
  );
}

// ---- 02 the wordmark and the lockups ------------------------------------------------------------------

function WordmarkFigure() {
  const pad = 460;
  const top = WORDMARK.top - pad;
  const height = WORDMARK.bottom - WORDMARK.top + 2 * pad;
  const [r, n] = [WORDMARK.letters[5], WORDMARK.letters[6]];
  const t = WORDMARK.letters[3];
  const x = (v) => `${((v / WORDMARK.width) * 100).toFixed(3)}%`;
  const y = (v) => `${(((v - top) / height) * 100).toFixed(3)}%`;
  // the opened r–n pair: a dimension line under the gap; the t's trimmed arm: a ring round its end
  const dimY = 170;
  const arm = { x: t.x0 + 50, y: -WORDMARK.xHeight + 25, r: 150 };
  return (
    <figure className="bk-wordmark">
      <div className="bk-wordmark-art">
        <svg viewBox={`0 ${top} ${WORDMARK.width} ${height}`} role="img" aria-label="Lantern, the wordmark">
          <path className="bk-word" d={WORDMARK.d} />
          <g className="bk-callout" aria-hidden="true">
            <line x1={r.x1} y1={dimY - 110} x2={r.x1} y2={dimY} />
            <line x1={n.x0} y1={dimY - 110} x2={n.x0} y2={dimY} />
            <line x1={r.x1} y1={dimY} x2={n.x0} y2={dimY} />
            <circle cx={arm.x} cy={arm.y} r={arm.r} />
          </g>
        </svg>
        <span className="bk-callout-label" aria-hidden="true" style={{ '--x': x(arm.x), '--y': y(arm.y - arm.r - 190) }}>1</span>
        <span className="bk-callout-label" aria-hidden="true" style={{ '--x': x((r.x1 + n.x0) / 2), '--y': y(dimY + 200) }}>2</span>
      </div>
      <figcaption>
        <ol className="bk-list">
          <li>The t’s left crossbar arm is trimmed to 60%: the t becomes the lantern’s post.</li>
          <li>The r–n pair opens by 40/1000 em, so the word can’t read “Lantem”.</li>
        </ol>
        <p className="bk-caption">Fraunces roman at opsz 144, weight 360, SOFT 30, WONK 0, tracking −0.01em, outlined. Below 18px tall, use the mark alone.</p>
      </figcaption>
    </figure>
  );
}

function ClearSpace() {
  const L = lockupNodes({ kind: 'primary', variant: 'primary', detail: 'hook', clear: true, hangul: HANGUL });
  const [x0, y0, w, h] = L.viewBox.split(' ').map(Number);
  const H = LOCKUP.H;
  const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;
  return (
    <figure className="bk-clear">
      <div className="bk-clear-art">
        <svg viewBox={L.viewBox} role="img" aria-label="The primary lockup inside its clear space">
          <rect className="bk-clear-box" x={x0} y={y0} width={w} height={h} />
          <rect className="bk-ink-box" x={x0 + H} y={y0 + H} width={w - 2 * H} height={h - 2 * H} />
          <g className="bk-dims" aria-hidden="true">
            <line x1={x0} y1={y0 + h / 2} x2={x0 + H} y2={y0 + h / 2} />
            <line x1={x0 + w / 2} y1={y0} x2={x0 + w / 2} y2={y0 + H} />
          </g>
          {renderNodes(L.nodes)}
        </svg>
        <span className="bk-dim-label" data-at="left" style={{ '--x': pct(H / 2, w), '--y': pct(h / 2, h) }}>1H</span>
        <span className="bk-dim-label" data-at="top" style={{ '--x': pct(w / 2, w), '--y': pct(H / 2, h) }}>1H</span>
      </div>
    </figure>
  );
}

function Lockups() {
  return (
    <div className="bk-lockups">
      <figure className="bk-lockup-card">
        <div className="bk-tile bk-tile-wide">
          <CompactLockup capHeight={17} title="Lantern, the compact lockup" />
        </div>
        <figcaption><span className="bk-tile-name">Compact</span> Mark and wordmark: the header and the footer, at a 17px cap height.</figcaption>
      </figure>
      <figure className="bk-lockup-card">
        <div className="bk-tile bk-tile-wide">
          <LanternMark size={32} title="The mark alone" />
        </div>
        <figcaption><span className="bk-tile-name">Mark alone</span> Favicons, app icons, and the header below 400px.</figcaption>
      </figure>
      <figure className="bk-lockup-card">
        <div className="bk-tile bk-tile-wide bk-minimums">
          <span className="bk-min">
            <Lockup kind="primary" capHeight={19} fluid={false} title="The primary lockup at its smallest" />
            <span className="bk-ruler" aria-hidden="true" />
          </span>
          <span className="bk-min">
            <CompactLockup capHeight={16} title="The compact lockup at its smallest" />
            <span className="bk-ruler" aria-hidden="true" />
          </span>
        </div>
        <figcaption><span className="bk-tile-name">Smallest</span> {LOCKUP.minWidth.primary}px wide for the primary, {LOCKUP.minWidth.compact}px for the compact. Below that, the mark alone.</figcaption>
      </figure>
      <figure className="bk-lockup-card bk-lockup-paper">
        <div className="bk-tile bk-tile-wide paper">
          <Lockup kind="primary" variant="reversed" capHeight={40} title="Lantern 등불, reversed on Hanji" />
        </div>
        <figcaption><span className="bk-tile-name">Reversed</span> The primary lockup in Night on Hanji paper, the flame in ember-deep.</figcaption>
      </figure>
    </div>
  );
}

// 등 drawn apart into its three strokes. Each subpath of the outline is sorted by where it starts
// (font units, y down, baseline 0): the top stroke, the bar, and the round body with its counter.
function jamo(d) {
  const parts = { cap: [], bar: [], body: [] };
  for (const sub of d.split(/(?=M)/)) {
    const y = Number(sub.match(/^M\s*-?[\d.]+[\s,]+(-?[\d.]+)/)[1]);
    parts[y < -450 ? 'cap' : y < -150 ? 'bar' : 'body'].push(sub);
  }
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.join('')]));
}
// The ink box of an outline written by fontTools' SVGPathPen (absolute M, L, Q, H, V, Z), counting
// control points: close enough to hang a label beside.
function inkBox(d) {
  const tokens = d.match(/[MLQHVZ]|-?[\d.]+/g);
  let cmd = 'M';
  const xs = [];
  const ys = [];
  for (let i = 0; i < tokens.length;) {
    if (/[A-Z]/.test(tokens[i])) { cmd = tokens[i]; i += 1; continue; }
    if (cmd === 'H') { xs.push(Number(tokens[i])); i += 1; } else if (cmd === 'V') { ys.push(Number(tokens[i])); i += 1; } else {
      xs.push(Number(tokens[i]));
      ys.push(Number(tokens[i + 1]));
      i += 2;
    }
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function Deungbul() {
  const g = HANGUL.deung;
  const parts = jamo(g.d);
  const lift = { cap: -150, bar: 0, body: 150 };
  const boxes = Object.fromEntries(Object.entries(parts).map(([k, d]) => [k, inkBox(d)]));
  const top = -g.ink[3] - 150 - 80;
  const bottom = -g.ink[1] + 150 + 80;
  const right = g.ink[2] + 60;
  const width = right + 520; // the leaders run on to the labels
  const height = bottom - top;
  const labels = [
    ['cap', 'the cap', 'digeut'],
    ['bar', 'the frame bar', 'eu'],
    ['body', 'the round paper body', 'ieung'],
  ];
  const mid = (k) => (boxes[k].y0 + boxes[k].y1) / 2 + lift[k];
  // the tag: the two glyphs stacked on the lockup's rhythm (0.6H glyphs in a 1.3H column)
  const step = (1000 * (LOCKUP.tagColumn - LOCKUP.tagGlyph)) / LOCKUP.tagGlyph;
  const tag = [HANGUL.deung, HANGUL.bul];
  return (
    <div className="bk-deungbul">
      <div className="bk-deungbul-art">
        <svg className="bk-tag" viewBox={`0 0 1000 ${1000 + step}`} role="img" aria-label="등불, set as a tag">
          {tag.map((t, i) => <path key={t.char} d={t.d} transform={`translate(20 ${t.emTop + i * step})`} />)}
        </svg>
        <div className="bk-jamo">
          <svg viewBox={`0 ${top} ${width} ${height}`} role="img" aria-label="등, drawn apart into its three strokes">
            {Object.entries(parts).map(([k, d]) => (
              <path key={k} className="bk-jamo-part" data-part={k} d={d} transform={`translate(0 ${lift[k]})`} />
            ))}
            <g className="bk-leaders" aria-hidden="true">
              {labels.map(([k]) => <line key={k} x1={boxes[k].x1 + 60} y1={mid(k)} x2={width} y2={mid(k)} />)}
            </g>
          </svg>
          {labels.map(([k, label, name]) => (
            <span key={k} className="bk-jamo-label" aria-hidden="true" style={{ '--y': `${(((mid(k) - top) / height) * 100).toFixed(3)}%` }}>
              {label} <span className="bk-romaja">{name}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="bk-deungbul-text">
        <p>
          <Ko>등불</Ko> (<i>deungbul</i>) means “lantern light”: the quiet second voice, set in Gowun Batang, in Hanji and never
          Ember. Written with a brush, <Ko>등</Ko> is itself a lantern: its top stroke reads as the cap, the bar as the frame,
          and the circle as the round paper body.
        </p>
        <p>It appears in three places only: the primary lockup, the landing’s eyebrow and the app icons.</p>
      </div>
    </div>
  );
}

// ---- 03 colour -------------------------------------------------------------------------------------

function Swatches({ css }) {
  return (
    <>
      <ul className="bk-swatches">
        {COLOURS.map(([k, name, role]) => (
          <li key={k} className="bk-swatch" data-token={k}>
            <span className="bk-chip" aria-hidden="true" />
            <span className="bk-swatch-name">{name}</span>
            <code className="bk-swatch-hex" data-hex="">{css[k]}</code>
            <code className="bk-swatch-var">--{k}</code>
            <span className="bk-swatch-role">{role}</span>
          </li>
        ))}
      </ul>
      <ul className="bk-swatches bk-derived" aria-label="Derived colours">
        {DERIVED.map(([k, name, role]) => (
          <li key={k} className="bk-swatch" data-token={k}>
            <span className="bk-chip" aria-hidden="true" />
            <span className="bk-swatch-name">{name}</span>
            <code className="bk-swatch-hex" data-hex="">{css[k]}</code>
            <code className="bk-swatch-var">--{k}</code>
            <span className="bk-swatch-role">{role}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

const NAME = Object.fromEntries([...COLOURS, ...DERIVED].map(([k, name]) => [k, name]));

function ContrastTable({ css }) {
  const groups = Object.keys(USE).map((use) => [use, PAIRS.filter((p) => p[2] === use)]);
  return (
    <div className="bk-table-wrap">
      <table className="bk-contrast">
        <caption className="sr-only">Contrast ratios between the colour tokens, worked out from this page’s stylesheet</caption>
        <thead>
          <tr><th scope="col"><span className="sr-only">Sample</span></th><th scope="col">Pair</th><th scope="col">Ratio</th></tr>
        </thead>
        {groups.map(([use, pairs]) => (
          <tbody key={use}>
            <tr className="bk-group"><th scope="rowgroup" colSpan={3}>{USE[use][0]} <span>{USE[use][1]}</span></th></tr>
            {pairs.map(([fg, bg]) => {
              const ratio = contrast(css[fg], css[bg]);
              return (
                <tr key={`${fg}-${bg}`} data-fg={fg} data-bg={bg} data-use={use} data-ratio={ratio.toFixed(2)}>
                  <td className="bk-sample-cell"><Sample fg={fg} bg={bg} use={use} /></td>
                  <th scope="row">{NAME[fg]} on {NAME[bg]}</th>
                  <td className="bk-ratio">{ratio.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// Text pairs are shown as text; the flame's pairs as the flame, never as text; control outlines as a
// capsule; the pair that is never used, struck through.
function Sample({ fg, bg, use }) {
  return (
    <span className="bk-sample" data-fg={fg} data-bg={bg} data-use={use}>
      {use === 'text' ? 'Aa' : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {use === 'control' ? <rect x={2.5} y={7.5} width={19} height={9} rx={4.5} /> : <path d={flamePath({ cx: 12, cy: 12, height: 14 })} />}
          {use === 'never' && <line x1={3} y1={21} x2={21} y2={3} />}
        </svg>
      )}
    </span>
  );
}

// ---- 04 type ---------------------------------------------------------------------------------------

function Families() {
  return (
    <ul className="bk-families">
      <li className="bk-family" data-family="display">
        <div className="bk-family-meta">
          <p className="bk-family-name">Fraunces <span>as Lantern Display</span></p>
          <p className="bk-family-axes">wght 300–600 · opsz 9–144 · SOFT 30 · WONK 0; italic wght 300–500, WONK 1</p>
          <p className="bk-family-use">Headings, set light, with at most one italic word.</p>
        </div>
        <div className="bk-specimen">
          <p className="bk-spec-display">Lose the device. Keep the <em>identity.</em></p>
          <div className="bk-opsz" aria-label="The same word at two optical sizes">
            <p><span className="bk-opsz-word" data-opsz="9">Lantern</span><span className="bk-opsz-note">opsz 9: sturdy, for small sizes</span></p>
            <p><span className="bk-opsz-word" data-opsz="144">Lantern</span><span className="bk-opsz-note">opsz 144: fine, for display</span></p>
          </div>
        </div>
      </li>
      <li className="bk-family" data-family="sans">
        <div className="bk-family-meta">
          <p className="bk-family-name">Instrument Sans <span>as Lantern Sans</span></p>
          <p className="bk-family-axes">wght 400–600 · wdth 80–100</p>
          <p className="bk-family-use">Text, and the narrow widths for labels and the nav. There is no sans italic: emphasis is set in Fraunces italic.</p>
        </div>
        <div className="bk-specimen">
          <p className="bk-spec-sans">Lantern lets hidden guardians restore a lost Midnight identity secret, and proves it is the right one.</p>
          <ul className="bk-widths">
            <li><span className="bk-w" data-wdth="100">Watch a recovery</span><span className="bk-wdth-note">wdth 100, text</span></li>
            <li><span className="bk-w" data-wdth="90">The recovery · Attack it</span><span className="bk-wdth-note">wdth 90, the nav</span></li>
            <li><span className="bk-w bk-w-label" data-wdth="80">Social recovery for Midnight</span><span className="bk-wdth-note">wdth 80, labels</span></li>
          </ul>
        </div>
      </li>
      <li className="bk-family" data-family="mono">
        <div className="bk-family-meta">
          <p className="bk-family-name">Fragment Mono <span>as Lantern Mono</span></p>
          <p className="bk-family-axes">400</p>
          <p className="bk-family-use">The ledger printout: hashes, counts, the clock.</p>
        </div>
        <div className="bk-specimen">
          <pre className="bk-spec-mono" aria-label="A ledger printout">{`identity commitments 1 · veto commitment 1
guardian leaves 3 · threshold 2
recoveries opened 1 · approvals 2 of 2
timelock 72 h · vetoed recoveries 1`}</pre>
        </div>
      </li>
      <li className="bk-family" data-family="kr">
        <div className="bk-family-meta">
          <p className="bk-family-name">Gowun Batang <span>as Lantern KR</span></p>
          <p className="bk-family-axes">400 · two glyphs only</p>
          <p className="bk-family-use"><Ko>등</Ko> and <Ko>불</Ko>, and nothing else: the file is 1.2 KB.</p>
        </div>
        <div className="bk-specimen">
          <p className="bk-spec-kr" lang="ko">등불</p>
        </div>
      </li>
    </ul>
  );
}

function Scale({ css }) {
  return (
    <ol className="bk-scale">
      {STEPS.map(([k, use, sample, face]) => (
        <li key={k} data-scale-step={k}>
          <p className="bk-scale-meta">
            <code>--step-{k}</code>
            <span className="bk-scale-px">{stepRange(css[`step-${k}`])}px</span>
            <span className="bk-scale-use">{use}</span>
          </p>
          <p className="bk-scale-sample" data-face={face}>{face === 'display-italic' ? <em>{sample}</em> : sample}</p>
        </li>
      ))}
    </ol>
  );
}

// ---- 05 the seal and the pictograms -----------------------------------------------------------------

const SEAL_STATE_NOTES = [
  ['open', 'Refused', `The ring with a 60${deg} gap at one o’clock.`],
  ['closed', 'Accepted', 'The full ring and a centre dot.'],
  ['lit', 'The lock', 'An Ember light inside the ring, the flame in Night.'],
  ['retired', 'Retired', 'An old commitment: a dashed Ash ring.'],
];

function SealStates() {
  return (
    <ul className="bk-seals">
      {SEAL_STATE_NOTES.map(([state, meaning, drawing]) => (
        <li key={state}>
          <Seal state={state} size={96} title={`The seal, ${state}`} />
          <p className="bk-tile-name"><code>{state}</code> {meaning}</p>
          <p className="bk-tile-note">{drawing}</p>
        </li>
      ))}
    </ul>
  );
}

// The seal on Hanji paper, and the button that presses it: each press stamps it closed (it presses in
// from a little above, on the ignite spring). The notch depths are set round its edge.
function SealPress() {
  const [stamps, setStamps] = useState(0);
  const sealed = stamps > 0;
  return (
    <figure className="bk-press paper" data-stamps={stamps}>
      <div className="bk-press-art">
        <div className="bk-press-seal">
          <Seal
            key={stamps}
            state={sealed ? 'closed' : 'open'}
            size={176}
            ground="paper"
            className={sealed ? 'seal is-stamped' : 'seal'}
            title={sealed ? 'The seal, closed' : 'The seal, open'}
          />
          <ol className="bk-depths" aria-label="The notch depths, clockwise from one o’clock">
            {SEAL.depths.map((d, i) => <li key={i}>{d}</li>)}
          </ol>
        </div>
      </div>
      <figcaption>
        <p className="bk-press-text">
          The ring is D/14 thick. Its inner edge carries 12 key cuts at 30{deg} intervals, {SEAL.depths.join(' ')} × D/48 deep:
          the bitting that only the right flame fits.
        </p>
        <button type="button" className="primary" onClick={() => setStamps((s) => s + 1)}>Press to seal</button>
        <p className="bk-press-state" aria-live="polite">
          {sealed ? <>Closed: <em>accepted.</em></> : <>Open: <em>refused.</em></>}
        </p>
      </figcaption>
    </figure>
  );
}

// [name, what it shows, where it is used]
const PICTOS = [
  ['01-seal', 'A lit lantern hanging above its seal.', '01 · Thirty days earlier'],
  ['02-three-lights', 'One flame sends three shares on dotted arcs to three small lanterns; three rings on the line.', '02 · Three guardians'],
  ['03-dark', 'A dashed lantern with no flame; the seal still on the line. Also this site’s 404.', '03 · Loss, and the 404'],
  ['04-return', 'An unlit lantern with two lights coming back; a recovery ring and two hollow rings.', '04 · A new phone'],
  ['05-window', 'The hours gone solid, the hours to run dotted; the veto card over a second, dashed ring.', '05 · Seventy-two hours'],
  ['06-lock', 'The lantern lit again, over its seal lit on the line.', '06 · The right one'],
  ['07-apps', 'Two small windows joined to one knot on the line.', '07 · The DApp never noticed'],
  ['attacks-named', 'Lanterns with name tags: the designs that gave their guardians away.', 'The designs that broke'],
  ['attacks-held', 'Three unlabelled lights: the design that held.', 'The design that held'],
];

function Pictograms() {
  return (
    <ul className="bk-pictos">
      {PICTOS.map(([name, note]) => (
        <li key={name}>
          <Suspense fallback={<span className="pictogram" />}><Pictogram name={name} className="pictogram" /></Suspense>
          <p className="bk-tile-name"><code>{name}</code></p>
          <p className="bk-tile-note">{note}</p>
        </li>
      ))}
    </ul>
  );
}

// ---- 06 motion -------------------------------------------------------------------------------------

// The plot's unit square inside its box (viewBox x -0.05..1.05, y -0.2..1.1, y down): progress 1 is
// 0.2 below the top, so the ignite spring's overshoot has room.
const PLOT = { x0: -0.05, w: 1.1, y0: -0.2, h: 1.3 };

function Eases({ css }) {
  return (
    <ul className="bk-eases">
      {EASES.map(([k, job]) => <Ease key={k} name={k} value={css[`ease-${k}`]} job={job} ms={parseFloat(css['dur-lock']) || 900} />)}
    </ul>
  );
}

function Ease({ name, value, job, ms }) {
  const ride = useRef(null);
  const pts = easePoints(value);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(4)} ${(1 - y).toFixed(4)}`).join('');
  // a dot rides the curve: across in plain time, up along the curve
  const play = () => {
    const box = ride.current;
    const across = box.firstElementChild;
    const up = across.firstElementChild;
    const { width, height } = box.getBoundingClientRect();
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timing = { duration: still ? 0 : ms, fill: 'forwards' };
    across.getAnimations().concat(up.getAnimations()).forEach((a) => a.cancel());
    across.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${width}px)` }], { ...timing, easing: 'linear' });
    up.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-height}px)` }], { ...timing, easing: value });
  };
  return (
    <li className="bk-ease" data-ease={name}>
      <div className="bk-plot">
        <svg viewBox={`${PLOT.x0} ${PLOT.y0} ${PLOT.w} ${PLOT.h}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="bk-plot-axis" x1={0} y1={1} x2={1} y2={1} />
          <line className="bk-plot-axis" x1={0} y1={0} x2={1} y2={0} />
          <line className="bk-plot-axis" x1={0} y1={0} x2={0} y2={1} />
          <path className="bk-plot-curve" d={d} />
        </svg>
        <div className="bk-ride" ref={ride} aria-hidden="true"><span className="bk-ride-x"><span className="bk-ride-y" /></span></div>
      </div>
      <div className="bk-ease-text">
        <p className="bk-ease-name"><code>--ease-{name}</code></p>
        <p className="bk-ease-value"><code>{value}</code></p>
        <p className="bk-ease-job">{job}</p>
        <button type="button" className="bk-play" onClick={play}>Play<span className="sr-only"> {name}</span></button>
      </div>
    </li>
  );
}

function Durations({ css }) {
  const rows = DURATIONS.map((k) => [k, parseFloat(css[`dur-${k}`])]);
  const max = Math.max(...rows.map(([, v]) => v));
  return (
    <ol className="bk-durations">
      {rows.map(([k, v]) => (
        <li key={k} data-dur={k}>
          <code className="bk-dur-name">--dur-{k}</code>
          <span className="bk-dur-bar" aria-hidden="true"><span style={{ '--w': (v / max).toFixed(4) }} /></span>
          <span className="bk-dur-ms">{v}ms</span>
        </li>
      ))}
    </ol>
  );
}

// ---- 07 voice --------------------------------------------------------------------------------------

const VOICE = [
  ['Seo-yeon and Mum approve the new phone.', 'The guardian quorum authenticates the device.', 'Plain verbs, concrete nouns: people, a phone.'],
  ['Every recovery waits 72 hours where anyone can see it.', 'Recoveries are subject to a seventy-two-hour timelock period.', 'Digits in running copy. One technical term at a time, its plain meaning beside it.'],
  ['Runs in your browser: no wallet, no chain, no proofs.', 'Seamless recovery on the blockchain, instantly!', 'Say exactly what runs where. No exclamation marks, no “seamless”, “unlock” or “revolutionary”.'],
  ['Watch a recovery', 'Watch A Recovery', 'Sentence case everywhere.'],
  ['enrol · authorised · licence', 'enroll · authorized · license', 'British spelling, except “finalize”, the contract’s own word.'],
  ['“2 of 3” · 72 hours · Hana’s', '"two out of three" - Hana\'s', 'Curly quotes and apostrophes, middle-dot separators.'],
];

function Voice() {
  return (
    <>
      <ul className="bk-voice">
        {VOICE.map(([say, not, why]) => (
          <li key={say}>
            <p className="bk-say"><span className="bk-mark" data-kind="say">Say</span> {say}</p>
            <p className="bk-not"><span className="bk-mark" data-kind="not">Not</span> {not}</p>
            <p className="bk-why">{why}</p>
          </li>
        ))}
      </ul>
      <p className="bk-meta">
        Four words and phrases are banned from the site’s text outright, because they would claim a chain it does not run; the
        list and the test that holds it sit in <code>web/e2e/helpers.js</code>. The people in the story are fictional, and the
        footer says so once.
      </p>
    </>
  );
}

// ---- 08 downloads -------------------------------------------------------------------------------------

const DOWNLOADS = [
  ['The mark', [
    ['/brand-kit/lantern-mark.svg', 'Primary. For Night.', 'night'],
    ['/brand-kit/lantern-mark-mono-hanji.svg', 'One colour, Hanji. For Night.', 'night'],
    ['/brand-kit/lantern-mark-reversed.svg', 'Night, the flame ember-deep. For Hanji.', 'paper'],
    ['/brand-kit/lantern-mark-mono-night.svg', 'One colour, Night. For Hanji.', 'paper'],
    ['/brand-kit/lantern-mark-16.svg', 'The optical drawing, for 16 to 23px.', 'night'],
  ]],
  ['Wordmark and lockups', [
    ['/brand-kit/lantern-lockup.svg', <>Primary lockup, with <Ko>등불</Ko>. For Night.</>, 'night'],
    ['/brand-kit/lantern-lockup-reversed.svg', 'Primary lockup. For Hanji.', 'paper'],
    ['/brand-kit/lantern-lockup-compact.svg', 'Compact lockup: the header, the footer.', 'night'],
    ['/brand-kit/lantern-wordmark.svg', 'The wordmark alone, outlined.', 'night'],
    ['/brand-kit/lantern-lockup@2x.png', 'Primary lockup on Night, with its clear space.', 'night'],
  ]],
  ['The seal', SEAL_STATE_NOTES.map(([state, meaning]) => [`/brand-kit/lantern-seal-${state}.svg`, `${meaning}. For Night.`, 'night'])],
  ['Pictograms', PICTOS.map(([name, , use]) => [`/brand-kit/pictograms/${name}.svg`, `${use}. For Night.`, 'night'])],
  ['Icons and the social card', [
    ['/brand-kit/icon-512.png', 'The app icon, maskable-safe.', 'night'],
    ['/apple-touch-icon.png', 'The home-screen icon.', 'night'],
    ['/favicon.svg', 'The tab icon.', 'night'],
    ['/favicon.ico', 'The tab icon, for older browsers.', 'night'],
    ['/og.png', 'The social card.', 'night'],
  ]],
];

function Downloads() {
  return (
    <div className="bk-downloads">
      {DOWNLOADS.map(([group, files]) => (
        <div key={group} className="bk-dl-group">
          <h3>{group}</h3>
          <ul>
            {files.filter(([path]) => KIT[path]).map(([path, note, ground]) => {
              const f = KIT[path];
              const name = path.split('/').pop();
              const format = name.split('.').pop().toUpperCase();
              const px = f.sizes ? f.sizes.map((s) => `${s}`).join(' and ') : `${Math.round(f.width)} × ${Math.round(f.height)}`;
              return (
                <li key={path}>
                  <a className="bk-dl" href={path} download>
                    <span className={`bk-dl-art${ground === 'paper' ? ' paper' : ''}`}>
                      <img src={path} alt="" width={f.width ?? 32} height={f.height ?? 32} loading="lazy" decoding="async" />
                    </span>
                    <span className="bk-dl-name">{name}</span>
                    <span className="bk-dl-note">{note}</span>
                    <span className="bk-dl-meta">{format} · {px}px · {kb(f.bytes)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
