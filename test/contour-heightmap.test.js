#!/usr/bin/env node
/**
 * contour-heightmap.test.js — the 3D height map has to close on the sheet's period.
 *
 * The fragment shader samples this map with `texture2D(u_height, fract(uv))`, so texel
 * w-1 and texel 0 are NEIGHBOURS on screen, and the map is not just a texture: the
 * marched hit height sets the magnification and the lift of every pixel. A step at the
 * wrap is therefore a step in the picture, along the whole wrap line.
 *
 * That is exactly what shipped: the downsample binned over the whole buffer (`cols`, not
 * the period `cols-1`) and the box blur clamped at the edges, so the last row/column of
 * texels was computed from a different neighbourhood than the first. Measured on the
 * shipped code, at the frame centre where the wrap sits: every contour jogged 1-3 device
 * px, and the seam metric the earlier rounds used (mean |d alpha| between adjacent
 * columns of the SHEET) could not see it -- the sheet was perfect, the displacement was
 * not. Hence this test works on the map itself and on the property that makes it
 * seamless, not on a threshold.
 *
 *   node test/contour-heightmap.test.js
 *
 * Usage: node test/contour-heightmap.test.js
 */

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8').replace(/\r\n/g, '\n')

let bad = 0
const ok = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); bad++ }

/* The map is a pure function of the field, so it can be sliced out on its own -- no
   generator, no browser, no GPU. */
function grab(name) {
  const at = src.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  let d = 0
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}') {
      d--
      if (d === 0) return src.slice(at, j + 1)
    }
  }
  throw new Error('unbalanced: ' + name)
}
function grabNum(name) {
  const m = src.match(new RegExp('const ' + name + ' = (-?[0-9.]+)'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}

let heightMap = null
try {
  heightMap = new Function(`
${grabNum('CONTOUR_3D_HEIGHT_DIV')}
${grabNum('CONTOUR_3D_HEIGHT_MAX')}
${grab('contourHeightMap')}
return contourHeightMap
`)()
} catch (e) {
  console.error('FAIL  could not slice contourHeightMap out of client.js: ' + e.message)
  process.exit(1)
}

/* A synthetic field that is EXACTLY periodic, so "the map closes" has an exact meaning:
   the surface is a smooth swell plus one bump, sampled at the lattice, with the far row
   and column written as the duplicate the generator writes. */
const STEP = 10
function periodicField(pw, ph) {
  const cols = pw + 1
  const rows = ph + 1
  const F = new Float32Array(cols * rows)
  const at = (x, y) => {
    const u = (2 * Math.PI * (x % pw)) / pw
    const v = (2 * Math.PI * (y % ph)) / ph
    const bump = Math.exp(-((((x % pw) - pw * 0.3) ** 2) / (2 * (pw * 0.09) ** 2)
      + (((y % ph) - ph * 0.7) ** 2) / (2 * (ph * 0.09) ** 2)))
    return 0.6 * Math.sin(u) * Math.cos(v) + 0.35 * Math.sin(2 * u + 0.7) + 0.9 * bump
  }
  let mn = Infinity
  let mx = -Infinity
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = at(x, y)
      F[y * cols + x] = v
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
  }
  /* The duplicate far row/column must be the same samples the wrapped side sees. */
  for (let x = 0; x < cols; x++) F[ph * cols + x] = F[x]
  for (let y = 0; y < rows; y++) F[y * cols + pw] = F[y * cols]
  return {
    cols, rows, step: STEP, tw: pw * STEP, th: ph * STEP,
    F, mn, mx,
  }
}

/* Rotate a periodic field by (dx, dy) CELLS, keeping the duplicate row/column valid. */
function rotateField(f, dx, dy) {
  const { cols, rows, F } = f
  const pw = cols - 1
  const ph = rows - 1
  const out = new Float32Array(cols * rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      out[y * cols + x] = F[((y + dy) % ph) * cols + ((x + dx) % pw)]
    }
  }
  for (let x = 0; x < cols; x++) out[ph * cols + x] = out[x]
  for (let y = 0; y < rows; y++) out[y * cols + pw] = out[y * cols]
  return { ...f, F: out }
}

/* ---------------------------------------------------------------- A. closes ---- */

/* A1. Rotating the terrain by an exact number of BINS must rotate the map by the same
   number of texels -- values AND the 8-bit bytes the GPU actually samples. This is the
   property that "periodic downsample" means; the shipped code failed it because its
   bins were tied to the buffer length, not to the period. */
function closureCase(pw, ph) {
  const f = periodicField(pw, ph)
  const m = heightMap(f)
  const w = m.w
  const h = m.h
  const perBin = pw / w
  if (!Number.isInteger(perBin)) {
    fail('test setup: ' + w + ' bins do not divide the period of ' + pw + ' cells')
    return
  }
  const hPerBin = ph / h
  if (!Number.isInteger(hPerBin)) {
    fail('test setup: ' + h + ' rows do not divide the period of ' + ph + ' cells')
    return
  }
  const M = 3            // bins to rotate by
  const N = 2
  const rot = rotateField(f, M * perBin, N * hPerBin)
  const r = heightMap(rot)
  let worst = 0
  let worstByte = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + M) % w
      const dy = (y + N) % h
      const want = m.values[dy * w + dx]
      worst = Math.max(worst, Math.abs(r.values[y * w + x] - want))
      worstByte = Math.max(worstByte, Math.abs(r.bytes[(y * w + x) * 4] - m.bytes[(dy * w + dx) * 4]))
    }
  }
  const tol = 2e-6
  if (worst <= tol) {
    ok('map ' + w + 'x' + h + ': rotating the terrain by ' + M + ' bins rotates the map exactly (' +
      worst.toExponential(1) + ')')
  } else {
    fail('map ' + w + 'x' + h + ': rotating the terrain by ' + M + ' bins changes the map by ' +
      worst.toExponential(2) + ' (a non-periodic downsample)')
  }
  if (worstByte <= 1) ok('map ' + w + 'x' + h + ': the 8-bit texels agree too (max ' + worstByte + ' LSB)')
  else fail('map ' + w + 'x' + h + ': the 8-bit texels differ by ' + worstByte + ' LSB after a rotation')

  /* A2. And the wrap itself is an ordinary neighbour step: no row may jump more across
     the wrap than it does anywhere inside. This is the assertion a user's eye makes. */
  let worstRowRatio = 0
  for (let y = 0; y < h; y++) {
    const wrap = Math.abs(m.values[y * w] - m.values[y * w + w - 1])
    let inner = 0
    for (let x = 0; x + 1 < w; x++) inner = Math.max(inner, Math.abs(m.values[y * w + x] - m.values[y * w + x + 1]))
    if (inner > 0) worstRowRatio = Math.max(worstRowRatio, wrap / inner)
  }
  if (worstRowRatio <= 1.0001) ok('map ' + w + 'x' + h + ': the wrap is no bigger a step than the row it is in (' +
    worstRowRatio.toFixed(3) + 'x)')
  else fail('map ' + w + 'x' + h + ': the wrap jumps ' + worstRowRatio.toFixed(2) + 'x the worst step inside its own row')
}
closureCase(320, 160)
closureCase(84, 44)

/* ------------------------------------------------------- B. the open sheet ------ */

/* B1. A sheet that does NOT close (only reachable by calling the generator directly)
   must keep the old behaviour byte for byte: the wrap does not exist there, and
   wrapping the blur would invent one. The reference below is the shipped algorithm. */
{
  const pw = 137
  const ph = 91
  const f = periodicField(pw + 1, ph + 1)     // sizes that do not close against tw/th
  f.tw = pw * STEP + 5
  f.th = ph * STEP + 5
  const m = heightMap(f)
  /* Reference: the pre-fix algorithm, run on the same field. */
  const w = Math.max(8, Math.min(192, Math.round(f.cols / 4)))
  const h = Math.max(8, Math.min(192, Math.round(f.rows / 4)))
  const span = (f.mx - f.mn) || 1
  const acc = new Float32Array(w * h)
  const cnt = new Float32Array(w * h)
  for (let y = 0; y < f.rows; y++) {
    const ty = Math.min(h - 1, Math.floor((y * h) / f.rows))
    for (let x = 0; x < f.cols; x++) {
      const tx = Math.min(w - 1, Math.floor((x * w) / f.cols))
      acc[ty * w + tx] += (f.F[y * f.cols + x] - f.mn) / span
      cnt[ty * w + tx]++
    }
  }
  let cur = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) cur[i] = cnt[i] > 0 ? acc[i] / cnt[i] : 0
  const blur = (s2, horizontal) => {
    const out = new Float32Array(s2.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0
        let n = 0
        for (let k = -1; k <= 1; k++) {
          const sx = horizontal ? x + k : x
          const sy = horizontal ? y : y + k
          if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
          sum += s2[sy * w + sx]
          n++
        }
        out[y * w + x] = sum / n
      }
    }
    return out
  }
  for (let p = 0; p < 3; p++) cur = blur(blur(cur, true), false)
  let worst = 0
  if (m.w !== w || m.h !== h) fail('open sheet changed the map size (' + m.w + 'x' + m.h + ' vs ' + w + 'x' + h + ')')
  else {
    for (let i = 0; i < w * h; i++) worst = Math.max(worst, Math.abs(m.values[i] - cur[i]))
    if (worst <= 1e-9) ok('a sheet that does not close keeps the clamped downsample exactly (' + worst.toExponential(1) + ')')
    else fail('a sheet that does not close changed by ' + worst.toExponential(2))
  }
}

if (bad) {
  console.error(bad + ' height map check(s) failed')
  process.exit(1)
}
console.log('all height map checks passed')
