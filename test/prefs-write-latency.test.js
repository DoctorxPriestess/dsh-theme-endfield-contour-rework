/**
 * prefs-write-latency.test.js — prove a setting written this tick is READABLE
 * this tick, so no control needs a second click.
 *
 * Why this exists (a real, user-reported defect). The theme reads its settings
 * through the DSH `settingsScope`, whose `set()` is ASYNCHRONOUS: the served
 * section only changes when the host round-trip comes back. `prefsGet` prefers
 * that served section over the page-local copy, so a handler that wrote a value
 * and then immediately re-read it saw the value from BEFORE the click:
 *
 *   - 「等高线密度」-> contourRetune() re-extracted with the OLD level count;
 *   - 「地形粗糙度」-> the debounced rebuild read the OLD stop;
 *   - 「滚动方向 / 速度」-> contourRefreshMotion() cached the OLD vector.
 *
 * The user-visible symptom is "切换挡位需要点击两次, 第一次点击后不刷新" — the
 * second click applies the first one's value. It survived the whole existing
 * suite because every fixture applied writes SYNCHRONOUSLY, i.e. the mocks were
 * more forgiving than production.
 *
 * This test therefore runs the REAL preference layer (sliced out of client.js)
 * against a scope whose set() defers the served section to an explicit flush(),
 * and asserts the ordering contract directly:
 *   write -> prefsGet returns the NEW value immediately (overlay)
 *   flush -> the overlay is dropped, the served section is the single truth
 *   and a value the host never confirms keeps working page-locally.
 *
 * Usage: node test/prefs-write-latency.test.js
 */
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { settingsScopeStub } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'))

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8').replace(/\r\n/g, '\n')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* The preference layer is one contiguous region: from the namespace declaration to
   the row of DOM helpers that follows it. Both markers must be present, so a
   structural change fails loudly here instead of silently testing nothing. */
const START = src.indexOf("const PREFS_NS = '")
const END = src.indexOf('const RADIUS_KEY = ')
if (START < 0 || END < 0 || END <= START) {
  console.error('FAIL  could not locate the preference layer in client.js')
  process.exit(1)
}
const block = src.slice(START, END)

/** Load the real prefs layer over a scope stub and expose its internals. */
function load (scopeStub) {
  const timers = []
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length },
    clearTimeout: () => {},
    ctx: {
      effect: () => {},
      get: (name) => (name === 'settingsScope' ? scopeStub.binder : undefined),
    },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(block
    + '\nglobalThis.__api = { prefsGet, prefsSet, prefsFieldOf, PREFS_NS, PREFS_FIELD_DEFAULTS,'
    + ' written: () => prefsWritten, section: () => prefsFieldValue, emit: () => prefsEmit() };\n', sandbox)
  return { api: sandbox.__api, timers }
}

const DENSITY = 'contour-density'
const ROUGH = 'contour-roughness'

/* ---------- 1. the deferred fixture really is asynchronous ---------- */
const store = settingsScopeStub({}, { deferWrites: true })
const { api } = load(store)
const ns = api.PREFS_NS
if (api.prefsFieldOf(ns + '-' + DENSITY) === 'contourDensity' && api.prefsFieldOf(ns + '-' + ROUGH) === 'contourRoughness') {
  pass('the real key -> field mapping resolves both hyphenated settings')
} else {
  fail('key -> field mapping broke for ' + DENSITY + ' / ' + ROUGH)
}
if (api.prefsGet(ns + '-' + DENSITY) === '1') pass('reads start from the schema default (density index 1)')
else fail('expected the density default "1", got ' + JSON.stringify(api.prefsGet(ns + '-' + DENSITY)))

/* ---------- 2. write -> read in the SAME tick ---------- */
api.prefsSet(ns + '-' + DENSITY, '3')
if (api.prefsGet(ns + '-' + DENSITY) === '3') {
  pass('a write is readable by the very next read, before the transport echoes it')
} else {
  fail('write-then-read returned ' + JSON.stringify(api.prefsGet(ns + '-' + DENSITY))
    + ' — the control would need a second click (the reported defect)')
}
if (store.section.contourDensity !== '3' && store.pending().length === 1) {
  pass('the fixture really deferred the write (served section still "' + store.section.contourDensity + '")')
} else {
  fail('the deferred fixture applied the write eagerly; this test would not cover the defect')
}

/* Every engine read goes through the same accessor, so the settings the handlers
   consult right after a click must already be the new ones. */
api.prefsSet(ns + '-' + ROUGH, '11')
if (api.prefsGet(ns + '-' + ROUGH) === '11') pass('the roughness slider reads back its own stop immediately')
else fail('roughness write-then-read returned ' + JSON.stringify(api.prefsGet(ns + '-' + ROUGH)))

/* ---------- 3. the echo retires the overlay ---------- */
store.flush()
if (store.section.contourDensity === '3' && api.prefsGet(ns + '-' + DENSITY) === '3') {
  pass('after the transport echo the served section is the single source of truth')
} else {
  fail('after flush the served section/value disagree: section=' + store.section.contourDensity
    + ' read=' + api.prefsGet(ns + '-' + DENSITY))
}
if (api.written().size === 0) pass('the write-through overlay is empty once every echo has landed')
else fail('overlay still holds ' + api.written().size + ' field(s) after the echo: ' + Array.from(api.written().keys()).join(', '))

/* A value the host never confirms must not be lost from the page's own view: the
   namespace may simply not be served in this profile yet. */
api.prefsSet(ns + '-' + ROUGH, '3')
if (api.prefsGet(ns + '-' + ROUGH) === '3') {
  pass('an unconfirmed write keeps working page-locally (no silent revert)')
} else {
  fail('an unconfirmed write reverted to ' + JSON.stringify(api.prefsGet(ns + '-' + ROUGH)))
}

/* ---------- 4. the synchronous path is unchanged ---------- */
const syncStore = settingsScopeStub({}, {})
const second = load(syncStore)
second.api.prefsSet(ns + '-' + DENSITY, '2')
if (second.api.prefsGet(ns + '-' + DENSITY) === '2' && syncStore.section.contourDensity === '2') {
  pass('with a synchronous scope the write still lands in the served section at once')
} else {
  fail('synchronous scope path regressed: section=' + syncStore.section.contourDensity
    + ' read=' + second.api.prefsGet(ns + '-' + DENSITY))
}
/* And a settings-row style toggle (enabled is a default-ON switch read as !== '0')
   must keep its polarity through the overlay. */
second.api.prefsSet(ns + '-enabled', '0')
if (second.api.prefsGet(ns + '-enabled') === '0') pass('overlay preserves the stored-string polarity of a switch')
else fail('enabled wrote "0" but reads back ' + JSON.stringify(second.api.prefsGet(ns + '-enabled')))

console.log('')
if (failures) { console.error(failures + ' write-latency check(s) failed'); process.exit(1) }
console.log('all preference write-latency checks passed')
