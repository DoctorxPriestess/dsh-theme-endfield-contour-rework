/**
 * prefs-key-mapping.test.js — prove a settings toggle can actually be READ BACK.
 *
 * Why this exists (a real, shipped defect): the theme gets its preferences through
 * the DSH settings namespace. The browser side addresses a setting by a kebab-case
 * key (`dsh-…-contour-speed`) while the host schema declares the field in camelCase
 * (`contourSpeed`), and the settings service serves a namespace strictly from its
 * DECLARED fields. The mapping between the two used to be an identity slice of the
 * key, so every hyphenated setting was written under an undeclared name: the host
 * happily persisted it into settings.yaml, the write reported `status= ready
 * mode= host`, and yet the value was dropped from the served section and reverted
 * to the schema default on the next reload. Single-word settings (`radius`,
 * `thunder`) hid it because their suffix and field name coincide.
 *
 * The check therefore compares two INDEPENDENT sources:
 *   - the prefs keys the browser side really uses, executed from client.js source;
 *   - the field names the host really declares, from index.js exports.
 * No browser, no DSH, no schemastery: this runs anywhere.
 *
 * Usage: node test/prefs-key-mapping.test.js
 */
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const host = require(path.join(ROOT, 'index.js'))

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* ---------- host side: the fields the schema really declares ---------- */
const schemaFields = Object.keys(host.FIELD_DEFAULTS || {})
if (!schemaFields.length) fail('index.js exports no FIELD_DEFAULTS to compare against')
else pass('host schema declares ' + schemaFields.length + ' fields: ' + schemaFields.join(', '))

/* ---------- browser side: the prefs keys and the real mapping ---------- */
const nsMatch = src.match(/const PREFS_NS = '([^']+)'/)
if (!nsMatch) { console.error('FAIL  client.js has no PREFS_NS'); process.exit(1) }
const PREFS_NS = nsMatch[1]

// The mapping block: helper + table + prefsFieldOf. Bounded by the next
// declaration so a structural change fails loudly instead of silently skipping.
const blockStart = src.indexOf('const prefsKeyToField')
const blockEnd = src.indexOf('const prefsListeners')
if (blockStart < 0 || blockEnd < 0 || blockEnd <= blockStart) {
  console.error('FAIL  could not locate the prefs key->field mapping block in client.js')
  process.exit(1)
}
const mappingBlock = src.slice(blockStart, blockEnd)

const sandbox = { PREFS_NS }
vm.createContext(sandbox)
try {
  // `const` at script top level stays in that script's lexical scope, so the
  // declarations are re-exported onto the context explicitly.
  vm.runInContext(mappingBlock + '\nglobalThis.prefsFieldOf = prefsFieldOf;'
    + 'globalThis.PREFS_KEY_TO_FIELD = PREFS_KEY_TO_FIELD;'
    + 'globalThis.prefsKeyToField = prefsKeyToField;\n', sandbox)
} catch (e) {
  console.error('FAIL  the mapping block does not evaluate: ' + e.message)
  process.exit(1)
}
const prefsFieldOf = sandbox.prefsFieldOf
const keyTable = sandbox.PREFS_KEY_TO_FIELD
if (typeof prefsFieldOf !== 'function' || typeof keyTable !== 'object') {
  console.error('FAIL  mapping block did not define prefsFieldOf / PREFS_KEY_TO_FIELD')
  process.exit(1)
}
pass('mapping block evaluates; table has ' + Object.keys(keyTable).length + ' keys')

/* Every per-setting key constant the client uses, evaluated for real. */
const keyConstants = []
const keyRe = /const ([A-Z][A-Z0-9_]*_KEY) = ([^\r\n]+)/g
let m
while ((m = keyRe.exec(src)) !== null) keyConstants.push({ name: m[1], expr: m[2].trim() })
if (!keyConstants.length) fail('client.js declares no *_KEY preference constants')
else pass('client.js uses ' + keyConstants.length + ' preference key constants')

/* ---------- assertions ---------- */

// 1) The client must write the namespace the host registers. A rename that
//    updates only one of the two makes every write hit an unregistered namespace.
if (PREFS_NS === host.NAMESPACE) pass('client PREFS_NS matches the registered namespace (' + PREFS_NS + ')')
else fail('client PREFS_NS ' + JSON.stringify(PREFS_NS) + ' != registered namespace ' + JSON.stringify(host.NAMESPACE))

// 2) Every key must resolve to a DECLARED field. This is the defect guard.
const resolved = []
for (const k of keyConstants) {
  let value
  try { value = vm.runInContext(k.expr, sandbox) } catch (e) { fail(k.name + ' does not evaluate: ' + e.message); continue }
  if (typeof value !== 'string') { fail(k.name + ' is not a string (' + typeof value + ')'); continue }
  if (!value.startsWith(PREFS_NS + '-')) fail(k.name + ' = ' + JSON.stringify(value) + ' is outside the ' + PREFS_NS + ' namespace')
  const field = prefsFieldOf(value)
  resolved.push({ name: k.name, key: value, field })
  if (schemaFields.includes(field)) pass(k.name + ' -> ' + field + ' (declared)')
  else fail(k.name + ' -> ' + field + ' is NOT a declared schema field — the host will drop it and the setting cannot be read back')
}

// 3) No orphan fields: a declared field nothing writes would be dead UI.
const written = new Set(resolved.map((r) => r.field))
const orphans = schemaFields.filter((f) => !written.has(f))
if (!orphans.length) pass('every declared field is reachable from a preference key')
else fail('declared fields with no preference key: ' + orphans.join(', '))

// 4) Named regression for the exact shape that broke: hyphenated keys must map
//    to the camelCase field, never to themselves.
const hyphenated = resolved.filter((r) => r.key.slice(PREFS_NS.length + 1).includes('-'))
if (!hyphenated.length) fail('no hyphenated preference key found — this test would no longer cover the defect')
else {
  const stillKebab = hyphenated.filter((r) => r.field.includes('-'))
  if (stillKebab.length) fail('hyphenated keys still map to kebab field names: ' + stillKebab.map((r) => r.key + ' -> ' + r.field).join(', '))
  else pass(hyphenated.length + ' hyphenated keys all map to camelCase fields (e.g. ' + hyphenated[0].key + ' -> ' + hyphenated[0].field + ')')
}

// 5) Single source of truth: keys are derived from PREFS_NS, never spelled out.
const hardcoded = keyConstants.filter((k) => /^'[^']*'$/.test(k.expr))
if (!hardcoded.length) pass('no preference key hardcodes the package name')
else fail('these keys hardcode a literal instead of deriving from PREFS_NS: ' + hardcoded.map((k) => k.name).join(', '))
if (mappingBlock.includes("'" + PREFS_NS + '-')) fail('the mapping table hardcodes full key names instead of suffixes')
else pass('the mapping table lists suffixes, not full key names')

// 6) The buggy slicing must survive only inside the helper. A second occurrence
//    means a call site went back to using the raw key tail as a field name.
const sliceRe = /slice\(PREFS_NS\.length \+ 1\)/g
const sliceCount = (src.match(sliceRe) || []).length
if (sliceCount === 1) pass('raw key tail is sliced in exactly one place (the helper)')
else fail('found ' + sliceCount + ' occurrences of slice(PREFS_NS.length + 1); only the helper may use it')

// 7) package.json name must match what the host registers, since DSH mounts the
//    bundle by package name.
if (pkg.name === host.name) pass('package.json name matches the host plugin name (' + pkg.name + ')')
else fail('package.json name ' + JSON.stringify(pkg.name) + ' != host plugin name ' + JSON.stringify(host.name))

/* ---------- 8) the test fixtures must not diverge from production ----------
 * The defect this file guards lived for a while precisely because the fixtures
 * mirrored the client's identity-slice mapping: the mocks agreed with the broken
 * implementation, so every test built on them passed. Both fixtures are compared
 * against the client's real mapping and the host's real field defaults here. */

// Node fixture
const nodeFixture = require(path.join(ROOT, 'test', 'fixtures', 'settings-scope.js'))
let fixtureMismatches = 0
for (const r of resolved) if (nodeFixture.fieldName(r.key) !== r.field) fixtureMismatches++
if (fixtureMismatches === 0) pass('test/fixtures/settings-scope.js maps every key like client.js does')
else fail('test/fixtures/settings-scope.js disagrees with client.js on ' + fixtureMismatches + ' key(s) — the mocks would hide the defect again')

const nodeDefaults = nodeFixture.FIELD_DEFAULTS
const defaultsDiffer = schemaFields.filter((f) => nodeDefaults[f] !== host.FIELD_DEFAULTS[f])
if (Object.keys(nodeDefaults).length === schemaFields.length && !defaultsDiffer.length) pass('node fixture defaults match index.js FIELD_DEFAULTS')
else fail('node fixture defaults differ from index.js: ' + (defaultsDiffer.join(', ') || 'field set differs'))

// Browser fixture (a source snippet inlined into headless pages)
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(ROOT, 'test', 'fixtures', 'settings-scope.browser.js'))
const browserSandbox = {
  console: { error() {} },
  window: { console: { error() {} } },
  document: null,
}
vm.createContext(browserSandbox)
try {
  vm.runInContext(BROWSER_SETTINGS_SCOPE_SNIPPET + '\nglobalThis.__mkScope = __endfieldSettingsScope;\n', browserSandbox)
} catch (e) {
  fail('browser fixture snippet does not evaluate: ' + e.message)
}
if (typeof browserSandbox.__mkScope === 'function') {
  const browserDefaults = browserSandbox.__endfieldFieldDefaults || {}
  const bDiffer = schemaFields.filter((f) => browserDefaults[f] !== host.FIELD_DEFAULTS[f])
  if (Object.keys(browserDefaults).length === schemaFields.length && !bDiffer.length) pass('browser fixture defaults match index.js FIELD_DEFAULTS')
  else fail('browser fixture defaults differ from index.js: ' + (bDiffer.join(', ') || 'field set differs'))

  // A raw key seeded through the fixture's localStorage-style shim must land on
  // the same field the client reads back.
  let shimMismatches = 0
  for (const r of resolved) {
    const scope = browserSandbox.__mkScope({})
    scope.setItem(r.key, 'probe')
    if (scope.section[r.field] !== 'probe') shimMismatches++
  }
  if (shimMismatches === 0) pass('browser fixture setItem() lands on the field client.js reads (' + resolved.length + ' keys)')
  else fail('browser fixture setItem() missed the client field for ' + shimMismatches + ' key(s)')

  // Seeding a field the schema does not declare must be REPORTED, never ignored.
  // Silently dropping it is how a page test ends up measuring a schema default
  // while looking green.
  const recorded = []
  const badSandbox = {
    console: { error() {} },
    window: { console: { error() {} } },
    document: {
      documentElement: { appendChild(el) { recorded.push(el) } },
      body: null,
      createElement() {
        const attrs = {}
        return { _attrs: attrs, setAttribute(k, v) { attrs[k] = String(v) }, style: {} }
      },
    },
  }
  vm.createContext(badSandbox)
  vm.runInContext(BROWSER_SETTINGS_SCOPE_SNIPPET + '\nglobalThis.__mkScope = __endfieldSettingsScope;\n', badSandbox)
  badSandbox.__mkScope({ 'contour-fps': '60' })
  const marker = recorded.find((el) => el._attrs && el._attrs['data-endfield-scope-error'] === 'contour-fps')
  if (marker) pass('browser fixture reports an undeclared seed ("contour-fps") instead of dropping it')
  else fail('browser fixture silently ignored an undeclared seed — page tests could pass while measuring a default')

  // ...and the Node fixture must fail loudly for the same input.
  let nodeThrew = null
  try { nodeFixture.settingsScopeStub({ 'contour-fps': '60' }) } catch (e) { nodeThrew = e }
  if (nodeThrew && /contour-fps/.test(nodeThrew.message)) pass('node fixture throws on an undeclared seed, naming the field')
  else fail('node fixture accepted an undeclared seed')
}

console.log('')
if (failures) { console.error(failures + ' prefs-key-mapping check(s) failed'); process.exit(1) }
console.log('all prefs key mapping checks passed')
