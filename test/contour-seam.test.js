/**
 * contour-seam.test.js — the sheet has to be ONE picture, not a picture whose edges
 * were patched together.
 *
 * The background scrolls by tiling the sheet, and the 3D view samples it through
 * `fract(uv)`, so both views show the join between the far edge and the near one. For
 * that join to be invisible the two have to be the SAME ink, which takes three things,
 * and this file measures all three without a browser:
 *
 *   1. THE SHEET CLOSES ON ITS SAMPLING GRID. The terrain is sampled every
 *      CONTOUR_STEP px; a size that is not a whole number of steps leaves a residual
 *      cell at the edge, and a contour crossing there lands up to a step away from its
 *      continuation -- a jog whose size depended on the window. contourTargetTexture
 *      has to return a multiple of the step (and of two steps, so the DEVICE period is
 *      a whole number of texels at the quarter-step ratios panels report).
 *   2. THE FIELD CLOSES ON ITS NOISE LATTICE. Every noise period equals the sheet size,
 *      so F(0) and F(last) are the same physical point and must be equal to the last bit.
 *   3. NOTHING IS CUT AT THE EDGE. The extraction wraps on the period, so a contour that
 *      leaves one edge comes back at the other: every contour has to CLOSE on the torus.
 *      A free end is a stroke drawn with a butt cap and smoothed against nothing, i.e.
 *      the seam. (contour-cusps.test.js measures the same invariant on the shipped
 *      viewports; this file measures it on the sizes the planner actually produces.)
 *
 * Plus the guard for the other side of the contract: a sheet that does NOT close is not
 * a torus, and there the extraction must stay bounded exactly as it always was.
 *
 * Usage: node test/contour-seam.test.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
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
  'contourTargetTexture', 'contourSeamShifts', 'contourTerrainProfile', 'contourTerrainRow',
  'contourOctaveLadder', 'contourStair', 'contourTerrace', 'contourCliff',
  'contourTerraceField', 'contourApplyLandforms', 'contourShapeWarp', 'contourReliefWarp',
  'contourRidgeAt', 'contourValleyAt', 'contourFeaturePeriod', 'contourHash3',
  'contourPrimitiveDelta', 'contourApplyPrimitives']
  .map(grab).join('\n')
const oneLiners = ['contourSmooth', 'contourHash01'].map(grabOne).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES',
  'CONTOUR_PERSIST', 'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX',
  'CONTOUR_ROUGHNESS_DEFAULT', 'CONTOUR_TERRACE_STEPS_BASE', 'CONTOUR_TERRACE_STEPS_SPAN',
  'CONTOUR_TERRACE_SOFT', 'CONTOUR_NOISE_NORM', 'CONTOUR_FEATURE_MIN',
  'CONTOUR_PLATEAU_BAND', 'CONTOUR_CLIFF_BAND', 'CONTOUR_CLIFF_STEPS_BASE',
  'CONTOUR_CLIFF_STEPS_SPAN', 'CONTOUR_CLIFF_SOFT_BASE', 'CONTOUR_CLIFF_SOFT_FALL',
  'CONTOUR_GRAIN_OCTAVES', 'CONTOUR_RIDGED_GAIN', 'CONTOUR_WARP_SHARE', 'CONTOUR_WARP_SCALE',
  'CONTOUR_LANDFORM_RIDGE', 'CONTOUR_LANDFORM_VALLEY', 'CONTOUR_BAND_GRAIN_X',
  'CONTOUR_BAND_GRAIN_Y', 'CONTOUR_CONTRAST_SCALE']
  .map(grabNum).join('\n')
const texNums = ['CONTOUR_TEX_MULT', 'CONTOUR_TEX_MAX_AREA', 'CONTOUR_TEX_MAX_DIM',
  'CONTOUR_TEX_QUANT', 'CONTOUR_MEM_BUDGET', 'CONTOUR_SCROLL_MIN_MULT',
  'CONTOUR_SURFACE_MAX_PX', 'CONTOUR_SURFACE_PAD', 'CONTOUR_3D_TEX_MULT',
  'CONTOUR_3D_TEX_AREA', 'CONTOUR_SHEET_MAX_DEVICE_PX', 'CONTOUR_SCROLL_AREA',
  'CONTOUR_SCROLL_DIM'].map(grabNum).join('\n')
const kinds = ['CONTOUR_FEAT_NONE', 'CONTOUR_FEAT_PLATEAU', 'CONTOUR_FEAT_CLIFF',
  'CONTOUR_FEAT_FAN', 'CONTOUR_FEAT_CONE', 'CONTOUR_FEAT_CRATER', 'CONTOUR_FEAT_DUNE',
  'CONTOUR_FEAT_PIT', 'CONTOUR_FEAT_ARETE', 'CONTOUR_FEAT_TROUGH', 'CONTOUR_FEAT_KARST',
  'CONTOUR_FEAT_TALUS', 'CONTOUR_FEAT_WATER'].map(grabNum).join('\n')
const lines = ['CONTOUR_DENSITIES', 'CONTOUR_ROUGHNESS_BASE', 'CONTOUR_ROUGHNESS_PERSIST',
  'CONTOUR_ROUGHNESS_OCTAVES', 'CONTOUR_TERRAIN_CLASS', 'CONTOUR_TERRAIN_MACRO',
  'CONTOUR_TERRAIN_SHAPE', 'CONTOUR_TERRAIN_RIDGE', 'CONTOUR_TERRAIN_VALLEY',
  'CONTOUR_TERRAIN_PLATEAU', 'CONTOUR_TERRAIN_CLIFF', 'CONTOUR_TERRAIN_CLIFFBAND',
  'CONTOUR_TERRAIN_RELIEF', 'CONTOUR_TERRAIN_WATER', 'CONTOUR_TERRAIN_BLOBS',
  'CONTOUR_TERRAIN_BLOBSCALE', 'CONTOUR_PALETTE_0', 'CONTOUR_PALETTE_1', 'CONTOUR_PALETTE_2',
  'CONTOUR_PALETTE_3', 'CONTOUR_PALETTE_4',
  'CONTOUR_TERRAIN_RIDGED', 'CONTOUR_TERRAIN_GRAIN', 'CONTOUR_TERRAIN_CONTRAST']
  .map(grabLine).join('\n')
const exprs = ['CONTOUR_GRAD_X', 'CONTOUR_GRAD_Y', 'CONTOUR_KEEP_LEN',
  'CONTOUR_KEEP_RING', 'CONTOUR_LEVEL_MARGIN', 'CONTOUR_FEATURE_PALETTES',
  'CONTOUR_FEATURE_GRID'].map(grabOne).join('\n')
const ROUGH = (src.match(/const CONTOUR_ROUGHNESS_DEFAULT = ([0-9]+)/) || [])[1]

let api
try {
  api = new Function(`
let contourField = null, contourPaths = [], contourTex = null
${nums}
${texNums}
${kinds}
${lines}
${exprs}
${oneLiners}
${fns}
const contourPerm = new Uint16Array(512)
let contourSeed = contourReseed(0x5eed4242)
let contourDensityIdx = 1
const contourDensityIndex = () => contourDensityIdx
let contourRoughnessIdx = ${ROUGH}
const contourRoughnessIndex = () => contourRoughnessIdx
const isDarkScheme = () => false
const isWulingPalette = () => false
return {
  step: CONTOUR_STEP,
  plan(w, h, dpr, three) {
    const t = contourTargetTexture(w, h, dpr, three === true)
    return { twCss: t.twCss, thCss: t.thCss, twDev: t.twDev, thDev: t.thDev, scroll: t.scroll === true }
  },
  /* Build the field + extraction at a size and report the two closure numbers. */
  build(tw, th) {
    contourDensityIdx = 1
    contourField = contourGenerateField(tw, th)
    const f = contourField
    let fieldSeam = 0
    for (let j = 0; j < f.rows; j++) {
      const d = Math.abs(f.F[j * f.cols] - f.F[j * f.cols + f.cols - 1])
      if (d > fieldSeam) fieldSeam = d
    }
    for (let i = 0; i < f.cols; i++) {
      const d = Math.abs(f.F[i] - f.F[(f.rows - 1) * f.cols + i])
      if (d > fieldSeam) fieldSeam = d
    }
    contourExtractAll()
    const perX = (f.cols - 1) * f.step
    const perY = (f.rows - 1) * f.step
    let freeEnds = 0
    let maxStep = 0
    let outside = 0
    let shortest = Infinity
    /* A contour that winds around the sheet is unwrapped as it is walked, so its
       coordinates legitimately run outside the tile -- by at most as far as the contour
       is long, which is the only bound that does not need a magic constant. A break in
       the unwrap shows up here immediately: it stretches a short contour by a whole
       period (the defect this check caught, 1150px of span on a 50px contour). */
    let worstStretch = 0
    for (const p of contourPaths) {
      const n = p.length
      let len = 0
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (let k = 2; k < n; k += 2) {
        const d = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1])
        len += d
        if (d > maxStep) maxStep = d
      }
      for (let k = 0; k < n; k += 2) {
        if (p[k] < minX) minX = p[k]
        if (p[k] > maxX) maxX = p[k]
        if (p[k + 1] < minY) minY = p[k + 1]
        if (p[k + 1] > maxY) maxY = p[k + 1]
      }
      if (n / 2 < shortest) shortest = n / 2
      let gx = p[0] - p[n - 2]
      let gy = p[1] - p[n - 1]
      gx -= Math.round(gx / perX) * perX
      gy -= Math.round(gy / perY) * perY
      if (Math.hypot(gx, gy) > 2) freeEnds++
      const slack = f.step * 2
      if (maxX - minX > len + slack || maxY - minY > len + slack) {
        outside++
        const stretch = Math.max(maxX - minX, maxY - minY) / Math.max(1, len)
        if (stretch > worstStretch) worstStretch = stretch
      }
    }
    return { fieldSeam, paths: contourPaths.length, freeEnds, maxStep, outside, shortest,
      worstStretch, range: f.mx - f.mn, perX, perY }
  },
  torusAt(tw, th) {
    const f = contourField
    if (f === null) return false
    return (f.cols - 1) * f.step === tw && (f.rows - 1) * f.step === th
  },
  shifts(perX, perY, wCss, hCss, minX, maxX, minY, maxY, eps) {
    return contourSeamShifts(perX, perY, wCss, hCss, minX, maxX, minY, maxY, eps)
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

/* Viewports x device ratios: small (where the planner clamps at its floor), typical,
   large, extreme aspect (where it clamps on one axis only) and HiDPI at the quarter
   step ratios the panel reports -- 1.25 and 1.5 are the ones that used to make
   period * dpr non-integral. */
const CASES = []
for (const [w, h] of [[320, 240], [1152, 648], [1432, 753], [1610, 1006], [1920, 1080],
  [2560, 1440], [2000, 200], [960, 1080]]) {
  for (const dpr of [1, 1.25, 1.5, 2]) CASES.push([w, h, dpr])
}

/* ---------- 1. the planned sheet closes on the sampling grid ---------------- */
let offGrid = 0
let nonIntegral = 0
let overCap = 0
let planned = 0
let worstCover = Infinity
const sizes = new Set()
for (const [w, h, dpr] of CASES) {
  for (const three of [false, true]) {
    const t = api.plan(w, h, dpr, three)
    planned++
    sizes.add(t.twCss + 'x' + t.thCss)
    if (t.twCss % api.step !== 0 || t.thCss % api.step !== 0) {
      offGrid++
      if (offGrid <= 4) console.error('      ' + w + 'x' + h + '@' + dpr + (three ? ' 3d' : '')
        + ': sheet ' + t.twCss + 'x' + t.thCss + ' is not a whole number of ' + api.step + 'px cells')
    }
    /* The device period has to be a whole number of texels or the wrap lands half a
       pixel off the texel grid (and the 3D shader samples it through fract()). */
    if (Math.abs(t.twCss * dpr - Math.round(t.twCss * dpr)) > 1e-9
      || Math.abs(t.thCss * dpr - Math.round(t.thCss * dpr)) > 1e-9) nonIntegral++
    /* Ceiling: the 3D sheet and the scroll path are both planned against
       CONTOUR_SCROLL_DIM, the blit fallback against CONTOUR_TEX_MAX_DIM. */
    const cap = (three || t.scroll) ? 8192 : 4096
    if (t.twDev > cap || t.thDev > cap) {
      overCap++
      if (overCap <= 4) console.error('      ' + w + 'x' + h + '@' + dpr + (three ? ' 3d' : '')
        + ': sheet ' + t.twDev + 'x' + t.thDev + ' device px is over the ' + cap + ' ceiling')
    }
    /* Coverage is reported, not asserted: at a 2560x1440 viewport on a 2x panel the
       fallback's 4096-device-px ceiling genuinely cannot hold a period wider than the
       viewport, and the shipped shape of that path is to draw the sheet it can afford
       (the scroll path, which has the longer period, takes over whenever it fits). */
    const cover = Math.min(t.twCss / w, t.thCss / h)
    if (cover < worstCover) worstCover = cover
  }
}
if (offGrid === 0) ok('every planned sheet is a whole number of ' + api.step + 'px cells ('
  + planned + ' plans, ' + sizes.size + ' distinct sizes)')
else fail(offGrid + ' of ' + planned + ' planned sheets leave a residual cell at the edge')
if (nonIntegral === 0) ok('every planned sheet is a whole number of DEVICE texels at every tested ratio')
else fail(nonIntegral + ' planned sheet(s) have a fractional device-pixel period')
if (overCap === 0) ok('no planned sheet is over its device-pixel ceiling')
else fail(overCap + ' planned sheet(s) are over their device-pixel ceiling')
console.log('  period covers the viewport by ' + worstCover.toFixed(2) + 'x at the tightest tested case')

/* ---------- 2 + 3. the field closes, and nothing is cut at the edge ---------- */
const CHECK = [[1920, 1280, 'plain'], [3720, 1560, '2D sheet at 1432x753@2x'],
  [3980, 2100, '2D sheet at 1610x1006@2x'], [1800, 900, '3D sheet'], [320, 240, 'clamped floor']]
let worstFieldSeam = 0
let freeEnds = 0
let torusSheets = 0
let worstStretch = 0
let maxStep = 0
let outside = 0
let degenerate = 0
for (const [tw, th, label] of CHECK) {
  const b = api.build(tw, th)
  if (!api.torusAt(tw, th)) {
    fail(label + ' ' + tw + 'x' + th + ': the built sheet is not a torus (cols-1)*step != tw')
    continue
  }
  torusSheets++
  if (b.fieldSeam > worstFieldSeam) worstFieldSeam = b.fieldSeam
  freeEnds += b.freeEnds
  if (b.maxStep > maxStep) maxStep = b.maxStep
  outside += b.outside
  if (b.worstStretch > worstStretch) worstStretch = b.worstStretch
  if (b.paths < 20) {
    degenerate++
    console.error('      ' + label + ' ' + tw + 'x' + th + ': only ' + b.paths + ' contours')
  }
  console.log('  ' + label.padEnd(24) + tw + 'x' + th + ': contours ' + String(b.paths).padStart(4)
    + '  field seam ' + b.fieldSeam.toExponential(0) + '  ends ' + b.freeEnds
    + '  worst step ' + b.maxStep.toFixed(1) + 'px')
}
if (torusSheets === 0) fail('no closed sheet could be built — nothing was measured')
else {
  if (worstFieldSeam === 0) ok('the field is exactly periodic at every sheet size (F(0) == F(last) bit for bit)')
  else fail('the field does not close: worst |F(0) - F(last)| = ' + worstFieldSeam.toExponential(2))

  if (freeEnds === 0) ok('no contour ends anywhere on a closed sheet: every contour wraps around the torus')
  else fail(freeEnds + ' contour(s) still end on a closed sheet — those are cut strokes, i.e. the seam')

  if (maxStep < api.step * 2.5) ok('no vertex jump inside a contour (worst step ' + maxStep.toFixed(1) + 'px)')
  else fail('a contour jumps ' + maxStep.toFixed(1) + 'px between vertices — the unwrap broke')

  if (outside === 0) ok('no contour is stretched by the unwrap (span never exceeds its own length)')
  else fail(outside + ' contour(s) span further than their length allows (worst '
    + worstStretch.toFixed(1) + 'x) — the unwrap broke')

  if (degenerate === 0) ok('every sheet carries a full contour set')
}

/* ---------- 4. a sheet that does not close must stay bounded ----------- */
/* Only reachable by calling the generator directly, but the fallback has to stay
   exactly as it was: no wrapping, no period-long jumps, nothing outside the tile. */
{
  const tw = 1803, th = 1207            // deliberately 3 px off the grid on each axis
  const b = api.build(tw, th)
  const torus = api.torusAt(tw, th)
  const endsMeanNothing = b.maxStep < 25
  if (torus) fail('a sheet 3px off the grid was treated as a torus')
  else if (!endsMeanNothing) fail('off-grid sheet: a contour jumps ' + b.maxStep.toFixed(1) + 'px between vertices')
  else if (b.outside > 0) fail('off-grid sheet: a contour spans further than its length allows')
  else ok('an off-grid sheet is not wrapped: ' + b.paths + ' contours, worst step '
    + b.maxStep.toFixed(1) + 'px, all vertices inside the tile')
}

/* ---------- 5. the shift planner paints every point exactly once ----------- */
/* This is the one piece of the seam that can be wrong while the extraction is right:
   which whole-period translations of a contour to stroke. Paint too few and the ink at
   the far side of the seam is missing; paint too many and the same stroke is laid down
   twice (visibly brighter at 20-40% alpha). Both are checked here on the planner
   directly, over boxes that sit inside, straddle and wind around the sheet.
   A point's correct translation is the one that reduces it modulo the period, so the
   assertions are: that pair is always offered, no pair offers it twice, and every
   offered pair (the untranslated one aside) actually puts some of the box on the sheet. */
{
  const SHIFT_CASES = [
    /* [perX, perY, wCss, hCss, minX, maxX, minY, maxY, why] */
    [3560, 1680, 3560, 1680, 100, 500, 100, 500, 'interior'],
    [3560, 1680, 3560, 1680, 3500, 3620, 200, 400, 'straddles the right edge'],
    [3560, 1680, 3560, 1680, 3560, 4000, 200, 400, 'entirely past the right edge'],
    [3560, 1680, 3560, 1680, -300, 300, -120, 120, 'entirely past the left/top edges'],
    [3560, 1680, 3560, 1680, 5, 3570, 5, 1690, 'winds one period in both axes'],
    [3560, 1680, 3560, 1680, -1200, 2400, 300, 700, 'two periods wide'],
    /* A sheet that does not close: the period is wider than the sheet, so the residual
       strip past wCss must not be shifted back onto the canvas. */
    [1160, 650, 1152, 648, 1100, 1159, 100, 300, 'off-grid residual strip'],
    [1160, 650, 1152, 648, 0, 1160, 0, 650, 'off-grid whole tile'],
    [0, 0, 3560, 1680, 0, 100, 0, 100, 'no field (no period at all)'],
  ]
  let missing = 0
  let doubled = 0
  let wasteful = 0
  let cases = 0
  for (const [perX, perY, wCss, hCss, minX, maxX, minY, maxY, why] of SHIFT_CASES) {
    cases++
    const eps = 0.5
    const shifts = api.shifts(perX, perY, wCss, hCss, minX, maxX, minY, maxY, eps)
    /* A contour is always offered at least one translation (a drifted one may be
       offered only the shifted pair: its own position is off the canvas entirely). */
    if (shifts.length === 0) missing += 1000
    /* Every pair except the untranslated one must put ink on the sheet... */
    for (const [kx, ky] of shifts) {
      if (kx === 0 && ky === 0) continue
      const dx = kx * perX
      const dy = ky * perY
      if (maxX + dx <= eps || minX + dx >= wCss - eps || maxY + dy <= eps || minY + dy >= hCss - eps) {
        wasteful++
        if (wasteful <= 3) console.error('      ' + why + ': translation ' + kx + ',' + ky + ' rasters nothing')
      }
    }
    /* ...and every point of the box has its own translation offered, exactly once. */
    for (let u = 0; u <= 10; u++) {
      for (let v = 0; v <= 10; v++) {
        const x = minX + ((maxX - minX) * u) / 10
        const y = minY + ((maxY - minY) * v) / 10
        const cx = perX > 0 ? x - Math.floor(x / perX) * perX : x
        const cy = perY > 0 ? y - Math.floor(y / perY) * perY : y
        const strictInside = cx > eps && cx < wCss - eps && cy > eps && cy < hCss - eps
        /* how many offered translations put this point strictly inside */
        let inside = 0
        for (const [sx2, sy2] of shifts) {
          const px2 = x + sx2 * perX
          const py2 = y + sy2 * perY
          if (px2 > eps && px2 < wCss - eps && py2 > eps && py2 < hCss - eps) inside++
        }
        if (inside > 1) {
          doubled++
          if (doubled <= 3) console.error('      ' + why + ': point ' + x.toFixed(1) + ',' + y.toFixed(1)
            + ' is painted ' + inside + ' times')
        } else if (strictInside && inside === 0) {
          /* A point on the sheet with no translation offered is ink that would be
             missing. The residual strip of an off-grid sheet is the documented
             exception: it lies outside [0, wCss] by construction. */
          const offGridStrip = perX > wCss && cx >= wCss - eps - 1e-9
          if (!offGridStrip) {
            missing++
            if (missing <= 3) console.error('      ' + why + ': point ' + x.toFixed(1) + ',' + y.toFixed(1)
              + ' is on the sheet but no translation paints it')
          }
        }
      }
    }
  }
  if (missing === 0 && doubled === 0) {
    ok('the shift planner paints every point of ' + cases + ' bbox case(s) exactly once')
  } else {
    fail(missing + ' point(s) never painted, ' + doubled + ' painted twice by contourSeamShifts')
  }
  if (wasteful === 0) ok('no contour is stroked at a translation that rasters nothing')
  else fail(wasteful + ' translation(s) put no ink on the sheet')
}

console.log('')
if (bad) {
  console.error(bad + ' seam check(s) failed')
  process.exit(1)
}
console.log('all seam checks passed')
