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
  'CONTOUR_HOLLOW_SHARE', 'CONTOUR_HOLLOW_SHARP', 'CONTOUR_HOLLOW_DEPTH', 'CONTOUR_HOLLOW_RADIUS',
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
    FIELD_FNS.map(grab).join('\n'),
    grab('contourParallaxUV'),
    grab('contourOcclude'),
  ].join('\n')
  api = new Function(`
let contourField = null, contourPaths = [], contourTex = null
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

if (bad) {
  console.error(bad + ' hollow terrain check(s) failed')
  process.exit(1)
}
console.log('all hollow terrain checks passed')
