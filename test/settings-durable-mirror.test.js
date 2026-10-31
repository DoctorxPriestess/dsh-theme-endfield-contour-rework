/**
 * settings-durable-mirror.test.js — the theme-owned mirror that keeps a setting
 * alive when the DSH settings transport never becomes writable.
 *
 * Reported bug: "我每次重启都不是默认视差模式，而是平面". The contour view was
 * written through the settings namespace and reverted on every launch, while older
 * settings (written when the transport did work) stayed. Two independent defects
 * could produce that, and both are pinned here:
 *
 *   1. the frame watchdog PERSISTED its page-local downgrades (the 3D view, and
 *      later the animation switch), so one busy stretch rewrote the user's
 *      preferences for every later launch;
 *   2. a namespace field whose host value is the shipped default is
 *      indistinguishable from "this write was dropped", so the client needs a
 *      durable store of its own to fall back to.
 *
 * The precedence is a pure function (prefsResolveField) exactly so it can be
 * pinned here; the "shed must not persist" rule is asserted on the source of
 * contourShedLoad, because it is the ABSENCE of a prefsSet call that matters.
 */
const fs = require('fs')
const path = require('path')

let pass = 0
let fail = 0
const ok = (m) => { pass++; console.log('ok    ' + m) }
const bad = (m) => { fail++; console.error('FAIL  ' + m) }
const check = (m, cond, detail) => (cond ? ok(m + (detail ? '  (' + detail + ')' : '')) : bad(m + '  -> ' + detail))

const ROOT = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

/* Slice a balanced-brace block starting at a `const NAME = ...` / `function NAME`
   header: the tests must run the SHIPPED expression, not a copy of it. */
function grab(name) {
  const at = SRC.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('could not find const ' + name)
  const open = SRC.indexOf('(', at)
  const start = SRC.indexOf('{', at)
  const arrow = SRC.indexOf('=>', at)
  const from = arrow >= 0 && (start < 0 || arrow < start) ? arrow : (open >= 0 ? open : start)
  let i = from
  let depth = 0
  let seen = false
  for (; i < SRC.length; i++) {
    const c = SRC[i]
    if (c === '(' || c === '{') { depth++; seen = true } else if (c === ')' || c === '}') {
      depth--
      if (seen && depth === 0) { i++; break }
    }
  }
  return SRC.slice(at, i)
}

/* ---------- 1. the precedence, as shipped ---------- */
{
  const body = grab('prefsResolveField')
  // eslint-disable-next-line no-new-func
  const prefsResolveField = new Function(body + '\nreturn prefsResolveField')()
  /* The reported failure this rule exists for: the namespace still held the OLD
     roughness stop (10) because its writes stopped landing, while the mirror held the
     one just chosen (11). The stale non-default host value used to win. */
  check('the mirror wins over a stale non-default host value',
    prefsResolveField('10', '7', '11') === '11', prefsResolveField('10', '7', '11'))
  check('the mirror wins even when the host disagrees on a switch',
    prefsResolveField('1', '0', '0') === '0', prefsResolveField('1', '0', '0'))
  check('the mirror supplies a value the host never had',
    prefsResolveField(undefined, '0', '1') === '1', prefsResolveField(undefined, '0', '1'))
  check('without a mirror the host value stands',
    prefsResolveField('2', '0', undefined) === '2', prefsResolveField('2', '0', undefined))
  check('with neither store the shipped default stands',
    prefsResolveField(undefined, '0', undefined) === '0', prefsResolveField(undefined, '0', undefined))
  check('mirror values are read back as stored strings',
    prefsResolveField(undefined, '0', 1) === '1', prefsResolveField(undefined, '0', 1))
}

/* ---------- 2. the shed is page-local and never persisted ---------- */
{
  /* grab() balances braces, so this covers the WHOLE function.  The old slice
     stopped at the first "\n    }" (the end of the 3D branch), which is exactly
     how the animation branch kept its prefsSet while this test stayed green. */
  const seg = grab('contourShedLoad')
  check('contourShedLoad exists', seg.length > 0)
  check('the shed no longer writes the view preference', seg.indexOf('prefsSet(CONTOUR_VIEW_KEY') < 0,
    seg.indexOf('prefsSet(CONTOUR_VIEW_KEY') < 0 ? 'no prefsSet(CONTOUR_VIEW_KEY...)' : 'STILL PERSISTS THE VIEW')
  check('the shed no longer writes the animation preference', seg.indexOf('prefsSet(CONTOUR_ANIM_KEY') < 0,
    seg.indexOf('prefsSet(CONTOUR_ANIM_KEY') < 0 ? 'no prefsSet(CONTOUR_ANIM_KEY...)' : 'STILL PERSISTS THE ANIMATION')
  check('the shed sets the page-local flag instead', /contourViewShed = true/.test(seg))
  check('the shed still reconciles the layer', /contourApplySwitches\(\)/.test(seg))
  check('isContourView3D honours the page-local shed',
    /const isContourView3D = \(\) => !contourViewShed && prefsGet\(CONTOUR_VIEW_KEY\) === '1'/.test(SRC))
  check('a manual pick clears the shed',
    /contourViewShed = false\n\s*prefsSet\(CONTOUR_VIEW_KEY/.test(SRC))
  const watch = grab('contourWatchFrame')
  check('the watchdog only tracks the 3D path', /!isContourView3D\(\)/.test(watch) && watch.indexOf('prefsSet') < 0)
}

/* ---------- 3. every write is mirrored, and the mirror is loaded at boot ---------- */
{
  const setAt = SRC.indexOf('const prefsSet = (rawKey, encoded) => {')
  const setBody = SRC.slice(setAt, SRC.indexOf('\n    }', setAt) + 6)
  check('prefsSet mirrors the value to the theme file store', /prefsMirrorSave\(field/.test(setBody))
  check('boot loads the mirror next to the transport bind', /rebindPrefs\(0\)[\s\S]{0,400}?prefsMirrorLoad\(\)/.test(SRC))
  check('the mirror route is the host half\'s', SRC.indexOf("'/api/theme-endfield-contour-rework'") > 0)
}

/* ---------- 4. the host half really persists (file round-trip) ---------- */
{
  const mod = require(path.join(ROOT, 'index.js'))
  const S = mod.__settingsMirror
  const os = require('node:os')
  const tmp = path.join(os.tmpdir(), 'endfield-mirror-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json')
  check('the host exposes the mirror helpers', !!S && typeof S.mirrorWrite === 'function')
  check('the route is declared', mod.SETTINGS_ROUTE === '/api/theme-endfield-contour-rework', mod.SETTINGS_ROUTE)
  check('a missing file reads as an empty object', JSON.stringify(S.mirrorRead(tmp)) === '{}', JSON.stringify(S.mirrorRead(tmp)))
  S.mirrorWrite({ contourView: '1' }, tmp)
  check('the value survives a round-trip', S.mirrorRead(tmp).contourView === '1', JSON.stringify(S.mirrorRead(tmp)))
  S.mirrorWrite({ contourSpeed: '3' }, tmp)
  const after = S.mirrorRead(tmp)
  check('a second write merges instead of replacing', after.contourView === '1' && after.contourSpeed === '3',
    JSON.stringify(after))
  check('undeclared and non-string fields are refused',
    JSON.stringify(S.mirrorFilter({ bogus: '1', nope: 2, contour: '2' })) === '{"contour":"2"}',
    JSON.stringify(S.mirrorFilter({ bogus: '1', nope: 2, contour: '2' })))
  check('the file is written atomically (no .tmp left behind)', fs.existsSync(tmp) && !fs.existsSync(tmp + '.tmp'))
  const declared = new Set(Object.keys(mod.FIELD_DEFAULTS))
  check('every mirrorable field is a declared schema field',
    Object.keys(S.mirrorFilter(Object.fromEntries(Array.from(declared).map((k) => [k, 'x'])))).every((k) => declared.has(k)))
  try { fs.unlinkSync(tmp) } catch (e) { /* already gone */ }
}

function report() {
  console.log('')
  if (fail > 0) {
    console.error(fail + ' durable-mirror check(s) failed')
    process.exit(1)
  }
  console.log('all ' + pass + ' durable-mirror checks passed')
}

/* ---------- 5. the route really gets mounted, even when the server arrives late ----------
   The bug that made the whole mirror dead on arrival: `ctx.inject(['webServer'], cb)`
   mounted from the OUTER ctx, but a service only lands on the context that injects it,
   so the probe found nothing, the route was never registered, and every client write
   went nowhere. Measured on the live app while that build was running:
   /api/plugin-updates/status answered 200, /api/theme-endfield-contour-rework answered
   401 (the SPA fallback). This block drives the real handler through a fake server. */
;(async () => {
  const mod = require(path.join(ROOT, 'index.js'))
  const S = mod.__settingsMirror
  const os = require('node:os')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-home-'))
  const envBackup = process.env.DSH_HOME
  process.env.DSH_HOME = home // mirrorPath() resolves through this at call time

  const routes = []
  const server = { register: (route) => { routes.push(route); return () => {} } }
  const child = {
    get: (n) => (n === 'webServer' ? server : undefined),
    webServer: server,
    effect: (fn) => fn(),
  }
  const outer = {
    get: () => undefined,
    effect: (fn) => fn(),
    inject: (names, cb) => cb(child),
  }

  const makeRes = () => {
    const out = { status: 0, body: '', writeHead(s) { out.status = s }, end(t) { out.body = t; out.done = true } }
    return out
  }
  const makeReq = (method, payload, origin) => {
    const handlers = {}
    return {
      method,
      headers: { host: '127.0.0.1:1234', origin: origin === undefined ? 'http://127.0.0.1:1234' : origin },
      on(name, cb) {
        handlers[name] = cb
        /* Deliver in stream order once the handler has subscribed: data first, then
           end. Pushing before the handler attaches listeners would be dropped. */
        if (name === 'data' && payload !== undefined) setTimeout(() => cb(Buffer.from(payload)), 0)
        if (name === 'end') setTimeout(() => cb(), 1)
        return this
      },
      destroy() {},
      push() { /* payload is delivered by on('data') above */ },
    }
  }
  const call = (handler, req, res) => Promise.resolve(handler(req, res)).then(() => res)

  try {
    S.mountSettingsMirror.done = false
    S.mountSettingsMirror(outer)
    check('the route is registered from the injected child context', routes.length === 1, routes.length + ' registration(s)')
    check('the route is ours and prefix-mounted',
      !!routes[0] && routes[0].kind === 'prefix' && routes[0].path === '/api/theme-endfield-contour-rework',
      routes[0] ? routes[0].kind + ' ' + routes[0].path : 'none')

    if (routes.length !== 1) throw new Error('nothing to drive: the route was not registered')
    const handler = routes[0].handler

    const getRes = await call(handler, makeReq('GET'), makeRes())
    let parsed = null
    try { parsed = JSON.parse(getRes.body) } catch (e) { parsed = null }
    check('GET answers ok with a value object',
      getRes.status === 200 && !!parsed && parsed.ok === true && parsed.value && typeof parsed.value === 'object',
      getRes.status + ' ' + String(getRes.body).slice(0, 70))
    check('GET reports the file it uses', parsed && typeof parsed.path === 'string' && parsed.path.indexOf(home) === 0,
      parsed ? String(parsed.path) : 'none')

    const postReq = makeReq('POST', JSON.stringify({ contourView: '1', bogus: 'x' }))
    postReq.push()
    const postRes = await call(handler, postReq, makeRes())
    let posted = null
    try { posted = JSON.parse(postRes.body) } catch (e) { posted = null }
    check('POST is accepted', postRes.status === 200 && !!posted && posted.ok === true, postRes.status)
    check('POST stores the declared field and drops the rest',
      !!posted && posted.wrote && posted.wrote.contourView === '1' && posted.wrote.bogus === undefined,
      posted ? JSON.stringify(posted.wrote) : 'none')
    const file = path.join(home, 'theme-endfield-contour-rework', 'settings.json')
    check('the write really landed in the file', fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).contourView === '1',
      fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').trim() : 'no file')

    const get2 = await call(handler, makeReq('GET'), makeRes())
    let again = null
    try { again = JSON.parse(get2.body) } catch (e) { again = null }
    check('a later GET reads the value back (the restart path)', !!again && again.value && again.value.contourView === '1',
      again ? JSON.stringify(again.value) : 'none')

    const crossReq = makeReq('POST', JSON.stringify({ contourView: '0' }), 'http://evil.example')
    crossReq.push()
    const crossRes = await call(handler, crossReq, makeRes())
    check('a cross-origin POST is refused', crossRes.status === 403, crossRes.status)

    const badRes = await call(handler, makeReq('DELETE'), makeRes())
    check('an unsupported method is refused', badRes.status === 405, badRes.status)
  } catch (e) {
    bad('route probe threw: ' + String(e && e.message || e))
  } finally {
    if (envBackup === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = envBackup
    try { fs.rmSync(home, { recursive: true, force: true }) } catch (e) { /* temp */ }
    report()
  }
})()
