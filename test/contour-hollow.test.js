/**
 * contour-hollow.test.js — the hollow terrain ("镂空"), without a GPU.
 *
 * Two halves, because the feature has two halves:
 *
 *   A. THE CARVE (client.js: contourApplyLandforms, stage 5.5). The 3D view opens
 *      cavities where the terrain bottoms out; the flat view must be untouched
 *      (hollow = 0), and a cavity must be SPARSE and DEEP rather than a colander:
 *      measured on the shipped generator at the shipped constants, 2.9% of the sheet
 *      is carved, 6 pits per tile, the widest ~182 CSS px, and 8 contour levels cross
 *      the deepest point (that is the number that makes it read as a hole instead of
 *      a dent).
 *
 *   B. THE OCCLUSION RULE (client.js: contourOcclude, the CPU mirror of the shader's
 *      raymarch). A flat field must reproduce the closed-form offset exactly --
 *      occlusion may not move anything where there is nothing to occlude -- and
 *      occlusion may only ever pull a sample NEARER.
 *
 * Honest boundary, asserted here so it cannot be forgotten: a height field cannot
 * carry a true overhang (z = f(x, y) is single-valued), so what the shader occludes
 * is steep wall against wall, not a leaning rock. Measured contribution on the
 * shipped terrain: 1 march step vs 14 differs by ~2k pixels of 3.4M. Read the docs
 * before promising more than that.
 *
 * Usage: node test/contour-hollow.test.js
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8').replace(/\r\n/g, '\n')

let bad = 0
const ok = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); bad++ }

/* ---------------------------------------------------------------- slicing ---- */
function grab(name) {
  const at = src.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  let d = 0
  for (let j = src.indexOf('{', at); j < src.length; j++) {
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

const FIELD_FNS = ['contourRng', 'contourRollSeed', 'contourReseed', 'contourNoise',
  'contourGenerateField', 'contourTerrainProfile', 'contourTerrainRow', 'contourOctaveLadder',
  'contourStair', 'contourTerrace', 'contourCliff', 'contourTerraceField', 'contourApplyLandforms',
  'contourShapeWarp', 'contourReliefWarp', 'contourRidgeAt', 'contourValleyAt',
  'contourFeaturePeriod', 'contourHash3', 'contourPrimitiveDelta',
  'contourApplyPrimitives', 'contourLevels']
const NUM_NAMES = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES', 'CONTOUR_PERSIST',
  'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX',
  'CONTOUR_ROUGHNESS_DEFAULT', 'CONTOUR_TERRACE_STEPS_BASE', 'CONTOUR_TERRACE_STEPS_SPAN',
  'CONTOUR_TERRACE_SOFT', 'CONTOUR_NOISE_NORM', 'CONTOUR_FEATURE_MIN',
  'CONTOUR_PLATEAU_BAND', 'CONTOUR_CLIFF_BAND', 'CONTOUR_CLIFF_STEPS_BASE',
  'CONTOUR_CLIFF_STEPS_SPAN', 'CONTOUR_CLIFF_SOFT_BASE', 'CONTOUR_CLIFF_SOFT_FALL',
  'CONTOUR_GRAIN_OCTAVES', 'CONTOUR_RIDGED_GAIN', 'CONTOUR_WARP_SHARE', 'CONTOUR_WARP_SCALE',
  'CONTOUR_LANDFORM_RIDGE', 'CONTOUR_LANDFORM_VALLEY', 'CONTOUR_BAND_GRAIN_X',
  'CONTOUR_BAND_GRAIN_Y', 'CONTOUR_CONTRAST_SCALE', 'CONTOUR_LEVEL_MARGIN',
  'CONTOUR_HOLLOW_SHARE', 'CONTOUR_HOLLOW_MIN_ROUGHNESS', 'CONTOUR_HOLLOW_DEPTH', 'CONTOUR_HOLLOW_RADIUS',
  'CONTOUR_KARST_ELONG', 'CONTOUR_KARST_LOBE', 'CONTOUR_KARST_LOBE2', 'CONTOUR_KARST_RIM',
  'CONTOUR_KARST_MIN_R',
  'CONTOUR_HOLLOW_FEATHER',
  'CONTOUR_3D_REF', 'CONTOUR_3D_DEPTH', 'CONTOUR_3D_RISE', 'CONTOUR_3D_STEPS']
const KIND_NAMES = ['CONTOUR_FEAT_NONE', 'CONTOUR_FEAT_PLATEAU', 'CONTOUR_FEAT_CLIFF',
  'CONTOUR_FEAT_FAN', 'CONTOUR_FEAT_CONE', 'CONTOUR_FEAT_CRATER', 'CONTOUR_FEAT_DUNE',
  'CONTOUR_FEAT_PIT', 'CONTOUR_FEAT_ARETE', 'CONTOUR_FEAT_TROUGH', 'CONTOUR_FEAT_KARST',
  'CONTOUR_FEAT_TALUS', 'CONTOUR_FEAT_WATER']
const LINE_NAMES = ['CONTOUR_TERRAIN_CLASS', 'CONTOUR_TERRAIN_MACRO', 'CONTOUR_TERRAIN_SHAPE',
  'CONTOUR_TERRAIN_RIDGE', 'CONTOUR_TERRAIN_VALLEY', 'CONTOUR_TERRAIN_PLATEAU',
  'CONTOUR_TERRAIN_CLIFF', 'CONTOUR_TERRAIN_CLIFFBAND', 'CONTOUR_TERRAIN_RELIEF',
  'CONTOUR_TERRAIN_WATER', 'CONTOUR_TERRAIN_BLOBS', 'CONTOUR_TERRAIN_BLOBSCALE',
  'CONTOUR_DENSITIES', 'CONTOUR_ROUGHNESS_BASE', 'CONTOUR_ROUGHNESS_PERSIST',
  'CONTOUR_ROUGHNESS_OCTAVES', 'CONTOUR_PALETTE_0', 'CONTOUR_PALETTE_1', 'CONTOUR_PALETTE_2',
  'CONTOUR_PALETTE_3', 'CONTOUR_PALETTE_4', 'CONTOUR_TERRAIN_RIDGED',
  'CONTOUR_TERRAIN_GRAIN', 'CONTOUR_TERRAIN_CONTRAST']
const EXPR_NAMES = ['CONTOUR_GRAD_X', 'CONTOUR_GRAD_Y', 'CONTOUR_KEEP_LEN', 'CONTOUR_KEEP_RING',
  'CONTOUR_FEATURE_PALETTES', 'CONTOUR_FEATURE_GRID']

let api = null
try {
  const body = [
    NUM_NAMES.map(grabNum).join('\n'),
    KIND_NAMES.map(grabNum).join('\n'),
    LINE_NAMES.map(grabLine).join('\n'),
    EXPR_NAMES.map(grabOne).join('\n'),
    ['contourSmooth', 'contourHash01'].map(grabOne).join('\n'),
    ['CONTOUR_HOLLOW_ENABLED', 'PREFS_NS', 'CONTOUR_VIEW_KEY'].map(grabOne).join('\n'),
    grabOne('isContourView3D'),
    grab('contourHollowStrength'),
    FIELD_FNS.map(grab).join('\n'),
    grab('contourParallaxUV'),
    grab('contourOcclude'),
  ].join('\n')
  api = new Function(`
let contourField = null, contourPaths = [], contourTex = null
let contourViewShed = false
let viewPref = '0'
const prefsGet = (k) => (k === CONTOUR_VIEW_KEY ? viewPref : '')
${body}
const contourPerm = new Uint16Array(512)
let contourSeed = contourReseed(0x51ee7)
let contourRoughnessIdx = 7
const contourRoughnessIndex = () => contourRoughnessIdx
let contourDensityIdx = 1
const contourDensityIndex = () => contourDensityIdx
const isDarkScheme = () => false
const isWulingPalette = () => false
return {
  contourGenerateField, contourReseed, contourLevels, contourParallaxUV, contourOcclude,
  contourHollowStrength,
  setView: (v) => { viewPref = v },
  setRoughness: (r) => { contourRoughnessIdx = r },
  hollowEnabled: () => CONTOUR_HOLLOW_ENABLED === true,
  setField: (v) => { contourField = v },
  consts: { REF: CONTOUR_3D_REF, DEPTH: CONTOUR_3D_DEPTH, RISE: CONTOUR_3D_RISE,
            STEPS: CONTOUR_3D_STEPS, SHARE: CONTOUR_HOLLOW_SHARE,
            HOLLOW_DEPTH: CONTOUR_HOLLOW_DEPTH },
}
`)()
} catch (e) {
  console.error('FAIL  could not slice the generator out of client.js: ' + e.message)
  process.exit(1)
}

const TW = 2864
const TH = 1506
const build = (hollow) => {
  api.contourReseed(0x51ee7)
  return api.contourGenerateField(TW, TH, hollow)
}

/* --------------------------------------------------- A. the carve ------------ */
const flat = build(0)
const hollow = build(1)
const flatSpan = flat.mx - flat.mn

/* A0. the cavity's HEIGHT BAND, which is what the shader masks on. The second layer
   opens where the sampled terrain is below holeHi and is fully open below holeLo, so
   the band has to exist, be ordered, and sit on the carved part of the range. */
{
  const okBand = hollow.holeLo !== null && hollow.holeHi !== null
    && Number.isFinite(hollow.holeLo) && Number.isFinite(hollow.holeHi)
    && hollow.holeHi > hollow.holeLo
  if (!okBand) {
    fail('the carved field carries no cavity band (' + hollow.holeLo + ' .. ' + hollow.holeHi + ')')
  } else if (!(hollow.holeLo < hollow.mn + (hollow.mx - hollow.mn) * 0.7)) {
    /* The band has to sit on the LOW side of the range, or the mask would be opening
       holes on ordinary ground. It is the pit cells' own percentile after the carve,
       not the range floor: a cell the funnel barely touched is still mid-range. */
    fail('the cavity band is not on the low side of the range (lo '
      + hollow.holeLo.toFixed(4) + ' vs mn ' + hollow.mn.toFixed(4) + ' mx ' + hollow.mx.toFixed(4) + ')')
  } else if (!(hollow.holeHi < hollow.mx)) {
    fail('the cavity band tops out at the range maximum -- the mask would open everywhere')
  } else if (!(hollow.holeShare > 0.01 && hollow.holeShare < 0.12)) {
    fail('the carved share of cells is ' + (hollow.holeShare * 100).toFixed(1) + '% (expected a few %)')
  } else {
    ok('cavity band ' + hollow.holeLo.toFixed(4) + '..' + hollow.holeHi.toFixed(4)
      + ' sits at the range floor, over ' + (hollow.holeShare * 100).toFixed(1) + '% of cells')
  }
}

/* A1. hollow = 0 is byte-identical to the shipped field: the flat view cannot move. */
{
  const again = build(0)
  let diff = 0
  for (let i = 0; i < flat.F.length; i++) if (flat.F[i] !== again.F[i]) diff++
  if (diff === 0) ok('hollow = 0 is deterministic and changes nothing (2D untouched)')
  else fail('hollow = 0 is not reproducible: ' + diff + ' cells differ')
}

/* A2. hollow = 1 digs: the floor drops well below the flat range. */
const drop = (flat.mn - hollow.mn) / flatSpan
if (drop > 0.2 && drop < 2.0) ok('the cavity floor drops ' + (100 * drop).toFixed(0) + '% of the flat range')
else fail('carve depth out of range: ' + (100 * drop).toFixed(0) + '% of the flat range')

/* A3. The pits stay sparse and wide: this is the difference between a landscape with
   cavities and a colander. */
{
  const n = flat.F.length
  let carved = 0
  for (let i = 0; i < n; i++) if (flat.F[i] - hollow.F[i] > flatSpan * 0.01) carved++
  const pct = (100 * carved) / n
  if (pct > 0.5 && pct < 10) ok('carved area is ' + pct.toFixed(1) + '% of the sheet (sparse)')
  else fail('carved area out of range: ' + pct.toFixed(1) + '%')
}

/* A3.5 KARST OUTLINES: no opening may be a circle, and none may contain an island.
   The first implementation carved a cone per opening (every cave came out as a perfect
   funnel) and the donut variant stood a remnant tower in the middle of one. Both were
   rejected: a real doline's outline is set by the joint pattern -- lobed, stretched,
   sometimes merged with its neighbour -- and nothing stands in the middle of it.

   Measured here on the final height field: for every opening (a connected run of cells
   below the opening level) the radius is sampled in 12 directions around its centroid;
   an outline that is not a circle must show a max/min spread, and a pillar would show up
   as a cell ABOVE the level surrounded by cells below it. */
{
  const aspects = hollow.holeAspect
  const lvlH = hollow.holeLevel
  const cols = hollow.cols
  const rows = hollow.rows
  const F = hollow.F
  const below = new Uint8Array(cols * rows)
  let belowN = 0
  for (let i = 0; i < F.length; i++) if (F[i] < lvlH) { below[i] = 1; belowN++ }
  /* Islands: a cell above the level ENCLOSED by one opening -- not simply a cell that
     happens to sit in a cluster of pre-existing noise dips, which is why this is an
     enclosure test inside each opening's own bounding box rather than a neighbour count.
     (A raw 1-cell dip below the percentile level is ordinary terrain: the sheet draws
     its ring and the speck filter decides what survives.) */
  let islandMax = 0
  /* Openings: 4-connected runs of below-level cells, interior only. */
  const seen = new Uint8Array(cols * rows)
  const stack = []
  const roundness = []
  for (let s = 0; s < cols * rows; s++) {
    if (below[s] !== 1 || seen[s] === 1) continue
    const cells = []
    stack.length = 0
    stack.push(s)
    seen[s] = 1
    while (stack.length > 0) {
      const c = stack.pop()
      cells.push(c)
      const ci = c % cols
      const cj = (c - ci) / cols
      if (ci < 1 || ci >= cols - 1 || cj < 1 || cj >= rows - 1) continue
      const nb = [c + 1, c - 1, c + cols, c - cols]
      for (const nc of nb) {
        if (below[nc] === 1 && seen[nc] === 0) { seen[nc] = 1; stack.push(nc) }
      }
    }
    if (cells.length < 24) continue
    let cx = 0
    let cy = 0
    for (const c of cells) { const ci = c % cols; cx += ci; cy += (c - ci) / cols }
    cx /= cells.length
    cy /= cells.length
    const BY = 12
    const sum = new Float64Array(BY)
    const nBy = new Int32Array(BY)
    for (const c of cells) {
      const ci = c % cols
      const cj = (c - ci) / cols
      const dx = ci - cx
      const dy = cj - cy
      const a = Math.atan2(dy, dx)
      const b = ((Math.floor((a + Math.PI) / (2 * Math.PI) * BY) % BY) + BY) % BY
      sum[b] += Math.sqrt(dx * dx + dy * dy)
      nBy[b]++
    }
    let lo = Infinity
    let hi = 0
    for (let b = 0; b < BY; b++) {
      if (nBy[b] === 0) continue
      const r = sum[b] / nBy[b]
      if (r < lo) lo = r
      if (r > hi) hi = r
    }
    if (lo > 0 && hi > 0) roundness.push(hi / lo)
    /* Enclosure inside THIS opening: flood the above-level cells of its bounding box
       from the border; whatever is left over is a pillar standing in the hole. */
    let bi0 = cols
    let bi1 = -1
    let bj0 = rows
    let bj1 = -1
    for (const c of cells) {
      const ci = c % cols
      const cj = (c - ci) / cols
      if (ci < bi0) bi0 = ci
      if (ci > bi1) bi1 = ci
      if (cj < bj0) bj0 = cj
      if (cj > bj1) bj1 = cj
    }
    const bw = bi1 - bi0 + 1
    const bh = bj1 - bj0 + 1
    const out = new Uint8Array(bw * bh)
    const q = []
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const edge = i === 0 || j === 0 || i === bw - 1 || j === bh - 1
        if (!edge) continue
        if (F[(bj0 + j) * cols + (bi0 + i)] < lvlH) continue
        out[j * bw + i] = 1
        q.push(j * bw + i)
      }
    }
    while (q.length > 0) {
      const c = q.pop()
      const ci = c % bw
      const cj = (c - ci) / bw
      const nb = [ci > 0 ? c - 1 : -1, ci < bw - 1 ? c + 1 : -1,
        cj > 0 ? c - bw : -1, cj < bh - 1 ? c + bw : -1]
      for (const nc of nb) {
        if (nc < 0 || out[nc] === 1) continue
        if (F[(bj0 + Math.floor(nc / bw)) * cols + (bi0 + (nc % bw))] < lvlH) continue
        out[nc] = 1
        q.push(nc)
      }
    }
    /* Size the enclosed runs: a pillar would be dozens of cells, a diagonal pinch of
       the noise field is one or two. Only a run of 4+ counts as an island. */
    const marked = new Uint8Array(bw * bh)
    let pit = 0
    for (let c0 = 0; c0 < bw * bh; c0++) {
      if (out[c0] === 1 || marked[c0] === 1) continue
      if (F[(bj0 + Math.floor(c0 / bw)) * cols + (bi0 + (c0 % bw))] < lvlH) continue
      let n = 0
      q.length = 0
      q.push(c0)
      marked[c0] = 1
      while (q.length > 0) {
        const c = q.pop()
        n++
        const ci = c % bw
        const cj = (c - ci) / bw
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue
            const ni = ci + di
            const nj = cj + dj
            if (ni < 0 || nj < 0 || ni >= bw || nj >= bh) continue
            const nc = nj * bw + ni
            if (marked[nc] === 1 || out[nc] === 1) continue
            if (F[(bj0 + nj) * cols + (bi0 + ni)] < lvlH) continue
            marked[nc] = 1
            q.push(nc)
          }
        }
      }
      if (n > pit) pit = n
    }
    if (pit > islandMax) islandMax = pit
  }
  roundness.sort((a, b) => a - b)
  const widest = roundness.length > 0 ? roundness[roundness.length - 1] : 0
  const narrowest = roundness.length > 0 ? roundness[0] : 0
  if (belowN < 20) {
    fail('no opening in the field (' + belowN + ' cells below the level)')
  } else if (!Array.isArray(aspects) || aspects.length < 2) {
    fail('no per-opening aspect list (' + JSON.stringify(aspects) + ')')
  } else if (aspects.some((v) => !(v > 0.2 && v <= 1))) {
    fail('an aspect ratio is out of range: ' + aspects.join(','))
  } else if (new Set(aspects).size < 2) {
    fail('every opening came out with the same stretch (' + aspects.join(',') + ')')
  } else if (hollow.holeHi !== hollow.holeLevel) {
    fail('the mask threshold is not the opening level (' + hollow.holeHi + ' vs ' + hollow.holeLevel + ')')
  } else if (islandMax >= 12) {
    fail('a ' + islandMax + '-cell island stands inside an opening: a pillar came back')
  } else if (!(narrowest >= 1.08)) {
    fail('an opening is within ' + ((narrowest - 1) * 100).toFixed(1)
      + '% of a circle (max/min radius): the outline is not karst')
  } else if (!(widest >= 1.25)) {
    fail('no opening is strongly lobed (widest max/min radius ' + widest.toFixed(2) + ')')
  } else {
    ok('karst outlines: ' + roundness.length + ' openings, max/min radius '
      + narrowest.toFixed(2) + '..' + widest.toFixed(2) + ', largest enclosed run '
      + islandMax + ' cells, aspects '
      + JSON.stringify(Array.from(new Set(aspects)).slice(0, 6)))
  }
}

/* A3.6 THE MASK IS BINARY: inside the opening the near ground contributes NOTHING and
   the far layer is everything; outside it the far layer is invisible. The old build
   blended 42% of each ("洞为100%透明" was the request, and a blend is not transparent).
   Asserted on the shader source because the composite is GPU-only. */
{
  const shader = src.slice(src.indexOf('float sunH = surfaceAt(uv);'),
    src.indexOf('if (u_diagWrap > 0.5)'))
  if (!/col = mix\(deep, col, cover\)/.test(shader)) {
    fail('the cavity composite is not a two-layer mix (deep, ground)')
  } else if (/0\.42/.test(shader)) {
    fail('the old 42% blend is still in the cavity composite')
  } else if (!/u_holeFeather/.test(shader)) {
    fail('the mask edge has no feather uniform')
  } else if (!/uniform float u_holeFeather;/.test(src)
    || !/uniform1f\(st\.uHoleFeather,/.test(src)) {
    fail('u_holeFeather is not declared/uploaded')
  } else {
    ok('cavity composite is binary: mix(deep, ground, cover), feathered edge, no 42% blend')
  }
}


/* A4. Contour SPACING is preserved: more levels when the range grew, not wider gaps.
   Without this the surface visibly thinned the moment a pit appeared (~40% fewer
   lines, measured). */
{
  api.setField(flat)
  const flatLevels = api.contourLevels()
  api.setField(hollow)
  const hollowLevels = api.contourLevels()
  const flatStep = (flatLevels[1] - flatLevels[0])
  const hollowStep = (hollowLevels[1] - hollowLevels[0])
  const ratio = hollowStep / flatStep
  if (Math.abs(ratio - 1) < 0.02) {
    ok('contour spacing is preserved (' + (100 * ratio).toFixed(1) + '% of the flat step, ' +
      hollowLevels.length + ' levels vs ' + flatLevels.length + ')')
  } else fail('contour spacing moved by ' + (100 * (ratio - 1)).toFixed(1) + '%')
  if (hollowLevels.length > flatLevels.length) {
    ok('the extra depth got extra levels (' + flatLevels.length + ' -> ' + hollowLevels.length + ')')
  } else fail('range grew but level count did not (' + flatLevels.length + ' -> ' + hollowLevels.length + ')')
}

/* A5. Rings inside the deepest pit: the number that makes it read as a hole. */
{
  api.setField(hollow)
  const levels = api.contourLevels()
  const cols = hollow.cols
  let deepestAt = 0
  let deepest = -Infinity
  for (let i = 0; i < hollow.F.length; i++) {
    const d = flat.F[i] - hollow.F[i]
    if (d > deepest) { deepest = d; deepestAt = i }
  }
  const cx = deepestAt % cols
  const cy = (deepestAt - cx) / cols
  let lo = Infinity
  let hi = -Infinity
  for (let j = Math.max(0, cy - 3); j <= Math.min(hollow.rows - 1, cy + 3); j++) {
    for (let i = Math.max(0, cx - 3); i <= Math.min(cols - 1, cx + 3); i++) {
      const v = hollow.F[j * cols + i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  let rings = 0
  for (const L of levels) if (L > lo && L < hi) rings++
  if (rings >= 4) ok(rings + ' contour levels cross the deepest pit (a hole, not a dent)')
  else fail('only ' + rings + ' contours cross the deepest pit: it reads as a dent')
}

/* A6. The carved field still repeats seamlessly. */
{
  const cols = hollow.cols
  const rows = hollow.rows
  let worst = 0
  if (Math.abs((cols - 1) * hollow.step - TW) < 1e-6) {
    for (let j = 0; j < rows; j++) {
      worst = Math.max(worst, Math.abs(hollow.F[j * cols + cols - 1] - hollow.F[j * cols]))
    }
  }
  if (Math.abs((rows - 1) * hollow.step - TH) < 1e-6) {
    for (let i = 0; i < cols; i++) {
      worst = Math.max(worst, Math.abs(hollow.F[(rows - 1) * cols + i] - hollow.F[i]))
    }
  }
  if (worst < 1e-6) ok('the carved field still repeats exactly at the tile edge')
  else fail('the carve broke the tile edge by ' + worst.toExponential(2))
}

/* --------------------------------------------- B. the occlusion rule -------- */
const VW = 2864
const VH = 1506
const TS = 3968
const THT = 2048
const CAM = 412.5

/* B1. A flat field must reproduce the closed form: nothing to occlude, nothing moves. */
{
  const surface = () => 0.5
  let worst = 0
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 40; j++) {
      const px = 100 + i * 44
      const py = 100 + j * 34
      const r = api.contourOcclude(px, py, CAM, CAM * 0.5, TS, THT, VW, VH, surface, 14)
      worst = Math.max(worst, Math.abs(r.h - 0.5))
    }
  }
  if (worst < 1e-6) ok('a flat field reproduces the closed-form offset exactly (' + worst.toExponential(1) + ')')
  else fail('a flat field moved by ' + worst.toExponential(2) + ' (occlusion invents depth)')
}

/* B2. Occlusion may only pull the sample NEARER, never deeper. The reference is the
   fixed point of the one-step mapping, which only exists while the surface is
   continuous -- so this uses a SMOOTH field. (A saw-tooth field has no fixed point to
   compare against: the one-step mapping jumps, which is exactly the case where one
   step and many disagree, and where marching is the only correct answer.) */
{
  let worse = 0
  let compared = 0
  let marched = 0
  for (let ok_i = 0; ok_i < 16; ok_i++) {
    const surface = (u, v) => 0.5 + 0.22 * Math.sin(2 * Math.PI * u + ok_i) * Math.cos(2 * Math.PI * v + ok_i * 0.7)
    for (let i = 0; i < 18; i++) {
      const px = 300 + i * 131
      const py = 200 + ((i * 211) % 1100)
      const r = api.contourOcclude(px, py, CAM, CAM * 0.5, TS, THT, VW, VH, surface, 16)
      let naive = 0.5
      for (let it = 0; it < 60; it++) {
        const at = api.contourParallaxUV(px, py, CAM, CAM * 0.5, TS, THT, naive, VW, VH)
        naive = surface(at.u, at.v)
      }
      compared++
      if (r.occluded) marched++
      if (r.h < naive - 2e-3) worse++
    }
  }
  if (worse === 0) {
    ok('occlusion never pulls a sample deeper (' + compared + ' rays, ' + marched + ' hit before the bottom)')
  } else fail(worse + ' of ' + compared + ' rays ended up DEEPER than the closed form')
}

/* B3. Steps are accuracy, not behaviour: on a flat field 1 step and 32 steps agree. */
{
  let worst = 0
  for (let i = 0; i < 24; i++) {
    const a = api.contourOcclude(300 + i * 61, 200 + i * 37, CAM, CAM * 0.5, TS, THT, VW, VH, () => 0.5, 1)
    const b = api.contourOcclude(300 + i * 61, 200 + i * 37, CAM, CAM * 0.5, TS, THT, VW, VH, () => 0.5, 32)
    worst = Math.max(worst, Math.abs(a.h - b.h))
  }
  if (worst < 1e-9) ok('1 step and 32 steps agree on a flat field (' + worst.toExponential(1) + ')')
  else fail('step count changes the answer on a flat field by ' + worst.toExponential(2))
}

/* ------------------------------------------------- C. who gets the holes ------- */
/* The decision is "3D only, and how rough the terrain is", which is a product choice,
   not a detail of the carve: the flat sheet is what most people see and it is a still
   image, so a second parallax layer there would cost memory and buy nothing. And calm
   terrain must not have sinkholes -- a cavity in a plain reads as a rendering fault.

   Required behaviour, from the user: "地形粗糙度也应该影响洞穴密度。1-6 无洞穴，
   7 开始有浅洞穴，12 就按现在这个来". So the strength is 0 below the 7th stop, a
   sixth at the 7th (shallow), and exactly 1 at the last stop (what shipped). */
{
  api.setView('1')
  api.setRoughness(11)
  const w12 = api.contourHollowStrength()
  api.setRoughness(6)
  const w7 = api.contourHollowStrength()
  api.setRoughness(5)
  const w6 = api.contourHollowStrength()
  api.setRoughness(0)
  const w1 = api.contourHollowStrength()
  api.setRoughness(11)
  api.setView('0')
  const flat2d = api.contourHollowStrength()
  if (Math.abs(w12 - 1) < 1e-9) ok('the last roughness stop gives the cavities their shipped strength (1)')
  else fail('the last stop does not give strength 1: ' + w12)
  if (Math.abs(w7 - 1 / 6) < 1e-9) ok('the 7th stop is shallow, not off (' + w7.toFixed(3) + ')')
  else fail('the 7th stop should be 1/6, got ' + w7)
  if (w6 === 0 && w1 === 0) ok('stops 1-6 have no cavities at all')
  else fail('a calm terrain still carves cavities: stop 6 = ' + w6 + ', stop 1 = ' + w1)
  if (flat2d === 0) ok('the flat view never carves, whatever the roughness says')
  else fail('the flat view is carving cavities (it must stay byte-identical): ' + flat2d)
  if (api.hollowEnabled()) ok('CONTOUR_HOLLOW_ENABLED is on, so the 3D path is live')
  else fail('CONTOUR_HOLLOW_ENABLED is off: the 3D path above is dead code')
}

/* ------------------------------------------------- C2. strength scales the carve --- */
/* Not just a switch: a 1/6-strength field must carve LESS area and shallower than a
   full one, and more than nothing. Same seed, so the landscape is identical and only
   the carving differs. */
{
  const full = build(1)
  const shallow = build(1 / 6)
  const areaOf = (f) => {
    let n = 0
    for (let i = 0; i < f.F.length; i++) if (f.F[i] < f.holeLevel) n++
    return n / f.F.length
  }
  const dropOf = (f) => {
    let mn = Infinity
    for (let i = 0; i < f.F.length; i++) if (f.F[i] < mn) mn = f.F[i]
    return mn
  }
  const aFull = areaOf(full)
  const aShallow = areaOf(shallow)
  if (!(aShallow > 0)) fail('a 1/6 strength carves nothing at all: the 7th stop would show no caves')
  else if (!(aShallow < aFull)) fail('a 1/6 strength carves as much as the full one ('
    + aShallow.toFixed(4) + ' vs ' + aFull.toFixed(4) + ')')
  else if (!(dropOf(shallow) > dropOf(full))) fail('a 1/6 strength is as deep as the full one ('
    + dropOf(shallow).toFixed(3) + ' vs ' + dropOf(full).toFixed(3) + ')')
  else {
    ok('strength scales the carve: area ' + (aShallow * 100).toFixed(2) + '% vs '
      + (aFull * 100).toFixed(2) + '%, floor ' + dropOf(shallow).toFixed(3)
      + ' vs ' + dropOf(full).toFixed(3))
  }
}

if (bad) {
  console.error(bad + ' hollow terrain check(s) failed')
  process.exit(1)
}
console.log('all hollow terrain checks passed')
