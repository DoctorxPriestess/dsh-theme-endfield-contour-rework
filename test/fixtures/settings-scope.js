/**
 * settings-scope.js — canonical dsh settingsScope seam used by the theme tests.
 *
 * Migration (see docs/engineering-notes.md): the theme no longer persists to
 * localStorage. Its switches read/write a DSH settings namespace
 * (`dsh-theme-endfield-contour-rework`) through the browser `ctx.settingsScope` service — the
 * client mirror of the host `ctx.settings.register(ns, schema)` that index.js
 * declares, persisted by DSH to the profile's <dshHome>/settings.yaml.
 *
 * These unit tests therefore exercise the theme exactly the way a user's stored
 * preferences would, but through that same seam: they feed the plugin a fake
 * `ctx.settingsScope` binder (the precise contract the theme binds) whose
 * in-memory "section" plays the role that <settings.yaml> plays in production.
 *
 * Contract honoured (mirrors @deepseek-ai/dsh-client-ui-settings):
 *   binder.bind({ namespace, decode? }) -> scope
 *   scope.getSnapshot() -> { status, value, writable, mode, ... }
 *   scope.subscribe(listener) -> disposer
 *   scope.set(field, value); scope.unset(field)
 *
 * The theme only trusts a `status === 'ready'` snapshot with a `value` object;
 * before that, and when no binder is present at all, it falls back to in-memory
 * schema defaults (enabled on, loader off, ...). All fields are stored as the
 * exact strings described in docs/features.md.
 */
'use strict'

const FIELD_DEFAULTS = {
  enabled: '1',
  palette: 'valley',
  radius: 'square',
  contour: '0',
  contourAnim: '1',
  contourDir: '0',
  contourSpeed: '2',
  contourDensity: '1',
  contourRoughness: '7',
  contourScrollPause: '1',
  watermark: '1',
  watermarkPersist: '0',
  loader: '0',
  thunder: '0',
  thunderAnim: '0',
}

const PREFIX = 'dsh-theme-endfield-contour-rework-'

/**
 * Raw preference key -> the schema field it stores.
 *
 * This MIRRORS the client's own mapping (client.js `prefsKeyToField`) and must
 * stay byte-for-byte equivalent in behaviour: the section is keyed by the schema
 * field names declared above, which are camelCase, while raw keys spell the same
 * setting in kebab case. An identity slice here would reproduce the very defect
 * the mapping exists to avoid (a hyphenated setting persisting under an
 * undeclared name and never being read back), and — worse — would make this
 * fixture agree with a broken client, so every test built on it would pass.
 * client.js's mapping is asserted against this one from test/prefs-key-mapping.test.js.
 *
 * Accepts the raw key ('dsh-…-contour-speed'), the bare kebab tail
 * ('contour-speed') or the field name itself ('contourSpeed') for test
 * convenience; all three resolve to 'contourSpeed'.
 */
function fieldName(rawKey) {
  const tail = rawKey.startsWith(PREFIX) ? rawKey.slice(PREFIX.length) : rawKey
  return tail.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * Build a fake settingsScope binder over an in-memory section.
 *
 * @param initial - initial stored section (field -> string). Undefined fields
 *                  resolve to FIELD_DEFAULTS during value resolution, exactly
 *                  like a schema `.default()` merges into a stored section.
 * @returns { binder, section, getSnapshot, setField, setSection, change }
 */
function settingsScopeStub(initial = {}) {
  // Merged defaults so `value` is never missing a key (mirrors schema defaults).
  const section = Object.assign({}, FIELD_DEFAULTS)
  for (const k of Object.keys(initial)) {
    const field = fieldName(k)
    // A key the schema does not declare would be DROPPED by the real host
    // (served sections carry declared fields only), so a test asking for one is
    // a test bug — fail loudly instead of silently measuring the default.
    if (!Object.prototype.hasOwnProperty.call(FIELD_DEFAULTS, field)) {
      throw new Error('settings-scope fixture: ' + JSON.stringify(k) + ' is not a declared field;'
        + ' the real settings service would ignore it. Declared fields: ' + Object.keys(FIELD_DEFAULTS).join(', '))
    }
    section[field] = String(initial[k])
  }

  let listeners = []
  const notify = () => { for (const l of listeners.slice()) { try { l() } catch (e) { /* test safety */ } } }

  const getSnapshot = () => ({
    status: 'ready',
    value: Object.assign({}, section),
    base: Object.assign({}, FIELD_DEFAULTS),
    user: Object.assign({}, section),
    revision: 1,
    writable: true,
    mode: 'host',
  })

  const scope = {
    getSnapshot,
    subscribe(listener) { listeners.push(listener); return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1) } },
    set(field, value) { section[field] = String(value); notify(); },
    unset(field) { section[field] = FIELD_DEFAULTS[field]; notify(); },
  }

  const binder = {
    bind() { return scope }, // the theme only uses the default field decode
  }

  return {
    binder,
    section,
    get: (rawKey) => section[fieldName(rawKey)],
    set: scope.set,
    unset: scope.unset,
    setField: (rawKey, value) => { section[fieldName(rawKey)] = String(value); notify() },
    getSnapshot,
    reset() { for (const k of Object.keys(FIELD_DEFAULTS)) section[k] = FIELD_DEFAULTS[k]; notify() },
  }
}

module.exports = { settingsScopeStub, FIELD_DEFAULTS, fieldName }
