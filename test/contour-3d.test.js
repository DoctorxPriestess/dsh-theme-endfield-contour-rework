/**
 * contour-3d.test.js — the 3D view's projection, without a GPU.
 *
 * The shader is four lines of arithmetic (see CONTOUR_GL_FRAG in client.js), so the
 * thing worth testing is the ARITHMETIC, not the rasteriser: this runs the same
 * maths as plain functions sliced out of the real client.js and asserts its shape.
 *
 * Each assertion exists because a WRONG version of it looked fine in a screenshot:
 *
 *   1. DEPTH=0 + RISE=0 reproduces the 2D projection exactly. Flip the view and the
 *      terrain must not move.
 *   2. The projection is EXACTLY periodic in the scroll offset: advancing the camera
 *      by one sheet period must reproduce the identical sample. The first shipped
 *      formula scaled the offset by height instead of inverting a camera, so its
 *      shear integrated with the offset and the whole image snapped by up to ~140px
 *      every period -- measured in the rendered shots, not hypothesised.
 *   3. "Near ground sweeps faster" is a claim about screen SPEED. The forward map
 *      must move a point of height h by scale(h) * dcam, and scale must increase
 *      strictly with h, so adjacent height bands never move backwards relative to
 *      each other.
 *   4. Every sample lands inside [0,1): the shader wraps with fract(), and an
 *      out-of-range value would clamp at the texture edge instead.
 *   5. The vertical lift is RISE*(h-REF)*viewHeight, and it lifts (never sinks)
 *      ground above the reference height.
 *   6. The hardware rule's regex rejects software rasterisers and accepts real GPUs.
 *
 * The GPU side (context, compile, link, draw, fallback) is covered in a real browser
 * by contour-render.test.js.
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
  grabFn('contourParallaxScreen'),
].join('\n')
const TAIL = '\nreturn { contourParallaxUV, contourParallaxScreen, REF: CONTOUR_3D_REF, DEPTH: CONTOUR_3D_DEPTH, RISE: CONTOUR_3D_RISE }'

let api
let flat
let liftOnly
try {
  api = new Function(SOURCE + TAIL)()
  /* The same declarations with BOTH 3D knobs turned off. Depth sets the
     magnification and rise lifts the ground, so "no 3D at all" is both at zero --
     they are separate knobs on purpose (how fast a ridge sweeps is a different
     question from how tall it looks), and the flat view is the state where neither
     applies. */
  flat = new Function(
    SOURCE
      .replace(/const CONTOUR_3D_DEPTH = [^\n]+/, 'const CONTOUR_3D_DEPTH = 0')
      .replace(/const CONTOUR_3D_RISE = [^\n]+/, 'const CONTOUR_3D_RISE = 0')
    + TAIL)()
  /* Depth off, rise on: isolates the vertical lift from the magnification, which
     otherwise mixes into every v comparison. */
  liftOnly = new Function(
    SOURCE.replace(/const CONTOUR_3D_DEPTH = [^\n]+/, 'const CONTOUR_3D_DEPTH = 0')
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
const wrap = (x) => ((x % 1) + 1) % 1

/* ---------- 1. depth 0 + rise 0 is the 2D projection, exactly ---------- */
{
  let worst = 0
  let n = 0
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 25; j++) {
      const px = (i / 39) * VW
      const py = (j / 24) * VH
      const camX = 1234
      const camY = 777
      const h = ((i * 7 + j * 13) % 20) / 19
      const a = flat.contourParallaxUV(px, py, camX, camY, TW, TH, h, VW, VH)
      const wantU = wrap((px - VW / 2 + camX) / TW)
      const wantV = wrap((py - VH / 2 + camY) / TH)
      worst = Math.max(worst, Math.abs(a.u - wantU), Math.abs(a.v - wantV))
      n++
    }
  }
  if (worst <= 1e-12) ok('depth 0 + rise 0 reproduces the flat projection exactly (' + n + ' samples, worst ' + worst.toExponential(1) + ')')
  else fail('depth 0 does not match the flat projection: worst error ' + worst.toExponential(2))
}

/* ---------- 2. exactly periodic in the camera offset (the wrap is seamless) --- */
{
  let worst = 0
  let n = 0
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 16; j++) {
      const px = (i / 23) * VW
      const py = (j / 15) * VH
      const camX = ((i * 311) % TW) - TW / 2
      const camY = ((j * 197) % TH) - TH / 2
      const h = ((i * 5 + j * 3) % 13) / 12
      const a = api.contourParallaxUV(px, py, camX, camY, TW, TH, h, VW, VH)
      const b = api.contourParallaxUV(px, py, camX + TW, camY + TH, TW, TH, h, VW, VH)
      worst = Math.max(worst, Math.abs(a.u - b.u), Math.abs(a.v - b.v))
      n++
    }
  }
  if (worst <= 1e-12) ok('camera + one period reproduces the identical sample (' + n + ' samples, worst ' + worst.toExponential(1) + ') -- the wrap cannot snap')
  else fail('the projection is not periodic in the camera offset: worst ' + worst.toExponential(2) + ' -- the sheet would jump once per period')
}

/* ---------- 3. near ground sweeps faster (screen speed == the scale) ---------- */
{
  const px = VW * 0.5
  const py = VH * 0.4
  const camX = 700
  const camY = 900
  let prev = null
  let monotone = true
  const scales = []
  for (let k = 0; k <= 20; k++) {
    const h = k / 20
    const r = api.contourParallaxUV(px, py, camX, camY, TW, TH, h, VW, VH)
    scales.push(r.scale)
    if (prev !== null && !(r.scale > prev)) monotone = false
    prev = r.scale
  }
  if (monotone) ok('magnification strictly increases with height (' + scales[0].toFixed(3) + ' .. ' + scales[20].toFixed(3) + ')')
  else fail('magnification is not strictly increasing: ' + scales.map((v) => v.toFixed(3)).join(' '))

  /* Speed, measured rather than assumed: move the camera by dcam and see how far
     the SCREEN position of a terrain point travels, at two heights. */
  const dcam = 10
  const tx = TW * 0.31
  const ty = TH * 0.62
  const hi = api.contourParallaxScreen(tx, ty, camX, camY, TW, TH, 1, VW, VH)
  const hi2 = api.contourParallaxScreen(tx, ty, camX + dcam, camY, TW, TH, 1, VW, VH)
  const lo = api.contourParallaxScreen(tx, ty, camX, camY, TW, TH, 0, VW, VH)
  const lo2 = api.contourParallaxScreen(tx, ty, camX + dcam, camY, TW, TH, 0, VW, VH)
  const hiSpeed = Math.abs(hi2.x - hi.x)
  const loSpeed = Math.abs(lo2.x - lo.x)
  const wantRatio = (1 + api.DEPTH * (1 - api.REF)) / (1 + api.DEPTH * (0 - api.REF))
  const gotRatio = hiSpeed / loSpeed
  if (hiSpeed > loSpeed && Math.abs(gotRatio - wantRatio) <= 1e-9) {
    ok('high ground sweeps faster: ' + hiSpeed.toFixed(2) + 'px vs ' + loSpeed.toFixed(2) + 'px per ' + dcam + 'px of camera travel (ratio ' + gotRatio.toFixed(3) + ')')
  } else {
    fail('screen speed does not follow the scale: high ' + hiSpeed.toFixed(3) + ' low ' + loSpeed.toFixed(3) + ' (ratio ' + gotRatio.toFixed(4) + ', expected ' + wantRatio.toFixed(4) + ')')
  }
}

/* ---------- 4. samples always land inside the period ---------- */
{
  let outside = 0
  let n = 0
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 40; j++) {
      const px = -VW + (i / 59) * 3 * VW       // deliberately beyond the frame
      const py = -VH + (j / 39) * 3 * VH
      const camX = ((i * 137) % TW) - TW / 2    // and negative offsets
      const camY = ((j * 311) % TH) - TH / 2
      const h = ((i + j) % 11) / 10
      const r = api.contourParallaxUV(px, py, camX, camY, TW, TH, h, VW, VH)
      if (!(r.u >= 0 && r.u < 1) || !(r.v >= 0 && r.v < 1)) outside++
      n++
    }
  }
  if (outside === 0) ok('all ' + n + ' samples wrap into [0,1) (including negative cameras and off-frame points)')
  else fail(outside + ' of ' + n + ' samples fell outside [0,1) -- the shader would clamp instead of wrap')
}

/* ---------- 5. the vertical lift is RISE*(h-REF)*H, and it lifts ---------- */
{
  const px = VW * 0.3
  const py = VH * 0.6
  const h = 0.9
  const camX = 0
  const camY = 0
  const a = api.contourParallaxUV(px, py, camX, camY, TW, TH, h, VW, VH)
  const lift = api.RISE * (h - api.REF) * VH
  if (Math.abs(a.lift - lift) <= 1e-12) ok('reported lift equals RISE*(h-REF)*viewHeight (' + lift.toFixed(1) + ' px)')
  else fail('reported lift ' + a.lift.toFixed(3) + ' != RISE*(h-REF)*H ' + lift.toFixed(3))

  /* Higher ground must sit HIGHER on screen, which means it is sampled from
     further down the sheet. */
  const hi = liftOnly.contourParallaxUV(px, py, camX, camY, TW, TH, 1, VW, VH)
  const lo = liftOnly.contourParallaxUV(px, py, camX, camY, TW, TH, 0, VW, VH)
  const dv = ((hi.v - lo.v) % 1 + 1) % 1
  const span = api.RISE * VH / TH
  if (Math.abs(dv - span) <= 1e-9) ok('the full height range lifts ground by ' + (api.RISE * VH).toFixed(1) + ' px on screen')
  else fail('full-height lift is ' + dv.toFixed(6) + ' of the period, expected ' + span.toFixed(6))
}

/* ---------- 6. the constants stay in a range the sheet can survive ---------- */
{
  const dep = api.DEPTH
  const rise = api.RISE
  const ref = api.REF
  if (dep > 0 && dep < 0.5) ok('CONTOUR_3D_DEPTH ' + dep + ' keeps magnification inside (' + (1 - dep / 2).toFixed(2) + ' .. ' + (1 + dep / 2).toFixed(2) + ') -- neighbouring bands cannot cross')
  else fail('CONTOUR_3D_DEPTH ' + dep + ' is out of range (0,0.5)')
  if (rise >= 0 && rise <= 0.25) ok('CONTOUR_3D_RISE ' + rise + ' lifts at most a quarter of a viewport height')
  else fail('CONTOUR_3D_RISE ' + rise + ' is out of range [0,0.25]')
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

/* ---------- 8. the shader's plumbing: scale-neutral SS, premultiply, AA ------ */
/* These are SOURCE assertions, and they exist because a rendered comparison caught
   something no arithmetic test could: with the projection fed the RASTER size, the
   supersample factor also magnified the terrain (measured line pitch 22.0px against
   the flat view's 30.0px at SS 1.5 -- i.e. 1.5x denser), which is what put the line
   spacing into the beating range that reads as moire. The invariant is "the
   projection is in logical device px, so SS only adds samples", and the way to pin
   it in a headless run is to assert the code that encodes it. */
{
  const uni = SRC.match(/gl\.uniform2f\(st\.uViewSize, ([^)]*)\)/)
  if (uni === null) fail('u_viewSize uniform not found in client.js')
  else if (/\bwDev\b|\bhDev\b|CONTOUR_3D_SS/.test(uni[1])) {
    fail('u_viewSize is fed the raster size (' + uni[1] + '): the supersample factor would magnify the terrain')
  } else ok('u_viewSize is in logical device px, not the SS raster size (' + uni[1] + ')')

  const vw = SRC.match(/const vW = Math\.max\(1, Math\.round\(([^)]*)\)\)/)
  if (vw === null) fail('vW (logical device width) not found')
  else if (/CONTOUR_3D_SS/.test(vw[1])) fail('vW includes the supersample factor: ' + vw[1])
  else ok('vW is viewport * dpr with no supersample factor (' + vw[1] + ')')

  const ss = SRC.match(/const CONTOUR_3D_SS = ([0-9.]+)/)
  if (ss === null) fail('CONTOUR_3D_SS not found')
  else if (Number(ss[1]) > 1.5) fail('CONTOUR_3D_SS = ' + ss[1] + ' costs more than the footprint filter earns')
  else ok('CONTOUR_3D_SS = ' + ss[1] + ' (footprint filter earns the rest)')

  /* Premultiplied output: writing straight alpha into a premultipliedAlpha context
     drew every stroke at full strength -- measured (253,253,189) against the flat
     path's (220,215,160). The tap helper is where that conversion now lives. */
  if (!/return vec4\(s\.rgb \* s\.a, s\.a\)/.test(SRC)) {
    fail('the fragment shader does not premultiply its colour')
  } else ok('the fragment shader premultiplies (rgb * a) before it writes')

  /* Footprint-aware sampling: the extension, the derivative, and the 4 taps. */
  const hasExt = /#extension GL_OES_standard_derivatives : enable/.test(SRC)
  const hasDf = /dFdx\(uv\)/.test(SRC) && /dFdy\(uv\)/.test(SRC)
  const taps = (SRC.match(/contourSample\(uv \+ vec2/g) || []).length
  if (hasExt && hasDf && taps === 4) ok('footprint filter: extension + dFdx/dFdy + 4 taps')
  else fail('footprint filter incomplete (ext=' + hasExt + ' deriv=' + hasDf + ' taps=' + taps + ')')
  /* ...and it must be optional: the same source has to compile without the
     extension, or a driver without it loses 3D entirely. */
  if (/contourGlFragSource\(false\)/.test(SRC) && /#else[\s\S]{0,80}contourSample\(uv\)/.test(SRC)) {
    ok('the shader has a single-tap fallback for drivers without the extension')
  } else fail('no fallback shader for devices without OES_standard_derivatives')
}

/* ---------- 9. the cavity's second layer ------------------------------------ */
/* A pit in a height field seen from a near-vertical camera is a funnel with more
   contour lines on it -- the rim has nothing to hide. The second layer is what makes
   it read as a HOLE: the near ground stops being drawn where the ray hit the pit
   floor, the ground behind is sampled on its own (much slower) plane, and a void tint
   plus a lit rim say "this is an opening". These assertions pin the three parts that
   are easy to lose in a refactor. */
{
  /* The mask is the terrain height at the point the ray HIT, not the marched
     coordinate: a ray that runs out of steps ends near hh = 0 and would open the
     second layer over every low valley (measured: 14.8% of the screen instead of the
     ~4% that is carved). */
  const mask = SRC.match(/float cover = smoothstep\(u_holeHi - feather, u_holeHi \+ feather, ([^)]*)\)/)
  if (mask === null) fail('the cavity mask is not in the shader')
  else if (mask[1] !== 'sunH' || !/float sunH = surfaceAt\(uv\);/.test(SRC)) {
    fail('the cavity mask does not read the hit point terrain height: ' + mask[0])
  } else ok('cavity mask = terrain height at the hit point, binary threshold at the rim')

  /* The far ground is on its OWN plane, so it sweeps at a different speed. */
  const deep = SRC.match(/vec2 uvDeep = ([^;]*);/)
  if (deep === null) fail('the second layer is not sampled through uvDeep')
  else if (!/u_deepScale/.test(deep[1])) fail('the second layer is not scaled into its own plane: ' + deep[1])
  else ok('second layer has its own plane (u_deepScale)')

  const ds = SRC.match(/const CONTOUR_3D_HOLE_SCALE = ([0-9.]+)/)
  const dep = SRC.match(/const CONTOUR_3D_DEPTH = ([0-9.]+)/)
  const rf = SRC.match(/const CONTOUR_3D_REF = ([0-9.]+)/)
  if (ds === null || dep === null || rf === null) fail('cavity constants not found')
  else {
    /* The slowest the SURFACE ever gets is the deepest point it can reach: scale
       1 + DEPTH*(0 - REF). The far ground must clearly beat that, or the two layers
       drift at the same rate and there is no parallax between them. */
    const floorScale = 1 + Number(dep[1]) * (0 - Number(rf[1]))
    if (!(Number(ds[1]) < floorScale - 0.2)) {
      fail('CONTOUR_3D_HOLE_SCALE ' + ds[1] + ' is not clearly slower than the surface floor ' + floorScale.toFixed(2))
    } else ok('far ground sweeps at ' + ds[1] + 'x vs the surface floor ' + floorScale.toFixed(2) + 'x')
  }

  /* Occlusion must be visible: the near layer has to stop inside the cavity, or the
     pit's own rings cover the far ground completely (that was the first attempt, and
     it rendered as a hill with dense contours). */
  if (!/col = mix\(deep, col, cover\);/.test(SRC)) {
    fail('the near layer is not replaced inside the cavity, so nothing occludes the far ground')
  } else if (/col \*= 1\.0 - 0\.\d+ \* hole;/.test(SRC)) {
    fail('the cavity still blends the two layers instead of replacing one with the other')
  } else ok('the near layer is replaced by the far one inside the cavity (100% transparent)')
  /* NOTHING ADDITIVE. Painting the lip or the void as added colour also paints the
     transparent pixels between the strokes, which on a dark theme renders as a glowing
     oval over the map -- reported from the live app ("这么个圈不突兀吗"). Every
     contribution has to be gated on coverage that already exists. */
  const added = SRC.match(/col \+= (vec4|deep|vec3)\(?[^\n]*/g) || []
  const additive = added.filter((line) => !/\* col\.a|^col \+= deep \* hole/.test(line))
  if (additive.length > 0) {
    fail('additive colour over transparent pixels: ' + additive[0].trim())
  } else if (!/col\.rgb \+= [^\n]*\* lip \* lip \* col\.a;/.test(SRC)) {
    fail('the lit lip does not modulate existing stroke coverage')
  } else if (/col\.rgb \*= 1\.0 - 0\.\d+ \* hole;/.test(SRC)) {
    fail('the old void tint survived: inside a hole the near layer must be GONE, not dimmed')
  } else ok('no additive colour: the lip only brightens existing strokes, the void removes them')

  /* The drawing buffer has to survive a re-composite: the layer is only redrawn when
     the camera moved enough to change a pixel, and without preserveDrawingBuffer a
     page that re-composites in between (expanding a thinking panel) can present an
     EMPTY buffer -- which the user sees as a black flash. */
  const ctxCalls = SRC.match(/getContext\('webgl', \{[^}]*\}/g) || []
  if (ctxCalls.length < 2) fail('expected the probe and the layer contexts, found ' + ctxCalls.length)
  else if (ctxCalls.some((c) => !/preserveDrawingBuffer: true/.test(c))) {
    fail('a WebGL context is created without preserveDrawingBuffer: the last frame can be lost on a re-composite')
  } else ok('both WebGL contexts keep the last frame (preserveDrawingBuffer)')

  /* ...and off in the flat view: the uniform gate is what keeps 2D byte-identical. */
  const gate = SRC.match(/const hasHoles = ([^\n]*)/)
  if (gate === null) fail('the cavity gate is missing in contourGlDraw')
  else if (!/holeLo !== null/.test(gate[1])) fail('the cavity gate does not check for a band: ' + gate[1])
  else if (/uHoleLo/.test(SRC)) fail('the shader still binds u_holeLo, which the binary mask does not use')
  else ok('cavities are gated on the field carrying a band (2D sheet: none)')
}

if (bad) {
  console.error(bad + ' contour 3D check(s) failed')
  process.exit(1)
}
console.log('all contour 3D geometry checks passed')
