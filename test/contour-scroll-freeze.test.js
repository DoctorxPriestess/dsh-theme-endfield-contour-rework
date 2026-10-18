/**
 * contour-scroll-freeze.test.js — the rules that keep a scrolling page from turning the
 * sheet black, and stop the freeze from firing for the wrong scroller.
 *
 * Why this file exists. The user's final, decisive description was:
 *   "我发现了，不是 cot 蹦 token，是页面滚动导致的黑块闪烁"
 * — a black block that FLASHES WHILE THE PAGE SCROLLS. Three code-level causes are
 * possible, and all three are pinned here:
 *
 *   1. THE FREEZE FELL FOR THE WRONG SCROLL. window's capture-phase `scroll` listener
 *      sees EVERY scroller, and the message list is one of them — the app auto-scrolls
 *      it on every streaming token. Only the page's own scroll may freeze the sheet
 *      (contourPageScrolled).
 *
 *   2. THE FREEZE STOPPED THE DRAWING, NOT JUST THE MOTION. contourStopLoop() left one
 *      commit on screen for the length of the scroll, and a canvas with no recent
 *      commit is exactly what a re-composite during a scroll can present as black.
 *      contourPauseOnScroll now keeps the loop alive and contourFrame advances ZERO
 *      time instead (asserted by driving one frame here, not by reading the source).
 *
 *   3. THE 3D GATE COULD COALESCE THE FROZEN COMMITS AWAY. With the camera still, "did
 *      it move" is always no, so the sub-pixel gate plus the time floor would drop the
 *      frame; contourFrame forces the draw while frozen. The floor itself is still
 *      there for the moving case (contourGlWantsFrame).
 *
 * Usage: node test/contour-scroll-freeze.test.js
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
function grabOne(name) {
  const re = new RegExp('^\\s*const ' + name + ' = .*$', 'm')
  const m = src.match(re)
  if (!m) throw new Error('not found in client.js: ' + name)
  return m[0].trim()
}
function grabNum(name) {
  const m = src.match(new RegExp('const ' + name + ' = (-?[0-9.]+)'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}

let api = null
try {
  const body = [
    grabNum('CONTOUR_GL_REFRESH_MS'),
    grabNum('CONTOUR_GL_HALF_PX'),
    grabOne('contourGlWantsFrame'),
    grab('contourPageScrolled'),
    grab('onContourScrollEvent'),
    grab('onContourScrollEndEvent'),
    grab('contourPauseOnScroll'),
    grab('contourFrame'),
    grab('contourStepOffset'),
  ].join('\n')
  api = new Function(`
let contourScrollHook = () => { scrollHookCalls += 1 }
let contourScrollEndHook = () => { scrollEndHookCalls += 1 }
let scrollHookCalls = 0
let scrollEndHookCalls = 0
let contourScrollPaused = false
let contourWrap = null
let contourTex = null
let contourScrollTimer = null
let contourResizePending = false
let contourHost = null
let contourSwitchSig = ''
let contourRaf = null
let contourLastT = -1
let contourOffsetX = 0
let contourOffsetY = 0
let contourGlLastDrawAt = 12345
let contourVelX = 1
let contourVelY = 1
let contourSpeedPx = 48
let contourDpr = 1
let contourDisableAnim = false
let loopStops = 0
let loopStarts = 0
let watchCalls = []
let blits = []
const isEnabled = () => true
const isContourOn = () => true
const isContourScrollPauseOn = () => true
const isContourAnimOn = () => contourDisableAnim !== true
const contourWantsScroll = () => isContourAnimOn()
const contourWatchFrame = (dt) => { watchCalls.push(dt) }
const contourStopLoop = () => { loopStops += 1; contourRaf = null }
const contourStartLoop = () => { if (contourRaf === null && contourWantsScroll()) { loopStarts += 1; contourRaf = 99 } }
const contourBlit = () => { blits.push({ x: contourOffsetX, y: contourOffsetY, at: contourGlLastDrawAt }) }
const contourApplySwitches = () => {}
const contourSizeTo = () => false
const contourScheduleRebuildCheck = () => {}
const requestAnimationFrame = () => 7
let clockMs = 0
const performance = { now: () => clockMs }
const doc = { scrollingElement: null, documentElement: null, body: null }
doc.scrollingElement = { tag: 'html' }
doc.documentElement = doc.scrollingElement
doc.body = { tag: 'body' }
const document = doc
${body}
return {
  pageScrolled: contourPageScrolled,
  scrollEvent: onContourScrollEvent,
  scrollEndEvent: onContourScrollEndEvent,
  pause: contourPauseOnScroll,
  frame: contourFrame,
  glFrame: contourGlWantsFrame,
  consts: { REFRESH: CONTOUR_GL_REFRESH_MS, HALF: CONTOUR_GL_HALF_PX },
  hooks: () => ({ scroll: scrollHookCalls, scrollEnd: scrollEndHookCalls }),
  doc,
  setLayer: (wrap, tex) => { contourWrap = wrap; contourTex = tex },
  setRaf: (v) => { contourRaf = v },
  raf: () => contourRaf,
  setOffsets: (x, y) => { contourOffsetX = x; contourOffsetY = y },
  offsets: () => [contourOffsetX, contourOffsetY],
  setPaused: (v) => { contourScrollPaused = v },
  paused: () => contourScrollPaused,
  setAnim: (v) => { contourDisableAnim = v === false },
  counters: () => ({ loopStops, loopStarts, watch: watchCalls.slice(), blits: blits.slice() }),
  resetCounters: () => { loopStops = 0; loopStarts = 0; watchCalls = []; blits = [] },
  setTime: (v) => { clockMs = v },
}
`)()
} catch (e) {
  console.error('FAIL  could not slice the helpers out of client.js: ' + e.message)
  process.exit(1)
}

/* ------------------------------------------- 1. which scroller may freeze ----- */
const root = api.doc.scrollingElement
const nested = { tag: 'div', cls: 'Md3f7G_messageList' }

if (api.pageScrolled({ target: root }) === true) ok('a page (documentElement) scroll is the page scrolling')
else fail('a documentElement scroll was not recognised as the page scrolling')
if (api.pageScrolled({ target: api.doc }) === true) ok('a document scroll is the page scrolling')
else fail('a document scroll was not recognised')
if (api.pageScrolled({ target: api.doc.body }) === true) ok('a body scroll is the page scrolling')
else fail('a body scroll was not recognised')
if (api.pageScrolled({ target: nested }) === false) {
  ok('a nested scroller (the streaming message list) does NOT count as the page scrolling')
} else {
  fail('a nested scroller still counts as the page scrolling -- the auto-scrolling message list would freeze the sheet on every token')
}
if (api.pageScrolled(null) === true && api.pageScrolled(undefined) === true) {
  ok('an unknown event keeps the old behaviour (freeze), never the silent one')
} else {
  fail('an unknown event did not fall back to freezing')
}
api.scrollEvent({ target: nested })
if (api.hooks().scroll === 0) ok('a nested scroll event does not reach the freeze hook')
else fail('a nested scroll event still reached the freeze hook')
api.scrollEvent({ target: root })
if (api.hooks().scroll === 1) ok('a page scroll event reaches the freeze hook')
else fail('a page scroll event did not reach the freeze hook')
api.scrollEndEvent({ target: nested })
if (api.hooks().scrollEnd === 0) ok('a nested scrollend does not resume the sheet')
else fail('a nested scrollend still resumed the sheet')
api.scrollEndEvent({ target: root })
if (api.hooks().scrollEnd === 1) ok('a page scrollend resumes the sheet')
else fail('a page scrollend did not resume the sheet')

/* ------------------------------ 2. the freeze stops TIME, not the drawing ----- */
api.setLayer({}, { cv: { width: 1000, height: 600 } })
api.setOffsets(100, 50)
api.resetCounters()
api.pause()
const afterPause = api.counters()
if (afterPause.loopStops === 0) ok('freezing does not stop the frame loop (that is what left the canvas uncommitted)')
else fail('the freeze still calls contourStopLoop()')
if (api.raf() !== 99) fail('the freeze left the loop idle (raf=' + api.raf() + ', starts=' + api.counters().loopStarts + ')')
else ok('freezing starts the loop when it was idle, so the frozen picture keeps being drawn')
if (api.paused() === true) ok('the freeze is recorded as state')
else fail('the freeze did not set contourScrollPaused')

api.resetCounters()
api.setPaused(false)
api.setOffsets(100, 50)
api.setTime(1000)
api.frame() // primes contourLastT: the FIRST frame has no elapsed time by design
api.resetCounters()
api.setOffsets(100, 50)
api.setTime(1016)
api.frame()
const running = api.counters()
if (running.blits.length === 1) ok('a running frame commits once')
else fail('a running frame committed ' + running.blits.length + ' times')
const movedX = running.blits[0].x - 100
if (movedX > 0.5) ok('a running frame advances the camera (' + movedX.toFixed(3) + ' device px in one frame)')
else fail('a running frame did not advance the camera (dx=' + movedX + ')')
if (running.blits[0].at === 12345) ok('a running frame keeps the recorded draw time (the 3D gate decides)')
else fail('a running frame rewrote contourGlLastDrawAt')

api.resetCounters()
api.setPaused(true)
api.setOffsets(100, 50)
api.setTime(3000)
api.frame()
const frozen = api.counters()
if (frozen.blits.length === 1) ok('a frozen frame STILL commits (the scroll must not stop the canvas)')
else fail('a frozen frame committed ' + frozen.blits.length + ' times')
if (frozen.blits[0].x === 100 && frozen.blits[0].y === 50) {
  ok('a frozen frame advances ZERO time: same offsets, same picture')
} else {
  fail('a frozen frame moved the camera to ' + frozen.blits[0].x + ',' + frozen.blits[0].y)
}
if (frozen.blits[0].at === -1) ok('a frozen frame forces the 3D draw past the sub-pixel gate')
else fail('a frozen frame left contourGlLastDrawAt at ' + frozen.blits[0].at + ' -- the gate can drop it')
if (frozen.watch.length === 1 && frozen.watch[0] === 0) {
  ok('a frozen frame is not counted by the slow-frame watchdog (a scroll must not disable 3D)')
} else {
  fail('a frozen frame fed dt=' + JSON.stringify(frozen.watch) + ' to the watchdog')
}

/* ------------------------------------------- 3. the 3D frame refresh floor ---- */
const F = api.glFrame
if (F(0, 0, 0) === false) ok('a still camera that just drew does not redraw (the sub-pixel gate still skips)')
else fail('a still camera redrew immediately -- the gate is gone')
if (F(0.4, -0.4, 10) === false) ok('sub-half-pixel drift is still skipped')
else fail('sub-half-pixel drift forced a redraw')
if (F(0.5, 0, 10) === true && F(0, -0.6, 10) === true) ok('half a device pixel of drift forces a redraw')
else fail('half a device pixel of drift did not force a redraw')
if (F(0, 0, 199) === false && F(0, 0, 200) === true) {
  ok('a still camera redraws after ' + api.consts.REFRESH + 'ms, not before')
} else {
  fail('the refresh floor is not ' + api.consts.REFRESH + 'ms')
}
if (F(0, 0, Infinity) === true) ok('a never-drawn layer always draws')
else fail('a never-drawn layer skipped its first frame')

/* ------------------------------------------------- 4. the wiring in client.js */
const blitSrc = grab('contourBlit')
if (/contourGlWantsFrame\(/.test(blitSrc)) ok('contourBlit uses the refresh rule')
else fail('contourBlit does not use contourGlWantsFrame')
if (/contourGlLastDrawAt = contourGlNow\(\)/.test(blitSrc)) ok('a successful 3D draw records when it was committed')
else fail('contourBlit does not record contourGlLastDrawAt')
if (/contourGlLastDrawAt = -1/.test(src) && /webglcontextlost/.test(src)) {
  ok('a lost/disposed context forces the next frame to draw')
} else {
  fail('a fresh context could skip its first frame (contourGlLastDrawAt is not reset)')
}
if (/contourStopLoop\(\)/.test(grab('contourPauseOnScroll')) === false) {
  ok('contourPauseOnScroll contains no contourStopLoop()')
} else {
  fail('contourPauseOnScroll still stops the loop')
}
if (/addEventListener\('focus', onContourVisibility\)/.test(src)
  && /addEventListener\('pageshow', onContourVisibility\)/.test(src)) {
  ok('focus/pageshow repaint once, so an occluded-then-shown layer is never left stale')
} else {
  fail('no focus/pageshow repaint: an occluded layer can stay stale')
}

console.log(bad === 0 ? '\nall checks passed' : '\n' + bad + ' check(s) failed')
process.exit(bad === 0 ? 0 : 1)
