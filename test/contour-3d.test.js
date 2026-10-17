#!/usr/bin/env node
/**
 * contour-3d.test.js — the 3D view's projection, without a GPU.
 *
 * The shader is three lines of arithmetic (see CONTOUR_GL_FRAG in client.js), so the
 * thing worth testing is the ARITHMETIC, not the rasteriser: this runs the same maths
 * as a plain function sliced out of the real client.js and asserts its shape.
 *
 * What it pins down, and why each one matters:
 *
 *   1. depth = 0 reproduces the 2D projection EXACTLY. If that identity ever breaks,
 *      the "flat" and "3D" views silently disagree about where the sheet is, and a
 *      user flipping the switch sees the landscape jump.
 *   2. motion gain is strictly increasing in height. That IS the feature ("a ridge
 *      sweeps past faster than the valley behind it"); a non-monotone gain would mean
 *      some band of terrain moving backwards relative to its neighbours.
 *   3. h = REF is the fixed point: the reference height moves exactly like the flat
 *      sheet, so the two views line up at that band.
 *   4. every sample lands inside [0,1) -- the sheet is periodic and the shader wraps
 *      with fract(); an out-of-range value would sample the clamped edge instead.
 *   5. the vertical lift follows RISE * (h - REF) * viewHeight.
 *
 * The GPU side (hardware check, fallback, shader actually running) is covered in a
 * real browser by contour-render.test.js, because that needs a canvas.
 *
 * Usage: node test/contour-3d.test.js
 */
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

function grabConst(name) {
  const m = SRC.match(new RegExp('const ' + name + ' = [^\\n]+'))
  if (m === null) throw new Error('not found in client.js: ' + name)
  return m[0]
}
function grabFn(name) {
  const at = SRC.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  let d = 0
  for (let j = SRC.indexOf('{', at); j < SRC.length; j++) {
    if (SRC[j] === '{') d++
    else if (SRC[j] === '}') {
      d--
      if (d === 0) return SRC.slice(at, j + 1)
    }
  }
  throw new Error('unbalanced: ' + name)
}

const SOURCE = [
  grabConst('CONTOUR_3D_REF'),
  grabConst('CONTOUR_3D_DEPTH'),
  grabConst('CONTOUR_3D_RISE'),
  grabFn('contourParallaxUV'),
].join('\n')
const TAIL = '\nreturn { contourParallaxUV, REF: CONTOUR_3D_REF, DEPTH: CONTOUR_3D_DEPTH, RISE: CONTOUR_3D_RISE }'

let api
let flat
try {
  api = new Function(SOURCE + TAIL)()
  /* The same declaration with BOTH 3D knobs turned off. Depth scales the motion and
     rise lifts the ground, so "no 3D at all" is both at zero -- they are separate
     knobs on purpose (how fast a ridge sweeps is a different question from how tall
     it looks), and the flat view is the state where neither applies. */
  flat = new Function(
    SOURCE
      .replace(/const CONTOUR_3D_DEPTH = [^\n]+/, 'const CONTOUR_3D_DEPTH = 0')
      .replace(/const CONTOUR_3D_RISE = [^\n]+/, 'const CONTOUR_3D_RISE = 0')
    + TAIL)()
} catch (e) {
  console.error('FAIL  could not slice the projection out of client.js: ' + e.message)
  process.exit(1)
}

let bad = 0
const ok = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); bad++ }

/* A viewport and a sheet that are not multiples of each other, so a wrap or a
   sign error cannot hide behind a coincidence. */
const TW = 3968
const TH = 2048
const VW = 2864
const VH = 1506

/* ---------- 1. depth = 0 is the 2D projection, exactly ---------- */
{
  let worst = 0
  let n = 0
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 25; j++) {
      const px = (i / 39) * VW
      const py = (j / 24) * VH
      const sx = 1234
      const sy = 777
      const h = ((i * 7 + j * 13) % 20) / 19
      const a = flat.contourParallaxUV(px, py, sx, sy, TW, TH, h, VH)
      /* The 2D contract, written out independently of the implementation. */
      const u2 = (((px + sx) / TW) % 1 + 1) % 1
      const v2 = (((py + sy) / TH) % 1 + 1) % 1
      worst = Math.max(worst, Math.abs(a.u - u2), Math.abs(a.v - v2))
      n++
    }
  }
  if (worst <= 1e-12) ok('depth 0 reproduces the 2D projection exactly (' + n + ' samples, worst ' + worst.toExponential(1) + ')')
  else fail('depth 0 does not match the 2D projection: worst error ' + worst.toExponential(2))
}

/* ---------- 2. h = REF is the fixed point (tested against the 2D formula, not a
     second copy of the same function) ---------- */
{
  let worst = 0
  for (let i = 0; i < 40; i++) {
    const px = (i / 39) * VW
    const py = VH - (i / 39) * VH
    const a = api.contourParallaxUV(px, py, 900, 1400, TW, TH, api.REF, VH)
    const u2 = (((px + 900) / TW) % 1 + 1) % 1
    const v2 = (((py + 1400) / TH) % 1 + 1) % 1
    worst = Math.max(worst, Math.abs(a.u - u2), Math.abs(a.v - v2))
  }
  if (worst <= 1e-12) ok('height REF is exactly the flat projection (fixed point), worst ' + worst.toExponential(1))
  else fail('height REF deviates from the flat projection: ' + worst.toExponential(2))
}

/* ---------- 3. motion gain is strictly increasing in height ---------- */
{
  const px = VW * 0.5
  const py = VH * 0.4
  const sx = 500
  const sy = 900
  const gains = []
  let prevU = null
  let monotone = true
  let backwards = 0
  for (let k = 0; k <= 20; k++) {
    const h = k / 20
    const r = api.contourParallaxUV(px, py, sx, sy, TW, TH, h, VH)
    gains.push(r.gain)
    /* Track the horizontal sample position in UNWRAPPED sheet pixels, so a wrap
       does not read as a jump backwards. */
    if (prevU !== null) {
      if (!(r.gain > prevU)) monotone = false
      if (r.gain <= 0) backwards++
    }
    prevU = r.gain
  }
  if (monotone) ok('motion gain strictly increases with height (' + gains[0].toFixed(3) + ' .. ' + gains[20].toFixed(3) + ')')
  else fail('motion gain is not strictly increasing: ' + gains.map((g) => g.toFixed(3)).join(' '))
  if (backwards === 0) ok('no height band moves backwards relative to its neighbours')
  else fail(backwards + ' gain values are <= 0 (a band would stand still or reverse)')
  if (!(gains[0] < 1 && gains[20] > 1)) fail('gain does not straddle 1 (valleys should be slower, ridges faster)')
}

/* ---------- 4. samples always land inside the period ---------- */
{
  let outside = 0
  let n = 0
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 40; j++) {
      const px = -VW + (i / 59) * 3 * VW       // deliberately beyond the frame
      const py = -VH + (j / 39) * 3 * VH
      const sx = ((i * 137) % TW) - TW / 2      // and negative offsets
      const sy = ((j * 311) % TH) - TH / 2
      const h = ((i + j) % 11) / 10
      const r = api.contourParallaxUV(px, py, sx, sy, TW, TH, h, VH)
      if (!(r.u >= 0 && r.u < 1) || !(r.v >= 0 && r.v < 1)) outside++
      n++
    }
  }
  if (outside === 0) ok('all ' + n + ' samples wrap into [0,1) (including negative offsets and off-frame points)')
  else fail(outside + ' of ' + n + ' samples fell outside [0,1) -- the shader would clamp instead of wrap')
}

/* ---------- 5. the vertical lift follows RISE * (h - REF) * viewHeight ---------- */
{
  const px = VW * 0.3
  const py = VH * 0.6
  const h = 0.9
  const r = api.contourParallaxUV(px, py, 0, 0, TW, TH, h, VH)
  const want = (((r.v0 + api.RISE * (h - api.REF) * VH / TH) % 1) + 1) % 1
  const err = Math.abs(r.v - want)
  /* 1 - err also counts a wrap-around match. */
  if (Math.min(err, 1 - err) <= 1e-12) ok('vertical lift == RISE * (h - REF) * viewHeight (' + (api.RISE * (h - api.REF) * VH).toFixed(1) + ' px)')
  else fail('vertical lift does not match RISE * (h - REF) * viewHeight: error ' + err.toExponential(2))
  const higher = api.contourParallaxUV(px, py, 0, 0, TW, TH, 1, VH)
  const lower = api.contourParallaxUV(px, py, 0, 0, TW, TH, 0, VH)
  /* Higher ground must sit HIGHER on screen. Sampling from further down the sheet
     (larger v) draws the content above, so v(high) > v(low) whenever RISE > 0. */
  const dv = ((higher.v - lower.v) % 1 + 1) % 1
  const span = api.RISE * VH / TH
  if (Math.abs(dv - span) <= 1e-9) ok('higher ground sits higher on screen by ' + (api.RISE * VH).toFixed(1) + ' px across the full height')
  else fail('full-height lift is ' + dv.toFixed(6) + ' of the period, expected ' + span.toFixed(6))
}

/* ---------- 6. the constants are in a sane range ---------- */
{
  const dep = api.DEPTH
  const rise = api.RISE
  const ref = api.REF
  if (dep > 0 && dep < 1) ok('CONTOUR_3D_DEPTH ' + dep + ' keeps the gain inside (1-depth, 1+depth) -- no band moves >2x faster than the sheet')
  else fail('CONTOUR_3D_DEPTH ' + dep + ' is out of range (0,1)')
  if (rise > 0 && rise <= 0.5) ok('CONTOUR_3D_RISE ' + rise + ' lifts at most half a viewport height')
  else fail('CONTOUR_3D_RISE ' + rise + ' is out of range (0,0.5]')
  if (ref > 0 && ref < 1) ok('CONTOUR_3D_REF ' + ref + ' is an interior height')
  else fail('CONTOUR_3D_REF ' + ref + ' is not inside (0,1)')
}

/* ---------- 7. the hardware rule rejects software rasterisers ---------- */
{
  const m = SRC.match(/const CONTOUR_SOFT_GL = (\/[^\n]+?\/[a-z]*)\n/)
  if (m === null) { fail('CONTOUR_SOFT_GL pattern not found in client.js') }
  else {
    const re = eval(m[1]) // the literal is a regex in the shipped source
    const shouldReject = [
      'Google SwiftShader',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
      'Mesa softpipe',
    ]
    const shouldAccept = [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2 Pro',
      'AMD Radeon RX 6800 XT (radeonsi, navi21, LLVM 15.0.7, DRM 3.49, 6.2.0)',
    ]
    const leaked = shouldReject.filter((r) => !re.test(r))
    const killed = shouldAccept.filter((r) => re.test(r))
    if (leaked.length === 0) ok('every software renderer string is rejected (' + shouldReject.length + '/' + shouldReject.length + ')')
    else fail('software renderers that would pass the hardware check: ' + leaked.join(' | '))
    if (killed.length === 0) ok('real GPUs are not rejected (' + shouldAccept.length + '/' + shouldAccept.length + ')')
    else fail('real GPUs wrongly rejected: ' + killed.join(' | '))
  }
}

if (bad) {
  console.error(bad + ' contour 3D check(s) failed')
  process.exit(1)
}
console.log('all contour 3D geometry checks passed')
