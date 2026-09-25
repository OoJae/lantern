#!/usr/bin/env python3
"""The font half of `node scripts/fonts.mjs`: instance, subset and compress with fontTools.

Reads one JSON job description on stdin (fonts.mjs writes it; it names every source file, axis
limit and code point), writes the woff2 files, and prints one JSON report on stdout. It never
reaches the network and reads nothing it is not given, so the same pinned sources and the same
pinned tools give the same bytes: SOURCE_DATE_EPOCH (set by fonts.mjs) fixes head.modified, and
brotli is deterministic.

`fallbacks` mode measures the metric-matched fallback faces tokens.css hardcodes: size-adjust
from the average advance over a fixed English sample, ascent/descent/line-gap overrides from the
web font's own vertical metrics. It reads the fallback fonts from the paths it is given.
"""
import json
import os
import sys
import tempfile

import brotli
import fontTools
from fontTools import subset
from fontTools.merge import Merger
from fontTools.misc.fixedTools import floatToFixedToFloat
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates
from fontTools.ttLib.tables.TupleVariation import TupleVariation
from fontTools.varLib import builder, instancer
from fontTools.varLib.models import normalizeLocation, piecewiseLinearMap

# Pinned, like the npm packages: another fontTools can instance or subset to different bytes.
PINNED = {"fonttools": "4.60.2", "brotli": "1.2.0"}


def check_tools():
    have = {"fonttools": fontTools.version, "brotli": brotli.__version__}
    if have != PINNED:
        sys.exit(f"fonts.py: need {PINNED}, have {have} (pip install fonttools=={PINNED['fonttools']} brotli=={PINNED['brotli']})")
    return have


def ranges(cps):
    """Sorted code points as CSS unicode-range terms."""
    out, cps = [], sorted(cps)
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:04X}" if i == j else f"U+{cps[i]:04X}-{cps[j]:04X}")
        i = j + 1
    return ", ".join(out)


def options(features, keep_hinting=True):
    o = subset.Options()
    o.flavor = None
    o.layout_features = list(features)
    # The licence and copyright stay in the file: name IDs 0, 13 and 14. fvar and STAT keep the
    # names they reference on their own.
    o.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    o.name_languages = [0x0409]
    o.name_legacy = False
    o.hinting = keep_hinting
    o.drop_tables = sorted(set(o.drop_tables) | {"DSIG"})
    return o


def subset_font(font, unicodes, features, drop=()):
    o = options(features)
    o.drop_tables = sorted(set(o.drop_tables) | set(drop))
    s = subset.Subsetter(options=o)
    s.populate(unicodes=unicodes)
    s.subset(font)
    return font


def save_woff2(font, path):
    font.flavor = "woff2"
    font.save(path)


def describe(path, requested):
    f = TTFont(path)
    cmap = f.getBestCmap()
    cps = sorted(cmap)
    axes = {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in f["fvar"].axes} if "fvar" in f else {}
    feats = sorted({r.FeatureTag for r in f["GSUB"].table.FeatureList.FeatureRecord}) if "GSUB" in f else []
    feats += sorted({r.FeatureTag for r in f["GPOS"].table.FeatureList.FeatureRecord}) if "GPOS" in f else []
    # Every mapped glyph must carry an outline, except the spaces.
    glyf = f["glyf"]
    empty = [f"U+{cp:04X}" for cp in cps if cp not in (0x20, 0xA0)
             and glyf[cmap[cp]].numberOfContours == 0]
    return {
        "glyphs": len(f.getGlyphOrder()),
        "unitsPerEm": f["head"].unitsPerEm,
        "axes": axes,
        "features": sorted(set(feats)),
        "unicodeRange": ranges(cps),
        "missing": [f"U+{cp:04X}" for cp in sorted(requested) if cp not in cmap],
        "emptyOutlines": empty,
    }


def glyph_bounds(font, name):
    g = font["glyf"][name]
    g.recalcBounds(font["glyf"])
    return g.xMin, g.yMin, g.xMax, g.yMax


def filled_deltas(font, name, tv):
    """A gvar tuple's deltas for every point and the four phantom points, IUP-inferred where the
    table leaves them out."""
    glyf = font["glyf"]
    coords, ctrl = glyf._getCoordinatesAndControls(name, font["hmtx"].metrics)
    tv = TupleVariation(tv.axes, list(tv.coordinates))
    tv.calcInferredDeltas(coords, ctrl.endPts)
    return tv.coordinates


def derive_turned(font, spec):
    """Add a glyph that is another glyph of the same font turned a quarter anticlockwise.

    The @fontsource files follow Google's Latin subset, which carries ↓ (U+2193) but not → (U+2192),
    and the site's copy uses → ("probes → hits", the key tip, the CTA arrows). A system arrow beside
    Instrument Sans or Fragment Mono would be a different drawing at a different weight, so → is the
    family's own ↓, turned: the tip points right and the arrow's centre sits on the minus sign's
    axis, where a horizontal arrow belongs. The ↓ is all straight lines, so the turn is exact.

    Proportional (spec without "mono"): the side bearings stay the ↓'s, and the advance becomes the
    ↓'s length plus them. In a variable font every gvar tuple is turned with the points, corrected so
    the side bearings and the axis stay put while the weight and width move, and the advance goes
    into HVAR, which browsers read before gvar.
    Monospaced (spec "mono": true): the advance stays the cell's, and the turned arrow is centred in
    it. The source must be static and its ↓ no longer than the cell is wide.
    """
    cmap = font.getBestCmap()
    src, axis = cmap[spec["from"]], cmap[spec["axis"]]
    name = spec["name"]
    if spec["to"] in cmap:
        sys.exit(f"fonts.py: the source already maps U+{spec['to']:04X}")
    if name in font.getGlyphOrder():
        sys.exit(f"fonts.py: the source already has a glyph named {name}")
    glyf, hmtx = font["glyf"], font["hmtx"]
    gvar = font["gvar"] if "gvar" in font else None
    mono = bool(spec.get("mono"))
    if mono and gvar is not None:
        sys.exit("fonts.py: a monospaced turn is only handled for a static source")
    g = glyf[src]
    if g.isComposite() or g.numberOfContours <= 0:
        sys.exit(f"fonts.py: {src} must be a simple glyph")
    coords, ends, flags = g.getCoordinates(glyf)
    x0, y0, x1, y1 = glyph_bounds(font, src)
    adv, lsb = hmtx[src]
    rsb = adv - x1
    _, ay0, _, ay1 = glyph_bounds(font, axis)
    if mono:
        if y1 - y0 > adv:
            sys.exit(f"fonts.py: {src} is {y1 - y0} long, more than the {adv} cell")
        new_lsb = (adv - (y1 - y0)) // 2
        new_adv = adv
    else:
        new_lsb = lsb
        new_adv = lsb + (y1 - y0) + rsb
    # (x, y) -> (-y + tx, x + ty): a quarter turn anticlockwise, so the ↓'s tip points right.
    tx = new_lsb + y1
    ty = round((ay0 + ay1) / 2 - (x0 + x1) / 2)
    top = [i for i, (_, y) in enumerate(coords) if y == y1]
    tip = [i for i, (_, y) in enumerate(coords) if y == y0]
    left = [i for i, (x, _) in enumerate(coords) if x == x0]
    right = [i for i, (x, _) in enumerate(coords) if x == x1]

    new = Glyph()
    new.numberOfContours = g.numberOfContours
    new.endPtsOfContours = list(ends)
    new.flags = flags.copy() if hasattr(flags, "copy") else list(flags)
    new.coordinates = GlyphCoordinates([(-y + tx, x + ty) for x, y in coords])
    new.program = ttProgram.Program()
    new.program.fromBytecode(b"")
    new.recalcBounds(glyf)

    n = len(coords)
    turned, advances = [], []
    for tv in (gvar.variations.get(src, []) if gvar is not None else []):
        d = filled_deltas(font, src, tv)
        # The ↓'s top edge (the → 's left end) and its tip move with the weight and width. Shift the
        # turned outline so its left side bearing stays; keep the barbs' midpoint on the axis.
        dtop = sum(d[i][1] for i in top) / len(top)
        dtip = sum(d[i][1] for i in tip) / len(tip)
        dmid = round((sum(d[i][0] for i in left) / len(left) + sum(d[i][0] for i in right) / len(right)) / 2)
        pts = [(round(-dy + dtop), dx - dmid) for dx, dy in d[:n]]
        dadv = round(dtop - dtip)
        pts += [(0, 0), (dadv, 0), (0, 0), (0, 0)]
        turned.append(TupleVariation(dict(tv.axes), pts))
        advances.append((tv.axes, dadv))

    order = list(font.getGlyphOrder()) + [name]
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    glyf.glyphs[name] = new
    hmtx.metrics[name] = (new_adv, new_lsb)
    if gvar is not None:
        gvar.variations[name] = turned
    for t in font["cmap"].tables:
        if t.isUnicode():
            t.cmap[spec["to"]] = name
    # The turned glyph is whatever kind of glyph its source is (Instrument's ↓ is a base glyph;
    # Fragment Mono leaves its ↓ unclassified).
    if "GDEF" in font and font["GDEF"].table.GlyphClassDef:
        classes = font["GDEF"].table.GlyphClassDef.classDefs
        if src in classes or not mono:
            classes[name] = classes.get(src, 1)

    # HVAR: the advance's deltas as one new row, over the regions the gvar tuples name.
    hvar = font["HVAR"].table if "HVAR" in font else None
    if hvar is not None:
        if hvar.AdvWidthMap is None:
            sys.exit("fonts.py: HVAR without an AdvWidthMap is not handled")
        tags = [a.axisTag for a in font["fvar"].axes]
        regions = hvar.VarStore.VarRegionList.Region

        def region_of(axes):
            want = [axes.get(tag, (0.0, 0.0, 0.0)) for tag in tags]
            for ri, r in enumerate(regions):
                have = [(a.StartCoord, a.PeakCoord, a.EndCoord) for a in r.VarRegionAxis]
                if all(abs(p - q) < 1e-4 for w, h in zip(want, have) for p, q in zip(w, h)):
                    return ri
            sys.exit(f"fonts.py: no HVAR region for {axes}")

        indices = [region_of(axes) for axes, _ in advances]
        hvar.VarStore.VarData.append(builder.buildVarData(indices, [[d for _, d in advances]], optimize=False))
        hvar.VarStore.VarDataCount = len(hvar.VarStore.VarData)
        hvar.AdvWidthMap.mapping[name] = ((len(hvar.VarStore.VarData) - 1) << 16) | 0
    return {"from": f"U+{spec['from']:04X}", "axis": f"U+{spec['axis']:04X}", **({"cell": new_adv} if mono else {})}


def derive_doubled(font, spec):
    """Add a glyph that is another glyph of the same font drawn twice side by side: ‖ from |.

    The site prints the commitment scheme as commit(secret‖ctx, salt), and Fragment Mono has no ‖
    (U+2016). A system double bar beside it would be another drawing, narrower than the mono cell,
    and would break the column. So ‖ is the font's own | stem, twice, `gap` units apart, the pair
    centred in the cell, the stems' height and weight the |'s own. Static monospaced sources only.
    """
    cmap = font.getBestCmap()
    src, name = cmap[spec["from"]], spec["name"]
    if spec["to"] in cmap:
        sys.exit(f"fonts.py: the source already maps U+{spec['to']:04X}")
    if name in font.getGlyphOrder():
        sys.exit(f"fonts.py: the source already has a glyph named {name}")
    if "gvar" in font:
        sys.exit("fonts.py: a doubled glyph is only handled for a static source")
    glyf, hmtx = font["glyf"], font["hmtx"]
    g = glyf[src]
    if g.isComposite() or g.numberOfContours <= 0:
        sys.exit(f"fonts.py: {src} must be a simple glyph")
    coords, ends, flags = g.getCoordinates(glyf)
    x0, _, x1, _ = glyph_bounds(font, src)
    adv, _ = hmtx[src]
    stem, gap = x1 - x0, spec["gap"]
    width = 2 * stem + gap
    if width > adv:
        sys.exit(f"fonts.py: two {stem}-unit stems {gap} apart are wider than the {adv} cell")
    left = (adv - width) // 2
    a, b = left - x0, left - x0 + stem + gap
    n = len(coords)
    new = Glyph()
    new.numberOfContours = 2 * g.numberOfContours
    new.endPtsOfContours = list(ends) + [e + n for e in ends]
    new.flags = (flags + flags) if not hasattr(flags, "copy") else type(flags)(list(flags) + list(flags))
    new.coordinates = GlyphCoordinates([(x + a, y) for x, y in coords] + [(x + b, y) for x, y in coords])
    new.program = ttProgram.Program()
    new.program.fromBytecode(b"")
    new.recalcBounds(glyf)

    order = list(font.getGlyphOrder()) + [name]
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    glyf.glyphs[name] = new
    hmtx.metrics[name] = (adv, left)
    for t in font["cmap"].tables:
        if t.isUnicode():
            t.cmap[spec["to"]] = name
    if "GDEF" in font and font["GDEF"].table.GlyphClassDef:
        classes = font["GDEF"].table.GlyphClassDef.classDefs
        if src in classes:
            classes[name] = classes[src]
    return {"from": f"U+{spec['from']:04X}", "doubled": True, "gap": gap, "cell": adv}


def check_doubled(out, spec):
    """The doubled glyph fills its source's cell, its two stems level with the source's, the pair
    centred in the cell within a unit, the gap as asked."""
    f = TTFont(out)
    cmap = f.getBestCmap()
    src, new = cmap[spec["from"]], cmap[spec["to"]]
    sx0, sy0, sx1, sy1 = glyph_bounds(f, src)
    nx0, ny0, nx1, ny1 = glyph_bounds(f, new)
    sadv, _ = f["hmtx"][src]
    nadv, _ = f["hmtx"][new]
    stem = sx1 - sx0
    problems = []
    if nadv != sadv:
        problems.append(f"advance {nadv}, not the cell's {sadv}")
    if (ny0, ny1) != (sy0, sy1):
        problems.append(f"stems from {ny0} to {ny1}, not the source's {sy0} to {sy1}")
    if nx1 - nx0 != 2 * stem + spec["gap"]:
        problems.append(f"{nx1 - nx0} wide, not two {stem}-unit stems {spec['gap']} apart")
    if abs((nx0 + nx1) - nadv) > 1:
        problems.append(f"centred at {(nx0 + nx1) / 2}, not the cell's {nadv / 2}")
    if problems:
        sys.exit(f"fonts.py: {os.path.basename(out)} U+{spec['to']:04X}: {'; '.join(problems)}")
    return 1


def check_turned(out, spec):
    """At the corners and the middle of the kept design space (or once, for a static font), the
    turned glyph spans its source's length, sits centred on the axis glyph, and keeps its source's
    side bearings (proportional) or its cell, centred in it (monospaced). Within 3 units in 1000:
    instancing to the kept ranges rescales every tuple's deltas and rounds each one, which moves the
    source and its turned copy by different fractions."""
    tol = 3
    checked = 0
    built = TTFont(out)
    kept = {a.axisTag: (a.minValue, a.maxValue) for a in built["fvar"].axes} if "fvar" in built else {}
    grid = [{}]
    for tag, (lo, hi) in kept.items():
        grid = [dict(g, **{tag: v}) for g in grid for v in sorted({lo, (lo + hi) / 2, hi})]
    for loc in grid:
        f = instancer.instantiateVariableFont(TTFont(out), loc) if loc else TTFont(out)
        cmap = f.getBestCmap()
        src, new, axis = cmap[spec["from"]], cmap[spec["to"]], cmap[spec["axis"]]
        sx0, sy0, sx1, sy1 = glyph_bounds(f, src)
        nx0, ny0, nx1, ny1 = glyph_bounds(f, new)
        _, ay0, _, ay1 = glyph_bounds(f, axis)
        sadv, slsb = f["hmtx"][src]
        nadv, nlsb = f["hmtx"][new]
        problems = []
        if spec.get("mono"):
            if nadv != sadv:
                problems.append(f"advance {nadv}, not the cell's {sadv}")
            if abs(nlsb - (nadv - nx1)) > 1:
                problems.append(f"side bearings {nlsb} and {nadv - nx1}: not centred in the cell")
        else:
            if abs(nlsb - slsb) > tol:
                problems.append(f"left side bearing {nlsb}, not {slsb}")
            if abs((nadv - nx1) - (sadv - sx1)) > tol:
                problems.append(f"right side bearing {nadv - nx1}, not {sadv - sx1}")
        if abs((nx1 - nx0) - (sy1 - sy0)) > tol or abs((ny1 - ny0) - (sx1 - sx0)) > tol:
            problems.append(f"{nx1 - nx0} x {ny1 - ny0}, not the source's {sy1 - sy0} x {sx1 - sx0}")
        if abs((ny0 + ny1) / 2 - (ay0 + ay1) / 2) > tol:
            problems.append(f"centred at {(ny0 + ny1) / 2}, the axis at {(ay0 + ay1) / 2}")
        if problems:
            sys.exit(f"fonts.py: {os.path.basename(out)} U+{spec['to']:04X} at {loc or 'its only instance'}: {'; '.join(problems)}")
        checked += 1
    return checked


def build(job, requested_latin):
    out = job["out"]
    if "merge" in job:
        # Each glyph sits in a different numbered subset of the source: cut each part to its own
        # glyphs, then merge them into one font.
        with tempfile.TemporaryDirectory() as tmp:
            parts, requested = [], set()
            for i, part in enumerate(job["merge"]):
                f = TTFont(part["src"])
                subset_font(f, part["unicodes"], job["features"], job.get("drop", ()))
                p = os.path.join(tmp, f"part{i}.ttf")
                f.flavor = None
                f.save(p)
                parts.append(p)
                requested |= set(part["unicodes"])
            merged = Merger().merge(parts)
            save_woff2(merged, out)
        return describe(out, requested)

    font = TTFont(job["src"])
    derived = [derive_turned(font, spec) | {"to": f"U+{spec['to']:04X}"} for spec in job.get("turn", [])]
    derived += [derive_doubled(font, spec) | {"to": f"U+{spec['to']:04X}"} for spec in job.get("double", [])]
    # A derived glyph is kept by the subset whether or not the shared Latin set names it.
    wanted = set(requested_latin) | {spec["to"] for spec in job.get("double", [])}
    limits = {k: (tuple(v) if isinstance(v, list) else v) for k, v in (job.get("limits") or {}).items()}
    if limits:
        pins = {k: v for k, v in limits.items() if not isinstance(v, tuple)}
        pin_feature_variations(font, pins)
        font = instancer.instantiateVariableFont(font, limits, updateFontNames=False)
    subset_font(font, wanted, job["features"], job.get("drop", ()))
    save_woff2(font, out)
    report = describe(out, requested_latin)
    if limits:
        report["substitutionsChecked"] = check_feature_variations(out, job["src"], limits)
    if derived:
        report["derived"] = derived
        report["derivedChecked"] = sum(check_turned(out, spec) for spec in job["turn"]) \
            + sum(check_doubled(out, spec) for spec in job.get("double", []))
    return report


def normalized(font, location):
    axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes}
    loc = normalizeLocation(location, axes)
    avar = font["avar"].segments if "avar" in font else {}
    return {k: floatToFixedToFloat(piecewiseLinearMap(v, avar[k]) if k in avar else v, 14) for k, v in loc.items() if k in location}


def pin_feature_variations(font, pins):
    """Resolve the conditions on pinned axes in GSUB/GPOS FeatureVariations before instancing.

    fontTools 4.60.2 loses a record whose conditions all become true when it partially instances a
    font whose other records apply at the new default: Fraunces roman pinned to WONK=0 kept its
    "wonky" h, m and n above 18pt. Here a record whose pinned conditions fail is dropped; one whose
    conditions all pass becomes the default features, and no later record is ever reached.
    check_feature_variations() compares the result with full instances of the source.
    """
    if "fvar" not in font or not pins:
        return
    tags = [a.axisTag for a in font["fvar"].axes]
    at = normalized(font, pins)
    for tag in ("GSUB", "GPOS"):
        table = font[tag].table if tag in font else None
        fv = getattr(table, "FeatureVariations", None) if table else None
        if not fv:
            continue
        kept = []
        for rec in fv.FeatureVariationRecord:
            conds, holds = [], True
            for c in rec.ConditionSet.ConditionTable:
                axis = tags[c.AxisIndex]
                if axis not in at:
                    conds.append(c)
                elif not (c.FilterRangeMinValue <= at[axis] <= c.FilterRangeMaxValue):
                    holds = False
            if not holds:
                continue
            if not conds:
                for sr in rec.FeatureTableSubstitution.SubstitutionRecord:
                    table.FeatureList.FeatureRecord[sr.FeatureIndex].Feature = sr.Feature
                break
            rec.ConditionSet.ConditionTable = conds
            rec.ConditionSet.ConditionCount = len(conds)
            kept.append(rec)
        fv.FeatureVariationRecord = kept
        fv.FeatureVariationCount = len(kept)


def substituted(font, location):
    """The characters rvrn substitutes at a location, by the FeatureVariations first-match rule."""
    if "GSUB" not in font:
        return set()
    table = font["GSUB"].table
    features = {i: fr.Feature for i, fr in enumerate(table.FeatureList.FeatureRecord)}
    fv = getattr(table, "FeatureVariations", None)
    if fv and "fvar" in font:
        tags = [a.axisTag for a in font["fvar"].axes]
        at = normalized(font, location)
        for rec in fv.FeatureVariationRecord:
            if all(c.FilterRangeMinValue <= at[tags[c.AxisIndex]] <= c.FilterRangeMaxValue for c in rec.ConditionSet.ConditionTable):
                for sr in rec.FeatureTableSubstitution.SubstitutionRecord:
                    features[sr.FeatureIndex] = sr.Feature
                break
    cmap = font.getBestCmap()
    by_glyph = {}
    for cp, g in cmap.items():
        by_glyph.setdefault(g, set()).add(cp)
    out = set()
    for i, fr in enumerate(table.FeatureList.FeatureRecord):
        if fr.FeatureTag != "rvrn":
            continue
        for li in features[i].LookupListIndex:
            for st in table.LookupList.Lookup[li].SubTable:
                for g in getattr(st, "mapping", {}):
                    out |= by_glyph.get(g, set())
    return out


def check_feature_variations(out, src, limits):
    """Across a grid of the kept axes, the output substitutes exactly what a full instance of the
    source substitutes at the same location. Returns how many locations were compared."""
    built = TTFont(out)
    kept = {a.axisTag: (a.minValue, a.maxValue) for a in built["fvar"].axes}
    pins = {k: v for k, v in limits.items() if not isinstance(v, tuple)}
    grid = [{}]
    for tag, (lo, hi) in kept.items():
        steps = sorted({lo, hi, *[v for v in (9, 12, 17, 18, 19, 24, 36, 72, 144, 300, 400, 500, 600, 80, 90, 100) if lo <= v <= hi]})
        grid = [dict(g, **{tag: v}) for g in grid for v in steps]
    cmap = set(built.getBestCmap())
    for loc in grid:
        full = instancer.instantiateVariableFont(TTFont(src), dict(pins, **loc), updateFontNames=False)
        want = substituted(full, {}) & cmap
        have = substituted(built, loc)
        if want != have:
            sys.exit(f"fonts.py: {os.path.basename(out)} at {loc}: substitutes {sorted(map(chr, have))}, the source {sorted(map(chr, want))}")
    return len(grid)


def static_instance(path, location):
    f = TTFont(path)
    if location and "fvar" in f:
        f = instancer.instantiateVariableFont(f, location, updateFontNames=False)
    return f


def advance_sum(font, text):
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    return sum(hmtx[cmap[ord(c)]][0] for c in text if ord(c) in cmap)


def fallbacks(spec):
    text = spec["sample"]
    out = {}
    for name, f in spec["faces"].items():
        web = static_instance(f["web"], f.get("at"))
        local = TTFont(f["local"])
        missing = sorted({c for c in text if ord(c) not in web.getBestCmap() or ord(c) not in local.getBestCmap()})
        if missing:
            sys.exit(f"fonts.py: {name}: sample characters missing: {missing}")
        w = advance_sum(web, text) / web["head"].unitsPerEm
        l = advance_sum(local, text) / local["head"].unitsPerEm
        size = w / l
        upem = web["head"].unitsPerEm
        hhea = web["hhea"]
        pct = lambda v: round(v * 100, 2)
        out[name] = {
            "local": os.path.basename(f["local"]),
            "at": f.get("at", {}),
            "size-adjust": f"{pct(size)}%",
            "ascent-override": f"{pct(hhea.ascent / upem / size)}%",
            "descent-override": f"{pct(-hhea.descent / upem / size)}%",
            "line-gap-override": f"{pct(hhea.lineGap / upem / size)}%",
        }
    return out


def main():
    tools = check_tools()
    spec = json.load(sys.stdin)
    if spec.get("mode") == "fallbacks":
        json.dump({"tools": tools, "fallbacks": fallbacks(spec)}, sys.stdout, indent=2)
        return
    latin = set()
    for r in spec["latin"]:
        latin |= set(range(r[0], r[-1] + 1))
    report = {job["name"]: build(job, latin) for job in spec["jobs"]}
    json.dump({"tools": tools, "outputs": report}, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
