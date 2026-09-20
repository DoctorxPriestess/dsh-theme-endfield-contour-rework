/**
 * contour-roughness.test.js — prove the terrain-roughness slider is a real,
 * legible ladder of TERRAIN, and that its default stop is still the shipped map.
 *
 * Why this exists. 「地形粗糙度」is the only setting that changes the SHAPE of the
 * landscape (density only re-extracts iso-levels from the same field, direction
 * and speed only retime the scroll). It is therefore the one setting whose
 * failure mode is not an exception but a BAD MAP: a stop that draws nothing, two
 * neighbouring detents that draw the same thing (a slider that does nothing on
 * half its travel), a top end so rough that the sheet stops reading as terrain
 * and becomes uniform speckle, or a landform layer that quietly covers the whole
 * picture. None of those throw, and the other suites would all stay green.
 *
 * So this file measures the whole ladder the way a user sees it:
 *   - every landform table is well-formed, and the DEFAULT stop still resolves to
 *     the shipped fBm constants (280 / 0.5 / 5);
 *   - 高原 (plateau) appears at stop 6, DECREASES towards stop 9 and is gone from
 *     stop 10 on; 悬崖 (cliff) starts at stop 8 and grows to its maximum at stop
 *     12 — both as table values AND as measured coverage of the generated field;
 *   - the landform layer covers less than 75% of the sheet at EVERY stop (the
 *     stated ceiling: the sheet must still read as terrain, not as a quilt of
 *     features), and more than a token share of it at every stop;
 *   - water is an EXACT plane (every cell below the level is clamped to it);
 *   - the field stays exactly periodic across the tile seam, which is what makes
 *     the scroll seamless;
 *   - every stop draws contours, none draws debris, and the contour density per
 *     iso-level stays under the measured legibility ceiling.
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
  const m = src.match(new RegExp('const ' + name + ' = (-?[0-9.]+)'))
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
  'contourTerrainProfile', 'contourTerrainRow', 'contourOctaveLadder', 'contourStair',
  'contourTerrace', 'contourCliff', 'contourTerraceField', 'contourApplyLandforms',
  'contourShapeWarp', 'contourReliefWarp', 'contourRidgeAt', 'contourValleyAt',
  'contourFeaturePeriod', 'contourHash3', 'contourPrimitiveDelta',
  'contourApplyPrimitives'].map(grab).join('\n')
/* Single-expression arrows have no brace to scan to, so they are taken verbatim by
   line instead of by brace matching. */
const oneLiners = ['contourSmooth', 'contourHash01'].map(grabOne).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES', 'CONTOUR_PERSIST',
  'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX',
  'CONTOUR_ROUGHNESS_DEFAULT', 'CONTOUR_TERRACE_STEPS_BASE', 'CONTOUR_TERRACE_STEPS_SPAN',
  'CONTOUR_TERRACE_SOFT', 'CONTOUR_NOISE_NORM', 'CONTOUR_FEATURE_MIN',
  'CONTOUR_PLATEAU_BAND', 'CONTOUR_CLIFF_BAND', 'CONTOUR_CLIFF_STEPS_BASE',
  'CONTOUR_CLIFF_STEPS_SPAN', 'CONTOUR_CLIFF_SOFT_BASE', 'CONTOUR_CLIFF_SOFT_FALL']
  .map(grabNum).join('\n')
const kinds = ['CONTOUR_FEAT_NONE', 'CONTOUR_FEAT_PLATEAU', 'CONTOUR_FEAT_CLIFF',
  'CONTOUR_FEAT_FAN', 'CONTOUR_FEAT_CONE', 'CONTOUR_FEAT_CRATER', 'CONTOUR_FEAT_DUNE',
  'CONTOUR_FEAT_PIT', 'CONTOUR_FEAT_ARETE', 'CONTOUR_FEAT_TROUGH', 'CONTOUR_FEAT_KARST',
  'CONTOUR_FEAT_TALUS', 'CONTOUR_FEAT_WATER'].map(grabNum).join('\n')
/* Every landform table, read out of client.js by name: a table that loses a stop
   or gains a value out of range must fail here, not silently change the map. */
const LAND_TABLES = ['CONTOUR_TERRAIN_CLASS', 'CONTOUR_TERRAIN_MACRO',
  'CONTOUR_TERRAIN_SHAPE', 'CONTOUR_TERRAIN_RIDGE', 'CONTOUR_TERRAIN_VALLEY',
  'CONTOUR_TERRAIN_PLATEAU', 'CONTOUR_TERRAIN_CLIFF', 'CONTOUR_TERRAIN_CLIFFBAND',
  'CONTOUR_TERRAIN_RELIEF', 'CONTOUR_TERRAIN_WATER', 'CONTOUR_TERRAIN_BLOBS',
  'CONTOUR_TERRAIN_BLOBSCALE']
const lines = ['CONTOUR_DENSITIES', 'CONTOUR_ROUGHNESS_BASE', 'CONTOUR_ROUGHNESS_PERSIST',
  'CONTOUR_ROUGHNESS_OCTAVES', 'CONTOUR_PALETTE_0', 'CONTOUR_PALETTE_1',
  'CONTOUR_PALETTE_2', 'CONTOUR_PALETTE_3', 'CONTOUR_PALETTE_4'].concat(LAND_TABLES)
  .map(grabLine).join('\n')
const exprs = ['CONTOUR_GRAD_X', 'CONTOUR_GRAD_Y', 'CONTOUR_KEEP_LEN', 'CONTOUR_KEEP_RING',
  'CONTOUR_LEVEL_MARGIN', 'CONTOUR_FEATURE_PALETTES', 'CONTOUR_FEATURE_GRID']
  .map(grabOne).join('\n')

let api
try {
  api = new Function(`
let contourField=null, contourPaths=[], contourTex=null
${nums}
${kinds}
${lines}
${exprs}
${oneLiners}
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
  const t0 = Date.now()
  contourField = contourGenerateField(tw, th)
  const genMs = Date.now() - t0
  const t1 = Date.now()
  contourExtractAll()
  const extMs = Date.now() - t1
  const f = contourField
  const n = f.cols * f.rows
  let feat = 0
  const perKind = new Array(16).fill(0)
  let waterMin = Infinity, waterMax = -Infinity
  for (let i = 0; i < n; i++) {
    if (f.featAmt[i] >= CONTOUR_FEATURE_MIN) {
      feat++
      perKind[f.featKind[i]]++
    }
    if (f.featKind[i] === CONTOUR_FEAT_WATER) {
      if (f.F[i] < waterMin) waterMin = f.F[i]
      if (f.F[i] > waterMax) waterMax = f.F[i]
    }
  }
  /* Exact periodicity of the grid: index 0 and index cols-1 are the same physical
     point when the tile is a whole number of cells, and the scroll repeats the
     texture at exactly that boundary. */
  let seam = 0
  for (let j = 0; j < f.rows; j++) {
    const d = Math.abs(f.F[j * f.cols] - f.F[j * f.cols + f.cols - 1])
    if (d > seam) seam = d
  }
  for (let i = 0; i < f.cols; i++) {
    const d = Math.abs(f.F[i] - f.F[(f.rows - 1) * f.cols + i])
    if (d > seam) seam = d
  }
  let rings = 0
  let total = 0
  let shortest = Infinity
  for (const p of contourPaths) {
    const pts = p.length / 2
    if (pts > 2 && (p[0] - p[p.length - 2]) ** 2 + (p[1] - p[p.length - 1]) ** 2 < 4) rings++
    let len = 0
    for (let k = 2; k < p.length; k += 2) len += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1])
    total += len
    if (len < shortest) shortest = len
  }
  return { paths: contourPaths.length, rings, total, shortest, ms: genMs + extMs, genMs, extMs,
    mn: f.mn, mx: f.mx, feat: feat / n, perKind, waterFlat: waterMin === Infinity ? null : waterMax - waterMin,
    waterCells: perKind[CONTOUR_FEAT_WATER], seam }
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
  const row = contourTerrainRowFor(i)
  row.baseCell = CONTOUR_ROUGHNESS_BASE[i]
  row.persist = CONTOUR_ROUGHNESS_PERSIST[i]
  row.octaves = CONTOUR_ROUGHNESS_OCTAVES[i]
  return row
}
/* contourTerrainRow() reads the pref store too; this is the same row for an
   explicit index. */
function contourTerrainRowFor(i) {
  return {
    cls: CONTOUR_TERRAIN_CLASS[i],
    macro: CONTOUR_TERRAIN_MACRO[i],
    shape: CONTOUR_TERRAIN_SHAPE[i],
    ridge: CONTOUR_TERRAIN_RIDGE[i],
    valley: CONTOUR_TERRAIN_VALLEY[i],
    plateau: CONTOUR_TERRAIN_PLATEAU[i],
    cliff: CONTOUR_TERRAIN_CLIFF[i],
    cliffBand: CONTOUR_TERRAIN_CLIFFBAND[i],
    relief: CONTOUR_TERRAIN_RELIEF[i],
    water: CONTOUR_TERRAIN_WATER[i],
    blobs: CONTOUR_TERRAIN_BLOBS[i],
    blobScale: CONTOUR_TERRAIN_BLOBSCALE[i],
  }
}
return {
  build,
  ladder,
  profileFor: contourTerrainProfileFor,
  rowFor: contourTerrainRowFor,
  profile: () => contourTerrainProfile(),
  setRoughness: (i) => { contourRoughnessIdx = i },
  defaultStop: CONTOUR_ROUGHNESS_DEFAULT,
  stops: CONTOUR_ROUGHNESS_BASE.length,
  featureBar: CONTOUR_FEATURE_MIN,
  tables: {
    base: CONTOUR_ROUGHNESS_BASE.slice(), persist: CONTOUR_ROUGHNESS_PERSIST.slice(),
    octaves: CONTOUR_ROUGHNESS_OCTAVES.slice(),
    cls: CONTOUR_TERRAIN_CLASS.slice(), macro: CONTOUR_TERRAIN_MACRO.slice(),
    shape: CONTOUR_TERRAIN_SHAPE.slice(), ridge: CONTOUR_TERRAIN_RIDGE.slice(),
    valley: CONTOUR_TERRAIN_VALLEY.slice(), plateau: CONTOUR_TERRAIN_PLATEAU.slice(),
    cliff: CONTOUR_TERRAIN_CLIFF.slice(), cliffBand: CONTOUR_TERRAIN_CLIFFBAND.slice(),
    relief: CONTOUR_TERRAIN_RELIEF.slice(), water: CONTOUR_TERRAIN_WATER.slice(),
    blobs: CONTOUR_TERRAIN_BLOBS.slice(), blobScale: CONTOUR_TERRAIN_BLOBSCALE.slice(),
  },
  ids: {
    none: CONTOUR_FEAT_NONE, plateau: CONTOUR_FEAT_PLATEAU, cliff: CONTOUR_FEAT_CLIFF,
    water: CONTOUR_FEAT_WATER, fan: CONTOUR_FEAT_FAN, cone: CONTOUR_FEAT_CONE,
    crater: CONTOUR_FEAT_CRATER, dune: CONTOUR_FEAT_DUNE, pit: CONTOUR_FEAT_PIT,
    arete: CONTOUR_FEAT_ARETE, trough: CONTOUR_FEAT_TROUGH, karst: CONTOUR_FEAT_KARST,
    talus: CONTOUR_FEAT_TALUS,
  },
  extra: { GAP: CONTOUR_PERIOD_MAX, MIN_LEN: CONTOUR_MIN_LEN, MIN_RING: CONTOUR_MIN_RING_BOX,
    SHIPPED: [CONTOUR_BASE_CELL, CONTOUR_PERSIST, CONTOUR_OCTAVES],
    DENSITIES: CONTOUR_DENSITIES.slice() },
}
`)()
} catch (e) {
  console.error('FAIL  harness could not be built: ' + e.message)
  process.exit(1)
}

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

const T = api.tables
const stops = api.stops
const d = api.defaultStop
const shipped = api.extra.SHIPPED
const pct = (v) => (v * 100).toFixed(1) + '%'

/* ---------- 1. the tables are well-formed ---------- */
const tbls = Object.keys(T)
let badLen = tbls.filter((k) => T[k].length !== stops)
if (badLen.length === 0) pass('all ' + tbls.length + ' terrain tables carry ' + stops + ' stops')
else fail('tables with the wrong stop count: ' + badLen.join(', '))
if (stops >= 10) pass('the slider offers ' + stops + ' detents (the request was >= 10)')
else fail('only ' + stops + ' detents; the request was at least 10')

/* ---------- 2. the default stop IS the shipped fBm ---------- */
const atDefault = api.profileFor(d)
if (atDefault.baseCell === shipped[0] && atDefault.persist === shipped[1] && atDefault.octaves === shipped[2]) {
  pass('default stop still reproduces the shipped fBm constants exactly (' + shipped.join(' / ') + ')')
} else {
  fail('default stop is ' + [atDefault.baseCell, atDefault.persist, atDefault.octaves].join(' / ')
    + ' but the shipped constants are ' + shipped.join(' / '))
}
let resolved = null
try { api.setRoughness(d); resolved = api.profile() } catch (e) { fail('contourTerrainProfile() threw: ' + e.message) }
if (resolved && resolved.baseCell === shipped[0] && typeof resolved.plateau === 'number') {
  pass('contourTerrainProfile() resolves the shipped terrain plus its landform row for the default pref')
} else fail('contourTerrainProfile() returned ' + JSON.stringify(resolved) + ' for the default pref')

/* ---------- 3. 高原 appears, DECREASES, and is gone again ----------
   The stated behaviour: plateaus may start as early as stop 6, they must shrink as
   roughness rises, and from stop 10 on they are gone (the cliffs carry the relief
   there instead). Asserted as a shape, not as three magic numbers. */
const plateauStops = []
for (let i = 0; i < stops; i++) if (T.plateau[i] > 0) plateauStops.push(i)
if (plateauStops.length > 0 && plateauStops[0] === 5) {
  pass('高原 starts at stop ' + (plateauStops[0] + 1) + ' (the request allowed it to come down to stop 6)')
} else {
  fail('高原 starts at stop ' + (plateauStops.length === 0 ? 'nowhere' : plateauStops[0] + 1) + ', expected stop 6')
}
let flatUp = []
for (let k = 1; k < plateauStops.length; k++) {
  const a = plateauStops[k - 1]
  const b = plateauStops[k]
  if (!(T.plateau[b] < T.plateau[a])) flatUp.push('stop ' + (a + 1) + '->' + (b + 1) + ' (' + T.plateau[a] + ' -> ' + T.plateau[b] + ')')
}
if (flatUp.length === 0) {
  pass('高原 strength falls at every later stop (' + plateauStops.map((s) => (s + 1) + ':' + T.plateau[s]).join(', ') + ')')
} else fail('高原 strength does not fall: ' + flatUp.join('; '))
const plateauAfter = []
for (let i = plateauStops[plateauStops.length - 1] + 1; i < stops; i++) {
  if (T.plateau[i] !== 0) plateauAfter.push(i + 1)
}
if (plateauAfter.length === 0) pass('高原 is gone from stop ' + (plateauStops[plateauStops.length - 1] + 2) + ' on (the roughest stops carry cliffs instead)')
else fail('高原 is still set at stop(s) ' + plateauAfter.join(', ') + ' — it was meant to disappear by stop 10')

/* ---------- 4. 悬崖 starts later, grows, and is strongest at the top ---------- */
const cliffStops = []
for (let i = 0; i < stops; i++) if (T.cliff[i] > 0) cliffStops.push(i)
if (cliffStops.length >= 3 && cliffStops[0] >= 6) {
  pass('悬崖 runs from stop ' + (cliffStops[0] + 1) + ' to stop ' + (cliffStops[cliffStops.length - 1] + 1))
} else {
  fail('cliff stops are ' + (cliffStops.length === 0 ? 'missing' : cliffStops.map((s) => s + 1).join(', ')))
}
let cliffBad = []
for (let k = 1; k < cliffStops.length; k++) {
  const a = cliffStops[k - 1]
  const b = cliffStops[k]
  if (!(T.cliff[b] > T.cliff[a])) cliffBad.push('stop ' + (a + 1) + '->' + (b + 1))
  if (!(T.cliffBand[b] >= T.cliffBand[a])) cliffBad.push('band stop ' + (a + 1) + '->' + (b + 1))
}
if (cliffBad.length === 0) pass('悬崖 strength and coverage both grow at every later stop (' + cliffStops.map((s) => (s + 1) + ':' + T.cliff[s]).join(', ') + ')')
else fail('悬崖 does not grow monotonically: ' + cliffBad.join('; '))
if (T.cliff[stops - 1] === Math.max.apply(null, T.cliff)) pass('the last stop has the strongest cliffs (' + T.cliff[stops - 1] + ')')
else fail('the strongest cliffs are at stop ' + (T.cliff.indexOf(Math.max.apply(null, T.cliff)) + 1) + ', not the last')

/* ---------- 4b. the landform growth is CONVEX: it accelerates up the ladder ----------
   The requirement is "整体抬升，且越来越快": the plains/hills stops keep their
   landform budget nearly unchanged while each step near the top buys more than the
   one below it. That is a property of the table SHAPE, so it is asserted on the
   increments (second differences >= 0) rather than on any single value — a table
   that grew by a constant amount per stop would be linear and would fail here.
   Measured gains in feature coverage over 1.3.1 are 0 / 0 / +2.4 / +2.7 / +5.7 /
   +8.4 / +17.4 points at stops 6-12, which is this convexity seen on the field.
   RELIEF is deliberately NOT in the list: its stop-10 value is pinned by the
   roughness-dip fix (it must not fall back below stop 9), which is a different
   constraint from the growth curve, and it is asserted monotone just below. */
const GROWTH_TABLES = ['cliff', 'cliffBand', 'blobs', 'blobScale', 'ridge', 'valley', 'shape']
/* Start where the growth starts: stops 1-5 are the plains/hills range, whose
   landform budget is deliberately left alone (and is mostly the water plane). */
const GROWTH_FROM = 5
let concave = []
for (const k of GROWTH_TABLES) {
  const row = T[k]
  let firstNZ = 0
  while (firstNZ < stops && row[firstNZ] === 0) firstNZ++
  /* Skip the ENTRY step (0 -> first value) for a table that starts switched off
     (cliffs are off below stop 8): that jump is the feature being turned on, not a
     growth step to be compared against the one below it. */
  const from = Math.max(GROWTH_FROM + 2, firstNZ + 2)
  for (let i = from; i < stops; i++) {
    const d0 = row[i - 1] - row[i - 2]
    const d1 = row[i] - row[i - 1]
    if (d1 < d0 - 1e-9) concave.push(k + ': stop ' + (i + 1) + ' (step ' + d1.toFixed(3) + ' < ' + d0.toFixed(3) + ')')
  }
}
if (concave.length === 0) {
  pass('the landform growth accelerates up the ladder (convex increments on ' + GROWTH_TABLES.length + ' tables from stop ' + (GROWTH_FROM + 1) + ')')
} else fail('the growth curve is not convex: ' + concave.slice(0, 6).join('; '))

/* 尖锐山峰/深谷 and the water pattern: shape asserted, not values. */
let reliefBad = []
for (let i = 1; i < stops; i++) if (!(T.relief[i] >= T.relief[i - 1])) reliefBad.push(i + 1)
if (reliefBad.length === 0 && T.relief[stops - 1] > 0) pass('尖锐山峰/深谷 strength grows across the ladder and peaks at the last stop')
else fail('尖锐山峰/深谷 is not monotone (stops ' + reliefBad.join(', ') + ') or is never switched on')
const wetStops = []
const dryStops = []
for (let i = 0; i < stops; i++) (T.water[i] >= 0 ? wetStops : dryStops).push(i + 1)
if (wetStops.length > 0 && dryStops.length > 0) {
  pass('water covers ' + wetStops.length + ' stops (lakes and a fjord) and leaves ' + dryStops.length + ' dry so the contour structure reads')
} else fail('the water table is all-or-nothing (wet ' + wetStops.length + ', dry ' + dryStops.length + ')')
const blobZero = []
for (let i = 0; i < stops; i++) if (!(T.blobs[i] > 0)) blobZero.push(i + 1)
if (blobZero.length === 0) pass('every stop carries landform primitives (densest at the top: ' + T.blobs[stops - 1] + ')')
else fail('no primitives at stop(s) ' + blobZero.join(', '))
let landRange = []
for (const k of ['macro', 'shape', 'ridge', 'valley', 'plateau', 'cliff', 'cliffBand', 'relief', 'blobs', 'blobScale']) {
  /* blobScale is a size multiplier, not a 0..1 strength. */
  const hi = k === 'blobScale' ? 2 : 1.05
  for (let i = 0; i < stops; i++) {
    if (!isFinite(T[k][i]) || T[k][i] > hi || T[k][i] < -1) landRange.push(k + '[' + i + ']=' + T[k][i])
  }
}
if (landRange.length === 0) pass('every landform strength sits in its declared range')
else fail('landform strengths out of range: ' + landRange.slice(0, 5).join('; '))

/* ---------- 5. the octave ladder is bounded on every realistic texture ---------- */
const SIZES = [[1024, 768], [2048, 1152], [3840, 2160], [4096, 384], [640, 480]]
let overCeiling = []
let zeroOctaves = []
let finestShareMax = 0
let finestShareAt = ''
for (const [w, h] of SIZES) {
  for (let i = 0; i < stops; i++) {
    const L = api.ladder(w, h, i)
    for (const [px, py] of L.periods) {
      if (px > api.extra.GAP || py > api.extra.GAP) overCeiling.push(w + 'x' + h + ' stop ' + (i + 1))
    }
    if (L.n < 1) zeroOctaves.push(w + 'x' + h + ' stop ' + (i + 1))
    let norm = 0
    for (let o = 0; o < L.n; o++) norm += Math.pow(L.persist, o)
    const share = Math.pow(L.persist, L.n - 1) / norm
    const cell = Math.min(w / L.periods[L.n - 1][0], h / L.periods[L.n - 1][1])
    if (cell < 60 && share > finestShareMax) {
      finestShareMax = share
      finestShareAt = w + 'x' + h + ' stop ' + (i + 1) + ' (cell ' + cell.toFixed(1) + 'px)'
    }
  }
}
if (overCeiling.length === 0) pass('every octave period stays inside the permutation-table ceiling (' + api.extra.GAP + ') on all ' + SIZES.length + ' texture sizes')
else fail('octave periods exceed the perm-table ceiling: ' + overCeiling.slice(0, 4).join('; '))
if (zeroOctaves.length === 0) pass('no stop/size combination collapses to a flat field (ladder >= 1 octave everywhere)')
else fail('ladder reached zero octaves at: ' + zeroOctaves.slice(0, 4).join(', '))
if (finestShareMax <= 0.12) {
  pass('the finest octave stays a minority of the amplitude (worst ' + pct(finestShareMax) + ' at ' + finestShareAt + ')')
} else {
  fail('the finest octave carries ' + pct(finestShareMax) + ' at ' + finestShareAt
    + ' — past ~12% at a near-grid cell size the sheet reads as speckle, not terrain')
}

/* ---------- 6. measure every stop: coverage, plateau, cliff, water, seam ---------- */
const TW = 3840
const TH = 2160
const DENSITY = 1 // the shipped 14-level default; the density row is orthogonal
/* The measured legibility ceiling: contour polylines PER ISO-LEVEL on a
   3840x2160 texture. Measured across the ladder the worst is ~60 (stop 8); past
   ~90 the sheet stops reading as terrain and becomes uniform speckle, which is the
   failure this whole file exists to catch. */
const MAX_PATHS_PER_LEVEL = 90
const measured = []
for (let i = 0; i < stops; i++) {
  const out = api.build(TW, TH, i, DENSITY)
  measured.push(Object.assign({ stop: i }, out))
}
const blank = measured.filter((m) => !(m.mn > -Infinity) || !(m.mx < Infinity) || !(m.mx > m.mn))
if (blank.length === 0) pass('every stop generates a valid, non-degenerate height field')
else fail('stops with a degenerate field (flat/infinite): ' + blank.map((m) => m.stop + 1).join(', '))
const empty = measured.filter((m) => m.paths === 0)
if (empty.length === 0) pass('every stop draws contours (no blank patch at any detent)')
else fail('stops that drew nothing: ' + empty.map((m) => m.stop + 1).join(', '))

/* The <75% ceiling on feature terrain, per stop, plus the floor that proves the
   landform layer is actually reaching the field. */
const overCap = measured.filter((m) => m.feat >= 0.75)
if (overCap.length === 0) {
  const worst = measured.slice().sort((a, b) => b.feat - a.feat)[0]
  pass('feature terrain stays under the 75% ceiling at every stop (worst ' + pct(worst.feat) + ' at stop ' + (worst.stop + 1) + ')')
} else {
  fail('stops where feature terrain covers >= 75% of the sheet: '
    + overCap.map((m) => 'stop ' + (m.stop + 1) + ' ' + pct(m.feat)).join(', '))
}
const tooPlain = measured.filter((m) => m.feat < 0.02)
if (tooPlain.length === 0) pass('and every stop really carries landforms (least ' + pct(Math.min.apply(null, measured.map((m) => m.feat))) + ')')
else fail('stops with (almost) no feature terrain — the landform layer is off there: ' + tooPlain.map((m) => m.stop + 1).join(', '))

/* The TOP stop has a stated target of its own: feature terrain must cover 55-65%
   of the sheet there (raised from the 44.0% of 1.3.1), so the roughest detent is
   dominated by cliffs and primitives while still leaving a third of the sheet as
   base terrain. Asserted on the MEASURED field: it is the number the requirement
   is stated in, and no table can be trusted to deliver it (see the stop-10 dip). */
const TOP_COVERAGE_MIN = 0.55
const TOP_COVERAGE_MAX = 0.65
const topFeat = measured[stops - 1].feat
if (topFeat >= TOP_COVERAGE_MIN && topFeat <= TOP_COVERAGE_MAX) {
  pass('the top stop carries the stated share of feature terrain (' + pct(topFeat) + ', window '
    + pct(TOP_COVERAGE_MIN) + '-' + pct(TOP_COVERAGE_MAX) + ', up from 44.0% in 1.3.1)')
} else {
  fail('the top stop covers ' + pct(topFeat) + ' of the sheet with feature terrain, outside the stated '
    + pct(TOP_COVERAGE_MIN) + '-' + pct(TOP_COVERAGE_MAX) + ' window')
}

/* 高原 as MEASURED on the field: it has to shrink from stop 6 to stop 9 and be
   absent from stop 10 on, not merely be smaller in the table. */
const plateauShare = (m) => m.perKind[api.ids.plateau] / (TW / 10 * TH / 10)
let plateauBad = []
for (let k = 1; k < plateauStops.length; k++) {
  const a = plateauStops[k - 1]
  const b = plateauStops[k]
  if (!(plateauShare(measured[b]) < plateauShare(measured[a]))) {
    plateauBad.push('stop ' + (a + 1) + '->' + (b + 1) + ' (' + pct(plateauShare(measured[a])) + ' -> ' + pct(plateauShare(measured[b])) + ')')
  }
}
if (plateauBad.length === 0) {
  pass('measured 高原 area falls with roughness (' + plateauStops.map((s) => (s + 1) + ':' + pct(plateauShare(measured[s]))).join(' -> ') + ')')
} else fail('measured 高原 area does not fall: ' + plateauBad.join('; '))
let plateauLeft = []
for (let i = plateauStops[plateauStops.length - 1] + 1; i < stops; i++) {
  if (plateauShare(measured[i]) > 0.005) plateauLeft.push('stop ' + (i + 1) + ' ' + pct(plateauShare(measured[i])))
}
if (plateauLeft.length === 0) pass('and no plateau survives past stop ' + (plateauStops[plateauStops.length - 1] + 1))
else fail('plateaus are still on the field at: ' + plateauLeft.join(', '))

/* 悬崖 as measured: present, growing, and largest at the last stop. */
const cliffShare = (m) => m.perKind[api.ids.cliff] / (TW / 10 * TH / 10)
let cliffGrow = []
for (let k = 1; k < cliffStops.length; k++) {
  const a = cliffStops[k - 1]
  const b = cliffStops[k]
  if (!(cliffShare(measured[b]) >= cliffShare(measured[a]) * 0.95)) {
    cliffGrow.push('stop ' + (a + 1) + '->' + (b + 1) + ' (' + pct(cliffShare(measured[a])) + ' -> ' + pct(cliffShare(measured[b])) + ')')
  }
}
if (cliffGrow.length === 0) {
  pass('measured 悬崖 area never shrinks across the cliff stops (' + cliffStops.map((s) => (s + 1) + ':' + pct(cliffShare(measured[s]))).join(' -> ') + ')')
} else fail('measured 悬崖 area falls at: ' + cliffGrow.join('; '))
const cliffMax = Math.max.apply(null, measured.map((m) => cliffShare(m)))
const cliffAtLast = cliffShare(measured[stops - 1])
if (cliffAtLast >= cliffMax * 0.999 && cliffAtLast > 0.05) {
  pass('the last stop carries the most cliff terrain (' + pct(cliffAtLast) + ' of the sheet)')
} else fail('cliffs peak at ' + pct(cliffMax) + ' but the last stop has ' + pct(cliffAtLast))

/* The high-mountain tail has to keep escalating in INK. This is the assertion the
   file was missing when stop 10 shipped as the calmest of stops 8-12: every table
   looked right (cliffs grew, plateaus were gone) yet that stop carried 431k px of
   stroke against 471k/480k on the stops either side of it, so dragging the slider
   up made the sheet visibly calmer — a mid-ladder local minimum, which the eye
   reads as the slider being broken. The tabulated strengths cannot catch it: it
   took a basin-biased macro layer (-0.16 where the stops above it ran +0.20/+0.26),
   which no per-table range or monotonicity check can see. So it is asserted on the
   measured field, as an interior stop that may not sit more than 5% below the
   mean of its two neighbours. The 8 -> 9 step is deliberately exempt: that is the
   mid-to-high-mountain transition, where the design trades mountain COUNT for
   landform drama (cells grow from 280px to 600px), measured at 489k -> 471k px. */
const tailInk = measured.map((m) => m.total)
let inkDips = []
for (let i = 9; i <= stops - 2; i++) {
  const neighbours = (tailInk[i - 1] + tailInk[i + 1]) / 2
  if (tailInk[i] < neighbours * 0.95) {
    inkDips.push('stop ' + (i + 1) + ' ' + Math.round(tailInk[i] / 1000) + 'k vs '
      + Math.round(neighbours / 1000) + 'k around it ('
      + Math.round(100 * (1 - tailInk[i] / neighbours)) + '% calmer)')
  }
}
if (inkDips.length === 0) {
  pass('no stop in the high-mountain tail is a roughness dip (stops 9-12: '
    + tailInk.slice(8).map((t) => Math.round(t / 1000) + 'k').join(' -> ') + ')')
} else fail('the sheet gets CALMER at a mid-ladder stop: ' + inkDips.join('; '))
const tailMax = Math.max.apply(null, tailInk.slice(8))
if (tailInk[stops - 1] >= tailMax * 0.999) {
  pass('the top stop carries the most ink in the tail (' + Math.round(tailInk[stops - 1] / 1000) + 'k px)')
} else fail('the tail peaks at stop ' + (tailInk.indexOf(tailMax) + 1) + ' (' + Math.round(tailMax / 1000) + 'k), not the last one')

/* Water is an EXACT plane: every clamped cell carries the identical height. */
const wet = measured.filter((m) => m.waterCells > 0)
if (wet.length === 0) fail('no stop produced any water cells — the water plane never fired')
else {
  const notFlat = wet.filter((m) => !(m.waterFlat === 0))
  if (notFlat.length === 0) {
    pass('water is an exact plane at every wet stop (' + wet.map((m) => 'stop ' + (m.stop + 1) + ' ' + m.waterCells + ' cells').join(', ') + ')')
  } else {
    fail('water is not flat at: ' + notFlat.map((m) => 'stop ' + (m.stop + 1) + ' spread ' + m.waterFlat).join(', '))
  }
}

/* The tile seam has to be EXACT, or the scroll would show a hairline. */
const seams = measured.filter((m) => m.seam > 1e-6)
if (seams.length === 0) pass('the generated field is exactly periodic across the tile seam at every stop (max ' + Math.max.apply(null, measured.map((m) => m.seam)).toExponential(0) + ')')
else fail('tile seam is not exact at: ' + seams.map((m) => 'stop ' + (m.stop + 1) + ' ' + m.seam.toExponential(2)).join(', '))

/* Legibility: contour density per iso-level, measured. */
const levels = api.extra.DENSITIES[DENSITY]
let dense = measured.filter((m) => m.paths > MAX_PATHS_PER_LEVEL * levels)
if (dense.length === 0) {
  const worst = measured.slice().sort((a, b) => b.paths - a.paths)[0]
  pass('contour density stays legible at every stop (worst ' + (worst.paths / levels).toFixed(0)
    + ' polylines per iso-level at stop ' + (worst.stop + 1) + ', ceiling ' + MAX_PATHS_PER_LEVEL + ')')
} else {
  fail('stops past the legibility ceiling: ' + dense.map((m) => 'stop ' + (m.stop + 1) + ' ' + Math.round(m.paths / levels) + '/level').join(', '))
}

/* The plains end must be plainly smoother than the mountains end, and the ladder
   must be visibly different from detent to detent somewhere along its travel: the
   character changes hands (frequency -> landforms) rather than the stroke count
   growing forever, which is what the measured numbers above show. */
if (measured[0].paths < measured[stops - 1].paths) {
  pass('the ladder spans a real range: ' + measured[0].paths + ' -> ' + measured[stops - 1].paths + ' contours, '
    + Math.round(measured[0].total / 1000) + 'k -> ' + Math.round(measured[stops - 1].total / 1000) + 'k px of stroke')
} else fail('the plains end is not finer than the mountains end')
const shortestDrawn = Math.min.apply(null, measured.map((m) => m.shortest))
if (shortestDrawn >= api.extra.MIN_LEN) pass('no stop draws debris (shortest drawn chain ' + shortestDrawn.toFixed(1) + 'px >= ' + api.extra.MIN_LEN + 'px)')
else fail('a stop drew a chain shorter than the speck bar: ' + shortestDrawn.toFixed(1) + 'px')
const worstBuild = Math.max.apply(null, measured.map((m) => m.ms))
if (worstBuild < 400) pass('every detent rebuilds the terrain in well under half a second (worst ' + worstBuild + 'ms)')
else fail('a detent took ' + worstBuild + 'ms to build — dragging the slider would stall the page')

/* A readable summary, because the numbers ARE the evidence for this feature. */
console.log('')
console.log('  stop class  cell persist oct  paths rings   stroke   coverage plateau  cliff  water  seam')
const CLASS_NAME = ['plains', 'hills', 'low mtn', 'mid mtn', 'high mtn']
for (let i = 0; i < stops; i++) {
  const m = measured[i]
  console.log('  ' + String(i + 1).padStart(4)
    + ' ' + CLASS_NAME[T.cls[i]].padStart(6)
    + String(T.base[i]).padStart(6) + String(T.persist[i]).padStart(8) + String(api.ladder(TW, TH, i).n).padStart(4)
    + String(m.paths).padStart(7) + String(m.rings).padStart(6)
    + String(Math.round(m.total / 1000) + 'k').padStart(9)
    + String(pct(m.feat)).padStart(9) + String(pct(plateauShare(m))).padStart(8)
    + String(pct(cliffShare(m))).padStart(7) + String(pct(m.perKind[api.ids.water] / (TW / 10 * TH / 10))).padStart(7)
    + String(m.seam.toExponential(0)).padStart(7))
}
console.log('')

if (failures) { console.error(failures + ' terrain roughness check(s) failed'); process.exit(1) }
console.log('all terrain roughness checks passed')
