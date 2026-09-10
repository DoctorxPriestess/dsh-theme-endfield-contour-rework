/**
 * contour-cusps.test.js — 等高线笔画中不允许出现可见锐角尖刺（锯齿）.
 *
 * WHY THIS TEST EXISTS. contour-smoothness.test.js compares curve-drawn against
 * straight-drawn pixels. That proves smoothing runs, but a defect shared by both
 * renderings is invisible to it. The historical artefact was exactly that: sharp
 * angles present in every frame, reported as visible "while it changes" because
 * the sheet redraws many times a second. This test therefore measures the DRAWN
 * CURVE ITSELF: it stubs a 2d context, lets the SHIPPED contourRenderCache()
 * record its own moveTo/lineTo/bezierCurveTo/closePath stream, samples that
 * stream densely (de Casteljau, not endpoint chords), and measures the turn
 * angle at every sampled point — including across a closed ring's seam.
 * Nothing about the curve layout is re-derived here, so the test cannot
 * silently drift away from the renderer it is checking.
 *
 * DRAWING MODEL. contourRenderCache() opens ONE path, walks every contour with
 * its own moveTo, and strokes once — so the recording is split on moveTo
 * markers into individual subpaths before any angle is measured. A closed ring
 * is drawn back onto its own start point, so its duplicated seam sample is
 * dropped and its turns are measured cyclically.
 *
 * ADAPTED TO THE TILEABLE-TERRAIN ENGINE. The old version swept an animation
 * phase; the new architecture never re-extracts (the terrain is generated once
 * and only translated), so the "sequence" is now a sweep over viewport SIZES and
 * DENSITY settings — the two things that legitimately rebuild or re-extract the
 * landscape. Same defects, same measurement.
 *
 *   1. no degenerate final span (a 180-degree cusp with a whisker);
 *   2. ring seams — closed rings must be drawn as rings (seam corner measured);
 *   3. tangency needles — hairpins whose base is narrower than the stroke;
 *   4. geometry sanity — every coordinate finite and inside the tile plus the
 *      one-cell grid overshoot, so the scroll wrap cannot show a hard seam;
 *   5. extraction integrity — no duplicated contour and no vertex teleport.
 *      The hCount defect (a missing field in the generated terrain made every
 *      vertical-edge id NaN, which an Int32Array silently stored as 0) poisoned
 *      the stitched walk: it emitted previously-computed vertices from an older
 *      iso-level. It showed up as identical rings repeated across levels and as
 *      giant jumps inside one contour, and neither the pixel tests nor the
 *      smoothness tests noticed. These two checks are what caught it.
 *
 * Usage: node test/contour-cusps.test.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
/* Line endings are normalised before anything is sliced out: this harness cuts
   declarations out of client.js by line, so a CRLF checkout (git's default on
   Windows) must not change what it sees. */
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8').replace(/\r\n/g, '\n')

function grab(name) {
  const at = src.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  const i = src.indexOf('{', at)
  let d = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}') {
      d--
      if (d === 0) {
        // IIFE declarations end with `)()` after the balanced body; swallow them
        // or the extracted source is a syntax error.
        const rest = src.slice(j + 1, j + 9)
        const m = rest.match(/^\s*\)\s*\(\s*\)/)
        const end = j + 1 + (m ? m[0].length : 0)
        return src.slice(at, end)
      }
    }
  }
  throw new Error('unbalanced: ' + name)
}
function grabNum(name) {
  const m = src.match(new RegExp('const ' + name + ' = ([0-9.]+)'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}
function grabLine(name) {
  const m = src.match(new RegExp('const ' + name + ' = (\\[[^\\]]*\\])'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}
function grabOne(name) {
  const m = src.match(new RegExp('const ' + name + ' = .*'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return m[0]
}

/* The field, extraction and cache code touches only typed arrays, Math and a 2d
   context, so it runs directly in Node against a recording stub. Names must
   track client.js; a missing one throws here instead of failing mysteriously. */
const fns = ['contourRng', 'contourRollSeed', 'contourReseed', 'contourNoise',
  'contourGenerateField', 'contourLevels', 'contourExtractLevel', 'contourExtractAll',
  'contourStroke', 'contourRenderCache']
  .map(grab).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES',
  'CONTOUR_PERSIST', 'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX']
  .map(grabNum).join('\n')
const lines = ['CONTOUR_DENSITIES'].map(grabLine).join('\n')
const exprs = ['CONTOUR_GRAD_X', 'CONTOUR_GRAD_Y', 'CONTOUR_KEEP_LEN',
  'CONTOUR_KEEP_RING', 'CONTOUR_LEVEL_MARGIN'].map(grabOne).join('\n')

let api
try {
  api = new Function(`
let contourField=null, contourPaths=[], contourTex=null
${nums}
${lines}
${exprs}
${fns}
/* Fixed seed ON PURPOSE: a geometry regression must measure the SAME landscape
   every run. contourSeed is a let in client.js (a mount re-rolls it), so the
   harness pins it here instead of re-seeding per build. */
const contourPerm = new Uint16Array(512)
let contourSeed = contourReseed(0x5eed4242)
// Density switch stub: the sweep mutates this to re-extract at another density.
let contourDensityIdx=1
const contourDensityIndex=()=>contourDensityIdx
const isDarkScheme=()=>false
const isWulingPalette=()=>false

function build(w, h, density) {
  contourDensityIdx = density
  contourField = contourGenerateField(w, h)
  contourExtractAll()
  // Snapshot the raw extraction: the duplicate/teleport checks must see the
  // extractor's own output, not whatever the smoother happens to preserve.
  const raw = contourPaths.map((p) => Array.from(p))
  const REC = { strokes: 0, subs: [] }
  let cur = null
  const ctx = {
    setTransform(){}, clearRect(){},
    beginPath(){},
    moveTo(x, y){ cur = { closed: false, pts: [{ x, y }] }; REC.subs.push(cur) },
    lineTo(x, y){ if (cur) cur.pts.push({ x, y }) },
    bezierCurveTo(a, b, c, d, e, f){ if (cur) cur.pts.push({ c1x: a, c1y: b, c2x: c, c2y: d, x: e, y: f }) },
    closePath(){ if (cur) cur.closed = true },
    stroke(){ REC.strokes++ },
  }
  contourTex = { cv: { getContext: () => ctx, width: w, height: h }, wCss: w, hCss: h }
  contourRenderCache()
  REC.raw = raw
  return REC
}

return {
  build,
  /* Terrain lifecycle. client.js keeps the permutation table as the single carrier
     of terrain randomness and refills it in place from a new seed on every mount,
     so "same seed => same landscape" and "new seed => new landscape" are both
     provable here. */
  reseed(seed) { contourSeed = contourReseed(seed) },
  fieldRange() { return contourField === null ? 'none' : contourField.mn.toFixed(6) + '..' + contourField.mx.toFixed(6) },
  signature() {
    const parts = []
    for (const p of contourPaths) {
      parts.push(p.length)
      for (let k = 0; k < p.length; k++) parts.push(p[k].toFixed(2))
    }
    return parts.join('|')
  },
}
`)()
} catch (e) {
  console.error('FAIL  harness could not be built: ' + e.message)
  process.exit(1)
}

let bad = 0
const ok = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); bad++ }

/** Dense polyline of a recorded subpath (de Casteljau, `samples` per cubic). */
function polylineOf(sub, samples) {
  const dense = []
  for (const p of sub.pts) {
    if (p.c1x === undefined) { dense.push([p.x, p.y]); continue }
    const [x0, y0] = dense[dense.length - 1]
    const x1 = p.c1x, y1 = p.c1y, x2 = p.c2x, y2 = p.c2y, x3 = p.x, y3 = p.y
    for (let s = 1; s <= samples; s++) {
      const t = s / samples
      const mt = 1 - t
      const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t
      dense.push([a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3])
    }
  }
  return dense
}
/** Arc length of a polyline. */
function arcLength(poly) {
  let sum = 0
  for (let i = 1; i < poly.length; i++) {
    sum += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])
  }
  return sum
}
/** Larger side of a polyline's bounding box. */
function boxSide(poly) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0]
    if (p[0] > x1) x1 = p[0]
    if (p[1] < y0) y0 = p[1]
    if (p[1] > y1) y1 = p[1]
  }
  return Math.max(x1 - x0, y1 - y0)
}
/* Dense sampling of one recorded subpath.
   Closed rings: the renderer walks back onto the start point before closePath,
   so the final sample duplicates the first; it is dropped and the turns are
   measured cyclically, which puts the ring's seam corner under the same
   measurement as every other join. */
function sampleTurns(sub, samples) {
  const dense = polylineOf(sub, samples)
  let turns = []
  let maxStep = 0
  if (!sub.closed) {
    for (let i = 1; i < dense.length; i++) {
      maxStep = Math.max(maxStep, Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]))
    }
    for (let i = 1; i < dense.length - 1; i++) {
      turns.push(turnAt(dense[i - 1], dense[i], dense[i + 1]))
    }
  } else {
    const last = dense[dense.length - 1]
    const dupSeam = Math.abs(last[0] - dense[0][0]) < 1e-6 && Math.abs(last[1] - dense[0][1]) < 1e-6
    const m = dupSeam ? dense.length - 1 : dense.length
    for (let i = 0; i < m; i++) {
      const prev = dense[(i - 1 + m) % m]
      const cur = dense[i]
      const next = dense[(i + 1) % m]
      maxStep = Math.max(maxStep, Math.hypot(cur[0] - prev[0], cur[1] - prev[1]))
      turns.push(turnAt(prev, cur, next))
    }
  }
  // A kink needs curve on BOTH sides of it to be visible: where a contour folds
  // back on itself with one leg of 0.05px, both legs render inside the same 1px
  // stroke, and the angle at the fold means nothing. Such folds are numeric
  // noise (two marching-squares crossings can sit arbitrarily close when a level
  // grazes a grid node), so a turn is counted only when both adjacent spans are
  // long enough to be seen.
  const MIN_SPAN = 0.3
  return {
    turns: turns.filter((t) => t.spanA >= MIN_SPAN && t.spanB >= MIN_SPAN).map((t) => t.angle),
    maxStep,
  }
}
function turnAt(a, b, c) {
  const spanA = Math.hypot(b[0] - a[0], b[1] - a[1])
  const spanB = Math.hypot(c[0] - b[0], c[1] - b[1])
  let angle = spanA > 0 && spanB > 0
    ? Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * 180 / Math.PI
    : 0
  if (angle > 180) angle = 360 - angle
  return { angle, spanA, spanB }
}

/* The sweep: viewport sizes x 2 densities — every rebuild/re-extract the new
   architecture can legitimately do. Small and extreme-aspect sizes are included
   because the texture target clamps there (quantised minimum, per-side cap), and
   a clamped size is where the period maths could go wrong. Bounds are the tile
   plus one grid cell: marching-squares vertices sit on grid edges up to
   CONTOUR_STEP - 1 px past the right/bottom edge, and smoothing stays inside the
   vertex hull. */
const SIZES = [[320, 240], [2000, 200], [1152, 648], [1432, 753], [960, 1080], [1920, 950]]
const DENSITIES = [1, 2]
let worstMax = 0
const worstP99s = []
let totalRings = 0
let totalSubs = 0
let geometryBad = 0
let duplicated = 0
let teleports = 0
let worstStep = 0
/* Debris guard. The browser test contour-specks.test.js measures this on pixels;
   this is the same property measured on the drawn geometry, so it still holds in
   an environment with no browser. The extractor's keep() threshold is
   CONTOUR_KEEP_LEN px of raw stroke and CONTOUR_KEEP_RING px of ring box, so
   nothing shorter than that can legitimately be drawn. */
let shortestContour = Infinity
let smallestRingBox = Infinity

for (const [w, h] of SIZES) {
  for (const density of DENSITIES) {
    const REC = api.build(w, h, density)
    const subs = REC.subs
    totalSubs += subs.length
    if (REC.strokes === 0) { fail(w + 'x' + h + ' d' + density + ': nothing stroked at all'); continue }
    if (subs.length < 3) { fail(w + 'x' + h + ' d' + density + ': only ' + subs.length + ' subpath(s) drawn'); continue }
    // 5a. Extraction integrity: the same contour may not appear twice.
    const seenPaths = new Set()
    for (const p of REC.raw) {
      const key = p.map((v) => v.toFixed(2)).join(',')
      if (seenPaths.has(key)) duplicated++
      seenPaths.add(key)
    }
    const allTurns = []
    for (const sub of subs) {
      const { turns, maxStep } = sampleTurns(sub, 6)
      for (const t of turns) allTurns.push(t)
      if (sub.closed) totalRings++
      if (maxStep > worstStep) worstStep = maxStep
      // Debris: how small is the smallest thing on screen?
      const poly = polylineOf(sub, 6)
      const len = arcLength(poly)
      if (len < shortestContour) shortestContour = len
      if (sub.closed) {
        const box = boxSide(poly)
        if (box < smallestRingBox) smallestRingBox = box
      }
      // 5b. A stitched contour walks cell to cell, so consecutive vertices are
      // at most ~1.5 grid steps apart. Anything larger means the walk emitted a
      // vertex it did not compute (the stale-vertex class of defect).
      if (maxStep > 25) teleports++
      // 4. Every recorded point must be finite and inside the tile + grid cell.
      const bx = w + 11 /* CONTOUR_STEP - 1 + margin */
      const by = h + 11
      for (const p of sub.pts) {
        const xs = [p.x, p.c1x, p.c2x].filter((v) => v !== undefined)
        const ys = [p.y, p.c1y, p.c2y].filter((v) => v !== undefined)
        for (const v of xs) if (!Number.isFinite(v) || v < -1 || v > bx) geometryBad++
        for (const v of ys) if (!Number.isFinite(v) || v < -1 || v > by) geometryBad++
      }
    }
    allTurns.sort((a, b) => a - b)
    const p99 = allTurns[Math.floor(allTurns.length * 0.99)]
    const mx = allTurns[allTurns.length - 1]
    worstP99s.push(p99)
    if (mx > worstMax) worstMax = mx
    console.log('  ' + w + 'x' + h + ' d' + density + ': subs ' + subs.length
      + '  raw ' + REC.raw.length + '  p99 ' + p99.toFixed(1) + '  max ' + mx.toFixed(1) + ' deg')
  }
}

if (geometryBad === 0) ok('all recorded coordinates finite and inside the tile')
else fail(geometryBad + ' recorded coordinate(s) are non-finite or outside the tile')

if (duplicated === 0) ok('no contour extracted twice')
else fail(duplicated + ' contour(s) are byte-identical duplicates of another — the stitched walk is reusing state between levels')

if (teleports === 0) ok('no vertex teleport inside a contour (worst step ' + worstStep.toFixed(1) + 'px)')
else fail(teleports + ' contour(s) jump further than a grid cell — stale vertices from an older iso-level')

if (worstMax <= 150) ok('no cusp anywhere in the sweep (worst turn ' + worstMax.toFixed(1) + ' deg)')
else fail('cusp came back: worst turn ' + worstMax.toFixed(1) + ' deg')

const over90 = worstP99s.filter((p) => p >= 90).length
if (over90 === 0) ok('no landscape in the sweep has a p99 turn >= 90 deg')
else fail(over90 + ' landscape(s) in the sweep have p99 turn >= 90 deg')

const worstP99 = Math.max.apply(null, worstP99s)
if (worstP99 < 12) ok('bulk stays smooth: worst p99 turn ' + worstP99.toFixed(1) + ' deg')
else fail('p99 turn angle rose to ' + worstP99.toFixed(1) + ' deg — strokes are faceted again')

if (totalRings > 0) ok('closed rings drawn as rings: ' + totalRings + ' across the sweep')
else fail('no closed subpath in the whole sweep — rings are being drawn open again')

/* Debris. The drawn curve is a little shorter than the raw stroke it replaces
   (corner cutting), so the thresholds sit just under the extractor's own
   keep() limits: any speck regression shows up here as a sub-45px contour or a
   ring box under 25px. */
if (shortestContour >= 45) ok('no debris: shortest drawn contour ' + shortestContour.toFixed(1) + 'px')
else fail('a contour of only ' + shortestContour.toFixed(1) + 'px was drawn — debris is reaching the cache')
if (smallestRingBox >= 25) ok('no debris rings: smallest ring box ' + smallestRingBox.toFixed(1) + 'px')
else fail('a ring with a box of only ' + smallestRingBox.toFixed(1) + 'px was drawn')

/* 6. Terrain lifecycle: a mount re-rolls the permutation table, so the same seed
      must reproduce the identical landscape (resize determinism, spec 13) and a
      different seed must produce a different one (fresh terrain per start, spec
      11/12). Both are checked on the extractor's own output. */
api.reseed(0x5eed4242)
api.build(1152, 648, 1)
const sigA = api.signature()
api.reseed(0x5eed4242)
api.build(1152, 648, 1)
const sigAgain = api.signature()
api.reseed(0x1234abcd)
api.build(1152, 648, 1)
const sigB = api.signature()
if (sigA === sigAgain && sigA.length > 0) ok('same seed + same size reproduces the identical terrain (resize is deterministic)')
else fail('the same seed produced a different terrain on rebuild')
if (sigB !== sigA) ok('a re-seed produces a different terrain (each start draws a new map)')
else fail('re-seeding did not change the terrain')
/* A different ISO-LEVEL count must re-extract from the SAME terrain: the first
   level's geometry may differ, but the field itself must not be regenerated -- the
   generator only ever sees (cols, rows, seed), and the cusp assertions above
   already cover its output shape. Here the weaker, direct check is that a
   density change keeps the field's own range identical. */
api.reseed(0x5eed4242)
api.build(1152, 648, 1)
const rangeA = api.fieldRange()
api.build(1152, 648, 2)
const rangeB = api.fieldRange()
if (rangeA === rangeB) ok('a density change reuses the same field (range ' + rangeA + ')')
else fail('a density change regenerated the field (range ' + rangeA + ' -> ' + rangeB + ')')

console.log('  worst over the sweep: max turn ' + worstMax.toFixed(1) + ' deg, subpaths ' + totalSubs)
console.log('')
if (bad) { console.error(bad + ' cusp/smoothness check(s) failed'); process.exit(1) }
console.log('all cusp checks passed')
