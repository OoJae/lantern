# Lantern brand guide

**Night watch.** A hanji (mulberry-paper) lantern glowing in midnight dark. The flame is the secret; the paper around it is everything that keeps it private; the ground it stands over is the public record. 등불 (*deungbul*, “lantern light”) is the quiet Korean second voice.

Everything here is drawn from one source of path data, so the site, the files and the 3D scene agree to the unit:

| What | Where |
|---|---|
| Mark, colours, variants | `web/src/brand/marks.js` |
| Seal | `web/src/brand/seal.js` |
| Pictograms | `web/src/brand/pictograms.js` |
| Lockup geometry | `web/src/brand/lockup.js` |
| Outlined type | “Lantern” in `web/src/brand/glyphs.js`, 등불 in `web/src/brand/hangul.js`, both made by `web/scripts/brand-glyphs.py` |
| React components | `LanternMark.jsx`, `CompactLockup.jsx`, `Lockup.jsx` (and `Wordmark`), `Seal.jsx`, `Pictogram.jsx` |
| Downloadable files | `web/public/brand-kit/` (served at `/brand-kit/`) |
| Favicons | `web/public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png` |
| The social card | `web/public/og.png` |
| The kit as a page | [/brand](https://lantern-midnight.vercel.app/brand) (`web/src/pages/Brand.jsx`), which lists its downloads from `web/src/brand/kit.js` |

To change a drawing, edit the data, then run `node web/scripts/brand.mjs`: it rewrites every SVG, PNG and ICO above, refuses any SVG that carries a style, and writes `kit.js` (each file’s type, size and pixel size) for the page. A second run gives the same bytes. `node web/scripts/brand.mjs --og` also draws the social card (below); the flame flickers, so each run of that one differs a little, which is why it is a flag. Outputs are committed; the build never runs either.

The wordmark and 등불 sit in two files, not one, on purpose. The header draws the wordmark in the first load; a bundler moves a module whole into whichever chunk shares it, so if 등불’s outlines sat beside the wordmark’s, every page’s first load would carry them for the sake of the lazy /brand page.

## Three rules

1. **Ember is the flame.** It is the only accent, and it appears only where the secret or its light is: the mark’s flame, the scene’s flames and shares, the /demo share dots, the current beat, the design that held on /attacks, and the lock (an accepted `finalizeRecovery`). Never on buttons, links, focus rings or decoration.
2. **Above the line is private, on the line is public.** What is private floats: the flame, the shares, the veto card. What the public record holds lies flat on one horizon, the ledger: the seal, the guardian leaves, the nullifiers, the counts. Names never touch the line.
3. **One moving thing at a time.** Beyond the flame’s flicker, only one group moves at any moment.

## Colour

Six tokens, each with one job.

| Token | Hex | Role |
|---|---|---|
| Night | `#090A0F` | the page |
| Hanji | `#ECE4D2` | ink, primary button fill, accepted chips |
| Ash | `#948E83` | muted text, eyebrows, meta |
| Ember | `#FF8A3D` | the flame, and nothing else |
| Lacquer | `#14151B` | raised surfaces: panels, cards, tables, code |
| Rib | `#2C2D35` | decorative hairlines, never the only edge of a control |

Derived: Edge `#686661` for control outlines (3.45:1 on Night) · muted-on-paper `#5C574E`, only inside Hanji-filled scopes (5.67:1) · ember-deep `#B84A16`, the flame on paper, brand kit only · primary hover `#F6EFE0`.

Contrast: Hanji on Night 15.63 · Ash on Night 6.08 · Ember on Night 8.43 · Night on Hanji 15.63. Never set Ash over the 3D scene, and never put Ember on Hanji or Hanji on Ember (1.85).

## Type

Four families, all under the SIL Open Font License (OFL), self-hosted under our own names.

| Role | Family | Use |
|---|---|---|
| Display | Fraunces (“Lantern Display”) | headings, set light (300–360); one italic word at most |
| Body | Instrument Sans (“Lantern Sans”) | text; the condensed widths for labels and nav |
| Mono | Fragment Mono (“Lantern Mono”) | the ledger printout: hashes, counts, the clock |
| Korean | Gowun Batang (“Lantern KR”) | 등불 only |

The wordmark and the lockup’s 등불 are outlines, not text: they need no font file, and they come from these same two fonts (`web/scripts/brand-glyphs.py` instances Fraunces and draws both with fontTools).

## The mark

A lantern on a 24-unit grid with a 1u margin. Every part is a part of the story: the cap keeps the rain off, the body is the paper, the flame is the secret.

| Part | Construction |
|---|---|
| Hook | a ring, radius 1.25u at (12, 2), 1u stroke, joined to the cap by a 1u collar. 48px and up only |
| Cap | a filled trapezoid, 7–17u at y 4 to 6–18u at y 6; the bottom edge’s tips lift 0.5u, a roof eave. The eave from 32px up |
| Body | x 7, y 6.5, 10u × 12.5u, corner radius 3u, a 1.5u stroke, open |
| Flame | a teardrop 3.5u × 6.5u centred at (12, 12.75), its tip leaning 0.3u right. The only Ember fill |
| Foot | x 9, y 19.75, 6u × 1.5u, fully rounded, joined to the body by a 4u × 1.5u join along its straight bottom |

- **Sizes.** Below 24px use `lantern-mark-16.svg`, the optical drawing on a 16px grid: whole-pixel edges, a 3 × 5px flame set so its tip and foot land on pixel edges, no hook, no eave. From 24px the grid drawing; the eave appears at 32px and the hook at 48px. `LanternMark size={…}` picks the drawing for you.
- **Variants.** Primary: Hanji with the Ember flame, on Night. Mono Hanji and mono Night: one colour, flame included. Reversed: Night on Hanji paper, the flame in ember-deep. In the components, `variant="current"` follows the CSS colour; inside a Hanji scope pass `ground="paper"` as well, so the flame turns ember-deep and Ember never sits on Hanji.
- **Never** add a moon or a crescent (Midnight is the network’s brand), recolour the flame, fill the body, or set the mark on Ember.

## Wordmark

“Lantern” in Fraunces roman at opsz 144, wght 360, SOFT 30, WONK 0, tracking −0.01em, outlined. Two changes to the type:

1. The r–n pair opens by 40/1000 em, so the word can’t read “Lantem”.
2. The t’s left crossbar arm is trimmed to 60%: the t becomes the lantern’s post, keeping the arm a lantern hangs from.

Below 18px tall, use the mark alone.

## Lockups

H is the wordmark’s cap height.

- **Primary** (mark + wordmark + 등불): the OG image, /brand, the README banner, the video end card. Never the site header. The mark’s body centre (the flame) sits on the wordmark’s x-height centre and its cap’s top on the cap line, 0.45H before the L: two alignments that set its size at 1.66H from hook to foot, the hook rising like an ascender and the foot dropping like a descender. 등불 hangs like a lantern tag: two stacked glyphs at 0.6H in a 1.3H column, the top of 등’s ink on the ascender line, 0.5H after the n. Hanji, never Ember.
- **Compact** (mark + wordmark): the header and footer. Use `CompactLockup.jsx` (it carries no Korean outlines), or `LanternMark` beside `Wordmark` where the word has to drop out below 400px.
- **Reversed**: the primary lockup in Night on Hanji paper, the flame in ember-deep.
- **Mark alone**: favicons, and the header below 400px.

Clear space is 1H on every side. Minimum widths: 120px primary (a cap height of 19px gives 125px), 88px compact (16px gives 89px). The mark inside a lockup switches drawings at the same sizes as the mark alone: `capHeight` picks it. `Lockup` never grows wider than its container (it scales down, keeping its shape), so a large specimen can’t push a 320px page sideways.

등불 appears in three places only: the primary lockup, the hero eyebrow, and the app icons (apple-touch and 512).

## Favicons and app icons

- `favicon.svg`: a 32px Night tile (radius 7) with the optical drawing at 2×. A tab shows it at 16px, where every edge of the optical drawing lands on a whole pixel.
- `favicon.ico`: 16 and 32px, the same drawing.
- `apple-touch-icon.png` (180) and `brand-kit/icon-512.png`: Night, full bleed; the mark 96/180 of the side, a little left of centre; 등불 to its right at 20/180 a glyph, hanging from the cap line like a tag. The 512 keeps everything inside the central 80%, so it survives a maskable crop.

## The social card

`og.png`, 1200 × 630, as the design spec lays it out: 64px margins; the primary lockup at a 36px cap height, top left; “Lose the device. Keep the *identity.*” in Fraunces 300 at 72px; the sentence in Instrument Sans at 26px; “Midnight Korea Hackathon 2026 · lantern-midnight.vercel.app” in Fragment Mono at 18px, Ash. On the right, the lantern is the landing’s own 3D scene at its first frame: `brand.mjs --og` bundles `web/src/landing/scene/lantern-scene.js` with Vite and draws it on the GPU (Metal on a Mac; elsewhere Chromium’s software renderer at the same quality tier), holding its glow down under the words as the landing does. Over it: three share lights drifting right at three depths, and the seal lying faint on the ledger line. Everything that matters sits inside the central 1200 × 600, where a feed may crop. Its `og:image:alt` reads “A paper lantern glowing in the dark beside the words: Lose the device. Keep the identity.”

## The seal

The commitment motif: a round seal, a nod to the Korean dojang, diameter D and ring stroke D/14. Its inner edge carries 12 notches at 30° intervals, depths 2 1 3 1 2 3 1 2 1 3 2 1 × D/48, starting 15° past twelve: the bitting that only the right flame fits. Each notch is a key cut, with a flat floor and walls opening at 30°, so a deeper cut is also a wider one. Twelve equal slots round a dot would read as a clock; cuts of three widths read as a key.

| State | Means | Drawing |
|---|---|---|
| open | refused | the ring with a 60° gap at one o’clock |
| closed | accepted | the full ring and a centre dot, Hanji |
| lit | the lock | an Ember light filling the ring, 1u (and at least 1px) inside it, so the cuts stay Hanji on the ground; the flame drawn in Night. Ember-deep on paper |
| retired | an old commitment | 12 dashed Ash arcs, set between the notches |

Sizes: the deepest cut leaves D/112 of ring, so the notches are drawn from 64px up, and between 64 and 111px they are eased just enough to keep a whole pixel of ring behind the deepest cut. Below 64px the seal is a plain ring: the four states stay apart by a gap, a dot, a light and dashes (`Seal size` does all this). Files: `brand-kit/lantern-seal-{open,closed,lit,retired}.svg`, drawn at 128px.

## Pictograms

A 48u grid, Hanji structure, Ember only for flames and shares, built from the mark’s parts. The ledger is one unbroken line at y 40, the near edge of the public record: what is public rests on it (a ring lying flat is an ellipse, 0.3 as tall as it is wide), what is private floats clear of it, and names never touch it. The line is never cut at a ring: rings threaded on a line read as chain links. Weights: 1.5u for a full-size lantern body and the seal, 1.2u for small lanterns (at 1.5u a small body reads as a jar), 1u for everything else, and nothing under 1u but the dotted trails, so every line holds a pixel at 48px. Files in `brand-kit/pictograms/`.

| Name | Shows | Used for |
|---|---|---|
| `01-seal` | a lit lantern hanging above its seal | 01 · Thirty days earlier |
| `02-three-lights` | one flame, three shares on dotted arcs to three small lanterns; three rings on the line | 02 · Three guardians |
| `03-dark` | a dashed Ash lantern with no flame; the seal still on the line | 03 · Loss, and the 404 page |
| `04-return` | an unlit lantern with two lights coming back; a recovery ring and two hollow rings | 04 · A new phone |
| `05-window` | the new lantern over its recovery ring, the hours gone solid and the hours to run dotted; the veto card floating low over a second, dashed ring | 05 · Seventy-two hours |
| `06-lock` | the lantern lit again, as in 01, over its seal lit on the line | 06 · The right one |
| `07-apps` | two small windows joined to one knot on the line | 07 · The DApp never noticed |
| `attacks-named` | three lanterns with name tags, the tags well clear of the line | the designs that gave their guardians away |
| `attacks-held` | three unlabelled lights; only rings on the line | the design that held |

On Hanji paper, draw them with `ground="paper"`: Night structure, ember-deep flames. The name tag and the veto card are cut out (their holes and lines are real holes), so they sit on any ground.

## Where the drawings depart from the spec, and why

The design spec’s geometry is followed to the unit except in these places, each checked on screen at the sizes it ships:

- **Hook collar and foot join.** The spec’s hook ring stops 0.25u above the cap, and its foot meets the body’s stroke edge to edge. Both showed as hairline seams at 24–64px. A 1u collar joins the hook; a join along the body’s straight bottom closes the foot. Neither adds any shape.
- **16px drawing.** The body’s stroke runs y 3.5–12.5, not 13, so the bottom stroke fills a whole pixel row and one clear row sits above the foot; corner radius 1.5. The flame is the grid flame scaled to 5px tall (2.7 × 5, not 3 × 5), so the small flame is the same flame, set half a pixel low so its tip and foot land on pixel edges.
- **`favicon.svg`.** The optical drawing at 2×, not the grid mark at (4, 4): in a 16px tab the grid mark is 9px tall with strokes under a pixel. The SVG and the ICO now show the same drawing.
- **Lockup mark size.** 1.66H from hook to foot, not 1.55H: at 1.55H the cap’s top misses the cap line by 0.045H. To use the spec’s size, set `LOCKUP.markHeight` to `1.55 * H` in `lockup.js`.
- **Seal notch sizes.** Drawn from 64px, not 20px, and eased between 64 and 111px (see The seal).
- **Lit seal.** The light is a disc inside the ring rather than the whole notched interior, and the flame is drawn in Night rather than cut out, so it reads on paper too.
- **Pictograms.** Weights of 1.5, 1.2 and 1u rather than 1.5u throughout; the 72-hour ring as a solid arc and a dotted remainder (72 ticks on a 48u ring sit 0.6u apart and merge into a grey band); the lock as a lit lantern over a lit seal lying on the line (a seal standing on the line broke rule 2); the apps’ windows above the line, joined down to its knot (they read the record; they are not in it, and every drawing that laid them on the line lost them).

## Voice

- Plain verbs: watch, try, split, seal, prove. Sentence case everywhere.
- Concrete nouns: laptop, phone, card, share, seal. One technical term at a time, with its plain meaning beside it.
- Say exactly what runs where. Four words and phrases are banned from the site’s text outright; the list and its check sit in `web/e2e/helpers.js`. (“Lives” and “on chain” are fine.)
- British spelling (enrol, authorised, licence), except “finalize”, the contract’s own word.
- Digits in running copy (72 hours, 2 of 3), curly quotes, middle-dot separators.
- Calm, warm, a little wry. No exclamation marks, no emoji, no “seamless”, “unlock” or “revolutionary”.
- The people in the story are fictional, and the footer says so once.
