/**
 * contour-perf.test.js — measure the SHIPPED contour engine's cost, and prove the
 * cost SHAPE the architecture promises.
 *
 * WHAT CHANGED AND WHY. The previous engine deformed the landscape every frame:
 * it re-evaluated a gaussian field and re-ran marching squares 24 times a second,
 * and this test measured that per-frame cost against 24/60/120fps budgets. The
 * tileable-terrain engine does the expensive work ONCE (terrain -> iso-contours ->
 * smoothed texture) and a frame only shifts a cached bitmap, so timing the old
 * per-frame path would measure nothing. Two things are therefore asserted:
 *
 *   A. COST SHAPE (deterministic, not timing-based). Driving any number of frames
 *      must perform ZERO terrain generations, ZERO extractions and ZERO texture
 *      renders; a density change must reuse the terrain (0 generations); and the
 *      frame function's own source must not reference the expensive trio at all.
 *      This is the requirement itself, and it cannot be flaky.
 *   B. COST SIZE (measured). The one-time build (terrain + extraction + smoothed
 *      texture) at three viewport sizes, and the per-frame blit's operation count
 *      and JS time. Thresholds are deliberately generous -- this test exists to
 *      catch a regression of an order of magnitude, not to police milliseconds on
 *      an unknown machine -- and every number is printed so a change is visible.
 *
 * No browser is needed: the engine's drawing goes through a counted 2d-context
 * stub, and the functions are taken verbatim from client.js (located by name, not
 * retyped), so what is measured is the code that actually ships.
 *
 * Usage: node test/contour-perf.test.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
/* Line endings are normalised before anything is sliced out. The harness cuts
   declarations out by line (blank-line separators, /^.../m anchors), so a CRLF
   checkout — which is what git hands you by default on Windows, and what
   `git archive` produced before .gitattributes was added — made the slicing
   silently miss declarations and failed this test for a reason that had
   nothing to do with the engine. */
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8').replace(/\r\n/g, '\n')

/* The preference KEY constants in client.js are derived from the namespace (one source
   of truth, so a rename cannot leave a literal behind), which means the harness has to
   define PREFS_NS before them or grabbing CONTOUR_ANIM_KEY throws "PREFS_NS is not
   defined". The value is extracted rather than retyped, for the same reason every other
   declaration here is: the test must break when the source moves, not drift from it. */
const PREFS_NS = (() => {
  const m = src.match(/const PREFS_NS = '([^']+)'/)
  if (m === null) throw new Error('PREFS_NS declaration not found in client.js')
  return m[1]
})()

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
function grabOne(name) {
  const m = src.match(new RegExp('const ' + name + ' = .*'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return m[0]
}
function grabLine(name) {
  const m = src.match(new RegExp('const ' + name + ' = (\\[[^\\]]*\\])'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}
/** Multi-line array literal, e.g. the 8 direction vectors. */
function grabArray(name) {
  const at = src.indexOf('const ' + name + ' = [')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  let d = 0
  for (let j = at + ('const ' + name + ' = ').length; j < src.length; j++) {
    if (src[j] === '[') d++
    else if (src[j] === ']') {
      d--
      if (d === 0) return src.slice(at, j + 1)
    }
  }
  throw new Error('unterminated array: ' + name)
}

/* Names must track client.js: a missing one throws here rather than failing
   mysteriously at runtime. */
const FN = ['contourRng', 'contourRollSeed', 'contourReseed', 'contourNoise',
  'contourGenerateField', 'contourLevels', 'contourExtractLevel', 'contourExtractAll',
  'contourStroke', 'contourRenderCache', 'contourTargetTexture',
  'contourBuildTexture', 'contourSheetFits', 'contourStepOffset', 'contourBlit',
  'contourPaintSurface', 'contourRetune', 'contourFrame',
  'contourTerrainProfile', 'contourTerrainRow', 'contourOctaveLadder',
  'contourRebuildForRoughness', 'contourReadIndex', 'contourStair', 'contourTerrace',
  'contourCliff', 'contourTerraceField', 'contourApplyLandforms', 'contourShapeWarp',
  'contourReliefWarp', 'contourRidgeAt', 'contourValleyAt', 'contourFeaturePeriod',
  'contourHash3', 'contourPrimitiveDelta', 'contourApplyPrimitives']
const ONE = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES',
  'CONTOUR_PERSIST', 'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN',
  'CONTOUR_MIN_RING_BOX', 'CONTOUR_LEVEL_MARGIN', 'CONTOUR_GRAD_X',
  'CONTOUR_GRAD_Y', 'CONTOUR_KEEP_LEN', 'CONTOUR_KEEP_RING',
  'CONTOUR_TEX_MULT', 'CONTOUR_TEX_MAX_AREA', 'CONTOUR_TEX_MAX_DIM',
  'CONTOUR_TEX_QUANT', 'CONTOUR_MEM_BUDGET', 'CONTOUR_SCROLL_MIN_MULT', 'CONTOUR_SURFACE_MAX_PX',
  'CONTOUR_SURFACE_PAD', 'CONTOUR_3D_TEX_MULT', 'CONTOUR_3D_TEX_AREA',
  'CONTOUR_SHEET_MAX_DEVICE_PX',
  'CONTOUR_SCROLL_AREA', 'CONTOUR_SCROLL_DIM', 'CONTOUR_3D_REF', 'CONTOUR_3D_DEPTH',
  'CONTOUR_3D_RISE', 'CONTOUR_SOFT_GL', 'CONTOUR_VIEW_KEY',
  'CONTOUR_RESIZE_DEBOUNCE', 'CONTOUR_ANIM_KEY',
  'CONTOUR_ROUGHNESS_DEFAULT', 'CONTOUR_ROUGHNESS_KEY',
  'CONTOUR_TERRACE_STEPS_BASE', 'CONTOUR_TERRACE_STEPS_SPAN', 'CONTOUR_TERRACE_SOFT',
  'CONTOUR_NOISE_NORM', 'CONTOUR_FEATURE_MIN', 'CONTOUR_PLATEAU_BAND',
  'CONTOUR_CLIFF_BAND', 'CONTOUR_CLIFF_STEPS_BASE', 'CONTOUR_CLIFF_STEPS_SPAN',
  'CONTOUR_CLIFF_SOFT_BASE', 'CONTOUR_CLIFF_SOFT_FALL',
  'CONTOUR_GRAIN_OCTAVES', 'CONTOUR_RIDGED_GAIN', 'CONTOUR_WARP_SHARE', 'CONTOUR_WARP_SCALE',
  'CONTOUR_LANDFORM_RIDGE', 'CONTOUR_LANDFORM_VALLEY', 'CONTOUR_BAND_GRAIN_X', 'CONTOUR_BAND_GRAIN_Y',
  'CONTOUR_CONTRAST_SCALE',
  'CONTOUR_FEATURE_GRID', 'CONTOUR_FEAT_NONE', 'CONTOUR_FEAT_PLATEAU',
  'CONTOUR_FEAT_CLIFF', 'CONTOUR_FEAT_FAN', 'CONTOUR_FEAT_CONE', 'CONTOUR_FEAT_CRATER',
  'CONTOUR_FEAT_DUNE', 'CONTOUR_FEAT_PIT', 'CONTOUR_FEAT_ARETE', 'CONTOUR_FEAT_TROUGH',
  'CONTOUR_FEAT_KARST', 'CONTOUR_FEAT_TALUS', 'CONTOUR_FEAT_WATER',
  'contourSmooth', 'contourHash01']
const LINE = ['CONTOUR_DENSITIES', 'CONTOUR_SPEEDS', 'CONTOUR_ROUGHNESS_BASE',
  'CONTOUR_ROUGHNESS_PERSIST', 'CONTOUR_ROUGHNESS_OCTAVES', 'CONTOUR_TERRAIN_CLASS',
  'CONTOUR_TERRAIN_MACRO', 'CONTOUR_TERRAIN_SHAPE', 'CONTOUR_TERRAIN_RIDGE',
  'CONTOUR_TERRAIN_VALLEY', 'CONTOUR_TERRAIN_PLATEAU', 'CONTOUR_TERRAIN_CLIFF',
  'CONTOUR_TERRAIN_CLIFFBAND', 'CONTOUR_TERRAIN_RELIEF', 'CONTOUR_TERRAIN_WATER',
  'CONTOUR_TERRAIN_BLOBS', 'CONTOUR_TERRAIN_BLOBSCALE', 'CONTOUR_PALETTE_0',
  'CONTOUR_PALETTE_1', 'CONTOUR_PALETTE_2', 'CONTOUR_PALETTE_3', 'CONTOUR_PALETTE_4',
  'CONTOUR_TERRAIN_RIDGED', 'CONTOUR_TERRAIN_GRAIN', 'CONTOUR_TERRAIN_CONTRAST',
  'CONTOUR_FEATURE_PALETTES']

let body
let gateDecls
try {
  body = FN.map(grab).join('\n')
  // Count the expensive trio by renaming the real definitions and wrapping them:
  // every internal call site resolves to the wrapper through lexical scope.
  body = body.replace('const contourGenerateField = ', 'const __generateFieldImpl = ')
    .replace('const contourExtractAll = ', 'const __extractAllImpl = ')
    .replace('const contourRenderCache = ', 'const __renderCacheImpl = ')
  /* The scroll gate. prefersReducedMotion(), isContourAnimOn() and
     contourWantsScroll() are all SINGLE-EXPRESSION arrows with no brace block, so
     grab() must not be used on them (it would run on to the next `{` and swallow
     an unrelated declaration). The text between the known markers is taken
     VERBATIM instead, which stays correct whatever shape the expressions take. */
  const gateAt = src.indexOf('const prefersReducedMotion = ')
  const wantAt = src.indexOf('const contourWantsScroll = ')
  const wantEnd = src.indexOf('\n\n', wantAt)
  if (gateAt < 0 || wantAt < 0 || wantEnd < 0 || wantAt < gateAt) throw new Error('scroll gate declarations not found')
  const animOn = src.match(/const isContourAnimOn = [^\n]*/)
  if (animOn === null) throw new Error('isContourAnimOn declaration not found')
  gateDecls = src.slice(gateAt, wantEnd) + '\n' + animOn[0]
} catch (e) {
  console.error('FAIL  could not extract the engine from client.js: ' + e.message)
  process.exit(1)
}

let api
try {
  api = new Function(`
let contourField=null, contourPaths=[], contourTex=null, contourLineCv=null
let contourSurfaceOn=false
let contourOffsetX=0, contourOffsetY=0, contourDpr=1, contourSpeedPx=48
let contourVelX=0, contourVelY=-1, contourView=null, contourWrap=null
let contourRaf=null, contourLastT=-1, contourResizeTimer=null
let contourLoaderActive=false, contourScrollPaused=false, contourResizing=false, contourSwitchSig=''
/* The preference KEY constants are derived from the namespace (single source of truth:
   a rename must not leave 14 literals behind), so the harness must define it before
   them — otherwise grabbing e.g. CONTOUR_ANIM_KEY throws "PREFS_NS is not defined". */
const PREFS_NS = ${JSON.stringify(PREFS_NS)}
${ONE.map(grabOne).join('\n')}
${LINE.map(grabLine).join('\n')}
${grabArray('CONTOUR_DIRS')}
/* Pref transport stub: prefsGet(k) reads an object so the switch state can be
   flipped from the assertions below. The empty default matches the real default
   polarity (the anim switch is on-by-default: prefsGet(...) !== '0'). */
const prefs = {}
const prefsGet = (k) => (k in prefs ? prefs[k] : '')
/* The roughness rebuild coalesces through a timer in the browser. There is no
   timer service here ON PURPOSE (shadowing Node's global setTimeout), so the
   engine takes its no-timer path and rebuilds synchronously — which is what lets
   the assertions below count what one slider detent actually costs. */
const setTimeout = undefined
/* window stub whose reduced-motion answer can be flipped, so the gate's LIVE read
   (not a value cached at load) is what gets asserted. */
let reducedMotionMatches = false
const window = { matchMedia: () => ({ matches: reducedMotionMatches }) }
/* The 3D view is stubbed out here, deliberately: contourBlit/contourPaintSurface
   dispatch on it, and this harness must keep proving that the FLAT path costs
   nothing and needs no GPU. 'no gl layer' is the state of every device that fails
   the hardware check, so this is the shipped fallback, not an awkward fake. */
let contourGl = null
const contourGlDraw = () => false
const contourGlDispose = () => {}
/* Read straight from the pref store, exactly as the real one does. */
const isContourView3D = () => prefsGet(CONTOUR_VIEW_KEY) === '1'
/* Hollow terrain is shipped off, so the harness says no without pulling in the rest
   of the feature. */
const contourHollowWanted = () => false
${body}
${gateDecls}
const contourPerm = new Uint16Array(512)
let contourSeed = contourReseed(0x5eed4242)
let contourDensityIdx=1
const contourDensityIndex=()=>contourDensityIdx
/* Roughness reads the real preference store (unlike the density stub above):
   the assertions below drive the slider through prefsGet() and expect the
   terrain to follow, which is exactly the wiring worth testing here. */
const contourRoughnessIndex=()=>contourReadIndex(CONTOUR_ROUGHNESS_KEY, CONTOUR_ROUGHNESS_BASE.length - 1, CONTOUR_ROUGHNESS_DEFAULT)

const counts = { generate: 0, extract: 0, render: 0 }
const OP_KEYS = ['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo',
  'bezier', 'closePath', 'stroke', 'drawImage']
const op = {}
for (const k of OP_KEYS) op[k] = 0
function makeCtx() {
  return {
    strokeStyle: '', lineWidth: 0, lineJoin: '',
    setTransform(){ op.setTransform++ }, clearRect(){ op.clearRect++ },
    beginPath(){ op.beginPath++ }, moveTo(){ op.moveTo++ }, lineTo(){ op.lineTo++ },
    bezierCurveTo(){ op.bezier++ }, closePath(){ op.closePath++ }, stroke(){ op.stroke++ },
    drawImage(){ op.drawImage++ },
  }
}
const canvas = { width: 0, height: 0, style: {}, getContext() { this._ctx = this._ctx || makeCtx(); return this._ctx } }
/* The engine allocates its texture canvas through document.createElement; this
   lexical binding is what contourBuildTexture resolves to in Node. */
const document = { createElement: () => Object.assign({}, canvas, { _ctx: null }) }
const contourGenerateField = (...a) => { counts.generate++; return __generateFieldImpl(...a) }
const contourExtractAll = () => { counts.extract++; return __extractAllImpl() }
const contourRenderCache = () => { counts.render++; return __renderCacheImpl() }
const isDarkScheme = () => false
const isWulingPalette = () => false

function reset() { counts.generate = 0; counts.extract = 0; counts.render = 0 }
function blankOps() { for (const k of OP_KEYS) op[k] = 0 }
function snapshot() {
  return {
    counts: Object.assign({}, counts),
    texture: contourTex
      ? {
        wCss: contourTex.wCss, hCss: contourTex.hCss,
        wDev: contourTex.cv.width, hDev: contourTex.cv.height,
        scroll: contourTex.scroll === true,
      }
      : null,
    grid: contourField ? { cols: contourField.cols, rows: contourField.rows } : null,
    paths: contourPaths.length,
    ops: Object.assign({}, op),
  }
}
return {
  build(w, h, dpr) {
    contourDpr = dpr
    /* Mark the layer as mounted at this size: the engine only rebuilds the
       terrain while it is on screen, and contourRebuildForRoughness() reads the
       viewport back from here. */
    contourView = { w, h, dpr }
    contourWrap = contourWrap || {}
    contourLineCv = Object.assign({}, canvas, { _ctx: null })
    contourLineCv.width = Math.round(w * dpr)
    contourLineCv.height = Math.round(h * dpr)
    contourBuildTexture(w, h)
  },
  blit() { return contourBlit() },
  /* Compositor path controls: give the mounted canvas a writable transform the
     way a real <canvas> has one, then paint the surface by hand. */
  setTransformable(v) { contourLineCv.style = v ? { transform: '' } : {} },
  paintSurface() { return contourPaintSurface() },
  surfaceOn() { return contourSurfaceOn },
  memBudget() { return CONTOUR_MEM_BUDGET },
  surfaceMaxPx() { return CONTOUR_SURFACE_MAX_PX },
  surfacePad() { return CONTOUR_SURFACE_PAD },
  planSize(w, h, dpr, three) {
    const t = contourTargetTexture(w, h, dpr, three === true)
    return { tw: t.twDev, th: t.thDev, scroll: t.scroll }
  },
  build3D(w, h, dpr) {
    /* The engine picks the sheet class from the live view, so the harness only has
       to say which view it is in before building. */
    contourDpr = dpr
    contourView = { w, h, dpr }
    contourWrap = contourWrap || {}
    contourLineCv = Object.assign({}, canvas, { _ctx: null })
    contourLineCv.width = Math.round(w * dpr)
    contourLineCv.height = Math.round(h * dpr)
    const had = prefs[CONTOUR_VIEW_KEY]
    prefs[CONTOUR_VIEW_KEY] = '1'
    contourBuildTexture(w, h)
    if (had === undefined) delete prefs[CONTOUR_VIEW_KEY]
    else prefs[CONTOUR_VIEW_KEY] = had
  },
  sheetFits(w, h, dpr) { return contourSheetFits(w, h, dpr) },
  stepOffset(off, v, dt, period) { return contourStepOffset(off, v, dt, period) },
  setOffset(x, y) { contourOffsetX = x; contourOffsetY = y },
  offset() { return [contourOffsetX, contourOffsetY] },
  ref() { return [contourSurfaceRefX, contourSurfaceRefY] },
  scrollDim() { return CONTOUR_SCROLL_DIM },
  scrollArea() { return CONTOUR_SCROLL_AREA },
  transform() { return contourLineCv && contourLineCv.style ? contourLineCv.style.transform : null },
  surfaceSize() {
    return contourLineCv === null ? null : {
      w: contourLineCv.width, h: contourLineCv.height,
      tw: contourTex ? contourTex.cv.width : 0, th: contourTex ? contourTex.cv.height : 0,
    }
  },
  retune() { return contourRetune() },
  rebuildForRoughness() { return contourRebuildForRoughness() },
  roughKey: CONTOUR_ROUGHNESS_KEY,
  seed: () => contourSeed,
  fieldRange: () => (contourField === null ? 'none' : contourField.mn.toFixed(6) + '..' + contourField.mx.toFixed(6)),
  reset, blankOps, snapshot,
  frameSource: () => String(contourFrame),
  /* Scroll gate controls, for the reduced-motion / switch-off assertions. */
  wantsScroll: () => contourWantsScroll(),
  setReducedMotion(v) { reducedMotionMatches = v },
  setPref(k, v) { prefs[k] = v },
  animKey: CONTOUR_ANIM_KEY,
  setLoaderActive(v) { contourLoaderActive = v },
  setScrollPaused(v) { contourScrollPaused = v },
}
`)()
} catch (e) {
  console.error('FAIL  harness could not be built: ' + e.message)
  process.exit(1)
}

let bad = 0
const ok = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); bad++ }
const stats = (arr) => {
  const a = arr.slice().sort((x, y) => x - y)
  return { p50: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] }
}

/* ---------- A. cost shape: frames never redo the expensive work ---------- */
/* Small, typical, large, extreme-aspect and HiDPI viewports, so the texture-target
   maths (3x viewport, quantised, capped by area and by device pixels per side) is
   exercised where it clamps rather than only where it does not. */
const SIZES = [[320, 240, 1], [1152, 648, 1], [1432, 753, 1], [1920, 1080, 1], [2000, 200, 1], [1920, 1080, 2]]
const buildReport = []
for (const [w, h, dpr] of SIZES) {
  const label = w + 'x' + h + (dpr === 1 ? '' : '@' + dpr + 'x')
  api.reset()
  api.blankOps()
  const runs = []
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    api.build(w, h, dpr)
    runs.push(performance.now() - t0)
  }
  const s = api.snapshot()
  const report = { size: label, texture: s.texture, grid: s.grid, paths: s.paths, ms: stats(runs).p50 }
  buildReport.push(report)
  if (s.texture === null || s.texture.wDev === 0) { fail(label + ': no texture allocated'); continue }
  // The build path is the only place terrain work may happen: exactly one
  // generation and one extraction per build (3 builds above).
  if (s.counts.generate !== 3) fail(label + ': ' + s.counts.generate + ' terrain generations for 3 builds (expected 3)')
  if (s.counts.extract !== 3) fail(label + ': ' + s.counts.extract + ' extractions for 3 builds (expected 3)')
  if (s.counts.render !== 3) fail(label + ': ' + s.counts.render + ' texture renders for 3 builds (expected 3)')
  if (s.paths === 0) fail(label + ': the cache holds no contours')
  // Texture caps. Which pair applies depends on the play path: the scroll path
  // paints once and only moves a surface afterwards, so it may spend a longer
  // period; the blit fallback re-rasters the whole texture every frame and keeps
  // the tighter pair. Asserting the wrong pair here would either pass a runaway
  // texture or fail a legitimate one.
  const dimCap = s.texture.scroll ? api.scrollDim() : 4096
  const areaCap = s.texture.scroll ? api.scrollArea() : 8.3e6
  if (s.texture.wDev > dimCap || s.texture.hDev > dimCap) {
    fail(label + ': texture is ' + s.texture.wDev + 'x' + s.texture.hDev + ' device px, over the '
      + dimCap + ' cap for the ' + (s.texture.scroll ? 'scroll' : 'blit') + ' path')
  }
  const area = s.texture.wCss * s.texture.hCss
  if (!(area <= areaCap * 1.05)) {
    fail(label + ': texture area ' + Math.round(area) + ' css px^2 is over the '
      + (areaCap / 1e6).toFixed(1) + 'e6 budget for the ' + (s.texture.scroll ? 'scroll' : 'blit') + ' path')
  }
  // Frames: many blits, zero expensive work.
  api.reset()
  api.blankOps()
  const frameMs = []
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now()
    api.blit()
    frameMs.push(performance.now() - t0)
  }
  const after = api.snapshot()
  if (after.counts.generate || after.counts.extract || after.counts.render) {
    fail(label + ': a frame redid expensive work (gen=' + after.counts.generate
      + ' extract=' + after.counts.extract + ' render=' + after.counts.render + ')')
  }
  if (after.ops.clearRect !== 300) {
    fail(label + ': expected 1 clearRect per blit, saw ' + after.ops.clearRect + ' for 300 blits')
  }
  if (!after.ops.drawImage || after.ops.drawImage > 300 * 4) {
    fail(label + ': ' + after.ops.drawImage + ' drawImage calls for 300 blits (at most 4 per blit)')
  }
  report.blitPerBlit = after.ops.drawImage / 300
  report.blitMs = stats(frameMs)
}
if (!bad) ok('300 frames on each of ' + SIZES.length + ' viewports: 0 terrain generations, 0 extractions, 0 texture renders')

/* ---------- A2. compositor path: a frame writes a transform, nothing else --- */
/* The mounted canvas in a real page has a writable style, so the shipped path is
   the surface + transform one; the block above deliberately runs the fallback.
   Both must stay cheap AND correct, and the surface must respect its budget. */
for (const [w, h, dpr] of [[1432, 753, 2], [1920, 1080, 2], [1152, 648, 1]]) {
  const label = w + 'x' + h + '@' + dpr + 'x'
  api.reset()
  api.build(w, h, dpr)
  api.setTransformable(true)
  api.blankOps()
  api.paintSurface()
  if (!api.surfaceOn()) {
    /* A refused surface is only correct when it would have been too big: the huge
       canvas is what stalled the live app (one 100MB+ surface, re-allocated on resize,
       with the renderer observed at 1.68GB). The cheap per-frame blit covers it. */
    const area = Math.round(w * dpr) + api.surfacePad()
    const area2 = Math.round(h * dpr) + api.surfacePad()
    if (area * area2 > api.surfaceMaxPx()) {
      ok(label + ': surface refused on purpose, ' + Math.round(area * area2 / 1e6)
        + 'M device px > the ' + Math.round(api.surfaceMaxPx() / 1e6) + 'M cap -- per-frame blit instead')
    } else {
      fail(label + ': the surface path did not engage on a transformable canvas although it would fit')
    }
    continue
  }
  const painted = api.snapshot()
  if (painted.ops.clearRect !== 1) fail(label + ': painting the surface did ' + painted.ops.clearRect + ' clearRect (expected 1)')
  if (painted.counts.generate !== 1 || painted.counts.extract !== 1) {
    fail(label + ': painting the surface redid terrain work (gen=' + painted.counts.generate
      + ' extract=' + painted.counts.extract + ')')
  }
  const surf = api.surfaceSize()
  const tex = painted.texture
  /* The surface is the VIEWPORT plus a fixed pad -- not viewport+period. It exists to
     be translated; the pad is all the slack the translation needs, because the paint
     is refreshed once half of it is consumed. That is what keeps the backing store at
     ~one viewport (17MB at 1432x753@2x) instead of the 140MB it used to be. */
  const wantW = Math.round(w * dpr) + api.surfacePad()
  const wantH = Math.round(h * dpr) + api.surfacePad()
  if (surf.w !== wantW || surf.h !== wantH) {
    fail(label + ': surface is ' + surf.w + 'x' + surf.h + ', expected viewport+pad ' + wantW + 'x' + wantH)
  }
  // Budget: the layer holds the texture AND its surface, and the plan is only
  // allowed to engage the surface path when the pair fits.
  const surfBytes = surf.w * surf.h * 4
  const texBytes = surf.tw * surf.th * 4
  const totalBytes = surfBytes + texBytes
  if (totalBytes > api.memBudget() * 1.05) {
    fail(label + ': texture + surface is ' + Math.round(totalBytes / 1e6) + ' MB, over the '
      + Math.round(api.memBudget() / 1e6) + ' MB budget')
  }
  // Seamlessness depends on the period being larger than the viewport: at or below
  // 1.0 the same feature would appear twice inside one frame.
  if (!(surf.tw > Math.round(w * dpr) && surf.th > Math.round(h * dpr))) {
    fail(label + ': period ' + surf.tw + 'x' + surf.th + ' does not exceed the ' + Math.round(w * dpr) + 'x' + Math.round(h * dpr) + ' viewport')
  }
  // Frames: zero canvas work, one transform write, always inside the period.
  /* Frames: a transform write while the pad lasts, and a tiled repaint when half of it
     is gone. Neither may touch the terrain, and the repaint rate must stay small --
     the old shape repainted a viewport+period canvas instead, which is what the live
     renderer could not afford. */
  api.reset()
  api.blankOps()
  const frameMs = []
  let outside = 0
  let repaints = 0
  const halfPad = api.surfacePad() * 0.5
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now()
    api.blit()
    frameMs.push(performance.now() - t0)
    const step = api.snapshot()
    if (step.ops.drawImage > 0) repaints++
    const m = /translate3d\((-?[\d.e+-]+)px,(-?[\d.e+-]+)px,0\)/.exec(api.transform() || '')
    if (m === null) { outside++; continue }
    const tx = -parseFloat(m[1]) * dpr
    const ty = -parseFloat(m[2]) * dpr
    /* The transform only ever encodes the drift since the last paint, so it stays
       inside half the pad by construction. */
    if (!(Math.abs(tx) <= halfPad + 1) || !(Math.abs(ty) <= halfPad + 1)) outside++
  }
  const afterFrame = api.snapshot()
  if (afterFrame.counts.generate || afterFrame.counts.extract || afterFrame.counts.render) {
    fail(label + ': a compositor frame redid expensive work')
  }
  if (outside > 0) fail(label + ': ' + outside + ' of 300 frames wrote a transform outside the pad')
  if (repaints > 60) fail(label + ': ' + repaints + ' of 300 frames repainted the surface (expected a handful)')
  const blit = stats(frameMs)
  if (blit.p95 > 0.5) fail(label + ': compositor frame p95 is ' + blit.p95.toFixed(2) + ' ms (expected < 0.5 ms)')
  if (!bad) {
    ok(label + ': surface ' + surf.w + 'x' + surf.h + ' (' + Math.round(totalBytes / 1e6) + ' MB texture+surface, period '
      + (surf.tw / Math.round(w * dpr)).toFixed(2) + 'x viewport), 300 frames = ' + repaints + ' pad repaint(s), p95 '
      + blit.p95.toFixed(3) + ' ms')
  }
  api.setTransformable(false)
}

/* ---------- A3. a grown window is CROPPED, not regenerated ---------------- */
/* The sheet is a whole landscape and the window is a hole in front of it. Growing
   the window inside the sheet must not cost a rebuild (the measured 150-300ms and
   the changed map that a drag used to pay); only growing PAST the sheet may. */
{
  api.reset()
  api.build(1432, 753, 2)
  const sheet = api.surfaceSize()
  const fitsSelf = api.sheetFits(1432, 753, 2)
  const fitsGrown = api.sheetFits(1900, 1000, 2)
  /* The sheet is ~2.9x a viewport per axis, so this must be far past it. */
  const fitsHuge = api.sheetFits(1432 * 4, 753 * 4, 2)
  const fitsDpr = api.sheetFits(1432, 753, 1)
  if (!fitsSelf) fail('the sheet does not fit the viewport it was built for (' + sheet.tw + 'x' + sheet.th + ')')
  else if (!fitsGrown) fail('a window 33% larger than the build size wanted a rebuild -- that is the drag freeze')
  else if (fitsHuge) fail('a window 4x the sheet did not want a rebuild -- the period would be shorter than the viewport')
  else {
    ok('crop, not rebuild: fits at 1432x753 and at 1900x1000 (' + sheet.tw + 'x' + sheet.th + ' sheet), '
      + 'rebuild only past 4x, dpr 1 still fits')
  }
  if (fitsDpr) ok('a DPR change alone does not force a rebuild while the sheet still covers the window')
  else fail('a DPR change that the sheet still covers forced a rebuild')
}

/* ---------- A4. the 3D sheet is short-period and SMALL --------------------- */
/* 3D samples the sheet through a camera and wraps it with fract(), so its period only
   has to hide repetition; it is also where the texture is resident in VRAM. */
{
  const w = 1432, h = 753, dpr = 2
  api.reset()
  api.build(w, h, dpr)
  const flat = api.surfaceSize()
  api.reset()
  api.build3D(w, h, dpr)
  const three = api.surfaceSize()
  const vwDev = Math.round(w * dpr)
  const vhDev = Math.round(h * dpr)
  if (!(three.tw > vwDev && three.th > vhDev)) {
    fail('3D sheet ' + three.tw + 'x' + three.th + ' does not exceed the ' + vwDev + 'x' + vhDev + ' viewport')
  } else if (three.tw > vwDev * 1.55 || three.th > vhDev * 1.55) {
    fail('3D sheet ' + three.tw + 'x' + three.th + ' is longer than 1.5x the viewport')
  } else if (three.tw * three.th > 12e6) {
    fail('3D sheet is ' + Math.round(three.tw * three.th / 1e6) + 'M device px (cap 12M)')
  } else if (!(three.tw * three.th < flat.tw * flat.th)) {
    fail('the 3D sheet is not smaller than the 2D one')
  } else {
    ok('3D sheet ' + Math.round(three.tw / vwDev * 100) / 100 + 'x' + Math.round(three.th / vhDev * 100) / 100
      + ' viewport (' + Math.round(three.tw * three.th * 4 / 1e6) + 'MB) vs 2D '
      + (flat.tw / vwDev).toFixed(2) + 'x (' + Math.round(flat.tw * flat.th * 4 / 1e6) + 'MB)')
  }
}

/* ---------- A5. the pad is repainted only when it is half spent ----------- */
/* The surface is viewport+pad; the transform carries the drift and the paint is
   refreshed when half the pad is gone. Without this the sheet would run out of
   painted pixels and the edge would show as a hard seam. */
{
  const w = 1432, h = 753, dpr = 2
  api.reset()
  api.build(w, h, dpr)
  api.setTransformable(true)
  api.paintSurface()
  const pad = api.surfacePad()
  const size0 = api.surfaceSize()
  /* Small drift: transform only, no raster. */
  api.setOffset(pad * 0.3, pad * 0.2)
  api.blankOps()
  api.blit()
  const small = api.snapshot()
  /* Past half the pad: exactly one repaint, and the transform restarts from zero. */
  api.setOffset(pad * 0.6, 0)
  api.blankOps()
  api.blit()
  const big = api.snapshot()
  const ref = api.ref()
  const off = api.offset()
  const tf = api.transform() || ''
  const m = /translate3d\((-?[\d.e+-]+)px,(-?[\d.e+-]+)px,0\)/.exec(tf)
  const size1 = api.surfaceSize()
  if (small.ops.clearRect !== 0 || small.ops.drawImage !== 0) {
    fail('a drift of 0.3 pad rasterised (clearRect=' + small.ops.clearRect + ' drawImage=' + small.ops.drawImage + ')')
  } else if (big.ops.clearRect !== 1 || big.ops.drawImage < 1) {
    fail('a drift of 0.6 pad did not repaint the surface (clearRect=' + big.ops.clearRect
      + ' drawImage=' + big.ops.drawImage + ')')
  } else if (ref[0] !== Math.floor(off[0]) || ref[1] !== Math.floor(off[1])) {
    fail('the repaint did not record the offset it painted at (' + ref + ' vs ' + off + ')')
  } else if (m === null || Math.abs(parseFloat(m[1])) > 1 || Math.abs(parseFloat(m[2])) > 1) {
    fail('the transform did not restart from zero after the repaint (' + tf + ')')
  } else if (size1.w !== size0.w || size1.h !== size0.h) {
    fail('the pad repaint resized the surface (' + size0.w + 'x' + size0.h + ' -> ' + size1.w + 'x' + size1.h + ')')
  } else {
    ok('pad ' + pad + 'px: 0.3 pad = transform only, 0.6 pad = 1 repaint, transform restarts at 0, size unchanged')
  }
}

/* ---------- A6. the frame rate must not change the speed ------------------- */
/* A 120Hz panel gets 120 frames and a 60Hz panel 60, so the motion is px/second * dt
   and the total displacement over the same WALL time has to agree. If it were a fixed
   step per frame, a 120Hz display would scroll the map at double speed -- the classic
   bug, and invisible to any single-rate test. */
{
  const speed = 192 * 2            // px/s * dpr
  const period = 8192
  let a = 0
  for (let i = 0; i < 60; i++) a = api.stepOffset(a, speed, 1 / 60, period)
  let b = 0
  for (let i = 0; i < 120; i++) b = api.stepOffset(b, speed, 1 / 120, period)
  let c = 0
  for (let i = 0; i < 144; i++) c = api.stepOffset(c, speed, 1 / 144, period)
  const want = speed * 1.0
  const near = (x) => Math.abs(x - want) < 1e-6
  if (!near(a) || !near(b) || !near(c)) {
    fail('one second of motion depends on the refresh rate: 60Hz=' + a.toFixed(4)
      + ' 120Hz=' + b.toFixed(4) + ' 144Hz=' + c.toFixed(4) + ' (expected ' + want.toFixed(4) + ')')
  } else {
    ok('60/120/144Hz all advance ' + want.toFixed(1) + ' device px in one second (rate-independent)')
  }
  /* ...and it wraps into the period instead of running away, so the modulo in the
     blit stays trivial and float precision never degrades after hours. */
  const wrapped = api.stepOffset(period - 1, 100, 1, period)
  if (!(wrapped >= 0 && wrapped < period)) fail('the step does not wrap into the period: ' + wrapped)
  else ok('the step wraps into the period (' + wrapped.toFixed(2) + ')')
}

/* ---------- A7. no frame-rate cap on either path --------------------------- */
/* The panel's refresh rate IS the frame rate: one transform write on the compositor
   path, one viewport blit on the fallback. A 30fps cap here was measured as the wrong
   trade -- the requirement is >=60, ideally 120. */
{
  const src = api.frameSource()
  if (/CONTOUR_BLIT_MIN_MS|contourLastPaintT/.test(src)) {
    fail('the frame loop still carries a repaint-rate cap')
  } else if (!/contourBlit\(\)/.test(src)) {
    fail('the frame loop does not call contourBlit every frame')
  } else {
    ok('the frame loop calls contourBlit every frame, with no rate cap')
  }
}

/* ---------- A8. the load-shedding guards ----------------------------------- */
/* A long session must not end in a frozen app. Two guards, both cheap:
   - a hidden/minimised window animates nothing (hours of background GPU work for a
     picture nobody can see is the worst load profile for an unstable driver);
   - a frame-budget watchdog sheds load (3D first, then animation) if frames stay slow.
   These are SOURCE assertions: the behaviour needs a real compositor to be slow. */
{
  const fs = require('fs')
  const path = require('path')
  const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
  const wants = src.match(/const contourWantsScroll = \(\) =>[\s\S]{0,400}?\n\n/)
  if (wants === null) fail('contourWantsScroll not found')
  else if (!/!docHidden\(\)/.test(wants[0])) {
    fail('the scroll loop does not stop while the window is hidden')
  } else ok('a hidden/minimised window animates nothing')

  const watch = src.match(/const CONTOUR_WATCH_DT = ([0-9.]+)[\s\S]{0,120}?const CONTOUR_WATCH_NET = (\d+)/)
  if (watch === null) fail('no frame-budget watchdog constants')
  else if (Number(watch[1]) < 0.033) fail('the watchdog threshold is ' + watch[1] + 's, inside a 60fps frame')
  else if (!/contourShedLoad\(/.test(src) || !/contourWatchFrame\(dt\)/.test(src)) {
    fail('the watchdog is declared but never run from the frame loop')
  } else ok('frame watchdog: >' + (Number(watch[1]) * 1000) + 'ms/frame for ' + watch[2]
    + ' net frames sheds load')

  /* 3D is the expensive path: a per-pixel march. Keeping its step count and its sheet
     small is what makes the watchdog's first action (drop 3D) rarely needed. */
  const steps = src.match(/const CONTOUR_3D_STEPS = (\d+)/)
  const area = src.match(/const CONTOUR_3D_TEX_AREA = ([0-9.e]+)/)
  if (steps === null || area === null) fail('3D cost constants not found')
  else if (Number(steps[1]) > 12) fail('CONTOUR_3D_STEPS = ' + steps[1] + ' (expected <= 12)')
  else if (Number(area[1]) > 8e6) fail('CONTOUR_3D_TEX_AREA = ' + area[1] + ' device px (expected <= 8M)')
  else ok('3D cost: ' + steps[1] + ' march steps, sheet <= ' + Math.round(Number(area[1]) / 1e6) + 'M device px')
}

/* A density change reuses the terrain: new levels only. */
api.reset()
api.retune()
const retune = api.snapshot()
if (retune.counts.generate !== 0) {
  fail('a density change regenerated the terrain (' + retune.counts.generate + ' generations)')
} else if (retune.counts.extract !== 1 || retune.counts.render !== 1) {
  fail('a density change should re-extract and re-render exactly once (got extract='
    + retune.counts.extract + ' render=' + retune.counts.render + ')')
} else {
  ok('density change: 0 generations, 1 extraction, 1 render')
}

/* A roughness change is the ONE setting that regenerates the terrain — and it must
   do so from the same seed, so dragging the slider re-tunes the same landscape
   instead of shuffling the map on every detent. */
const seedBefore = api.seed()
const rangeBefore = api.fieldRange()
api.setPref(api.roughKey, '11')
api.reset()
api.rebuildForRoughness()
const rough = api.snapshot()
if (rough.counts.generate !== 1) {
  fail('a roughness change should regenerate the terrain exactly once (got ' + rough.counts.generate + ')')
} else if (rough.counts.extract !== 1 || rough.counts.render !== 1) {
  fail('a roughness rebuild should extract + render exactly once (got extract='
    + rough.counts.extract + ' render=' + rough.counts.render + ')')
} else if (api.seed() !== seedBefore) {
  fail('a roughness change re-rolled the seed (terrain shuffled instead of re-tuned)')
} else if (api.fieldRange() === rangeBefore) {
  fail('a roughness change left the height field identical — the setting does nothing')
} else {
  ok('roughness change: 1 generation + 1 extraction + 1 render, same seed, different terrain')
}
/* Sliding back must return the shipped terrain exactly (determinism, both ways). */
api.setPref(api.roughKey, '7')
api.rebuildForRoughness()
if (api.fieldRange() === rangeBefore) ok('sliding back to the default stop reproduces the shipped terrain exactly')
else fail('the default stop no longer reproduces the terrain it started from ('
  + api.fieldRange() + ' != ' + rangeBefore + ')')

/* The frame function's own source may not touch the expensive trio. */
const frameSrc = api.frameSource()
for (const n of ['contourGenerateField', 'contourExtractAll', 'contourRenderCache', 'contourBuildTexture']) {
  if (frameSrc.includes(n)) fail('contourFrame() references ' + n + '() -- the frame path is no longer cache-only')
}
if (!bad) ok('contourFrame() is cache-only by construction (no build/extract/render call in its source)')

/* ---------- the scroll gate ----------
   One test per reason the loop must not run. The reduced-motion case is the one
   that regressed silently once (the query was cached at load, so a user flipping
   the OS setting with the page open was ignored and thunder-edges.test.js failed):
   the gate must read the preference LIVE at every reconciliation. */
const gate = []
gate.push(['loop runs when the switch is on and nothing forbids it', api.wantsScroll() === true])
api.setReducedMotion(true)
gate.push(['reduced motion stops the loop even with the switch on', api.wantsScroll() === false])
api.setReducedMotion(false)
gate.push(['the preference is read live, not cached (clearing it restores the loop)', api.wantsScroll() === true])
api.setPref(api.animKey, '0')
gate.push(['scroll switch off stops the loop', api.wantsScroll() === false])
api.setPref(api.animKey, '1')
api.setLoaderActive(true)
gate.push(['the boot plate stops the loop', api.wantsScroll() === false])
api.setLoaderActive(false)
api.setScrollPaused(true)
gate.push(['an active page scroll pauses the loop', api.wantsScroll() === false])
api.setScrollPaused(false)
let gateBad = 0
for (const [name, pass] of gate) {
  if (pass) ok(name)
  else { fail(name); gateBad++ }
}

/* ---------- B. cost size ---------- */
console.log('')
console.log('one-time build (terrain -> contours -> smoothed texture)')
for (const r of buildReport) {
  console.log('  ' + r.size.padEnd(10) + ' texture '
    + (r.texture ? r.texture.wCss + 'x' + r.texture.hCss + ' css / ' + r.texture.wDev + 'x' + r.texture.hDev + ' dev' : 'n/a')
    + '  grid ' + (r.grid ? r.grid.cols + 'x' + r.grid.rows : 'n/a')
    + '  contours ' + r.paths
    + '  ' + r.ms.toFixed(1) + ' ms')
}
console.log('per-frame blit')
for (const r of buildReport) {
  if (!r.blitMs) continue
  console.log('  ' + r.size.padEnd(10) + ' ' + r.blitPerBlit + ' drawImage/blit'
    + '  p50 ' + r.blitMs.p50.toFixed(3) + ' ms  p95 ' + r.blitMs.p95.toFixed(3) + ' ms')
}
console.log('')

const worstBuild = Math.max.apply(null, buildReport.map((r) => r.ms))
const worstBlit = Math.max.apply(null, buildReport.map((r) => (r.blitMs ? r.blitMs.p95 : 0)))
if (worstBuild < 800) ok('one-time build stays under 800 ms on every size (worst ' + worstBuild.toFixed(1) + ' ms)')
else fail('one-time build took ' + worstBuild.toFixed(1) + ' ms -- mounting the theme would stall')
if (worstBlit < 8) {
  ok('per-frame blit stays far inside a 120fps budget (worst p95 ' + worstBlit.toFixed(3)
    + ' ms of ' + (1000 / 120).toFixed(1) + ' ms)')
} else {
  fail('per-frame blit p95 ' + worstBlit.toFixed(3) + ' ms is over the 120fps budget')
}

console.log('')
if (bad) { console.error(bad + ' contour perf check(s) failed'); process.exit(1) }
console.log('all contour perf checks passed')
