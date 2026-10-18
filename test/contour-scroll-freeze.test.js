/**
 * contour-scroll-freeze.test.js — the two rules that keep a frozen sheet from
 * flashing black, and stop the freeze from firing at all for the wrong scroller.
 *
 * Why this file exists. "展开 cot 后还是有黑块，会高速闪烁" (a black block flickers at
 * high speed after expanding a thinking panel) is a compositor symptom, and the
 * canvas can only be blamed for one half of it: a canvas that stops committing
 * frames can be re-composited from a surface the compositor has since recycled.
 * Two things in client.js could leave the layer in exactly that state:
 *
 *   1. THE FREEZE FELL FOR THE WRONG SCROLL. window's capture-phase `scroll`
 *      listener sees EVERY scroller, and the message list is one of them — the app
 *      auto-scrolls it on every token while a reply streams. So the sheet stopped
 *      and restarted dozens of times a second for the whole length of a reply.
 *      Only the page's own scroll may freeze it (contourPageScrolled).
 *
 *   2. A FROZEN OR STILL LAYER STOPPED DRAWING ALTOGETHER. contourStopLoop() left
 *      one commit on screen for as long as the scroll lasted (contourArmFrozenRefresh
 *      now re-commits it 4x/s), and the 3D sub-pixel gate could skip frames
 *      indefinitely while the camera stood still (contourGlWantsFrame now admits a
 *      frame every CONTOUR_GL_REFRESH_MS regardless).
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
    grabNum('CONTOUR_FROZEN_REFRESH_MS'),
    grabOne('contourGlWantsFrame'),
    grab('contourPageScrolled'),
    grab('onContourScrollEvent'),
    grab('onContourScrollEndEvent'),
  ].join('\n')
  api = new Function(`
let contourScrollHook = () => { scrollHookCalls += 1 }
let contourScrollEndHook = () => { scrollEndHookCalls += 1 }
let scrollHookCalls = 0
let scrollEndHookCalls = 0
let contourFrozenTimer = null
let contourScrollPaused = false
let contourWrap = null
let contourTex = null
let blitCalls = 0
let intervals = []
const contourBlit = () => { blitCalls += 1 }
const setInterval = (fn, ms) => { intervals.push({ fn, ms }); return intervals.length }
const clearInterval = (h) => { intervals[h - 1] = null }
const doc = { scrollingElement: null, documentElement: null, body: null }
doc.scrollingElement = { tag: 'html' }
doc.documentElement = doc.scrollingElement
doc.body = { tag: 'body' }
const document = doc
${body}
${grab('contourArmFrozenRefresh')}
return {
  pageScrolled: contourPageScrolled,
  scrollEvent: onContourScrollEvent,
  scrollEndEvent: onContourScrollEndEvent,
  armFrozen: contourArmFrozenRefresh,
  glFrame: contourGlWantsFrame,
  consts: { REFRESH: CONTOUR_GL_REFRESH_MS, HALF: CONTOUR_GL_HALF_PX, FROZEN: CONTOUR_FROZEN_REFRESH_MS },
  hooks: () => ({ scroll: scrollHookCalls, scrollEnd: scrollEndHookCalls }),
  fire: (i) => { const it = intervals[i - 1]; if (it) it.fn() },
  intervalMs: (i) => (intervals[i - 1] ? intervals[i - 1].ms : null),
  timers: () => intervals.filter(Boolean).length,
  setPaused: (v) => { contourScrollPaused = v },
  setLayer: (wrap, tex) => { contourWrap = wrap; contourTex = tex },
  blits: () => blitCalls,
  doc,
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

/* The listener must actually consult the rule -- a pure function nobody calls is
   the classic way this regresses. */
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

/* ------------------------------------------- 2. the frozen frame is re-committed */
api.setPaused(true)
api.setLayer({}, {})
api.armFrozen()
api.armFrozen()
if (api.timers() === 1) ok('arming the frozen refresh twice keeps one timer')
else fail('arming the frozen refresh twice created ' + api.timers() + ' timers')
if (api.intervalMs(1) === api.consts.FROZEN) {
  ok('the frozen refresh runs at ' + api.consts.FROZEN + 'ms (4/s: invisible for a still picture)')
} else {
  fail('frozen refresh interval is ' + api.intervalMs(1) + 'ms')
}
api.fire(1)
if (api.blits() === 1) ok('a frozen sheet is re-committed on the timer')
else fail('the frozen refresh did not blit (blits=' + api.blits() + ')')
api.setPaused(false)
api.fire(1)
if (api.blits() === 1) ok('the refresh stops once the scroll ended (no work while it is running again)')
else fail('the refresh kept blitting after the scroll ended')
api.setPaused(true)
api.setLayer(null, {})
api.fire(1)
if (api.blits() === 1) ok('no blit when there is no layer on screen')
else fail('the refresh blitted with the layer torn down')
api.setLayer({}, null)
api.fire(1)
if (api.blits() === 1) ok('no blit when there is no sheet')
else fail('the refresh blitted without a texture')

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
if (/webglcontextlost/.test(src) && /contourGlLastDrawAt = -1/.test(src)) {
  ok('a lost/disposed context forces the next frame to draw')
} else {
  fail('a fresh context could skip its first frame (contourGlLastDrawAt is not reset)')
}
const pauseSrc = grab('contourPauseOnScroll')
if (/contourArmFrozenRefresh\(\)/.test(pauseSrc)) ok('the freeze arms the refresh timer')
else fail('the freeze does not arm the refresh timer')
const resumeSrc = grab('contourResumeAfterScroll')
if (/clearInterval\(contourFrozenTimer\)/.test(resumeSrc)) ok('the resume clears the frozen refresh')
else fail('the resume leaves the frozen refresh running')
if (/clearInterval\(contourFrozenTimer\)/.test(grab('contourTeardown'))) {
  ok('teardown clears the frozen refresh (no timer outlives the layer)')
} else {
  fail('teardown leaks the frozen refresh timer')
}
if (/addEventListener\('focus', onContourVisibility\)/.test(src)
  && /addEventListener\('pageshow', onContourVisibility\)/.test(src)) {
  ok('focus/pageshow repaint once, so an occluded-then-shown layer is never left stale')
} else {
  fail('no focus/pageshow repaint: an occluded layer can stay stale')
}

console.log(bad === 0 ? '\nall checks passed' : '\n' + bad + ' check(s) failed')
process.exit(bad === 0 ? 0 : 1)
