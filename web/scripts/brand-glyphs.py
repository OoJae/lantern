#!/usr/bin/env python3
"""Outline Lantern's wordmark into web/src/brand/glyphs.js and 등불 into
web/src/brand/hangul.js.

A dev tool (never part of the build). It reads the pinned @fontsource
packages, so running it again gives the same file byte for byte:

  python3 web/scripts/brand-glyphs.py

Wordmark: "Lantern" in Fraunces roman, instanced at opsz 144, wght 360,
SOFT 30, WONK 0 (so n resolves to the upright n.alt through rvrn), with
the font's own kerning, tracking -0.01em, and two customisations:
  1. the r-n pair opened by 40/1000 em, so it can't read "Lantem";
  2. the t's left crossbar arm trimmed to 60% of its length (the t as
     the lantern's post: the arm that stays is the one a lantern hangs from).

등불: U+B4F1 and U+BD88 from Gowun Batang 400 (fontsource subsets 117 and
116), outlined as they are.

Coordinates are y-down with the baseline at y = 0 (the SVG convention),
in whole font units.

Two files, not one: the header's compact lockup draws the wordmark in the
first load, and a module is bundled whole wherever it is shared, so 등불's
outlines (for the primary lockup only, on lazy pages) must live apart or
they would ride along in the first load.
"""

import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
FRAUNCES = os.path.join(
    WEB, "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2"
)
GOWUN = os.path.join(WEB, "node_modules/@fontsource/gowun-batang/files")
OUT = os.path.join(WEB, "src/brand/glyphs.js")
OUT_KO = os.path.join(WEB, "src/brand/hangul.js")

LOCATION = {"opsz": 144, "wght": 360, "SOFT": 30, "WONK": 0}
WORD = "Lantern"
TRACKING = -0.01  # em
RN_OPEN = 0.040  # em, added between r and n
T_LEFT_ARM = 0.60  # share of the t's left crossbar arm that stays


def fmt(v):
    """Round to whole font units (2000 per em: finer than any screen needs)."""
    r = int(round(v))
    return str(0 if r == 0 else r)


class RoundingSVGPen(SVGPathPen):
    def __init__(self, glyphSet):
        super().__init__(glyphSet, ntos=fmt)


def rvrn_map(font):
    """Single substitutions the instancer baked into rvrn (WONK 0 -> n.alt)."""
    gsub = font["GSUB"].table
    mapping = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag != "rvrn":
            continue
        for li in fr.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[li]
            for st in lookup.SubTable:
                if lookup.LookupType == 7:
                    st = st.ExtSubTable
                mapping.update(getattr(st, "mapping", {}) or {})
    return mapping


def pair_kern(font, left, right):
    """XAdvance adjustment from GPOS kern (PairPos formats 1 and 2)."""
    gpos = font["GPOS"].table
    total = 0
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag != "kern":
            continue
        for li in fr.Feature.LookupListIndex:
            lookup = gpos.LookupList.Lookup[li]
            for st in lookup.SubTable:
                if lookup.LookupType == 9:
                    st = st.ExtSubTable
                cov = st.Coverage.glyphs
                if left not in cov:
                    continue
                if st.Format == 1:
                    for pvr in st.PairSet[cov.index(left)].PairValueRecord:
                        if pvr.SecondGlyph == right and pvr.Value1 is not None:
                            total += getattr(pvr.Value1, "XAdvance", 0) or 0
                            break
                else:
                    c1 = st.ClassDef1.classDefs.get(left, 0)
                    c2 = st.ClassDef2.classDefs.get(right, 0)
                    v = st.Class1Record[c1].Class2Record[c2].Value1
                    total += (getattr(v, "XAdvance", 0) or 0) if v is not None else 0
                break  # the first subtable that covers the pair applies
    return total


def trim_t(glyph, glyf):
    """Shorten the t's left crossbar arm to T_LEFT_ARM of its length.

    Fraunces draws the t as two contours: the stem with the left arm and the
    pointed top (contour 0), and the right arm (contour 1). The left arm's
    rounded tip is the run of points left of the arm's straight edges; we
    slide that run right, so the tip keeps its drawing and the arm shortens.
    """
    coords, ends, _flags = glyph.getCoordinates(glyf)
    first = [coords[i] for i in range(0, ends[0] + 1)]
    stem_left = None
    # the stem's left edge: the vertical run of on-curve points below the bar
    xs = sorted({round(x) for x, y in first if 150 < y < 800})
    stem_left = xs[0]
    tip = min(x for x, _ in first)
    shift = (1 - T_LEFT_ARM) * (stem_left - tip)
    # the tip run: points within the rounded end (left of the straight edges)
    tip_idx = [i for i, (x, y) in enumerate(first) if x <= tip + 20 and 800 < y < 880]
    if len(tip_idx) < 5:
        sys.exit(f"t: unexpected outline (tip points {tip_idx})")
    for i in tip_idx:
        x, y = coords[i]
        coords[i] = (x + shift, y)
    glyph.coordinates = coords
    glyph.recalcBounds(glyf)
    return {"stemLeft": stem_left, "tipBefore": tip, "tipAfter": tip + shift}


def outline(glyphset, name, dx, pen_cls=RoundingSVGPen):
    rec = RecordingPen()
    glyphset[name].draw(rec)
    pen = pen_cls(glyphset)
    # y-down, baseline at 0
    rec.replay(TransformPen(pen, (1, 0, 0, -1, dx, 0)))
    return pen.getCommands()


def bounds(glyphset, name):
    bp = BoundsPen(glyphset)
    glyphset[name].draw(bp)
    return bp.bounds


def wordmark():
    var = TTFont(FRAUNCES)
    font = instancer.instantiateVariableFont(var, LOCATION)
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    subst = rvrn_map(font)
    names = [subst.get(cmap[ord(c)], cmap[ord(c)]) for c in WORD]
    glyf = font["glyf"]
    t_info = trim_t(glyf["t"], glyf)
    gs = font.getGlyphSet()
    hmtx = font["hmtx"].metrics

    # metrics from the outlines themselves (OS/2 is not re-derived per instance)
    cap = bounds(gs, "H")[3]
    xh = bounds(gs, "x")[3]
    asc = bounds(gs, "l")[3]

    x = 0.0
    parts = []
    letters = []
    first_lsb = bounds(gs, names[0])[0]
    x = -first_lsb  # ink starts at x = 0
    kerns = []
    for i, (ch, gn) in enumerate(zip(WORD, names)):
        parts.append(outline(gs, gn, x))
        b = bounds(gs, gn)
        letters.append({"char": ch, "glyph": gn, "x0": x + b[0], "x1": x + b[2]})
        if i + 1 < len(names):
            k = pair_kern(font, gn, names[i + 1])
            extra = TRACKING * upm
            if ch == "r" and WORD[i + 1] == "n":
                extra += RN_OPEN * upm
            kerns.append((ch + WORD[i + 1], k, extra))
            x += hmtx[gn][0] + k + extra
    ink_right = letters[-1]["x1"]
    ys = [bounds(gs, gn) for gn in names]
    return {
        "upm": upm,
        "cap": cap,
        "xh": xh,
        "asc": asc,
        "width": ink_right,
        "top": -max(b[3] for b in ys),
        "bottom": -min(b[1] for b in ys),
        "d": "".join(parts),
        "letters": letters,
        "kerns": kerns,
        "t": t_info,
    }


def hangul():
    out = {}
    for key, sub, cp in (("deung", "117", 0xB4F1), ("bul", "116", 0xBD88)):
        font = TTFont(os.path.join(GOWUN, f"gowun-batang-{sub}-400-normal.woff2"))
        gn = font.getBestCmap()[cp]
        gs = font.getGlyphSet()
        b = bounds(gs, gn)
        out[key] = {
            "cp": cp,
            "upm": font["head"].unitsPerEm,
            "advance": font["hmtx"].metrics[gn][0],
            "vadvance": font["vmtx"].metrics[gn][0],
            "emTop": font["OS/2"].sTypoAscender,
            "emBottom": font["OS/2"].sTypoDescender,
            "ink": b,
            "d": outline(gs, gn, 0),
        }
    return out


def js_num(v):
    return fmt(v)


def main():
    w = wordmark()
    h = hangul()
    kern_note = ", ".join(f"{p} {fmt(k)}{'+' if e >= 0 else ''}{fmt(e)}" for p, k, e in w["kerns"])
    lines = []
    lines.append("// Generated by web/scripts/brand-glyphs.py. Do not edit by hand: run it again.")
    lines.append("//")
    lines.append("// \"Lantern\": Fraunces roman (@fontsource-variable/fraunces 5.3.0, OFL-1.1) instanced at")
    lines.append("// opsz 144, wght 360, SOFT 30, WONK 0; tracking -0.01em; r-n opened by 40/1000 em;")
    lines.append("// the t's left crossbar arm trimmed to 60%.")
    lines.append(f"// Pair adjustments in font units (kern + tracking/opening): {kern_note}.")
    lines.append("// Units are font units, y-down, baseline at y = 0. 등불's outlines are in hangul.js.")
    lines.append("")
    lines.append("export const WORDMARK = {")
    lines.append(f"  unitsPerEm: {w['upm']},")
    lines.append(f"  /** H, the cap height (the top of the L). */")
    lines.append(f"  capHeight: {js_num(w['cap'])},")
    lines.append(f"  /** flat x-height (the top of x). */")
    lines.append(f"  xHeight: {js_num(w['xh'])},")
    lines.append(f"  /** the ascender line (the top of l). */")
    lines.append(f"  ascender: {js_num(w['asc'])},")
    lines.append(f"  /** ink box: x from 0 to width, y from top (negative, up) to bottom (descent). */")
    lines.append(f"  width: {js_num(w['width'])},")
    lines.append(f"  top: {js_num(w['top'])},")
    lines.append(f"  bottom: {js_num(w['bottom'])},")
    lines.append("  letters: [")
    for L in w["letters"]:
        lines.append(f"    {{ char: '{L['char']}', x0: {js_num(L['x0'])}, x1: {js_num(L['x1'])} }},")
    lines.append("  ],")
    lines.append(f"  d: '{w['d']}',")
    lines.append("};")
    lines.append("")
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))
    lines = []
    lines.append("// Generated by web/scripts/brand-glyphs.py. Do not edit by hand: run it again.")
    lines.append("//")
    lines.append("// 등불: Gowun Batang 400 (@fontsource/gowun-batang 5.3.0, OFL-1.1), U+B4F1 and U+BD88.")
    lines.append("// Units are font units, y-down, baseline at y = 0. Apart from glyphs.js, so the first load,")
    lines.append("// which draws the wordmark in the header, never carries these (the primary lockup's only).")
    lines.append("")
    lines.append("/** 등 (deung) and 불 (bul): each in its own em box, y-down, baseline at 0. */")
    lines.append("export const HANGUL = {")
    for key in ("deung", "bul"):
        g = h[key]
        ink = ", ".join(js_num(v) for v in g["ink"])
        lines.append(f"  {key}: {{")
        lines.append(f"    char: '{chr(g['cp'])}',")
        lines.append(f"    unitsPerEm: {g['upm']},")
        lines.append(f"    advance: {g['advance']},")
        lines.append(f"    /** the em box: from -emTop (up) to -emBottom, x from 0 to advance. */")
        lines.append(f"    emTop: {g['emTop']},")
        lines.append(f"    emBottom: {g['emBottom']},")
        lines.append(f"    /** ink bounds in font units, y-up: [xMin, yMin, xMax, yMax]. */")
        lines.append(f"    ink: [{ink}],")
        lines.append(f"    d: '{g['d']}',")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    with open(OUT_KO, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))
    print(f"wrote {os.path.relpath(OUT, WEB)} and {os.path.relpath(OUT_KO, WEB)}")
    print(f"  cap {fmt(w['cap'])}  x-height {fmt(w['xh'])}  ascender {fmt(w['asc'])}  width {fmt(w['width'])}")
    print(f"  t arm: stem {w['t']['stemLeft']}  tip {w['t']['tipBefore']} -> {fmt(w['t']['tipAfter'])}")
    print(f"  pairs: {kern_note}")


if __name__ == "__main__":
    main()
