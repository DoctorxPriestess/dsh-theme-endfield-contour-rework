/**
 * host-config-resolution.test.js — regression test for the DSH 0.2.0-rc.2
 * desktop host half, where the theme's settings namespace was never served.
 *
 * Observed on the real app (host probe, 1.5.2 dev build):
 *
 *   our entry: fiber.state = 2 (ACTIVE), runtimeIsNull = false,
 *              runtime.Config = undefined          → describe() skips the entry
 *   settings.describe() namespaces: ... does not contain
 *              "theme-endfield-contour-rework"
 *
 * The Host loads plugin entries through its own internal importer (node
 * v24.18.1 there, while the profile's runtime is v24.21.0). Inside that wrapper
 * this module's `require` is not usable, so the old loadSchemastery() returned
 * undefined, `Config` was never exported and the browser could never read or
 * write the settings. This test drives index.js with NO `require` in scope —
 * the only way that failure can be reproduced off-device — and requires the
 * Module._load / search-base / absolute-root strategies to recover a builder.
 *
 * Usage: node test/host-config-resolution.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const vm = require('vm')
const Module = require('module')

const ROOT = path.resolve(__dirname, '..')
const INDEX = path.join(ROOT, 'index.js')
const SRC = fs.readFileSync(INDEX, 'utf8')

let failures = 0
const check = (label, fn) => {
  try { fn(); console.log('ok    ' + label) }
  catch (e) { failures++; console.error('FAIL  ' + label + ' — ' + e.message) }
}

/** Evaluate index.js exactly like a CJS module, minus `require`. */
function loadAsHostModule(env, requireImpl) {
  const m = new Module(INDEX, null)
  m.filename = INDEX
  m.paths = Module._nodeModulePaths(path.dirname(INDEX))
  const fn = vm.runInThisContext(
    '(function (module, exports, require, __filename, __dirname, process, console, setTimeout, clearTimeout, setInterval, Buffer) {'
    + SRC + '\n})',
    { filename: INDEX },
  )
  const previous = process.env.DSH_HOME
  if (env && env.DSH_HOME !== undefined) process.env.DSH_HOME = env.DSH_HOME
  try {
    fn(m, m.exports, requireImpl, INDEX, path.dirname(INDEX), process, console, setTimeout, clearTimeout, setInterval, Buffer)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
  return m.exports
}

/** A schemastery-shaped stub, placed where the DSH_HOME scan must find it. */
function writeStubSchemastery(home) {
  const dir = path.join(home, 'profiles', 'desktop', 'node_modules', '@deepseek-ai', 'schemastery')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/schemastery', version: '0.0.0-host-resolution-test', main: 'index.js',
  }))
  fs.writeFileSync(path.join(dir, 'index.js'), [
    "'use strict';",
    'function field(fallback) {',
    '  const node = { type: "string", meta: { default: fallback } };',
    '  node.toJSON = () => ({ type: "string", meta: node.meta });',
    '  node.default = (v) => { node.meta.default = v; return node };',
    '  node.volatile = () => { node.meta.volatile = true; return node };',
    '  return node;',
    '}',
    'module.exports = {',
    '  string: () => field(undefined),',
    '  object: (dict) => ({ type: "object", dict, meta: {}, toJSON: () => ({ type: "object" }) }),',
    '};',
  ].join('\n'))
  return dir
}

/* 1) the exact failure mode: no `require` anywhere in the module scope. */
check('host module without `require` still gets a non-undefined Config', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-hostres-'))
  writeStubSchemastery(home)
  const exported = loadAsHostModule({ DSH_HOME: home })
  const trace = exported.__schemaResolution
  assert.strictEqual(typeof exported.apply, 'function', 'apply export missing')
  assert.strictEqual(trace.host.loader, 'Module._load', 'must fall back to Module._load, got ' + trace.host.loader)
  assert.ok(trace.attempts.length > 0, 'resolution trace is empty')
  assert.ok(trace.attempts.some((a) => a.indexOf('ok') >= 0), 'no strategy succeeded: ' + JSON.stringify(trace.attempts))
  assert.notStrictEqual(exported.Config, undefined, 'Config is undefined — the settings namespace would never be served')
  assert.strictEqual(typeof exported.Config.toJSON, 'function', 'Config must expose toJSON for the settings service')
})

/* 2) the declaration the settings service actually depends on: every field has
   to be volatile, otherwise describe() skips the entry even with a schema. */
check('every declared field is volatile (describe() requires it)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-hostres-'))
  writeStubSchemastery(home)
  const exported = loadAsHostModule({ DSH_HOME: home })
  const dict = exported.Config.dict || {}
  const names = Object.keys(dict)
  assert.strictEqual(names.length, Object.keys(exported.FIELD_DEFAULTS).length,
    'schema field count must equal FIELD_DEFAULTS')
  const lazy = names.filter((n) => !(dict[n].meta && dict[n].meta.volatile))
  assert.deepStrictEqual(lazy, [], 'non-volatile fields would be dropped by describe()')
})

/* 3) no schemastery anywhere: degrade to a no-op instead of throwing. */
check('a host with no schemastery at all degrades without throwing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-hostres-empty-'))
  const exported = loadAsHostModule({ DSH_HOME: home })
  assert.strictEqual(typeof exported.apply, 'function', 'apply must still be exported')
  assert.ok(exported.__schemaResolution.attempts.length > 0, 'the trace must record the failures')
})

/* 4) sanity: under a plain require the schema still resolves (the fast path
   when the profile supplies schemastery, otherwise a recorded fallback — the
   dev checkout itself has no schemastery of its own). */
check('a plainly required module still builds the Config schema', () => {
  const exported = require(INDEX)
  assert.notStrictEqual(exported.Config, undefined, 'Config missing under a plain require')
  const trace = exported.__schemaResolution
  assert.ok(trace.attempts.length > 0, 'resolution trace is empty')
  assert.ok(trace.attempts.some((a) => a.indexOf('ok') >= 0), 'no strategy succeeded: ' + JSON.stringify(trace.attempts))
  assert.strictEqual(Object.keys(exported.Config.dict || {}).length, Object.keys(exported.FIELD_DEFAULTS).length,
    'every FIELD_DEFAULTS entry must reach the schema')
})

/* 5) the exact error the Host produced: the first require of the schema
   builder meets its ESM dependency mid-evaluation ("Cannot require() ES Module
   …cosmokit/lib/index.js because it is not yet fully loaded") and the SAME
   require succeeds on the retry. Config must survive it. */
check('a re-entrant "not yet fully loaded" failure is retried, not fatal', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-hostres-'))
  const stubDir = writeStubSchemastery(home)
  const stub = { string: undefined, object: undefined }
  // Use the stub package as the schema builder, but make its first require fail
  // exactly like the Host's re-entrant attempt.
  let schemaCalls = 0
  const fakeRequire = (id) => {
    if (id === '@deepseek-ai/schemastery') {
      schemaCalls += 1
      if (schemaCalls === 1) {
        throw new Error('Cannot require() ES Module C:\\…\\@deepseek-ai\\cosmokit\\lib\\index.js because it is not yet fully loaded.')
      }
      return schemaCalls === 2 ? require(path.join(stubDir, 'index.js')) : stub
    }
    if (id === 'schemastery') throw new Error("Cannot find module 'schemastery'")
    return require(id)
  }
  const exported = loadAsHostModule({ DSH_HOME: home }, fakeRequire)
  const trace = exported.__schemaResolution.attempts
  assert.ok(trace.some((a) => a.indexOf('not yet fully loaded') >= 0),
    'the re-entrant failure must be recorded: ' + JSON.stringify(trace))
  assert.ok(trace.some((a) => a.indexOf('retry') === 0 && a.indexOf('ok') >= 0),
    'the retry must succeed: ' + JSON.stringify(trace))
  assert.notStrictEqual(exported.Config, undefined, 'Config must survive a re-entrant first failure')
})

console.log('')
if (failures) { console.error(failures + ' host config resolution check(s) FAILED'); process.exit(1) }
console.log('all host config resolution checks passed')
