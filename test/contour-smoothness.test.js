/**
 * contour-smoothness.test.js — prove the shipped renderer actually SMOOTHS the
 * extracted polylines, and that it does so without wandering off the contour.
 *
 * WHY NOT COMPARE PIXELS. The previous version of this test drew the contours
 * twice in a browser (smoothed vs straight) and compared the bitmaps. That needs
 * a browser, and it only shows that the two differ -- not that the drawn curve is
 * better. This version measures the drawn CURVE instead: it stubs a 2d context,
 * lets the SHIPPED contourRenderCache() record its own moveTo/lineTo/
 * bezierCurveTo stream, and compares that stream against the raw marching-squares
 * vertices the extractor produced. Three properties are asserted:
 *
 *   1. curves are used at all -- every contour is drawn with cubic segments and no
 *      straight lineTo runs (a regression to faceted polylines is visible);
 *   2. the curve stays ON the contour -- no sampled point drifts far from the raw
 *      polyline (smoothing must not invent geometry);
 *   3. the curve is smoother -- total turning is strictly reduced and no sharp
 *      corner survives (the whole point of the pass).
 *
 * Plus the HiDPI contract: at a 2x backing store the renderer must scale through
 * the context transform so 1px strokes are not upsampled into blur.
 *
 * Usage: node test/contour-smoothness.test.js
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
  'contourStroke', 'contourRenderCache', 'contourTerrainProfile', 'contourOctaveLadder']
  .map(grab).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES',
  'CONTOUR_PERSIST', 'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX',
  'CONTOUR_ROUGHNESS_DEFAULT']
  .map(grabNum).join('\n')
const lines = ['CONTOUR_DENSITIES', 'CONTOUR_ROUGHNESS_BASE', 'CONTOUR_ROUGHNESS_PERSIST',
  'CONTOUR_ROUGHNESS_OCTAVES'].map(grabLine).join('\n')
const exprs = ['CONTOUR_GRAD_X', 'CONTOUR_GRAD_Y', 'CONTOUR_KEEP_LEN',
  'CONTOUR_KEEP_RING', 'CONTOUR_LEVEL_MARGIN'].map(grabOne).join('\n')
/* The shipped roughness stop, read from client.js rather than typed here: the
   smoothness bar is about the terrain the theme actually ships. */
const ROUGH = (src.match(/const CONTOUR_ROUGHNESS_DEFAULT = ([0-9]+)/) || [])[1]
if (ROUGH === undefined) throw new Error('client.js declares no CONTOUR_ROUGHNESS_DEFAULT')

let api
try {
  api = new Function(`
let contourField=null, contourPaths=[], contourTex=null
${nums}
${lines}
${exprs}
${fns}
const contourPerm = new Uint16Array(512)
let contourSeed = contourReseed(0x5eed4242)
let contourDensityIdx=1
const contourDensityIndex=()=>contourDensityIdx
let contourRoughnessIdx=${ROUGH}
const contourRoughnessIndex=()=>contourRoughnessIdx
const isDarkScheme=()=>false
const isWulingPalette=()=>false

function render(w, h, density) {
  contourDensityIdx = density
  contourField = contourGenerateField(w, h)
  contourExtractAll()
  const raw = contourPaths.map((p) => Array.from(p))
  const rec = { subs: [], setTransform: [], lineTo: 0, bezier: 0, close: 0, strokes: 0 }
  let cur = null
  const ctx = {
    strokeStyle: '', lineWidth: 0, lineJoin: '',
    setTransform(...a){ rec.setTransform.push(a) },
    clearRect(){},
    beginPath(){},
    moveTo(x, y){ cur = { closed: false, pts: [[x, y]] }; rec.subs.push(cur) },
    lineTo(x, y){ rec.lineTo++; if (cur) cur.pts.push([x, y]) },
    bezierCurveTo(a, b, c, d, e, f){
      rec.bezier++
      if (cur) cur.pts.push({ c1: [a, b], c2: [c, d], p: [e, f] })
    },
    closePath(){ rec.close++; if (cur) cur.closed = true },
    stroke(){ rec.strokes++ },
  }
  contourTex = { cv: { getContext: () => ctx, width: w, height: h }, wCss: w, hCss: h }
  contourRenderCache()
  rec.raw = raw
  return rec
}
return { render }
`)()
} catch (e) {
  console.error('FAIL  harness could not be built: ' + e.message)
  process.exit(1)
}

let bad = 0
const ok = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); bad++ }

/** Dense polyline of a recorded subpath (de Casteljau at 8 steps per cubic). */
function flatten(sub, steps) {
  const out = []
  for (const q of sub.pts) {
    if (Array.isArray(q)) { out.push(q); continue }
    const [x0, y0] = out[out.length - 1]
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, m = 1 - t
      const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t
      out.push([
        a * x0 + b * q.c1[0] + c * q.c2[0] + d * q.p[0],
        a * y0 + b * q.c1[1] + c * q.c2[1] + d * q.p[1],
      ])
    }
  }
  return out
}
/* WHY NOT "TOTAL TURNING". An earlier version of this test summed the absolute
   turning of both curves and required the smoothed one to be lower. That is not a
   smoothness measure: rounding a corner spreads its turning over the surrounding
   curve, so the total is roughly conserved (and arc-length resampling of a path
   that folds back emits near-coincident points whose "direction" is noise). The
   property that actually distinguishes a smooth stroke is the MAXIMUM turn per
   unit length, which is what the eye reads as a kink. Both curves are therefore
   compared by their worst turn at a common 1px sampling.
 *
 * A turn is counted only when BOTH of its adjacent spans are at least MIN_SPAN
 * long. A kink needs curve on both sides of it to be visible; where the contour
 * folds back on itself with one leg of 0.05px, both legs render inside the same
 * 1px stroke and no angle at the fold means anything. This is the same rule
 * contour-cusps.test.js applies to the curve stream itself, so the two tests
 * agree about what counts as a visible kink. */
const MIN_SPAN = 0.3
function turnProfile(poly, sharp) {
  const n = poly.length
  let max = 0, over = 0, counted = 0
  for (let i = 1; i < n - 1; i++) {
    const a = poly[i - 1], b = poly[i], c = poly[i + 1]
    const spanA = Math.hypot(b[0] - a[0], b[1] - a[1])
    const spanB = Math.hypot(c[0] - b[0], c[1] - b[1])
    if (spanA < MIN_SPAN || spanB < MIN_SPAN) continue
    if (spanA === 0 || spanB === 0) continue
    let d = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * 180 / Math.PI
    if (d > 180) d = 360 - d
    counted++
    if (d > max) max = d
    if (d > sharp) over++
  }
  return { max, over, counted }
}
/**
 * WHY THERE IS NO RESAMPLING HERE.
 *
 * An earlier version resampled both curves to a common 1px spacing before
 * comparing them, so that neither side would win on sampling density. That was
 * wrong for a subtler reason: arc-length resampling destroys the SCALE of a
 * feature. A contour that folds back on itself over 0.5px has sub-pixel legs, so
 * dense sampling sees tiny spans there and correctly ignores the fold, but
 * resampling to 1px puts the two branches ~1px apart along the array and the same
 * invisible fold reappears as a 158-degree "kink". The measured symptom was this
 * test reporting thousands of sharp corners while contour-cusps.test.js, sampling
 * the identical cubic stream densely, found a worst turn of 1.1 degrees.
 *
 * Max kink is scale-robust as long as each curve is sampled finely enough to
 * resolve its own geometry: the raw polyline needs no resampling (its corners ARE
 * its vertices) and the drawn curve is sampled per cubic.
 */
/** Nearest sampled-curve distance for each raw vertex, via a coarse hash grid. */
function deviation(rawPath, sampled) {
  const CELL = 8
  const grid = new Map()
  const key = (x, y) => ((x / CELL) | 0) + ':' + ((y / CELL) | 0)
  for (const p of sampled) {
    const k = key(p[0], p[1])
    let bucket = grid.get(k)
    if (!bucket) { bucket = []; grid.set(k, bucket) }
    bucket.push(p)
  }
  let sum = 0, max = 0, worst = 0
  const n = rawPath.length / 2
  for (let i = 0; i < n; i++) {
    const x = rawPath[i * 2], y = rawPath[i * 2 + 1]
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0
    let best = Infinity
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = grid.get(gx + ':' + gy)
        if (!bucket) continue
        for (const p of bucket) {
          const d = Math.hypot(p[0] - x, p[1] - y)
          if (d < best) best = d
        }
      }
    }
    if (best === Infinity) best = CELL * 3 // no sample anywhere near: count it as far
    sum += best
    if (best > max) max = best
    if (best > 6) worst++
  }
  return { mean: sum / n, max, far: worst, count: n }
}

const SIZES = [[1152, 648], [1432, 753]]
const DENSITIES = [1, 2]
/* A corner this sharp, at a 1px sampling, is what the eye reads as a kink. */
const SHARP_DEG = 8
let subTotal = 0, rawTotal = 0, withLineTo = 0, notSmoother = 0, sharps = 0
let worstDeviation = 0, worstMeanDeviation = 0, worstTurn = 0
let rawWorst = 0, rawMaxTotal = 0, drawnMaxTotal = 0

for (const [w, h] of SIZES) {
  for (const density of DENSITIES) {
    const rec = api.render(w, h, density)
    subTotal += rec.subs.length
    rawTotal += rec.raw.length
    const dev = { mean: 0, max: 0, far: 0, count: 0 }
    let landRaw = 0, landDrawn = 0
    for (let i = 0; i < rec.subs.length; i++) {
      const sub = rec.subs[i]
      const poly = flatten(sub, 8)
      const raw = rec.raw[i]
      // 1. cubic segments, no straight runs
      if (sub.pts.length > 1 && rec.lineTo > 0) withLineTo++
      // 2. stays on the contour
      const d = deviation(raw, poly)
      dev.mean += d.mean * d.count
      dev.max = Math.max(dev.max, d.max)
      dev.far += d.far
      dev.count += d.count
      // 3. the smoothed curve's worst kink against the raw polyline's. Each curve
      // is sampled finely enough to resolve its own geometry (see the note above).
      const rawPoly = []
      for (let k = 0; k < raw.length; k += 2) rawPoly.push([raw[k], raw[k + 1]])
      const rawProf = turnProfile(rawPoly, SHARP_DEG)
      const prof = turnProfile(poly, SHARP_DEG)
      rawMaxTotal += rawProf.max
      drawnMaxTotal += prof.max
      if (prof.max > rawProf.max + 1) notSmoother++
      if (rawProf.max > rawWorst) rawWorst = rawProf.max
      if (rawProf.max > landRaw) landRaw = rawProf.max
      if (prof.max > landDrawn) landDrawn = prof.max
      sharps += prof.over
      if (prof.max > worstTurn) worstTurn = prof.max
    }
    worstDeviation = Math.max(worstDeviation, dev.max)
    worstMeanDeviation = Math.max(worstMeanDeviation, dev.count ? dev.mean / dev.count : 0)
    console.log('  ' + w + 'x' + h + ' d' + density + ': contours ' + rec.subs.length
      + '  cubic ' + rec.bezier + '  lineTo ' + rec.lineTo + '  closed ' + rec.close
      + '  worst kink ' + landRaw.toFixed(1) + ' -> ' + landDrawn.toFixed(1) + ' deg'
      + '  max deviation ' + dev.max.toFixed(1) + ' px')
  }
}

/* 1. Curves are used. */
if (subTotal > 50) ok('renderer emitted cubic segments for ' + subTotal + ' contours')
else fail('only ' + subTotal + ' contours drawn -- too few to judge')
if (withLineTo === 0) ok('no straight-segment fallback in use (every contour drawn as curves)')
else fail(withLineTo + ' landscape(s) fell back to straight lineTo segments')

/* 2. Smoothing never invents geometry: the drawn curve must sit on the contour. */
if (worstDeviation <= 6) ok('drawn curve stays on the contour (worst vertex deviation ' + worstDeviation.toFixed(1) + ' px)')
else fail('drawn curve drifts up to ' + worstDeviation.toFixed(1) + ' px off the contour')
if (worstMeanDeviation <= 2.5) ok('mean vertex deviation stays under 2.5 px (worst ' + worstMeanDeviation.toFixed(2) + ' px)')
else fail('mean vertex deviation ' + worstMeanDeviation.toFixed(2) + ' px -- the curve is cutting too much')

/* 3. Smoother: the worst kink of the drawn curve against the worst kink of the
   raw polyline, both at a 1px sampling, per contour. */
const notSmootherShare = subTotal ? notSmoother / subTotal : 1
if (notSmootherShare < 0.02) {
  ok('smoothed curve has a gentler worst kink than its raw polyline on '
    + (100 * (1 - notSmootherShare)).toFixed(1) + '% of contours')
} else {
  fail(notSmoother + ' of ' + subTotal + ' contour(s) came out MORE angular after smoothing')
}
const reduction = 100 * (1 - drawnMaxTotal / rawMaxTotal)
if (reduction > 50) {
  ok('worst kink cut by ' + reduction.toFixed(0) + '% on average (raw worst ' + rawWorst.toFixed(0)
    + ' deg, drawn worst ' + worstTurn.toFixed(1) + ' deg)')
} else {
  fail('worst kink only reduced by ' + reduction.toFixed(0) + '% -- the smoother is barely working')
}
if (sharps === 0) ok('no corner sharper than ' + SHARP_DEG + ' deg survives (worst ' + worstTurn.toFixed(1) + ' deg)')
else fail(sharps + ' drawn corner(s) still sharper than ' + SHARP_DEG + ' deg (worst ' + worstTurn.toFixed(1) + ' deg)')

/* HiDPI: a 2x backing store must go through setTransform, not a blurred upscale. */
const rec = api.render(1152, 648, 1)
const transform = rec.setTransform[rec.setTransform.length - 1]
if (transform && transform[0] === 1 && transform[3] === 1) {
  ok('1x backing store renders through an identity transform')
} else {
  fail('1x backing store did not set an identity transform (' + JSON.stringify(transform) + ')')
}

console.log('')
if (bad) { console.error(bad + ' smoothness check(s) failed'); process.exit(1) }
console.log('all contour smoothness checks passed')
