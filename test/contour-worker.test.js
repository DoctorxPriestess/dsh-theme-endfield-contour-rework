/**
 * contour-worker.test.js — structural checks for the off-main-thread 2D renderer.
 *
 * These assertions pin the pieces that make the worker both seamless and safe to
 * fall back from. The browser-side proof (frames advance while the main thread is
 * blocked) lives in the lab run; this test keeps the shipped source from silently
 * regressing those pieces.
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log('ok    ' + m) }
const bad = (m) => { fail++; console.error('FAIL  ' + m) }
const check = (m, cond) => (cond ? ok(m) : bad(m))

check('2D worker entry point exists', SRC.includes('const contourWorkerMain = function ()'))
check('worker advances offsets by period modulo', /ox = \(ox \+ vx \* dt\) % tw/.test(SRC) && /oy = \(oy \+ vy \* dt\) % th/.test(SRC))
check('worker keeps offsets inside one period', /if \(ox < 0\) ox \+= tw/.test(SRC) && /if \(oy < 0\) oy \+= th/.test(SRC))
check('worker tiles from the floored offset', /for \(let y = -sy; y < h; y \+= th\)/.test(SRC) && /for \(let x = -sx; x < w; x \+= tw\)/.test(SRC))
check('worker disables smoothing for 1px strokes', /ctx\.imageSmoothingEnabled = false/.test(SRC))
check('worker uses OffscreenCanvas and a Blob Worker', /transferControlToOffscreen\(\)/.test(SRC) && /new Worker\(url\)/.test(SRC) && /createObjectURL\(new Blob/.test(SRC))
check('worker receives the sheet as a transferred bitmap', /type: 'bitmap', bitmap: bmp/.test(SRC) && /\[bmp\]/.test(SRC))
check('worker keeps the same sheet generation', /contourSheetGen \+ ':' \+ cv\.width/.test(SRC))
check('a harness can force the main-thread path', /__CONTOUR_NO_WORKER__ === true/.test(SRC))
check('flat blit yields to the worker', /contourWorker !== null && !isContourView3D\(\)\) return/.test(SRC))
check('the main loop yields to the worker', /const contourStartLoop = \(\) => \{\n      if \(typeof contourWorker !== 'undefined' && contourWorker !== null\) return/.test(SRC))
check('teardown stops the worker', /const contourTeardown = \(\) => \{\n      if \(typeof contourWorkerStop === 'function'\) contourWorkerStop\(\)/.test(SRC))
check('worker sync sends motion, run and pause', /type: 'motion'/.test(SRC) && /type: 'run'/.test(SRC) && /type: 'pause'/.test(SRC))
check('worker is stopped when entering 3D', /if \(isContourView3D\(\)\) \{\n        if \(typeof contourWorkerStop === 'function'\) contourWorkerStop\(\)/.test(SRC))
check('worker takes over after a sheet rebuild', /contourWorkerStart\(\)\) \{\n          if \(typeof contourStopLoop === 'function'\) contourStopLoop\(\)/.test(SRC))
check('page visibility pauses the worker', /onContourVisibility[\s\S]{0,200}contourWorkerSync/.test(SRC))
check('a failed worker falls back to the main path', /contourWorkerFailed = true[\s\S]{0,400}contourApplySwitches\(\)/.test(SRC))

console.log('')
if (fail > 0) {
  console.error(fail + ' contour worker check(s) failed')
  process.exit(1)
}
console.log('all ' + pass + ' contour worker checks passed')
