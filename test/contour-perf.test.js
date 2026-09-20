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
  'contourBuildTexture', 'contourBlit', 'contourRetune', 'contourFrame',
  'contourTerrainProfile', 'contourOctaveLadder', 'contourRebuildForRoughness',
  'contourReadIndex']
const ONE = ['CONTOUR_STEP', 'CONTOUR_BASE_CELL', 'CONTOUR_OCTAVES',
  'CONTOUR_PERSIST', 'CONTOUR_PERIOD_MAX', 'CONTOUR_MIN_LEN',
  'CONTOUR_MIN_RING_BOX', 'CONTOUR_LEVEL_MARGIN', 'CONTOUR_GRAD_X',
  'CONTOUR_GRAD_Y', 'CONTOUR_KEEP_LEN', 'CONTOUR_KEEP_RING',
  'CONTOUR_TEX_MULT', 'CONTOUR_TEX_MAX_AREA', 'CONTOUR_TEX_MAX_DIM',
  'CONTOUR_TEX_QUANT', 'CONTOUR_RESIZE_DEBOUNCE', 'CONTOUR_ANIM_KEY',
  'CONTOUR_ROUGHNESS_DEFAULT', 'CONTOUR_ROUGHNESS_KEY']
const LINE = ['CONTOUR_DENSITIES', 'CONTOUR_SPEEDS', 'CONTOUR_ROUGHNESS_BASE',
  'CONTOUR_ROUGHNESS_PERSIST', 'CONTOUR_ROUGHNESS_OCTAVES']

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
let contourOffsetX=0, contourOffsetY=0, contourDpr=1, contourSpeedPx=48
let contourVelX=0, contourVelY=-1, contourView=null, contourWrap=null
let contourRaf=null, contourLastT=-1, contourResizeTimer=null
let contourLoaderActive=false, contourScrollPaused=false
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
      ? { wCss: contourTex.wCss, hCss: contourTex.hCss, wDev: contourTex.cv.width, hDev: contourTex.cv.height }
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
  // Texture caps: a device pixel per side, and the CSS-pixel area budget. Both are
  // what keep a background layer from ballooning on a 4K HiDPI screen.
  if (s.texture.wDev > 4096 || s.texture.hDev > 4096) {
    fail(label + ': texture is ' + s.texture.wDev + 'x' + s.texture.hDev + ' device px, over the 4096 cap')
  }
  const area = s.texture.wCss * s.texture.hCss
  if (!(area <= 8.3e6 * 1.05)) fail(label + ': texture area ' + Math.round(area) + ' css px^2 is over the 8.3e6 budget')
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
