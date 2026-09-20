/**
 * contour-roughness.test.js — prove the terrain-roughness slider is a real,
 * monotone, legible ladder — and that its default stop is the shipped terrain.
 *
 * Why this exists. 「地形粗糙度」is the only setting that changes the SHAPE of the
 * landscape (density only re-extracts iso-levels from the same field, direction
 * and speed only retime the scroll). It is therefore the one setting whose
 * failure mode is not an exception but a BAD MAP: a stop that draws nothing, two
 * neighbouring detents that draw the same thing (a slider that does nothing on
 * half its travel), or — the one that actually bit during development — a top end
 * so rough that the sheet stops reading as terrain and becomes uniform speckle.
 * None of those throw, and the existing suites would all stay green: the cusp and
 * smoothness sweeps only inspect the DEFAULT stop, and the specks test only asks
 * whether individual chains are debris.
 *
 * So this file measures the whole ladder the way a user sees it:
 *   - the three parameter tables are well-formed and sorted plains -> mountains;
 *   - the default stop is literally the shipped constants (280 / 0.5 / 5), so
 *     "the slider opens on the terrain you already have" is a provable claim;
 *   - the octave ladder is bounded by the permutation table on every texture size
 *     a viewport can produce, and never collapses to zero octaves;
 *   - the finest octave of every stop stays a minority of the field's amplitude
 *     (the measured legibility ceiling: past ~1/10 at a near-grid cell size the
 *     render turns to speckle);
 *   - extracting every stop yields contours on every stop, with strictly more
 *     structure as the slider goes up, and a measurable change at every detent.
 *
 * The engine is sliced out of client.js and run in-process against a recording
 * canvas stub, exactly like the other contour suites — no browser, no DSH.
 *
 * Usage: node test/contour-roughness.test.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
/* Line endings normalised before slicing: the harness cuts declarations out of
   client.js by offset, so a CRLF checkout must not change what it sees. */
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
        const rest = src.slice(j + 1, j + 9)
        const m = rest.match(/^\s*\)\s*\(\s*\)/)
        return src.slice(at, j + 1 + (m ? m[0].length : 0))
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

const fns = ['contourRng', 'contourRollSeed', 'contourReseed', 'contourNoise',
  'contourGenerateField', 'contourLevels', 'contourExtractLevel', 'contourExtractAll',
  'contourTerrainProfile', 'contourOctaveLadder'].map(grab).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES',
  'CONTOUR_PERSIST', 'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX',
  'CONTOUR_ROUGHNESS_DEFAULT']
  .map(grabNum).join('\n')
const lines = ['CONTOUR_DENSITIES', 'CONTOUR_ROUGHNESS_BASE', 'CONTOUR_ROUGHNESS_PERSIST',
  'CONTOUR_ROUGHNESS_OCTAVES'].map(grabLine).join('\n')
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
const contourPerm = new Uint16Array(512)
/* Fixed seed: a roughness regression must measure the SAME landscape every run.
   client.js re-rolls contourSeed per mount, so the harness pins it here. */
let contourSeed = contourReseed(0x5eed4242)
let contourRoughnessIdx=0
const contourRoughnessIndex=()=>contourRoughnessIdx
let contourDensityIdx=1
const contourDensityIndex=()=>contourDensityIdx
const isDarkScheme=()=>false
const isWulingPalette=()=>false

function build(tw, th, rough, density) {
  contourRoughnessIdx = rough
  contourDensityIdx = density
  contourField = contourGenerateField(tw, th)
  contourExtractAll()
  return {
    paths: contourPaths.map((p) => Array.from(p)),
    mn: contourField.mn,
    mx: contourField.mx,
  }
}
/* The ladder the generator really uses for a stop on a given texture: the same
   arithmetic contourGenerateField performs, exposed so the parameter-level
   invariants below can be asserted without rendering. */
function ladder(tw, th, rough) {
  const prof = contourTerrainProfileFor(rough)
  const px0 = Math.max(3, Math.min(CONTOUR_PERIOD_MAX, Math.round(tw / prof.baseCell)))
  const py0 = Math.max(3, Math.min(CONTOUR_PERIOD_MAX, Math.round(th / prof.baseCell)))
  const n = contourOctaveLadder(px0, py0, prof.octaves)
  const periods = []
  for (let o = 0; o < n; o++) {
    periods.push([Math.min(CONTOUR_PERIOD_MAX, px0 * Math.pow(2, o)),
      Math.min(CONTOUR_PERIOD_MAX, py0 * Math.pow(2, o))])
  }
  return { prof, px0, py0, n, periods, persist: prof.persist }
}
/* contourTerrainProfile() reads the pref store; the assertions below want a
   specific stop, so it is re-derived from the tables by index here. */
function contourTerrainProfileFor(i) {
  return {
    baseCell: CONTOUR_ROUGHNESS_BASE[i],
    persist: CONTOUR_ROUGHNESS_PERSIST[i],
    octaves: CONTOUR_ROUGHNESS_OCTAVES[i],
  }
}
return {
  build,
  ladder,
  profileFor: contourTerrainProfileFor,
  profile: () => contourTerrainProfile(),
  setRoughness: (i) => { contourRoughnessIdx = i },
  defaultStop: CONTOUR_ROUGHNESS_DEFAULT,
  tables: { base: CONTOUR_ROUGHNESS_BASE.slice(), persist: CONTOUR_ROUGHNESS_PERSIST.slice(), octaves: CONTOUR_ROUGHNESS_OCTAVES.slice() },
  extra: { GAP: CONTOUR_PERIOD_MAX, MIN_LEN: CONTOUR_MIN_LEN, MIN_RING: CONTOUR_MIN_RING_BOX, SHIPPED: [CONTOUR_BASE_CELL, CONTOUR_PERSIST, CONTOUR_OCTAVES], DENSITIES: CONTOUR_DENSITIES.slice() },
}
`)()
} catch (e) {
  console.error('FAIL  harness could not be built: ' + e.message)
  process.exit(1)
}

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* ---------- 1. the tables are well-formed and sorted ---------- */
const T = api.tables
const stops = T.base.length
if (T.persist.length === stops && T.octaves.length === stops) pass('all three roughness tables have ' + stops + ' stops')
else fail('roughness tables disagree on length: base=' + stops + ' persist=' + T.persist.length + ' octaves=' + T.octaves.length)
if (stops >= 10) pass('the slider offers ' + stops + ' detents (the request was >= 10)')
else fail('only ' + stops + ' detents; the request was at least 10')

/* Monotone plains -> mountains. These are the sliders semantics, so they are
   asserted rather than assumed: a table that went back down would make the
   control lie about which direction is rougher. */
let nonMonotone = []
for (let i = 1; i < stops; i++) {
  if (!(T.base[i] < T.base[i - 1])) nonMonotone.push('base[' + i + ']=' + T.base[i] + ' >= base[' + (i - 1) + ']=' + T.base[i - 1])
  if (!(T.persist[i] > T.persist[i - 1])) nonMonotone.push('persist[' + i + ']=' + T.persist[i] + ' <= persist[' + (i - 1) + ']=' + T.persist[i - 1])
  if (!(T.octaves[i] >= T.octaves[i - 1])) nonMonotone.push('octaves[' + i + ']=' + T.octaves[i] + ' < octaves[' + (i - 1) + ']=' + T.octaves[i - 1])
}
if (nonMonotone.length === 0) {
  pass('the ladder is sorted plains -> mountains (cell ' + T.base[0] + '->' + T.base[stops - 1]
    + ' px, persistence ' + T.persist[0] + '->' + T.persist[stops - 1] + ')')
} else fail('the roughness tables are not monotone: ' + nonMonotone.join('; '))

/* ---------- 2. the default stop IS the shipped terrain ---------- */
const d = api.defaultStop
if (d >= 0 && d < stops) pass('default stop index ' + d + ' is inside the table')
else fail('CONTOUR_ROUGHNESS_DEFAULT=' + d + ' is outside the table (0..' + (stops - 1) + ')')
const shipped = api.extra.SHIPPED
const atDefault = api.profileFor(d)
if (atDefault.baseCell === shipped[0] && atDefault.persist === shipped[1] && atDefault.octaves === shipped[2]) {
  pass('default stop reproduces the shipped terrain constants exactly (' + shipped.join(' / ') + ')')
} else {
  fail('default stop is ' + [atDefault.baseCell, atDefault.persist, atDefault.octaves].join(' / ')
    + ' but the shipped constants are ' + shipped.join(' / ') + ' — existing users would get a different map')
}
/* And the resolver really resolves that index (the tables could be right while
   the pref reader clamps to something else). */
let resolved = null
try { api.setRoughness(d); resolved = api.profile() } catch (e) { fail('contourTerrainProfile() threw: ' + e.message) }
if (resolved && resolved.baseCell === shipped[0]) pass('contourTerrainProfile() resolves the shipped terrain for the default pref')
else fail('contourTerrainProfile() returned ' + JSON.stringify(resolved) + ' for the default pref')

/* ---------- 3. the octave ladder is bounded on every realistic texture ----------
   A viewport becomes a texture of roughly 3x its size, capped by area and by the
   4096px device limit, so these four cover what the engine can produce. */
const SIZES = [[1024, 768], [2048, 1152], [3840, 2176], [4096, 384], [640, 480]]
let overCeiling = []
let zeroOctaves = []
let finestShareMax = 0
let finestShareAt = ''
for (const [w, h] of SIZES) {
  for (let i = 0; i < stops; i++) {
    const L = api.ladder(w, h, i)
    for (const [px, py] of L.periods) {
      if (px > api.extra.GAP || py > api.extra.GAP) overCeiling.push(w + 'x' + h + ' stop ' + i + ' period ' + px + 'x' + py)
    }
    if (L.n < 1) zeroOctaves.push(w + 'x' + h + ' stop ' + i)
    if (L.periods.length !== L.n) overCeiling.push('ladder length mismatch at ' + i)
    /* Amplitude share of the FINEST octave, and the size of that octave's cell in
       CSS px. This is the measured legibility rule: fine detail is harmless while
       its scale is far above the 10px sampling grid, and turns the sheet into
       speckle once a big share of the amplitude lives at a cell only a couple of
       samples wide. */
    let norm = 0
    for (let o = 0; o < L.n; o++) norm += Math.pow(L.persist, o)
    const share = Math.pow(L.persist, L.n - 1) / norm
    const cellX = w / L.periods[L.n - 1][0]
    const cellY = h / L.periods[L.n - 1][1]
    const cell = Math.min(cellX, cellY)
    if (cell < 60 && share > finestShareMax) {
      finestShareMax = share
      finestShareAt = w + 'x' + h + ' stop ' + i + ' (cell ' + cell.toFixed(1) + 'px, '
        + (share * 100).toFixed(1) + '% of the amplitude)'
    }
  }
}
if (overCeiling.length === 0) pass('every octave period stays inside the permutation-table ceiling (' + api.extra.GAP + ') on all ' + SIZES.length + ' texture sizes')
else fail('octave periods exceed the perm-table ceiling: ' + overCeiling.slice(0, 4).join('; '))
if (zeroOctaves.length === 0) pass('no stop/size combination collapses to a flat field (ladder >= 1 octave everywhere)')
else fail('ladder reached zero octaves at: ' + zeroOctaves.slice(0, 4).join(', '))
if (finestShareMax <= 0.12) {
  pass('the finest octave stays a minority of the amplitude (worst ' + (finestShareMax * 100).toFixed(1) + '% at ' + finestShareAt + ')')
} else {
  fail('the finest octave carries ' + (finestShareMax * 100).toFixed(1) + '% at ' + finestShareAt
    + ' — past ~12% at a near-grid cell size the sheet reads as speckle, not terrain')
}

/* ---------- 4. every stop actually draws terrain ---------- */
const TW = 3840
const TH = 2176
const DENSITY = 1 // the shipped 14-level default; the density row is orthogonal
const measured = []
let blank = []
for (let i = 0; i < stops; i++) {
  const t0 = Date.now()
  const out = api.build(TW, TH, i, DENSITY)
  const ms = Date.now() - t0
  let rings = 0
  let total = 0
  let shortest = Infinity
  for (const p of out.paths) {
    const pts = p.length / 2
    if (pts > 2 && (p[0] - p[p.length - 2]) ** 2 + (p[1] - p[p.length - 1]) ** 2 < 4) rings++
    let len = 0
    for (let k = 2; k < p.length; k += 2) len += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1])
    total += len
    if (len < shortest) shortest = len
  }
  if (!(out.mn > -Infinity) || !(out.mx < Infinity) || !(out.mx > out.mn)) blank.push(i)
  measured.push({ stop: i, paths: out.paths.length, rings, total, shortest, ms, range: out.mx - out.mn })
}
if (blank.length === 0) pass('every stop generates a valid, non-degenerate height field')
else fail('stops with a degenerate field (flat/infinite): ' + blank.join(', '))
const empty = measured.filter((m) => m.paths === 0)
if (empty.length === 0) pass('every stop draws contours (no blank patch at any detent)')
else fail('stops that drew nothing: ' + empty.map((m) => m.stop).join(', '))

/* Strictly more structure as the slider goes up. Measured on this fixed seed and
   size the smallest step is ~6% (rings) and ~5% of stroke length, so a 4% bar is
   below every real step and above extraction noise. */
let flatPairs = []
let smallPairs = []
for (let i = 1; i < measured.length; i++) {
  const a = measured[i - 1]
  const b = measured[i]
  if (!(b.total > a.total * 1.04)) flatPairs.push('stop ' + (i - 1) + '->' + i + ' (' + Math.round(a.total) + ' -> ' + Math.round(b.total) + ' px)')
  if (!(b.rings > a.rings)) smallPairs.push('stop ' + (i - 1) + '->' + i + ' rings ' + a.rings + ' -> ' + b.rings)
}
if (flatPairs.length === 0) pass('total contour length grows at every detent (roughness is monotone where the user can see it)')
else fail('detents that change the terrain by less than 4%: ' + flatPairs.join('; '))
if (smallPairs.length === 0) pass('closed-ring count grows at every detent (' + measured[0].rings + ' -> ' + measured[stops - 1].rings + ')')
else fail('ring count does not grow at: ' + smallPairs.join('; '))
if (measured[stops - 1].total > measured[0].total * 3) {
  pass('the slider spans a real range: ' + Math.round(measured[0].total / 1000) + 'k -> '
    + Math.round(measured[stops - 1].total / 1000) + 'k px of stroke')
} else {
  fail('the extremes are too close: ' + Math.round(measured[0].total) + ' -> ' + Math.round(measured[stops - 1].total))
}

/* No stop may degenerate into debris: every drawn chain must clear the speck bar
   the extractor enforces (a shorter chain would have been rejected). */
const shortestDrawn = Math.min(...measured.map((m) => m.shortest))
if (shortestDrawn >= api.extra.MIN_LEN) pass('no stop draws debris (shortest drawn chain ' + shortestDrawn.toFixed(1) + 'px >= ' + api.extra.MIN_LEN + 'px)')
else fail('a stop drew a chain shorter than the speck bar: ' + shortestDrawn.toFixed(1) + 'px')

/* Build cost is a one-off per change (the rAF loop only blits), so it is a UX
   budget, not a frame budget: a slider detent must not freeze the page. The perf
   suite owns the absolute bound; this keeps the whole ladder inside it. */
const worstBuild = Math.max(...measured.map((m) => m.ms))
if (worstBuild < 400) pass('every detent rebuilds the terrain in well under half a second (worst ' + worstBuild + 'ms)')
else fail('a detent took ' + worstBuild + 'ms to build — dragging the slider would stall the page')

/* A readable summary, because the numbers ARE the evidence for this feature. */
console.log('')
console.log('  stop  cell  persist oct  paths  rings   stroke   finest-cell share')
for (let i = 0; i < stops; i++) {
  const L = api.ladder(TW, TH, i)
  let norm = 0
  for (let o = 0; o < L.n; o++) norm += Math.pow(L.persist, o)
  const share = Math.pow(L.persist, L.n - 1) / norm
  const cell = TW / L.periods[L.n - 1][0]
  console.log('  ' + String(i).padStart(4) + String(T.base[i]).padStart(6) + String(T.persist[i]).padStart(9)
    + String(L.n).padStart(4) + String(measured[i].paths).padStart(7) + String(measured[i].rings).padStart(7)
    + String(Math.round(measured[i].total / 1000) + 'k').padStart(9) + String(cell.toFixed(0) + 'px').padStart(8)
    + String((share * 100).toFixed(1) + '%').padStart(9))
}
console.log('')

if (failures) { console.error(failures + ' roughness check(s) failed'); process.exit(1) }
console.log('all terrain roughness checks passed')
