/**
 * settings-020-integration.test.js — the REAL 0.2.0-rc.2 settings stack, wired
 * end to end around the REAL theme client.
 *
 * The 1.5.1 "fix" shipped after a simulation that modelled the wrong service
 * face, and it did nothing. This harness refuses to simulate: it extracts the
 * REAL @deepseek-ai/cordis, @deepseek-ai/cosmokit and the REAL
 * @deepseek-ai/dsh-client-ui-settings client bundle (the ConfigForms /
 * ConfigFormController / describe-mirror code the app actually runs) from the
 * installed app's asar, mounts them on a REAL cordis Context with a fake
 * `remote` transport, then mounts the REAL theme client as a REAL cordis plugin
 * (so the theme sees the same injection-enforcing context proxy the app gives
 * it — reading an undeclared service property throws there).
 *
 * Each scenario runs in its OWN sandbox (fresh window/document/module
 * instances) so nothing leaks between them.
 *
 * Scenario A: settings service mounts BEFORE the theme (the common case).
 *   → served section is READ (radius), a REAL panel toggle WRITES through
 *     ConfigFormController.set → remote.settings.mutate under the ENTRY id.
 * Scenario B: the theme mounts FIRST and the service appears ~600ms later.
 *   → the theme must bind via its ctx.inject hook / retry loop, ADOPT the
 *     served section (panel shows the seeded values) and WRITE.
 *
 * Skips (exit 0) when the app asar cannot be located.
 *
 * Usage: node test/settings-020-integration.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const vm = require('vm')
const Module = require('module')

const ROOT = path.resolve(__dirname, '..')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ----------------------------- asar extraction ---------------------------- */
function locateAsar() {
  const candidates = [
    process.env.DSH_APP_ASAR,
    'D:\\dsh020\\resources\\app.asar',
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'DeepSeek Harness', 'resources', 'app.asar'),
  ].filter(Boolean)
  for (const c of candidates) if (fs.existsSync(c)) return c
  return null
}
function asarRead(asarPath, memberPath) {
  const buf = fs.readFileSync(asarPath)
  const jsonLen = buf.readUInt32LE(12)
  const index = JSON.parse(buf.slice(16, 16 + jsonLen).toString('utf8'))
  const filesOffset = 8 + buf.readUInt32LE(4)
  let node = index
  for (const part of memberPath.split('/').filter(Boolean)) {
    node = node.files && node.files[part]
    if (!node) throw new Error('asar member not found: ' + memberPath)
  }
  if (node.files) throw new Error('asar member is a directory: ' + memberPath)
  return buf.slice(filesOffset + Number(node.offset), filesOffset + Number(node.offset) + node.size)
}

const asar = locateAsar()
if (!asar) {
  console.log('SKIP  DSH app asar not found (set DSH_APP_ASAR); 0.2.0 integration test not run')
  process.exit(0)
}

const P = '/dsh/node_modules/'
const read = (pkg, file) => asarRead(asar, P + pkg + '/' + file).toString('utf8')

/* ------------------- real cordis + cosmokit as importable ESM ------------- */
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-020-int-'))
const nm = path.join(tmpRoot, 'node_modules', '@deepseek-ai')
fs.mkdirSync(path.join(nm, 'cordis', 'lib'), { recursive: true })
fs.mkdirSync(path.join(nm, 'cosmokit', 'lib'), { recursive: true })
fs.writeFileSync(path.join(nm, 'cordis', 'lib', 'index.js'), read('@deepseek-ai/cordis', 'lib/index.js'))
fs.writeFileSync(path.join(nm, 'cordis', 'package.json'), JSON.stringify({ name: '@deepseek-ai/cordis', type: 'module', main: 'lib/index.js' }))
fs.writeFileSync(path.join(nm, 'cosmokit', 'lib', 'index.js'), read('@deepseek-ai/cosmokit', 'lib/index.js'))
fs.writeFileSync(path.join(nm, 'cosmokit', 'package.json'), JSON.stringify({ name: '@deepseek-ai/cosmokit', type: 'module', main: 'lib/index.js' }))

const uiSettingsSrc = read('@deepseek-ai/dsh-client-ui-settings', 'lib/client.js')

/* ------------------------------ fake host half ----------------------------
   The projection semantics below are the REAL @deepseek-ai/dsh-settings
   describe(): a plugin entry is served ONLY when its Config schema yields a
   volatile form, and only volatile fields are projected into the section. The
   form is built with the REAL schemastery (same 3.18.4 the app bundles) so
   form.toJSON() emits the canonical refs-table envelope the browser-side
   rehydrate expects. */
let zReal = null
function volatileForm(schema) {
  if (schema.meta && schema.meta.volatile) return schema
  if (schema.type === 'object') {
    const dict = {}
    for (const [key, child] of Object.entries(schema.dict ?? {})) {
      const field = volatileForm(child)
      if (field !== undefined) dict[key] = field
    }
    return Object.keys(dict).length === 0 ? undefined : zReal.object(dict)
  }
  return undefined
}
function projectForm(schema, value) {
  if (schema.type === 'object' && value !== null && typeof value === 'object') {
    const out = {}
    for (const [key, child] of Object.entries(schema.dict ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = projectForm(child, value[key])
    }
    return out
  }
  return value
}
async function derefConfig(configSchema, raw, cosmokit) {
  const result = configSchema['~standard'].validate(raw)
  const resolved = result && result.value !== undefined ? result.value : raw
  const walk = (v) => {
    if (cosmokit.isVolatile(v)) return walk(v.get())
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out = {}
      for (const [k, x] of Object.entries(v)) out[k] = walk(x)
      return out
    }
    return v
  }
  return walk(resolved)
}

/* ------------------------------ theme + module ---------------------------- */
const INSTALL = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles', 'desktop', 'node_modules', 'dsh-theme-endfield-contour-rework')
const themeSrc = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const requireTheme = Module.createRequire(path.join(INSTALL, 'index.js'))
const themeHost = requireTheme(path.join(INSTALL, 'index.js'))
if (!themeHost.Config) { fail('installed index.js exports no Config (host half stale)'); process.exit(1) }

const ENTRY_NS = 'theme-endfield-contour-rework'
const LEGACY_NS = 'dsh-theme-endfield-contour-rework'
/* Values currently stored in the user's real profile patch (the state 1.5.0/1.5.1
   left behind) — the theme must READ these back through the served section. */
const PATCH_CONFIG = { radius: 'round', contour: '1', contourSpeed: '0', thunder: '1', thunderAnim: '1', loader: '1', contourScrollPause: '0', contourRoughness: '11', contourDensity: '3' }

/* --------------------- one page sandbox per scenario ---------------------- */
function makeSandbox() {
  const factories = {}
  const sandboxRequires = {}
  const classAdds = new Set()
  const classRemoves = new Set()
  const classList = {
    add: (...c) => c.forEach((x) => classAdds.add(x)),
    remove: (...c) => c.forEach((x) => classRemoves.add(x)),
    contains: (c) => classAdds.has(c) && !classRemoves.has(c),
  }
  const noopEl = () => ({
    style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, getAttribute: () => null,
    appendChild() {}, removeChild() {}, insertBefore() {},
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    classList, className: '', parentNode: null, firstChild: null, isConnected: true,
    getContext: () => null, hasAttribute: () => false, appendData() {}, dataset: {},
  })
  const documentStub = {
    body: Object.assign(noopEl(), { classList }),
    documentElement: noopEl(),
    head: noopEl(),
    createElement: () => noopEl(),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    addEventListener() {}, removeEventListener() {},
  }
  const sandbox = {
    window: {
      addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false }), innerWidth: 1440,
      __ModuleLoader__: {
        load(m) {
          factories[m.id] = () => m.factory((spec) => {
            if (sandboxRequires[m.id] && sandboxRequires[m.id][spec]) return sandboxRequires[m.id][spec]
            throw new Error('unmapped require in ' + m.id + ': ' + spec)
          })
        },
      },
    },
    document: documentStub,
    React: makeReact(),
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    performance: { now: () => 0 },
    /* REAL timers: the theme's binder retry and any deferred write must actually
       run, exactly like in the app. */
    setTimeout, clearTimeout, setInterval, clearInterval,
    structuredClone,
    console,
  }
  sandbox.globalThis = sandbox
  sandbox.window.document = documentStub

  vm.createContext(sandbox)
  try { new vm.Script(uiSettingsSrc, { filename: 'ui-settings.client.js' }).runInContext(sandbox) }
  catch (e) { fail('ui-settings bundle threw while loading: ' + e.message); process.exit(1) }
  try { new vm.Script(themeSrc, { filename: 'client.js' }).runInContext(sandbox) }
  catch (e) { fail('theme client.js threw while loading: ' + e.message); process.exit(1) }
  return { factories, sandbox, sandboxRequires, classAdds, classRemoves }
}

/* a faithful snapshot-store shim (the app inlines zustand/immer; only
   getSnapshot/set/update/subscribe are consumed by the extracted code) */
const storeShim = {
  createSnapshotStore(initial) {
    let state = Object.assign({}, initial)
    const listeners = new Set()
    const notify = () => { for (const l of [...listeners]) { try { l() } catch (e) {} } }
    return {
      getSnapshot: () => state,
      set(partial) { state = Object.assign({}, state, partial); notify() },
      update(recipe) {
        const draft = JSON.parse(JSON.stringify(state))
        recipe(draft)
        state = draft
        notify()
      },
      subscribe(l) { listeners.add(l); return () => listeners.delete(l) },
    }
  },
}

const makeReact = () => ({
  useState(init) { return [typeof init === 'function' ? init() : init, () => {}] },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
})
const textOf = (el) => {
  if (el === null || el === undefined || typeof el === 'boolean') return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  return (el.children || []).map(textOf).join('')
}
const walk = (el, out = []) => {
  if (el && typeof el === 'object' && el.type) {
    out.push(el)
    for (const c of el.children || []) walk(c, out)
  }
  return out
}

/* ------------------------- fake host (per scenario) ----------------------- */
async function makeApp(cordis, opts = {}) {
  const cosmokit = await import('file://' + path.join(nm, 'cosmokit', 'lib', 'index.js').replace(/\\/g, '/'))
  const state = { userLayer: {}, mutations: [], revision: 10, lastRaw: undefined, describeCalls: 0 }
  /* opts.hideEntryCalls: answer WITHOUT our namespace for the first N describe
     reads — the stale-mirror race (the browser mirror fetched its view before
     the Host registered the namespace, and nothing invalidates it). */
  const hideEntryCalls = opts.hideEntryCalls || 0
  const fakeRemote = {
    $host: { isLoopback: true },
    $on() { return () => {} },
    settings: {
      async describe() {
        state.revision += 1
        state.describeCalls += 1
        const hide = state.describeCalls <= hideEntryCalls
        const form = volatileForm(themeHost.Config)
        if (form === undefined) return { ok: true, value: { writable: true, hasDocument: true, namespaces: [] } }
        const merged = Object.assign({}, PATCH_CONFIG, state.userLayer)
        const value = projectForm(form, await derefConfig(themeHost.Config, merged, cosmokit))
        const raw = JSON.stringify(value)
        if (raw !== state.lastRaw) { state.revision += 1; state.lastRaw = raw }
        const nsView = (ns) => ({
          autoGenerate: true, ns, schema: form.toJSON(), revision: state.revision,
          applies: 'live', value, base: value, user: Object.assign({}, state.userLayer),
        })
        const list = hide ? [nsView('ui-settings')] : [nsView(ENTRY_NS), nsView('ui-settings')]
        return { ok: true, value: { writable: true, hasDocument: true, namespaces: list } }
      },
      async mutate(ns, ops) {
        state.mutations.push({ ns, ops: JSON.parse(JSON.stringify(ops)) })
        if (ns !== ENTRY_NS) return { ok: false, error: { message: 'no configurable plugin entry "' + ns + '"' } }
        for (const op of ops) if (op.op === 'set' && op.path.length === 1) state.userLayer[op.path[0]] = op.value
        return { ok: true, value: (await this.describe()).value.namespaces.find((v) => v.ns === ns) }
      },
    },
  }
  const root = new cordis.Context()
  root.provide('remote', fakeRemote)
  root.provide('remote.settings', fakeRemote.settings)
  root.provide('theme', { overrideTokens: () => () => {} })
  let rendered = null
  root.provide('slots', {
    inject(_n, fn) { fn() },
    register(_o, render) { rendered = render; return () => {} },
  })
  return { root, state, get rendered() { return rendered } }
}

async function main() {
  /* the ui-settings bundle's require face: REAL cordis extracted from the asar */
  let cordisNS = null
  try { cordisNS = await import('file://' + path.join(nm, 'cordis', 'lib', 'index.js').replace(/\\/g, '/')) }
  catch (e) { fail('could not import extracted cordis: ' + e.message); process.exit(1) }

  /* real schemastery for the fake host's form serialization */
  const profileNM = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles', 'desktop', 'node_modules')
  const smNS = await import('file://' + path.join(profileNM, '@deepseek-ai', 'schemastery', 'lib', 'index.mjs').replace(/\\/g, '/'))
  zReal = smNS.default && smNS.default.object ? smNS.default : smNS

  const thunderButton = (renderedFn) => {
    const buttons = walk(renderedFn()).filter((n) => n.type === 'button')
    return buttons.find((b) => /大字/.test(textOf(b)))
  }
  const thunderLabel = (renderedFn) => {
    const btn = thunderButton(renderedFn)
    return btn ? textOf(btn) : null
  }

  /* ---------------- Scenario A: service BEFORE the theme ---------------- */
  {
    const page = makeSandbox()
    page.sandboxRequires['@deepseek-ai/dsh-client-ui-settings'] = {
      '@deepseek-ai/cordis': cordisNS,
      '@deepseek-ai/dsh-client-store': storeShim,
    }
    const uiExports = page.factories['@deepseek-ai/dsh-client-ui-settings']()
    const themeFactory = page.factories[LEGACY_NS]

    const app = await makeApp(cordisNS)
    try { app.root.plugin(uiExports) } catch (e) { fail('A: ui-settings plugin threw: ' + e.message); process.exit(1) }
    await sleep(150)
    if (typeof app.root.get('configForms') === 'undefined') { fail('A: configForms service not provided by the real ui-settings bundle'); process.exit(1) }
    pass('A: real ui-settings bundle provided the configForms service on a real cordis context')

    try { app.root.plugin(themeFactory()) } catch (e) { fail('A: theme plugin threw: ' + e.message); process.exit(1) }
    await sleep(250)
    if (page.classAdds.has('theme-endfield-round')) pass('A: host section radius=round reached the page (body class applied)')
    else fail('A: host section radius=round did NOT reach the page; classAdds=' + JSON.stringify([...page.classAdds]))

    const btn = thunderButton(app.rendered)
    if (!btn) { fail('A: no thunder toggle button rendered'); process.exit(1) }
    btn.props.onClick()
    await sleep(200)
    if (app.state.mutations.some((m) => m.ns === ENTRY_NS)) pass('A: panel toggle reached remote.settings.mutate under the ENTRY id')
    else fail('A: panel toggle never reached remote.settings.mutate; mutations=' + JSON.stringify(app.state.mutations))
    if (app.state.userLayer.thunder !== undefined) pass('A: host user layer received thunder=' + app.state.userLayer.thunder)
    else fail('A: host user layer did not receive a thunder write')

    const legacyScope = app.root.get('configForms').get(LEGACY_NS)
    if (legacyScope && typeof legacyScope.getSnapshot === 'function') pass('A: legacy package-name namespace still bindable (0.1.x face preserved)')
    else fail('A: legacy namespace face missing')
  }

  /* ------------- Scenario B: theme FIRST, service 600ms later ------------- */
  {
    const page = makeSandbox()
    page.sandboxRequires['@deepseek-ai/dsh-client-ui-settings'] = {
      '@deepseek-ai/cordis': cordisNS,
      '@deepseek-ai/dsh-client-store': storeShim,
    }
    const uiExports = page.factories['@deepseek-ai/dsh-client-ui-settings']()
    const themeFactory = page.factories[LEGACY_NS]

    const app = await makeApp(cordisNS)
    try { app.root.plugin(themeFactory()) } catch (e) { fail('B: theme plugin threw: ' + e.message); process.exit(1) }
    await sleep(300)
    if (thunderLabel(app.rendered) === null) { fail('B: panel did not render at all'); process.exit(1) }
    if (thunderLabel(app.rendered) === '关闭大字') fail('B: served values visible BEFORE the service existed (impossible)')
    else pass('B: theme running on defaults while the settings service is absent')

    try { app.root.plugin(uiExports) } catch (e) { fail('B: ui-settings plugin threw: ' + e.message); process.exit(1) }

    /* the theme must bind the late-provided service, ADOPT the served section
       (the panel flips to the seeded values) and then WRITE under the ENTRY id */
    let adopted = false
    for (let i = 0; i < 20; i++) {
      await sleep(250)
      if (thunderLabel(app.rendered) === '关闭大字') { adopted = true; break }
    }
    if (adopted) pass('B: theme bound the LATE-provided service and adopted the served section')
    else fail('B: theme never adopted the served section after the service appeared')

    const btn = thunderButton(app.rendered)
    if (btn) {
      btn.props.onClick()
      await sleep(200)
      if (app.state.mutations.some((m) => m.ns === ENTRY_NS)) pass('B: post-recovery toggle writes under the ENTRY id')
      else fail('B: post-recovery toggle never reached mutate; mutations=' + JSON.stringify(app.state.mutations))
    } else fail('B: no thunder toggle button rendered after recovery')
  }

  /* ---------- Scenario C: STALE MIRROR (the app's status=unbound) ----------
     The mirror's first describe happened before the Host served our namespace
     and nothing invalidates it: both scopes sit at loading/unavailable with no
     ready scope. The theme's convergence nudge (mirror.load()) must recover it
     WITHOUT any external event, then adopt and write like scenario A. */
  {
    const page = makeSandbox()
    page.sandboxRequires['@deepseek-ai/dsh-client-ui-settings'] = {
      '@deepseek-ai/cordis': cordisNS,
      '@deepseek-ai/dsh-client-store': storeShim,
    }
    const uiExports = page.factories['@deepseek-ai/dsh-client-ui-settings']()
    const themeFactory = page.factories[LEGACY_NS]

    const app = await makeApp(cordisNS, { hideEntryCalls: 1 })
    try { app.root.plugin(uiExports) } catch (e) { fail('C: ui-settings plugin threw: ' + e.message); process.exit(1) }
    await sleep(150) // the mirror now holds a view WITHOUT our namespace
    try { app.root.plugin(themeFactory()) } catch (e) { fail('C: theme plugin threw: ' + e.message); process.exit(1) }
    await sleep(300)
    if (thunderLabel(app.rendered) === '关闭大字') fail('C: served values visible before the entry was ever served (impossible)')
    else pass('C: stale mirror reproduced — theme bound with no ready scope')

    let recovered = false
    for (let i = 0; i < 24; i++) {
      await sleep(250)
      if (thunderLabel(app.rendered) === '关闭大字') { recovered = true; break }
    }
    if (recovered) pass('C: convergence nudge re-read the Host and the theme adopted the section')
    else fail('C: stale mirror never recovered; describeCalls=' + app.state.describeCalls)

    const btn = thunderButton(app.rendered)
    if (btn) {
      btn.props.onClick()
      await sleep(200)
      if (app.state.mutations.some((m) => m.ns === ENTRY_NS)) pass('C: post-recovery toggle writes under the ENTRY id')
      else fail('C: post-recovery toggle never reached mutate; mutations=' + JSON.stringify(app.state.mutations))
    } else fail('C: no thunder toggle button rendered after recovery')
  }

  console.log('')
  if (failures) { console.error(failures + ' settings 0.2.0 integration check(s) FAILED'); process.exit(1) }
  console.log('all settings 0.2.0 integration checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => { console.error('FAIL  harness crashed: ' + (e && e.stack || e)); process.exit(1) })
