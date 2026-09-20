/**
 * dsh-theme-endfield-contour-rework — Edge Intelligence Theme (browser client bundle)
 * 还原自《明日方舟：终末地》（Arknights: Endfield）官网的「工业编辑风」。
 * 参考：https://endfield.hypergryph.com
 *
 * Fork 自 dsh-theme-endfield — https://github.com/ymh0000123/dsh-theme-endfield
 * Copyright (c) ymh0000123（原始作品）。MIT 许可证，原文见仓库根的 LICENSE；
 * 出处与改动说明见 NOTICE.md / CHANGELOG.md。这行出处刻意写进文件头：LICENSE 与
 * NOTICE 只存在于仓库根，单独拷走这一个文件时它们不会跟过来。
 *
 * Client 半部：
 *   1) theme.overrideTokens —— 覆盖主题令牌（亮/暗双色），映射终末地官网色板；
 *   2) insertCss —— 注入字体栈、强调色、直角化、去蓝、hover 反色等全局样式。
 *      （动态插件环境走 styles.insert；安装为独立 bundle 时直接注入 <style> 到 head。）
 *   3) 设置页「终末地主题设置」—— 设置项按四组分类（主题 / 背景 / 动画 / 娱乐），
 *      默认值 / 语义标记通过 DSH 的设置命名空间（client ctx.settingsScope，
 *      host index.js 的 ctx.settings.register）随 profile 落盘，文案跟随 DSH 的语言设置。
 *      不再使用 localStorage：见本文 apply() 顶部「Durable preference store」注释。
 *
 * 文档：README.md 为索引；设计语言见 docs/design-language.md，
 * 各开关行为见 docs/features.md，实现决策与实测数据见 docs/engineering-notes.md。
 *
 * 由 dsh-client-modules 以 /plugins/dsh-theme-endfield-contour-rework/client.js 形式加载；
 * 通过 `dsh plugin --profile web add github:DoctorxPriestess/dsh-theme-endfield-contour-rework` 安装挂载。
 */
window.__ModuleLoader__.load({
	id: "dsh-theme-endfield-contour-rework",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

function insertCss(css) {
  // Dynamic Cordis runner provides the `styles` global; standalone bundle does not.
  if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
    return styles.insert(css)
  }
  // Idempotency: the installed bundle can be applied more than once (boot loader +
  // cordis composition both mount it). Never stack duplicate theme stylesheets.
  document.querySelectorAll('style[data-plugin="dsh-theme-endfield-contour-rework"]').forEach((old) => old.remove())
  const el = document.createElement('style')
  el.setAttribute('data-plugin', 'dsh-theme-endfield-contour-rework')
  el.textContent = css
  document.head.appendChild(el)
  return () => {
    if (el.parentNode) el.parentNode.removeChild(el)
  }
}

function apply(ctx) {
    // Idempotency: the installed bundle can be applied more than once (boot loader +
    // cordis composition both mount it). Only the first application owns tokens/styles;
    // duplicate overrideTokens would replace the layer and break the toggle's dispose.
    // The flag is RELEASED by the run's dispose (see the ctx.effect cleanup below), so
    // a dispose followed by a re-apply in the same page session mounts the theme again
    // instead of staying dead until a hard reload.
    if (typeof window !== 'undefined' && window.__dshThemeEndfieldApplied) return
    // Claim the flag only once the theme service is actually there: a boot order where
    // it is still missing must not lock the flag in place and kill every later apply.
    const theme = ctx.get('theme')
    if (theme === undefined) return
    if (typeof window !== 'undefined') window.__dshThemeEndfieldApplied = true

    /* ---------- Durable preference store (replaces localStorage) ----------
       The theme's switches used to persist through `localStorage`, which DSH
       Desktop broke on every restart: Desktop binds a fresh random localhost
       port per launch, so the origin (and thus the browser storage scope)
       changed and the saved settings silently reset to defaults.

       The durable authority is now DSH's own user-settings service. The HOST
       half of this plugin (index.js) registers the `dsh-theme-endfield-contour-rework`
       namespace through `ctx.settings`, which the settings provider persists
       to the profile harness home (<dshHome>/settings.yaml) — a path owned by
       DSH, entirely independent of the web origin/port. Here on the client we
       read/write that same namespace over the browser `ctx.settingsScope`
       service (the mirror of the host seam), so:

         dsh web     (browser, fixed loopback port)  -> host persistence
         DSH Desktop (browser, random loopback port) -> host persistence

       Both are loopback pages, so DSH resolves the connection to 'host' mode
       and the intended prefs comment stores to disk; a change of port does not
       move the values because nothing lives in browser storage any more.

       Value model. Namespace fields are the tails of the old localStorage keys
       and are stored as the same strings, so the semantics (and any older
       <settings.yaml> section from a prior build) keep scanning identically:
         default-ON switches store  '1'  and read as  !== '0'
         default-OFF switches store '0'  and read as  === '1'
         palette/radius store one of their documented literals; the contour
         direction/speed/density store integer indices into their option tables.
       FIELD_DEFAULTS is the shipped fallback and mirrors index.js.

       Resilience. Before the transport hands us a section (boot), or in an
       environment with no `settingsScope` service at all (an out-of-DSH page,
       in-process tests), the store falls back to FIELD_DEFAULTS overlaid with
       any in-page overrides made this session. Writes are committed to the
       settings transport only when it is ready + writable; otherwise they are
       kept session-local so toggles still work in place but do not persist
       (there is no durable backend to persist to — and no localStorage). */
    const PREFS_NS = 'dsh-theme-endfield-contour-rework'
    const PREFS_FIELD_DEFAULTS = {
      enabled: '1',
      palette: 'valley',
      radius: 'square',
      contour: '0',
      contourAnim: '1',
      /* Index into CONTOUR_DIRS (0 = up), CONTOUR_SPEEDS (2 = 48 px/s) and
         CONTOUR_DENSITIES (1 = 14 levels). The historic contourSpeed literal '2'
         happens to read as the new default index too, so old stored values land
         on a sane speed without migration code. */
      contourDir: '0',
      contourSpeed: '2',
      contourDensity: '1',
      /* Index into the terrain-roughness tables (CONTOUR_ROUGHNESS_BASE /
         _PERSIST / _OCTAVES). 7 is the stop the theme has always shipped --
         the plains..extreme-mountains slider opens on the familiar landscape. */
      contourRoughness: '7',
      contourScrollPause: '1',
      watermark: '1',
      watermarkPersist: '0',
      loader: '0',
      thunder: '0',
      thunderAnim: '0',
    }
    /* Translate one prefs key into the schema field name it stores. The keys
       spell a setting in kebab case ("contour-speed") while the host schema
       (index.js Config) declares it in camelCase ("contourSpeed"), and the
       settings service serves a namespace strictly from its declared fields:
       an undeclared kebab name is dropped from every served section. Writing
       under it therefore looked like a successful commit — the host really did
       persist it into settings.yaml — while the value could never be read back,
       so it silently reverted to the schema default on the next reload. Single
       word settings ("radius", "thunder") hid the bug because their key suffix
       and field name coincide. */
    const prefsKeyToField = (rawKey) => String(rawKey)
      .slice(PREFS_NS.length + 1)
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    const PREFS_KEY_TO_FIELD = (() => {
      const m = {}
      const raw = [
        'radius', 'enabled',
        'palette', 'watermark',
        'watermark-persist', 'contour',
        'contour-anim', 'contour-dir',
        'contour-speed', 'contour-density',
        'contour-roughness', 'contour-scroll-pause', 'loader',
        'thunder', 'thunder-anim',
      ].map((suffix) => PREFS_NS + '-' + suffix)
      for (const k of raw) m[k] = prefsKeyToField(k)
      return m
    })()
    /** Schema field for a prefs key: the declared table, else the same conversion. */
    const prefsFieldOf = (rawKey) => {
      const mapped = PREFS_KEY_TO_FIELD[rawKey]
      return mapped === undefined ? prefsKeyToField(rawKey) : mapped
    }
    const prefsListeners = []
    const prefsLocal = Object.assign({}, PREFS_FIELD_DEFAULTS) // schema defaults, for boot / no transport
    // Fields a panel toggle changed so far but that have not yet been durably
    // committed to the host scope. If the scope was not ready at apply() time and
    // only appears later, these are replayed so a pre-bind edit still persists
    // instead of silently living in page-only memory.
    const prefsDirty = new Set()
    /* Write-through overlay: field -> the raw string this page last wrote, kept
       only until the settings transport echoes the same value back.
       WHY IT EXISTS. prefsGet prefers the scoped section (prefsFieldValue) over
       prefsLocal, and a DSH scope.set is ASYNCHRONOUS — the section only comes back
       on the next host round-trip. So with no overlay, a handler that writes and
       then immediately re-reads acts on what the value was BEFORE the click:
         density      -> contourRetune() re-extracts the OLD level count
         direction/speed -> contourRefreshMotion() caches the OLD direction/speed
         roughness    -> the debounced rebuild reads the OLD stop
       Symptom in the app: "切换挡位需要点击两次, 第一次点击后不刷新" (the second
       click then applies the first one's value). The unit tests never saw it
       because their scope fixture applies a write synchronously.
       The overlay is page-local by design: it is not persisted here, it is dropped
       the moment the served section agrees, and the actual durable write still goes
       through prefsCommit with its own readiness gate. */
    const prefsWritten = new Map()
    let prefsFieldValue = null // last schema-resolved user+base+defaults section from the scope, if any
    let prefsScope = null // the bound ctx.settingsScope scope, or null while absent/not ready
    let prefsBindTimer = null // retry handle for a settingsScope that arrives late
    let prefsRetryTimer = null // bounded retry for held edits whose ready cue has not arrived
    // Max held-edit retry passes. The ready transition is normally the cue; this
    // bounded timer is the safety net for a mirror whose first describe predates
    // a late host registration and sees no document commit to rerun on.
    const PREFS_RETRY_LIMIT = 20 // ~20 * 500ms = up to ~10s after the last held edit
    let prefsRetryCount = 0
    // True while prefsReplayDirty is mid-pass. A normal DSH scope.set is async,
    // but the mirror can fold a ready snapshot in synchronously (and document
    // mocks/transitions too), which would re-enter the replay from the theme's
    // own subscription and write the same held edits twice. The bus flag makes a
    // single replay pass authoritative; re-entrant calls become no-ops.
    let prefsReplayBusy = false
    /* Theme layers install *their* reconcile here once they exist (updated from
       the bottom of apply) so a transport event can live-apply a real change. */
    let reconcileFromPrefs = null
    // Try the idiomatic injected-property access first (how DSH client plugins like
    // dsh-client-locale consume settingsScope — exports.inject plus `ctx.xxx`), then
    // the lookup form this module has historically used for optional services.
    const getSettingsScopeBinder = () => {
      try {
        if (ctx.settingsScope !== undefined && ctx.settingsScope !== null
          && typeof ctx.settingsScope.bind === 'function') return ctx.settingsScope
      } catch (e) { /* property may be a getter that throws when not available */ }
      try { return ctx.get('settingsScope') } catch (e) { return undefined }
    }
    const prefsGetValue = () => {
      // A schema-accepted section from the transport, else in-memory defaults
      // overlaid with any session-local override written while un-writable.
      return prefsFieldValue || prefsLocal
    }
    /** read one field as its raw stored string: <stored-or-default>, never null. */
    const prefsGet = (rawKey) => {
      const field = prefsFieldOf(rawKey)
      // This page's newest intent wins until the transport echoes it back (see
      // prefsWritten): a write must be readable by the very next reader, or every
      // write-then-read handler is one click behind.
      if (prefsWritten.has(field)) return prefsWritten.get(field)
      const sec = prefsGetValue()
      if (sec && Object.prototype.hasOwnProperty.call(sec, field)) return String(sec[field])
      return PREFS_FIELD_DEFAULTS[field]
    }
    /* Drop overlay entries the served section has caught up with. Called whenever
       a new section arrives; a value the host never confirms (namespace unserved,
       or a write the schema rejected) keeps its overlay, which is then exactly the
       old prefsLocal behaviour rather than a lost setting. */
    const prefsSettleWritten = () => {
      if (prefsWritten.size === 0 || !prefsFieldValue) return
      for (const [field, value] of Array.from(prefsWritten)) {
        if (Object.prototype.hasOwnProperty.call(prefsFieldValue, field)
          && String(prefsFieldValue[field]) === value) prefsWritten.delete(field)
      }
    }
    /** subscribe to any change of the whole namespace (transport or local). */
    const prefsSubscribe = (listener) => {
      prefsListeners.push(listener)
      return () => {
        const i = prefsListeners.indexOf(listener)
        if (i >= 0) prefsListeners.splice(i, 1)
      }
    }
    const prefsEmit = () => {
      for (const l of prefsListeners.slice()) { try { l() } catch (e) { /* keep going */ } }
      if (reconcileFromPrefs) try { reconcileFromPrefs() } catch (e) { /* keep going */ }
    }
    /** write one field with the exact stored-string value the UI derives. */
    const dbg = (...a) => { try { if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-theme-endfield-contour-rework:prefs]', ...a) } catch (e) { /* noop */ } }

    /* --- Durable write gate -----------------------------------------------
       A scope snapshot from @deepseek-ai/dsh-client-ui-settings carries three
       flags that must ALL hold before a scope.set can durably land:
         mode    === 'host'   loopback page syncing the Host document.
                              'memory' (non-loopback) never persists.
         status  === 'ready'  the Host's describe view actually SERVES this
                              namespace and a decoded value stands. It stays
                              'loading' before the first accepted section and
                              becomes 'unavailable' when the namespace is NOT in
                              the host's served list (the host half has not run
                              its ctx.settings.register(...) yet, or the mirror
                              last fetched before it appeared). A scope.set into
                              a 'loading'/'unavailable' host scope reaches no
                              durable store.
         writable=== true     the Host document accepts writes.
       Gating on snap.writable ALONE is the old bug: a host-mode describe view
       answers writable=true even while this namespace is still unserved, so the
       old code fired scope.set into a namespace the host had not registered,
       cleared the dirty mark and logged the misleading
       `commit ... status= unavailable` warn — the preference kept working for
       the page session but vanished on the next reload. We issue a real wire
       write only once the namespace is genuinely served, and keep the edit
       dirty so a later ready transition (re)plays it. */
    const prefsSnap = () => {
      const scope = prefsScope
      if (!scope) return null
      try { return scope.getSnapshot() } catch (e) { return null }
    }
    const prefsDurablyServed = (snap) => !!snap && snap.mode === 'host' && snap.status === 'ready' && !!snap.writable
    /* Push edits recorded while the scope was not durably served as soon as it
       is (bind catch-up + an unavailable/loading -> ready subscription both call
       this). A dirty field is cleared only once it is written to a served host
       scope, or when the host already holds the exact value / it is the shipped
       default (nothing left to persist). Guarded against races the same way as
       prefsCommit: a rejected async write keeps the field for a later try. */
    const prefsReplayDirty = () => {
      if (prefsReplayBusy) return
      if (prefsDirty.size === 0) return
      prefsReplayBusy = true
      try {
        const snap = prefsSnap()
        const durable = prefsDurablyServed(snap)
        for (const field of Array.from(prefsDirty)) {
          const local = prefsLocal[field]
          const hostValue = snap && snap.value
            ? (Object.prototype.hasOwnProperty.call(snap.value, field) ? String(snap.value[field]) : undefined)
            : undefined
          // An edit that equals the host already or the shipped default has
          // nothing left to persist (defaults are implied, not stored).
          if (local === hostValue || local === PREFS_FIELD_DEFAULTS[field]) {
            prefsDirty.delete(field)
            continue
          }
          if (!durable) continue
          const scope = prefsScope
          try {
            let p = null
            try { p = scope.set(field, local) } catch (e) { dbg('replay set threw', field, e && e.message); p = null }
            if (p && typeof p.catch === 'function') {
              p.catch((e) => { dbg('replay set REJECTED', field, local, String(e && e.message || e)); prefsDirty.add(field) })
            }
            dbg('replayed held', field, '=', local)
            prefsDirty.delete(field)
          } catch (e) { /* keep for later */ }
        }
      } finally {
        prefsReplayBusy = false
      }
    }
    /* Bounded safety net for a held edit whose "ready" cue never arrives on its
       own. A normal scope subscription fires on the ready transition and replays
       immediately; this is only for a mirror whose first describe predated a late
       host registration and that sees no intermediate document commit / reconnect
       to rerun on. Each tick simply calls prefsReplayDirty() again; once nothing
       is dirty (all replayed, matched the host, or reverted to a default) the
       loop stops itself. Stops after PREFS_RETRY_LIMIT ticks so an environment
       where the namespace is genuinely never served does not spin forever. */
    const prefsStopRetry = () => {
      if (prefsRetryTimer !== null && typeof clearTimeout === 'function') clearTimeout(prefsRetryTimer)
      prefsRetryTimer = null
      prefsRetryCount = 0
    }
    const prefsScheduleRetry = () => {
      // Nothing held any more: no reason to keep ticking.
      if (prefsDirty.size === 0) { prefsStopRetry(); return }
      // A durably-served scope needs no timer — its subscription replays fast.
      if (prefsDurablyServed(prefsSnap())) { prefsStopRetry(); return }
      if (prefsRetryTimer !== null) return // already ticking
      if (typeof setTimeout !== 'function') return // no timer environment
      prefsRetryCount = 0
      const tick = () => {
        prefsRetryTimer = null
        prefsRetryCount += 1
        if (prefsRetryCount > PREFS_RETRY_LIMIT) { prefsStopRetry(); return }
        if (prefsDirty.size === 0) { prefsStopRetry(); return }
        if (prefsDurablyServed(prefsSnap())) { prefsStopRetry(); return }
        prefsReplayDirty()
        if (prefsDirty.size > 0) prefsRetryTimer = setTimeout(tick, 500)
        else prefsStopRetry()
      }
      prefsRetryTimer = setTimeout(tick, 500)
    }
    const prefsCommit = (field, encoded) => {
      // Best-effort durable write. A real wire write happens only while the
      // scope is durably served (see the gate note above); before that we stay
      // session-local, record the edit in prefsDirty and let prefsReplayDirty
      // push it once the namespace is served. We deliberately do NOT
      // prefsEmit() here: the caller's toggle already reconciles the layer it
      // changes, and the authoritative echo arrives through the scope
      // subscription below, so an immediate synchronous emit would do the same
      // work twice.
      const scope = prefsScope
      if (scope) {
        try {
          const snap = scope.getSnapshot()
          if (prefsDurablyServed(snap)) {
            dbg('commit', field, '=', encoded, 'status=', snap.status, 'mode=', snap.mode)
            let p = null
            try { p = scope.set(field, String(encoded)) } catch (e) { dbg('set threw', field, e && e.message); p = null }
            if (p && typeof p.catch === 'function') p.catch((e) => dbg('set REJECTED', field, encoded, String(e && e.message || e)))
            prefsDirty.delete(field)
            return true
          }
          dbg('held (namespace not durably served yet)', field, '=', encoded, 'snap=', snap === null ? null : { status: snap.status, writable: snap.writable, mode: snap.mode })
        } catch (e) { dbg('commit exception', field, e && e.message) }
      } else {
        dbg('commit with NO scope bound (page-local only)', field, encoded)
      }
      prefsDirty.add(field)
      prefsScheduleRetry()
      return false
    }
    const prefsSet = (rawKey, encoded) => {
      const field = prefsFieldOf(rawKey)
      prefsLocal[field] = String(encoded)
      // Publish the intent to this page's own readers first (see prefsWritten):
      // the transport echo is asynchronous, the UI and the engine are not.
      prefsWritten.set(field, prefsLocal[field])
      prefsCommit(field, prefsLocal[field])
    }
    /* Repeatedly try to obtain the settingsScope binder until it (and its mirror)
       are actually available. DSH web mounts plugin rows concurrently, so the
       settings scope / shared describe mirror can legitimately settle AFTER this
       theme's apply() runs; without this retry a single synchronous attempt that
       raced would leave prefsScope null forever and every subsequent toggle would
       silently stay page-local — the exact "works now, gone on refresh" symptom. */
    const rebindPrefs = (attempt) => {
      if (prefsScope !== null) return
      if (attempt > 40) { dbg('gave up binding settingsScope after retries; staying in-memory'); return }
      const binder = getSettingsScopeBinder()
      if (binder === undefined || binder === null || typeof binder.bind !== 'function') {
        // Retry until a reasonable ceiling; mirrors the theme's own sessions/late-
        // service retry used elsewhere in this file.
        if (typeof setTimeout === 'function') {
          if (attempt % 8 === 0) dbg('waiting for settingsScope binder (attempt', attempt, ')')
          prefsBindTimer = setTimeout(() => rebindPrefs(attempt + 1), 250)
        }
        return
      }
      let scope = null
      try {
        scope = binder.bind({ namespace: PREFS_NS, decode: (section) => {
          // Section arrives already schema-validated by the shared mirror: it
          // carries the merged defaults + base + stored user values, typed to our
          // schema (all fields are strings). Fall back to schema defaults for a
          // field the mirror has not resolved yet.
          if (section === null || typeof section !== 'object') return Object.assign({}, PREFS_FIELD_DEFAULTS)
          const out = Object.assign({}, PREFS_FIELD_DEFAULTS)
          for (const k of Object.keys(PREFS_FIELD_DEFAULTS)) {
            if (Object.prototype.hasOwnProperty.call(section, k)) out[k] = String(section[k])
          }
          return out
        } })
      } catch (e) {
        scope = null
        dbg('bind threw', e && e.message)
      }
      if (scope === null) {
        if (typeof setTimeout === 'function') prefsBindTimer = setTimeout(() => rebindPrefs(attempt + 1), 250)
        return
      }
      prefsScope = scope
      const initial = scope.getSnapshot ? scope.getSnapshot() : null
      if (initial) dbg('bound scope; initial status=', initial.status, 'writable=', initial.writable, 'mode=', initial.mode, 'valueKeys=', initial.value ? Object.keys(initial.value).length : 0)
      if (initial && initial.status === 'ready' && initial.value !== undefined) {
        prefsFieldValue = initial.value
        prefsSettleWritten()
      }
      if (typeof scope.subscribe === 'function') {
        scope.subscribe(() => {
          let snap = null
          try { snap = scope.getSnapshot() } catch (e) { snap = null }
          if (snap && (snap.status === 'ready' || snap.status === 'unavailable')) {
            if (snap.status === 'ready' && snap.value !== undefined) {
              prefsFieldValue = snap.value
              prefsSettleWritten()
            }
            // An unavailable/loading -> ready transition is precisely when an edit
            // we HELD (see prefsCommit) can finally be written: replay any dirty
            // fields the moment the namespace is durably served. prefsReplayDirty
            // is a no-op when nothing is held or the scope is not yet served.
            prefsReplayDirty()
            prefsEmit()
          }
        })
      }
      // Catch up: an edit made before the scope settled must still persist. Replay
      // only genuinely user-changed fields (those prefsSet recorded as dirty) that
      // now differ from a freshly-fetched, durably-served host section.
      prefsReplayDirty()
    }
    // Kick off the (re)trying binder acquisition.
    rebindPrefs(0)
    // Dispose on run teardown (mirrors ctx.effect owned resources).
    ctx.effect(() => () => {
      prefsListeners.length = 0
      prefsScope = null
      prefsFieldValue = null
      prefsWritten.clear()
      if (prefsBindTimer !== null && typeof clearTimeout === 'function') clearTimeout(prefsBindTimer)
      prefsBindTimer = null
      if (prefsRetryTimer !== null && typeof clearTimeout === 'function') clearTimeout(prefsRetryTimer)
      prefsRetryTimer = null
    })
    // Dispose on run teardown (mirrors ctx.effect owned resources).
    ctx.effect(() => () => {
      prefsListeners.length = 0
      prefsScope = null
      prefsFieldValue = null
      prefsWritten.clear()
    })

    const RADIUS_KEY = PREFS_NS + '-radius'
    const ENABLED_KEY = PREFS_NS + '-enabled'
    const isEnabled = () => prefsGet(ENABLED_KEY) !== '0'
    const syncRadiusMode = () => {
      // The bundle can run before <body> exists (see runLoader's DOMContentLoaded
      // deferral for the same window); a classList touch on null would throw and
      // kill the whole install. syncPaletteClass guards the same way.
      if (typeof document === 'undefined' || document.body === null) return
      const mode = prefsGet(RADIUS_KEY) || 'square'
      if (mode === 'round') document.body.classList.add('theme-endfield-round')
      else document.body.classList.remove('theme-endfield-round')
    }

    /* ---------- accent palette: 谷地黄 (default) / 武陵青 ----------
       The palette is ONE class on <body>; the stylesheet defines both variable
       sets, so switching is a class flip with no restyling work here. Because the
       app applies its theme tokens as inline body styles and this theme's token
       overrides are var(--edge-accent) references, those tokens re-resolve on the
       same flip — no JS repaint, no theme.overrideTokens() re-registration.

       'valley' (谷地黄, signal yellow) is the DEFAULT, so an unset field and any
       unrecognised value both mean yellow. Only the exact string 'wuling' selects
       武陵青, which keeps a corrupt stored value (schema rejects / outside the
       fallback) from silently changing the shipped look.

       The one surface a class cannot reach is the contour canvas, which is painted
       by JS — hence syncPalette() redraws it, and the observer below catches a flip
       made in another tab or by the browser restoring state. */
    const PALETTE_KEY = PREFS_NS + '-palette'
    const PALETTE_CLASS = 'theme-endfield-wuling'
    const readPalette = () => (prefsGet(PALETTE_KEY) === 'wuling' ? 'wuling' : 'valley')
    /* Read from the DOM, not from storage: the canvas must match what is actually
       on screen. While the theme is switched off the class is absent, so the sheet
       keeps its default palette instead of following an ignored preference. */
    const isWulingPalette = () => typeof document !== 'undefined'
      && document.body !== null
      && document.body.classList.contains(PALETTE_CLASS)
    const syncPaletteClass = () => {
      if (typeof document === 'undefined' || document.body === null) return
      // The class only applies while the theme owns the page; unmount() drops it.
      if (isEnabled() && readPalette() === 'wuling') document.body.classList.add(PALETTE_CLASS)
      else document.body.classList.remove(PALETTE_CLASS)
    }

    /* ---------- background ENDFIELD watermark (settings-toggleable) ----------
       Two independent switches:
         WATERMARK_KEY  — the watermark itself (default ON), shown on the hero page.
         WATERMARK_PERSIST_KEY — "keep showing it off the hero page" (default OFF),
           which also paints it on an active conversation / settings / any other page.
       On the hero page the mark is centred on the headline. Off the hero page there
       is no headline to follow, so it is centred in the conversation column instead
       and mounted INSIDE that column rather than on <body>: a fixed body child
       paints above the message text (it has no z-index competitor to lose to),
       which would wash out what the user is reading. See mountPointFor().

       Both placements must stay strictly BEHIND the app's own chrome. That is a
       z-index question in the hero case and it is genuinely subtle -- see the long
       note on s.zIndex in styleWatermark(); it is locked down by
       test/watermark-stacking.test.js, which compares real screenshots because a
       pointer-events:none layer cannot be hit-tested. */
    const WATERMARK_KEY = PREFS_NS + '-watermark'
    const WATERMARK_PERSIST_KEY = PREFS_NS + '-watermark-persist'
    const isWatermarkOn = () => prefsGet(WATERMARK_KEY) !== '0'
    // Default OFF: the hero-only behaviour stays the shipped default.
    const isWatermarkPersistOn = () => prefsGet(WATERMARK_PERSIST_KEY) === '1'
    const isHeroVisible = () => {
      if (typeof document === 'undefined') return false
      const hero = document.querySelector('[class*="pXSMma_root"]')
      if (!hero) return false
      const r = hero.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    /** The visible conversation column — the persist-mode anchor and mount parent. */
    const findConversationRoot = () => {
      if (typeof document === 'undefined') return null
      const all = document.querySelectorAll('[class*="wSkVaW_root"]')
      for (const el of all) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return el
      }
      return null
    }
    const findVisibleHeadline = () => {
      if (typeof document === 'undefined') return null
      const all = document.querySelectorAll('[class*="pXSMma_headline"]')
      for (const h of all) {
        const r = h.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return h
      }
      return null
    }
    let watermarkEl = null
    let watermarkRaf = null
    let watermarkHost = null
    /* Where the mark belongs for the current page, and how it must stack there:
         hero    -> <body>, above the (empty) hero backdrop, following the headline.
         persist -> inside the conversation column, BEHIND the message text.
       Returning the parent alongside the mode keeps the two decisions in one place,
       so remount happens exactly when either the parent or the stacking changes. */
    const mountPointFor = () => {
      if (isHeroVisible()) return { mode: 'hero', parent: document.body }
      const conv = findConversationRoot()
      if (conv !== null) return { mode: 'persist', parent: conv }
      // No conversation column on screen (e.g. a full-page settings view). A body
      // child at z-index:-1 paints BELOW the body/frame's own opaque backgrounds
      // there and never shows, so prefer the app FRAME: while the mark is mounted
      // in it the stylesheet gives the frame isolation:isolate (the same pair of
      // properties the conversation column gets above), so -1 stays above the
      // frame background and strictly below the page content. body is only the
      // last resort for a page that has no frame at all. findAppFrame is declared
      // further down but only ever called from here at runtime, never during the
      // synchronous apply pass.
      const frame = findAppFrame()
      return { mode: 'persist', parent: frame !== null ? frame : document.body }
    }
    const positionWatermark = () => {
      if (!watermarkEl) return
      if (watermarkEl.getAttribute('data-endfield-watermark') === 'persist') {
        // Centred in its own positioned parent — no per-frame measurement needed.
        return
      }
      const headline = findVisibleHeadline()
      if (!headline) return
      const r = headline.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const cy = r.top + r.height / 2
      const cx = r.left + r.width / 2
      const vw = (typeof window !== 'undefined' && window.innerWidth) || (typeof document !== 'undefined' ? document.documentElement.clientWidth : 0)
      const top = (cy - 55) + 'px'
      const tx = 'translateX(' + (cx - vw / 2) + 'px)'
      // Only write when the value actually changed, so a stable layout costs nothing.
      if (watermarkEl.style.top !== top) watermarkEl.style.top = top
      if (watermarkEl.style.transform !== tx) watermarkEl.style.transform = tx
    }
    const watermarkRafLoop = () => {
      // Only the hero placement is measured per frame; persist mode is pure CSS, so
      // the loop must stop when the mode changes rather than spin for nothing.
      if (!watermarkEl || watermarkEl.getAttribute('data-endfield-watermark') !== 'hero') {
        watermarkRaf = null
        return
      }
      positionWatermark()
      watermarkRaf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(watermarkRafLoop) : null
    }
    const styleWatermark = (el, mode) => {
      const s = el.style
      s.display = 'flex'
      s.alignItems = 'center'
      s.justifyContent = 'center'
      s.pointerEvents = 'none'
      s.fontWeight = '900'
      s.letterSpacing = '0.1em'
      s.color = 'var(--dsw-alias-label-primary)'
      s.textTransform = 'uppercase'
      s.userSelect = 'none'
      s.fontFamily = 'var(--dsw-font-family)'
      /* Strength comes from a CSS variable, never a literal number, so the two
         colour schemes can carry DIFFERENT alphas (defined in the stylesheet) and
         a scheme flip simply re-resolves the variable — no observer, no repaint
         logic here. An inline numeric opacity would also outrank the stylesheet,
         which is exactly what made this value unthemeable before. */
      s.opacity = 'var(--edge-wm-alpha)'
      if (mode === 'hero') {
        s.position = 'fixed'
        s.left = '0'
        s.right = '0'
        s.top = ''
        s.bottom = ''
        s.height = '110px'
        /* z-index 0, NOT 1 — this is the fix for the wordmark painting on top of
           the app's own popovers, and the cause was a z-index TIE:
             .wSkVaW_composerHero is position:relative + z-index:1, so it IS a
             stacking context and the model-select menu's z-index:20 is trapped
             inside it; that 20 never competes at body level.
           The mark used to be z-index:1 too — the same level as composerHero in
           the root stacking context — and ties are broken by DOM order. Appended
           to <body> last, the mark won every tie and painted over the whole
           composer subtree, dropdown included (measured: 12027 changed pixels
           inside the opaque menu box, matching 11002 px found in a real capture).
           At 0 it loses to composerHero (1), the tabs (1) and the composer seat
           (7), yet still paints ABOVE the app frame's own opaque bg-base: the
           frame is position:relative with z-index:auto, so it creates no stacking
           context, both boxes paint in the same step, and the mark is still the
           later sibling. Verified by test/watermark-stacking.test.js. */
        s.zIndex = '0'
        s.fontSize = '9.5vw'
        s.transform = ''
      } else {
        // Fill the conversation column and sit behind its content. z-index:-1 paints
        // below in-flow text but still above the column's own background, which is
        // why the column is given `isolation: isolate` in the stylesheet: without a
        // stacking context there, -1 would slide behind that background and vanish.
        s.position = 'absolute'
        s.left = '0'
        s.right = '0'
        s.top = '0'
        s.bottom = '0'
        s.height = ''
        s.zIndex = '-1'
        s.fontSize = '9.5vw'
        s.transform = ''
      }
    }
    const syncWatermarkVisibility = () => {
      const on = isEnabled() && isWatermarkOn()
      const target = on ? mountPointFor() : null
      // Off the hero page the mark only survives when the persist switch is on.
      // parent can be null during very early boot (no <body> yet) — never mount.
      const shouldShow = target !== null && target.parent !== null
        && (target.mode === 'hero' || isWatermarkPersistOn())
      if (shouldShow && watermarkEl) {
        // A page change can flip the mode or move the parent — restyle/reparent in place.
        if (watermarkEl.getAttribute('data-endfield-watermark') !== target.mode) {
          watermarkEl.setAttribute('data-endfield-watermark', target.mode)
          styleWatermark(watermarkEl, target.mode)
        }
        if (watermarkHost !== target.parent) {
          target.parent.appendChild(watermarkEl)
          watermarkHost = target.parent
        }
      } else if (shouldShow && !watermarkEl) {
        const el = document.createElement('div')
        el.setAttribute('data-endfield-watermark', target.mode)
        /* Translation-proofing. The wordmark is a brand name that must never be
           rewritten by Chrome/Edge "translate this page", a Google Translate widget
           or a translator extension.
           The real defence is structural: the glyphs come from CSS `content` on a
           ::before (see the stylesheet), so there is NO DOM text node to translate —
           text-walking translators cannot see it at all. The attributes below are the
           declarative belt-and-braces for anything that inspects the element itself:
             translate="no"   — the HTML5 opt-out honoured by Chrome/Edge translate
             class notranslate — Google Translate's own opt-out hook
             lang="en"        — stops "this looks like Chinese page text" heuristics
           aria-hidden keeps a purely decorative mark out of the accessibility tree. */
        el.setAttribute('translate', 'no')
        el.setAttribute('lang', 'en')
        el.setAttribute('aria-hidden', 'true')
        el.className = 'notranslate'
        styleWatermark(el, target.mode)
        target.parent.appendChild(el)
        watermarkEl = el
        watermarkHost = target.parent
      } else if (!shouldShow && watermarkEl) {
        if (watermarkEl.parentNode) watermarkEl.parentNode.removeChild(watermarkEl)
        watermarkEl = null
        watermarkHost = null
      }
      // While visible, follow the headline every frame (page switches, sidebar
      // width changes, animations) — no reliance on observer timing. The persist
      // placement is pure CSS, so it needs no frame loop.
      const needsLoop = watermarkEl !== null && watermarkEl.getAttribute('data-endfield-watermark') === 'hero'
      if (needsLoop && !watermarkRaf && typeof requestAnimationFrame === 'function') {
        watermarkRaf = requestAnimationFrame(watermarkRafLoop)
      } else if (!needsLoop && watermarkRaf !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(watermarkRaf)
        watermarkRaf = null
      }
    }
    const onWatermarkResize = () => { if (watermarkEl) positionWatermark() }
    let contourScrollHook = () => {}
    let contourScrollEndHook = () => {}
    const onContourScrollEvent = () => { contourScrollHook() }
    const onContourScrollEndEvent = () => { contourScrollEndHook() }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', onWatermarkResize)
      window.addEventListener('scroll', onContourScrollEvent, true)
      window.addEventListener('scrollend', onContourScrollEndEvent, true)
    }
    let watermarkObserver = null
    /* Assigned to syncContour once that is defined below. Declared here as a real
       mutable binding rather than referenced directly, because a `const` declared
       later is in its temporal dead zone during apply() — and `typeof` does NOT
       protect against a TDZ ReferenceError the way it does for an undeclared name. */
    let contourSyncHook = () => {}
    /* The bundle can be evaluated before <body> exists (the same window runLoader
       defends with a DOMContentLoaded deferral). The old code created the observer
       only when body was already there and never retried, so an early-boot apply
       left the watermark and the contour sheet without their (re)attach channel
       for good. Deferred install instead, and right after installing, catch up on
       everything the observer missed while it did not exist yet. */
    const installWatermarkObserver = () => {
      if (watermarkObserver !== null) return
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || document.body === null) return
      watermarkObserver = new MutationObserver(() => {
        syncWatermarkVisibility()
        // The app frame does not exist during early boot and is replaced on some
        // route changes, so the layer has to be able to (re)attach later. This
        // fires on every DOM change on the page, including every streaming token,
        // so the hook's first act is an O(1) "still attached?" check.
        contourSyncHook()
      })
      watermarkObserver.observe(document.body, { childList: true, subtree: true })
    }
    const watermarkObserverLate = () => {
      installWatermarkObserver()
      if (watermarkObserver === null) return
      syncWatermarkVisibility()
      contourSyncHook()
    }
    if (typeof document !== 'undefined' && document.body !== null) installWatermarkObserver()
    else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', watermarkObserverLate, { once: true })
    }

    /* ---------- contour (topographic) background ------------------------------
       A signal-yellow topographic sheet behind the whole app, in the style of the
       supplied reference: thin even strokes, organic spacing, one continuous
       landscape.

       ARCHITECTURE (rewritten per the contour spec). The previous engine kept a
       LIVE field: 22 gaussian bumps plus sine ridges were re-evaluated and
       re-extracted ~24 times per second so loops could breathe, merge and split.
       The spec forbids exactly that: contours must not deform over time. The
       pipeline is now strictly generate-once, translate-forever:

         seed (one per page load)
           -> TILEABLE fBm Perlin height field; the gradient lattice wraps
              modulo each octave's integer period, so the field is exactly
              periodic in both axes
           -> min/max scan -> N iso-levels (from the density setting)
           -> marching squares ONCE (edge-ID stitching kept from the old code)
           -> Chaikin + clamped cubic B-spline strokes rendered ONCE into a large
              cache canvas (the "texture": ~3x the viewport per axis, capped)
           -> per frame: offset += direction * px/s * dt; blit the cache with
              wrap-around (at most 4 drawImage calls). No per-frame noise, no
              per-frame field, no per-frame extraction, no per-frame path work.

       WHY THE FIELD IS TILEABLE. Scrolling any non-tileable texture eventually
       shows its edge; the spec demands a wrap the eye cannot find. Wrapping the
       gradient-lattice indices modulo each octave's integer period makes
       noise(x + tw) == noise(x) EXACTLY for every octave, so the cache can be
       blitted with wrap-around and the seam is mathematically invisible: same
       gradients, same values, same strokes on both sides. That also gives the
       long period for free -- the texture is ~3x the viewport, so at the default
       medium speed (48 px/s) a full wrap takes on the order of a minute, and no
       "same hill returns" pop exists because the wrap IS the same hill, joined
       smoothly.

       UNITS. Field, extraction and stroke geometry all live in CSS px. The cache
       and the viewport canvas are backing stores at capped devicePixelRatio; the
       cache is rendered through a transform whose scale is EXACTLY
       (device width / css width), so the rendered content is exactly periodic in
       device pixels and the 1:1 blit never shows a seam even at 1.25/1.5 DPR.
       Scroll velocity is defined in CSS px/s and multiplied by the DPR once, in
       contourRefreshMotion's caller (the frame), never per frame.

       SETTINGS. Five keys, all read through prefsGet with clamped fallbacks so a
       corrupt stored value can never wedge the feature:
         CONTOUR_KEY            the layer itself (default OFF - it is decoration)
         CONTOUR_ANIM_KEY       the SCROLL switch (keeps the historic key and its
                                default, so existing installs migrate silently)
         CONTOUR_DIR_KEY        0..7 -> up, up-right, right, ... (clockwise)
         CONTOUR_SPEED_KEY      0..4 -> 12/24/48/96/192 px per SECOND, never px per
                                frame, so 60/120/144/240 Hz all move identically
         CONTOUR_DENSITY_KEY    0..3 -> iso-level count 8/14/22/34; changing it
                                re-extracts from the SAME field (terrain unchanged)
         CONTOUR_SCROLL_PAUSE_KEY  keep the upstream behaviour: the sheet freezes
                                while the user scrolls the page, resumes ~10ms after
       Switching direction or speed never regenerates anything: the cached texture
       is a finished picture and the loop just reads the new velocity. Switching
       density re-extracts + re-renders the cache once (still no per-frame work).
       The old FPS switch is gone by design: scroll motion is position-based
       (px/s * dt), so its smoothness is the display's refresh rate, not a chosen
       simulation rate.

       Reduced-motion users get the pattern without the motion: the sheet renders
       statically and no rAF loop is ever started.

       WHERE IT IS MOUNTED, and why this specific parent. Measured from the app's
       own CSS, three elements paint an OPAQUE --dsw-alias-bg-base over any
       body-level layer: the app frame ([class*='_frame']), the conversation column
       ([class*='wSkVaW_root']) and the details column. A fixed <body> child would
       therefore be invisible on every real page. The layer is instead a child of
       the app FRAME, with those descendant fills neutralised to transparent while
       the layer is mounted (the :has() guard makes all of it vanish when off).
       The frame is already position:relative and creates NO stacking context, so
       an inset:0 z-index:0 child sits above the frame's own background and below
       every positioned descendant. The sidebar keeps its own colour because in
       this theme --dsw-specific-sidebar-fill and --dsw-alias-bg-base are the same
       value, so making it transparent changes no pixel except letting the sheet
       through.

       COST. One build (field + extraction + one stroke pass into the cache) at
       mount and on real size changes; per frame only a clearRect plus at most 4
       drawImage calls at integer offsets. Completely idle when the layer or the
       scroll switch is off: the rAF loop is NOT scheduled at all, it does not
       tick-and-return. */

    const CONTOUR_KEY = PREFS_NS + '-contour'
    /* Kept as the historic key on purpose: the old "morph animation" switch
       becomes the scroll switch, so an existing install migrates with no
       migration code. */
    const CONTOUR_ANIM_KEY = PREFS_NS + '-contour-anim'
    /* Repurposed: the stored value is now an INDEX into CONTOUR_SPEEDS, not the
       old 1/2/4 multiplier. Values outside 0..4 fall back to the default. */
    const CONTOUR_SPEED_KEY = PREFS_NS + '-contour-speed'
    const CONTOUR_DIR_KEY = PREFS_NS + '-contour-dir'
    const CONTOUR_DENSITY_KEY = PREFS_NS + '-contour-density'
    /* Terrain roughness (index into CONTOUR_ROUGHNESS_*): the one setting that
       changes the SHAPE of the landscape rather than how it is drawn. */
    const CONTOUR_ROUGHNESS_KEY = PREFS_NS + '-contour-roughness'
    const CONTOUR_SCROLL_PAUSE_KEY = PREFS_NS + '-contour-scroll-pause'
    // Default OFF (=== '1'): a background pattern must be opt-in.
    const isContourOn = () => prefsGet(CONTOUR_KEY) === '1'
    // Scroll defaults ON, so enabling the layer shows the full effect at once.
    const isContourAnimOn = () => prefsGet(CONTOUR_ANIM_KEY) !== '0'
    const isContourScrollPauseOn = () => prefsGet(CONTOUR_SCROLL_PAUSE_KEY) !== '0'

    /* Scroll directions, clockwise from up. Diagonals are normalised so "fast"
       is the same SPEED on every direction rather than 1.41x faster there. */
    const CONTOUR_DIRS = [
      [0, -1],                    // up      (the texture moves up)
      [0.70710678, -0.70710678],  // up-right
      [1, 0],                     // right
      [0.70710678, 0.70710678],   // down-right
      [0, 1],                     // down
      [-0.70710678, 0.70710678],  // down-left
      [-1, 0],                    // left
      [-0.70710678, -0.70710678], // up-left
    ]
    /* Real-space speeds in CSS px/second. The frame advances the offset by
       speed * DPR * dt, so 60 Hz and 240 Hz cover the same distance per second. */
    const CONTOUR_SPEEDS = [12, 24, 48, 96, 192]
    /* Density = number of iso-levels between the field's padded min and max.
       This IS the spec's "height step = terrain range / contourCount", expressed
       as a count: sparse keeps wide vertical gaps, very dense tight ones. */
    const CONTOUR_DENSITIES = [8, 14, 22, 34]
    const CONTOUR_SPEED_DEFAULT = 2 // index into CONTOUR_SPEEDS: 48 px/s

    /* Integer-setting reader. parseInt on garbage yields NaN -> the default, and
       out-of-range values clamp, so a hand-edited pref can select only states the
       UI itself offers. */
    const contourReadIndex = (key, max, fallback) => {
      const n = parseInt(prefsGet(key), 10)
      if (!Number.isFinite(n) || n < 0) return fallback
      return n > max ? max : n
    }
    const contourDirIndex = () => contourReadIndex(CONTOUR_DIR_KEY, CONTOUR_DIRS.length - 1, 0)
    const contourSpeedIndex = () => contourReadIndex(CONTOUR_SPEED_KEY, CONTOUR_SPEEDS.length - 1, CONTOUR_SPEED_DEFAULT)
    const contourDensityIndex = () => contourReadIndex(CONTOUR_DENSITY_KEY, CONTOUR_DENSITIES.length - 1, 1)

    const CONTOUR_STEP = 10     // grid pitch in CSS px; 10 measured as the cost/detail knee
    /* Texture sizing. ~3x the viewport per axis gives a wrap period of roughly a
       minute at default speed; the area cap (~8.3M CSS px) and the 4096px per-side
       device cap keep memory sane and stay inside the 4096 texture limit of older
       GPUs. Targets are quantised to a 128px grid so that sub-page resizes (a 2px
       drag) do not regenerate the landscape at all. */
    const CONTOUR_TEX_MULT = 3
    const CONTOUR_TEX_MAX_AREA = 8.3e6      // CSS px^2
    const CONTOUR_TEX_MAX_DIM = 4096        // device px per side
    const CONTOUR_TEX_QUANT = 128           // CSS px
    /* Terrain shape. BASE_CELL is the approximate CSS-px size of the largest
       noise cell (hills land a few hundred px across, like a real topo map);
       5 octaves at persistence 0.5 add ridge/valley detail and a light grain.
       PERIOD_MAX keeps perm-table indexing safe: octave periods never exceed
       240, so the permutation lookups below cannot run past the table. */
    const CONTOUR_BASE_CELL = 280
    const CONTOUR_OCTAVES = 5
    const CONTOUR_PERSIST = 0.5
    const CONTOUR_PERIOD_MAX = 240

    /* Terrain ROUGHNESS — the fBm spectrum of the height field, from flat plains
       (low) to extreme mountains (high). Twelve stops, one slider detent each.
       Three parallel tables hold the whole terrain character:
         BASE_CELL  CSS-px size of the LARGEST noise cell. Large = broad, gentle
                    swells a few hundred px across (plains); small = short,
                    closely packed hills (mountains).
         PERSIST    amplitude ratio between successive octaves, i.e. how much
                    energy the fine detail carries. Low = only the big shapes
                    survive (smooth, wide-spaced contours); high = structure at
                    every scale (nested rings, jagged-looking lines).
         OCTAVES    upper bound for the ladder of scales. The ladder stops early
                    when the next octave's lattice period would pass
                    CONTOUR_PERIOD_MAX: such an octave can only re-add the already
                    clamped coarsest-fine scale instead of a finer one, which
                    piles near-grid noise onto the field for nothing (see
                    contourOctaveLadder).
       Every table must stay sorted from plains to mountains (asserted by
       test/contour-roughness.test.js).
       HOW THE 12 STOPS WERE TUNED. The tables come from a rendered sweep of the
       whole ladder (extract every stop, rasterise the contours, compare). Two
       limits showed up there and shaped the numbers:
         - LEGIBILITY: once the finest octave of the ladder carries more than
           roughly a tenth of the total amplitude AND sits near the 10px grid
           pitch, the sheet stops reading as terrain and turns into uniform
           speckle. That is why persistence is capped at 0.62 (the top stops also
           pin the base cell so the ladder keeps its fifth octave, which spreads
           the fine energy over a second scale instead of concentrating it).
         - DISTINCT DETENTS: the base cell is quantised to an integer lattice
           period per texture, so two adjacent stops whose cells round to the same
           period look identical. The low half therefore steps through distinct
           periods (ceil to 4..12 cells across the texture) and the top half, where
           the period saturates, is carried by persistence alone.
       CONTOUR_ROUGHNESS_DEFAULT is the stop the theme has always shipped: its
       three entries ARE the CONTOUR_BASE_CELL / CONTOUR_PERSIST / CONTOUR_OCTAVES
       constants above, so the long-standing landscape is literally those
       numbers and can never drift away from them silently. */
    const CONTOUR_ROUGHNESS_DEFAULT = 7
    const CONTOUR_ROUGHNESS_BASE = [960, 768, 640, 549, 480, 427, 384, CONTOUR_BASE_CELL, 360, 440, 520, 600]
    const CONTOUR_ROUGHNESS_PERSIST = [0.24, 0.28, 0.32, 0.36, 0.39, 0.42, 0.45, CONTOUR_PERSIST, 0.50, 0.52, 0.54, 0.56]
    const CONTOUR_ROUGHNESS_OCTAVES = [2, 3, 3, 4, 4, 4, 5, CONTOUR_OCTAVES, 5, 5, 5, 5]
    /* PLATEAUS AND CLIFFS are now two tables of the landform layer
       (CONTOUR_TERRAIN_PLATEAU, CONTOUR_TERRAIN_CLIFF) further down: a whole-field
       staircase for 高原, and the same staircase applied INSIDE bands for 悬崖. */
    /* Staircase shape, derived from that strength:
         STEPS     how many plateau levels the field is quantised into. Too few and
                   the plateaus swallow the whole sheet (no contour anywhere); too
                   many and the cliffs are single lines instead of bundles.
         SOFT      half-width of the ramp, in step units. This is what makes an edge
                   a cliff: the ramp carries the same height change over a fraction
                   of the distance, so the local gradient — and therefore the line
                   density — is multiplied by ~1/(2*SOFT*strength).
       Tuned by rendering true-scale strips across candidate shapes and reading the
       sheet back: the shipped 2 + round(4*strength) puts stops 10/11/12 at 4/5/6
       levels with empty plateaus covering ~18 / 35 / 35 percent of the sheet and a
       rising share of lines sitting on the ramps. Wider spans (7..9 levels) look
       better on paper and worse on screen: the plateaus grow until a third of the
       sheet is empty and the cliffs thin back out to single lines. */
    const CONTOUR_TERRACE_STEPS_BASE = 2
    const CONTOUR_TERRACE_STEPS_SPAN = 4
    const CONTOUR_TERRACE_SOFT = 0.5
    const contourRoughnessIndex = () => contourReadIndex(
      CONTOUR_ROUGHNESS_KEY, CONTOUR_ROUGHNESS_BASE.length - 1, CONTOUR_ROUGHNESS_DEFAULT)
    /* The roughness stop as the generator needs it: the fBm ladder (cell,
       persistence, octave budget) plus the landform row for that stop. Resolved
       HERE, once per build, not per sample. */
    const contourTerrainProfile = () => {
      const i = contourRoughnessIndex()
      const row = contourTerrainRow()
      row.baseCell = CONTOUR_ROUGHNESS_BASE[i]
      row.persist = CONTOUR_ROUGHNESS_PERSIST[i]
      row.octaves = CONTOUR_ROUGHNESS_OCTAVES[i]
      return row
    }
    /* The soft staircase behind 高原 + 悬崖 (see CONTOUR_ROUGHNESS_TERRACE).
       u is the position inside the field's own [min,max], strength is 0..1.
       C1-CONTINUOUS ON PURPOSE: the step edges are smoothsteps, not a hard
       floor(). A hard quantiser would put genuine slope discontinuities into the
       field, and the contours crossing them carry corners no amount of Chaikin /
       B-spline smoothing can remove — the cusp suite asserts that no turn above 8
       degrees survives anywhere in its sweep, and it sweeps these stops too. Soft
       edges are steep, not broken: the lines bunch up without kinking.
       Pointwise, so tileability and determinism are untouched, and it fixes the
       range's own endpoints (mn -> mn, mx -> mx), which keeps the iso-levels
       derived from that range crossing the terrain. */
    const contourStair = (u, steps, w) => {
      if (!(steps > 1)) return u
      const x = u * steps
      const i = Math.floor(x)
      const f = x - i
      const t = f <= w ? 0 : (f >= 1 - w ? 1 : (f - w) / (1 - 2 * w))
      const sm = t * t * (3 - 2 * t)
      const y = (i + sm) / steps
      return y < 0 ? 0 : (y > 1 ? 1 : y)
    }
    const contourTerrace = (u, strength) => {
      if (!(strength > 0)) return u
      const steps = CONTOUR_TERRACE_STEPS_BASE + Math.round(CONTOUR_TERRACE_STEPS_SPAN * strength)
      const w = Math.min(0.45, CONTOUR_TERRACE_SOFT * strength)
      return contourStair(u, steps, w)
    }
    /* The CLIFF shape of the same idea: many steps with thin ramps. A plateau
       wants few steps with wide treads (a floor to stand on), a cliff wants the
       level lines bunched up the face — the two differ in `steps` and `w`, not in
       "how strong" the effect is, so they get their own parameters. */
    const contourCliff = (u, strength) => {
      if (!(strength > 0)) return u
      const s = strength > 1 ? 1 : strength
      const steps = CONTOUR_CLIFF_STEPS_BASE + Math.round(CONTOUR_CLIFF_STEPS_SPAN * s)
      const w = CONTOUR_CLIFF_SOFT_BASE - CONTOUR_CLIFF_SOFT_FALL * s
      return contourStair(u, steps, w < 0.05 ? 0.05 : w)
    }
    /* Apply the staircase in place over the field's actual range (used by the
       landform layer for the whole-field plateau pass). */
    const contourTerraceField = (F, mn, mx, strength) => {
      const span = mx - mn
      if (!(span > 0)) return
      for (let i = 0; i < F.length; i++) F[i] = mn + span * contourTerrace((F[i] - mn) / span, strength)
    }

    /* ======================= 地形特征层 (landform layer) =======================
       Each roughness stop names a terrain CLASS (plains / hills / low, mid, high
       mountains) and a set of landforms, all of them ANALYTIC — no erosion, no
       flow accumulation, no sediment transport. That ceiling is deliberate: a
       physically simulated landscape needs iterative passes over the whole tile
       (water routing, deposition), which would turn a ~90 ms rebuild into seconds,
       break the exactly-tileable guarantee the scroll depends on, and buy detail
       nobody can see in a 1px-stroke background. What a contour sheet actually
       shows of a landform is the SHAPE of its level lines, and every shape below
       comes from either a monotone height remap or a local analytic primitive:

         陡坡/缓坡, 凸坡/凹坡, 均坡   a spatially varying exponent (shape warp)
         阶梯坡 / 高原                the soft staircase (contourTerrace)
         悬崖                         the same staircase inside BANDS only, so the
                                      sheet keeps natural terrain between cliffs
         山脊线/分水岭                ridged noise (1 - |n|), added
         山谷线/冲沟                  narrow troughs at the noise zero crossings
         尖锐山峰/深谷                a smooth tail-steepening polynomial
         海/湖/河漫滩/潟湖            an EXACT plane: everything below the water
                                      level is clamped to it. Water on a contour
                                      map IS flat, and a flat region draws no line
         冲积扇/泥石流扇/三角洲, 火山锥, 火口湖, 天坑/矿坑/冰斗, 沙丘/雅丹,
         峰林/峰丛/角峰, 刃脊, 峡湾/阶地河道, 倒石堆, 沙嘴
                                      parameterised primitives (see
                                      CONTOUR_FEATURE_PALETTES), placed by hashing
                                      a slot grid and evaluated with TOROIDAL
                                      distance, so a primitive straddling the tile
                                      edge is drawn identically on both sides.

       Bookkeeping: every LOCALISED modifier writes its own |height change| into
       field.featAmt and its kind into field.featKind, so "how much of the sheet is
       feature terrain" is measured rather than asserted by eye — the <75% cap and
       the plateau-decreasing / cliff-increasing rules are all assertions in
       test/contour-roughness.test.js. The base-terrain shaping (macro relief,
       slope shape, ridge lines, sharp tails) is NOT counted as coverage: it sets
       the terrain everything else sits in. Coverage counts the landforms a reader
       would point at: plateaus, cliffs, blobs, water. */

    const CONTOUR_FEAT_NONE = 0
    const CONTOUR_FEAT_PLATEAU = 1
    const CONTOUR_FEAT_CLIFF = 2
    const CONTOUR_FEAT_FAN = 3
    const CONTOUR_FEAT_CONE = 4
    const CONTOUR_FEAT_CRATER = 5
    const CONTOUR_FEAT_DUNE = 6
    const CONTOUR_FEAT_PIT = 7
    const CONTOUR_FEAT_ARETE = 8
    const CONTOUR_FEAT_TROUGH = 9
    const CONTOUR_FEAT_KARST = 10
    const CONTOUR_FEAT_TALUS = 11
    const CONTOUR_FEAT_WATER = 12
    /* A cell counts as feature terrain once a modifier moved it by at least this
       share of the field's range — i.e. by about a contour interval or more. */
    const CONTOUR_FEATURE_MIN = 0.02

    /* Terrain class per stop. 0 plains, 1 hills, 2 low mountains, 3 mid mountains,
       4 high mountains. Only a label: the shape of the stop comes from the numbers
       below, and the palettes keyed by this class. */
    const CONTOUR_TERRAIN_CLASS = [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4]
    /* Broad elevation trend (a very low frequency layer). POSITIVE lifts the
       middle of the tile into a plateau/massif, NEGATIVE carves a basin ringed by
       higher ground -- which is what makes a 盆地 read as one. */
    const CONTOUR_TERRAIN_MACRO = [0.16, 0.12, 0.14, 0.16, 0.18, 0.22, 0.24, 0.26, -0.20, 0.00, 0.20, 0.26]
    /* Slope shape: the exponent of u^k follows a low frequency mask, so the same
       stop carries 凹坡 (k > 1, lines bunch at the top) in one region and 凸坡
       (k < 1, lines bunch at the bottom) in another. 均坡 is what remains. */
    const CONTOUR_TERRAIN_SHAPE = [0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.21, 0.24, 0.27, 0.31, 0.35, 0.39]
    /* 山脊线 / 分水岭: how much ridged noise (1 - |n|) is added. Kept a MINORITY
       of the range: ridge noise multiplies the number of local maxima, and the
       measured legibility ceiling (level lines no finer than the 10px sampling
       grid) is set by however many extrema the terrain has per tile. */
    const CONTOUR_TERRAIN_RIDGE = [0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.09, 0.12, 0.15, 0.19, 0.23, 0.28]
    /* 山谷线 / 冲沟: how deep the troughs cut along those zero crossings. */
    const CONTOUR_TERRAIN_VALLEY = [0, 0, 0.01, 0.02, 0.02, 0.03, 0.04, 0.06, 0.08, 0.11, 0.15, 0.19]
    /* 高原: the staircase strength inside PLATEAU BANDS. A landform is a REGION,
       not a filter over the whole sheet: applying the staircase everywhere turned
       the map into a quilt of mesas (measured: 73% of the sheet flat at stop 6,
       with the relief piling up on the seams) — the "mountains chopped flat" this
       design was told to avoid. The band mask leaves natural terrain in between.
       Strength falls from stop 6 to stop 9, then is exactly 0: from stop 10 the
       cliffs below carry the relief instead. */
    const CONTOUR_TERRAIN_PLATEAU = [0, 0, 0, 0, 0, 0.75, 0.60, 0.45, 0.20, 0, 0, 0]
    /* 悬崖: the staircase strength inside CLIFF BANDS, on its own (narrower) mask.
       A cliff is the OTHER staircase shape: many steps with thin ramps, so the
       level lines bunch into a bundle up the face, where a plateau wants few steps
       with wide treads. Ramps up to the maximum at stop 12. */
    const CONTOUR_TERRAIN_CLIFF = [0, 0, 0, 0, 0, 0, 0, 0.10, 0.22, 0.40, 0.64, 0.92]
    /* Band width, per stop: the COVERAGE has to grow towards the top as well, or
       "the cliffs are strongest at 12" would only be true of their steepness.
       Measured, not guessed: |Perlin| is heavily concentrated near zero (|n| < 0.3
       already covers ~70% of a tile), so a band threshold has to be far tighter
       than intuition suggests. These put the plateau bands at roughly a third of
       the sheet and the cliff bands at a quarter to a third, together comfortably
       inside the <75% ceiling, with natural terrain left in the gaps. */
    const CONTOUR_PLATEAU_BAND = 0.13
    const CONTOUR_CLIFF_BAND = 0.11
    const CONTOUR_TERRAIN_CLIFFBAND = [0, 0, 0, 0, 0, 0, 0, 0.09, 0.11, 0.14, 0.18, 0.25]
    const CONTOUR_CLIFF_STEPS_BASE = 3
    const CONTOUR_CLIFF_STEPS_SPAN = 5
    const CONTOUR_CLIFF_SOFT_BASE = 0.22
    const CONTOUR_CLIFF_SOFT_FALL = 0.16
    /* 尖锐山峰 / 深谷: the tail-steepening polynomial (contourReliefWarp). Two
       sharp ends on a gentle middle slope -- high mountains at the top stops.
       Capped well below 1: the warp's own middle flattens as 1 - r, so a large r
       would buy sharp summits by turning the mid-slope into yet another plateau. */
    const CONTOUR_TERRAIN_RELIEF = [0, 0, 0, 0, 0, 0, 0.03, 0.08, 0.18, 0.34, 0.46, 0.58]
    /* Water level as a share of the range, NEGATIVE = no water at this stop. The
       plains and basins keep lakes and rivers; the high mountains keep cirque
       lakes and a fjord; the mid stops stay dry so the contour structure reads. */
    const CONTOUR_TERRAIN_WATER = [0.34, 0.28, 0.22, 0.18, 0.12, 0.08, -1, -1, -1, -1, 0.16, 0.22]
    /* Blob density: the share of the 4x4 feature slots that spawn a primitive. */
    const CONTOUR_TERRAIN_BLOBS = [0.30, 0.34, 0.38, 0.42, 0.44, 0.47, 0.50, 0.53, 0.58, 0.66, 0.80, 0.94]
    /* How large a primitive is, as a share of its slot. */
    const CONTOUR_TERRAIN_BLOBSCALE = [0.80, 0.82, 0.85, 0.88, 0.90, 0.92, 0.95, 0.98, 1.02, 1.08, 1.16, 1.26]
    /* Feature palettes per terrain class. Ids repeated to weight them. */
    const CONTOUR_PALETTE_0 = [3, 3, 9, 9, 6, 6, 7, 8]
    const CONTOUR_PALETTE_1 = [3, 3, 11, 11, 10, 9, 6, 7]
    const CONTOUR_PALETTE_2 = [3, 11, 11, 4, 10, 10, 9, 5]
    const CONTOUR_PALETTE_3 = [5, 5, 4, 4, 8, 8, 10, 11]
    const CONTOUR_PALETTE_4 = [5, 5, 4, 8, 8, 9, 10, 11]
    /* Single line on purpose: the test harnesses slice declarations by name, so a
       declaration that spans lines cannot be extracted. */
    const CONTOUR_FEATURE_PALETTES = [CONTOUR_PALETTE_0, CONTOUR_PALETTE_1, CONTOUR_PALETTE_2, CONTOUR_PALETTE_3, CONTOUR_PALETTE_4]
    /* The slot grid: 4x4 primitives per tile. Larger grids mean smaller, busier
       features; 16 keeps a 1px contour sheet readable at any texture size. */
    const CONTOUR_FEATURE_GRID = 4

    const contourTerrainRow = () => {
      const i = contourRoughnessIndex()
      return {
        cls: CONTOUR_TERRAIN_CLASS[i],
        macro: CONTOUR_TERRAIN_MACRO[i],
        shape: CONTOUR_TERRAIN_SHAPE[i],
        ridge: CONTOUR_TERRAIN_RIDGE[i],
        valley: CONTOUR_TERRAIN_VALLEY[i],
        plateau: CONTOUR_TERRAIN_PLATEAU[i],
        cliff: CONTOUR_TERRAIN_CLIFF[i],
        cliffBand: CONTOUR_TERRAIN_CLIFFBAND[i],
        relief: CONTOUR_TERRAIN_RELIEF[i],
        water: CONTOUR_TERRAIN_WATER[i],
        blobs: CONTOUR_TERRAIN_BLOBS[i],
        blobScale: CONTOUR_TERRAIN_BLOBSCALE[i],
      }
    }

    /* Integer, tileable noise period for a feature scale (in lattice cells).
       Kept well inside CONTOUR_PERIOD_MAX so the permutation table stays safe. */
    const contourFeaturePeriod = (size, baseCell, scale) => {
      const p = Math.round(size / (baseCell * scale))
      return p < 2 ? 2 : (p > 64 ? 64 : p)
    }
    /* Deterministic 32-bit hash of three integers, used to derive every primitive
       parameter from (slot, stop, seed). A hash rather than a stored list: the
       landscape must stay reproducible from the seed alone, and a primitive must be
       derivable in O(1) wherever it is needed. */
    const contourHash3 = (a, b, c) => {
      let h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B)
      h = Math.imul(h ^ ((b | 0) + 0x165667B1), 0xC2B2AE35)
      h = Math.imul(h ^ ((c | 0) + 0x27D4EB2F), 0x165667B1)
      h ^= h >>> 15
      h = Math.imul(h, 0x2545F491)
      h ^= h >>> 13
      return h >>> 0
    }
    const contourHash01 = (a, b, c) => contourHash3(a, b, c) / 4294967296

    /* 凸坡 / 凹坡 / 均坡. g(u) = u^k with k driven by a low frequency mask: k < 1
       bunches the level lines at the BOTTOM of the slope (凸坡, lines sparse above,
       dense below), k > 1 at the TOP (凹坡). Both are monotone and fix the
       endpoints, so the field's range is untouched. */
    const contourShapeWarp = (u, k) => {
      if (k === 1) return u
      if (u <= 0) return 0
      if (u >= 1) return 1
      return Math.pow(u, k)
    }
    /* 尖锐山峰 + 深谷 in one smooth polynomial: g = u + 2r*u(1-u)(2u-1), whose
       derivative is 1 + 2r(6u^2 - 6u + 1) — steepest at both ends (summits and
       valley floors), gentlest in between. FINITE derivative everywhere, unlike
       u^p (p < 1) whose slope runs to infinity at an endpoint and whose innermost
       level lines can fall below the 10px sampling grid; the cusp suite asserts the
       drawn curves of every stop stay under 8 degrees. r is capped below 1 so the
       map stays monotone (g' at the middle is 1 - r). */
    const contourReliefWarp = (u, r) => {
      const y = u + 2 * r * u * (1 - u) * (2 * u - 1)
      return y < 0 ? 0 : (y > 1 ? 1 : y)
    }
    /* ~1 for the corners of the noise range of contourNoise (|Perlin| <= 1/sqrt2). */
    const CONTOUR_NOISE_NORM = 1.41421356
    /* Ridged noise: peaks along the zero crossings of an octave, in 0..1. 山脊线
       (a divide: water sheds to both sides) is exactly this on a contour map. */
    const contourRidgeAt = (x, y, tw, th, px, py) => {
      const n = contourNoise((x / tw) * px, (y / th) * py, px, py) * CONTOUR_NOISE_NORM
      const a = n < 0 ? -n : n
      return a > 1 ? 0 : 1 - a
    }
    /* Valley lines / gullies: a narrow trough at the zero crossing of its own
       octave, so 山谷线 (the line that collects water) is a smooth V in plan view. */
    const contourValleyAt = (x, y, tw, th, px, py) => {
      const n = contourNoise((x / tw) * px, (y / th) * py, px, py) * CONTOUR_NOISE_NORM
      const a = n < 0 ? -n : n
      return a > 1 ? 0 : (1 - a) * (1 - a)
    }
    /* Smoothstep on an already clamped 0..1 input. */
    const contourSmooth = (t) => t * t * (3 - 2 * t)

    /* One analytic primitive, added into the normalised field.
       kind selects the shape. dx/dy are the SHORTEST SIGNED toroidal offsets to
       the primitive's centre: every shape below is a function of those, never of
       the raw position, which is what keeps a primitive that straddles the tile
       edge identical on both sides. amp is in units of the field's range. */
    const contourPrimitiveDelta = (kind, dx, dy, rad, ang, phase, amp) => {
      const d = Math.sqrt(dx * dx + dy * dy)
      const t = 1 - d / rad
      if (t <= 0) return 0
      const along = dx * Math.cos(ang) + dy * Math.sin(ang)
      const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang))
      switch (kind) {
        /* 冲积扇 / 洪积扇 / 泥石流扇 / 三角洲: a fan, apex at the centre, toe at
           the radius, with a concave-up profile like a real deposit. */
        case CONTOUR_FEAT_FAN: return amp * t * t * (0.6 + 0.4 * contourSmooth(t))
        /* 火山锥: cone with a crater at the summit. */
        case CONTOUR_FEAT_CONE:
          return amp * Math.pow(t, 1.2) - (d < rad * 0.26 ? amp * 0.75 * (1 - d / (rad * 0.26)) : 0)
        /* 火口湖 / 冰斗 / 潟湖: a bowl. Its floor can drop under the water level,
           in which case the water plane fills it — a lake where the terrain says
           there should be one. */
        case CONTOUR_FEAT_CRATER: {
          const r = d / rad
          return -amp * Math.pow(1 - r * r, 0.7)
        }
        /* 天坑 / 矿坑: nearly cylindrical, steep walls, flat floor. */
        case CONTOUR_FEAT_PIT: {
          const r = d / rad
          return -amp * Math.pow(1 - Math.pow(r, 6), 0.5)
        }
        /* 沙丘 / 雅丹: directional ripples, damped to zero at the rim. */
        case CONTOUR_FEAT_DUNE: {
          const lam = rad / 3.5
          return amp * 0.5 * (0.5 + 0.5 * Math.sin(phase + (along / lam) * 6.2831853)) * Math.pow(t, 0.5)
        }
        /* 刃脊 / 沙嘴: an elongated crest (a 刃脊 is a knife-edge between two
           cirques; a 沙嘴 is the same shape built of sand at the shore). */
        case CONTOUR_FEAT_ARETE: {
          const w = rad * 0.28
          if (perp >= w) return 0
          return amp * Math.pow(1 - perp / w, 1.2) * Math.pow(t, 0.4)
        }
        /* 峡湾 / 河漫滩 / 阶地河道: an elongated trough with stepped sides — the
           staircase in the cross-slope direction, not in height, which is what a
           river terrace looks like on a contour sheet. */
        case CONTOUR_FEAT_TROUGH: {
          const w = rad * 0.5
          if (perp >= w) return 0
          const tier = contourTerrace(perp / w, 0.55)
          return -amp * (1 - tier) * Math.pow(t, 0.35)
        }
        /* 峰林 / 峰丛 / 角峰: several sharp towers inside one blob, the karst
           signature (little level rings packed together). */
        case CONTOUR_FEAT_KARST: {
          const r = d / rad
          const lobes = 0.45 + 0.55 * Math.abs(Math.cos(3 * Math.atan2(dy, dx) + phase))
          return amp * Math.pow(1 - r, 2.1) * lobes
        }
        /* 倒石堆 / 火山碎屑裙: a low cone at the foot of the feature next to it. */
        case CONTOUR_FEAT_TALUS: return amp * 0.6 * Math.pow(t, 2)
        default: return 0
      }
    }

    /* Place and apply the primitives for one stop: a fixed slot grid, one
       primitive per slot, parameters hashed from (slot, class, seed). */
    const contourApplyPrimitives = (U, field, prof) => {
      const cols = field.cols
      const rows = field.rows
      const step = field.step
      const tw = field.tw
      const th = field.th
      const amt = field.featAmt
      const kind = field.featKind
      const palette = CONTOUR_FEATURE_PALETTES[prof.cls]
      const G = CONTOUR_FEATURE_GRID
      const sw = tw / G
      const sh = th / G
      const span = field.mx - field.mn
      const ampUnit = span > 0 ? 1 : 0
      for (let sy = 0; sy < G; sy++) {
        for (let sx = 0; sx < G; sx++) {
          const h0 = contourHash3(sx * 73856093 + 0x51ed270b, sy * 19349663 + 0x27d4eb2f, contourSeed)
          const h1 = contourHash3(h0, prof.cls + 17, contourSeed ^ 0x165667b1)
          const h2 = contourHash3(h1, sx + sy * 31, contourSeed ^ 0x9e3779b9)
          if ((h0 >>> 8) / 16777216 >= prof.blobs) continue
          const kd = palette[(h1 >>> 5) % palette.length]
          const r1 = ((h1 >>> 11) & 1023) / 1024
          const r2 = ((h1 >>> 21) & 1023) / 1024
          const r3 = ((h2 >>> 3) & 1023) / 1024
          const r4 = ((h2 >>> 13) & 1023) / 1024
          const r5 = ((h2 >>> 23) & 511) / 512
          const cx = (sx + 0.12 + 0.76 * r1) * sw
          const cy = (sy + 0.12 + 0.76 * r2) * sh
          const rad = prof.blobScale * (0.55 + 0.75 * r3) * Math.min(sw, sh) * 0.48
          if (!(rad > step)) continue
          const ang = r4 * 6.2831853
          const phase = r5 * 6.2831853
          /* Amplitude in units of the range: big enough to reshape the terrain,
             small enough that the feature stays a landform and not the terrain. */
          const amp = ampUnit * (0.07 + 0.11 * prof.blobs)
          const i0 = Math.floor((cx - rad) / step)
          const i1 = Math.ceil((cx + rad) / step)
          const j0 = Math.floor((cy - rad) / step)
          const j1 = Math.ceil((cy + rad) / step)
          const halfW = tw * 0.5
          const halfH = th * 0.5
          for (let j = j0; j <= j1; j++) {
            const yy = j * step
            let sdy = yy - cy
            /* Shortest SIGNED offset: the primitive is periodic, so a cell is
               influenced by whichever wrap of the centre is nearer. */
            if (sdy > halfH) sdy -= th
            else if (sdy < -halfH) sdy += th
            /* The storage index comes from the WRAPPED COORDINATE. Wrapping the
               index instead would be wrong wherever the tile is not a whole number
               of grid cells (which is the common case: the texture is quantised to
               128px against a 10px grid), because one index step would then mean
               slightly more than one period and the feature would be displaced by
               up to a cell across the seam -- caught by the seam check in the
               tuning harness as a 2e-2 discontinuity on an exact tiling. */
            const yw = yy - Math.floor(yy / th) * th
            let jj = Math.round(yw / step)
            if (jj > rows - 1) jj = rows - 1
            else if (jj < 0) jj = 0
            const row = jj * cols
            for (let i = i0; i <= i1; i++) {
              const xx = i * step
              let sdx = xx - cx
              if (sdx > halfW) sdx -= tw
              else if (sdx < -halfW) sdx += tw
              if (sdx * sdx + sdy * sdy > rad * rad) continue
              const xw = xx - Math.floor(xx / tw) * tw
              let ii = Math.round(xw / step)
              if (ii > cols - 1) ii = cols - 1
              else if (ii < 0) ii = 0
              const idx = row + ii
              const before = U[idx]
              const after = before + contourPrimitiveDelta(kd, sdx, sdy, rad, ang, phase, amp)
              U[idx] = after
              const diff = after > before ? after - before : before - after
              if (diff > amt[idx]) {
                amt[idx] = diff
                kind[idx] = kd
              }
            }
          }
        }
      }
    }

    /* Apply the whole landform layer to a freshly generated fBm field, in place.
       The order is deliberate:
         1. normalise the fBm to 0..1 (every feature below is resolution-blind);
         2. ADDITIVE features (macro relief, ridge lines, gullies, primitives) —
            they define the terrain the warps then shape;
         3. re-normalise (step 2 moved the range);
         4. MONOTONE warps: slope shape, staircase (plateau), banded staircase
            (cliffs), sharp tails;
         5. the water plane LAST: clamping to a level only stays a perfect plane if
            nothing warps the field after it;
         6. write back into the BASE range and recompute mn/mx, so the iso-levels
            are derived from what is really there (a lake raises the minimum). */
    const contourApplyLandforms = (field, prof) => {
      const F = field.F
      const U = field.uScratch
      const amt = field.featAmt
      const kind = field.featKind
      const cols = field.cols
      const rows = field.rows
      const step = field.step
      const tw = field.tw
      const th = field.th
      const n = cols * rows
      const baseMn = field.mn
      const baseSpan = field.mx - field.mn
      if (!(baseSpan > 0) || U === null || n === 0) return
      const inv = 1 / baseSpan
      for (let i = 0; i < n; i++) {
        U[i] = (F[i] - baseMn) * inv
        amt[i] = 0
        kind[i] = CONTOUR_FEAT_NONE
      }
      const bcell = prof.baseCell > 0 ? prof.baseCell : 280
      /* --- stage 2: additive base features ------------------------------------ */
      const pmx = contourFeaturePeriod(tw, bcell, 3.4)
      const pmy = contourFeaturePeriod(th, bcell, 3.4)
      const prx = contourFeaturePeriod(tw, bcell, 3.0)
      const pry = contourFeaturePeriod(th, bcell, 3.0)
      const pvx = contourFeaturePeriod(tw, bcell, 2.2)
      const pvy = contourFeaturePeriod(th, bcell, 2.2)
      const macro = prof.macro
      const ridge = prof.ridge
      const valley = prof.valley
      for (let j = 0; j < rows; j++) {
        const y = j * step
        const row = j * cols
        for (let i = 0; i < cols; i++) {
          const x = i * step
          let u = U[row + i]
          if (macro !== 0) u += macro * contourNoise((x / tw) * pmx, (y / th) * pmy, pmx, pmy) * CONTOUR_NOISE_NORM
          if (ridge > 0) u += ridge * (contourRidgeAt(x, y, tw, th, prx, pry) - 0.5)
          if (valley > 0) u -= valley * contourValleyAt(x, y, tw, th, pvx, pvy)
          U[row + i] = u
        }
      }
      if (prof.blobs > 0) contourApplyPrimitives(U, field, prof)
      /* --- stage 3: renormalise ---------------------------------------------- */
      let mn2 = Infinity
      let mx2 = -Infinity
      for (let i = 0; i < n; i++) {
        const u = U[i]
        if (u < mn2) mn2 = u
        if (u > mx2) mx2 = u
      }
      const span2 = mx2 - mn2
      if (!(span2 > 0)) return
      const inv2 = 1 / span2
      for (let i = 0; i < n; i++) U[i] = (U[i] - mn2) * inv2
      /* --- stage 4: monotone warps -------------------------------------------- */
      const shape = prof.shape
      const plateau = prof.plateau
      const cliff = prof.cliff
      const relief = prof.relief
      /* One period per mask, coarser for the plateau regions than for the cliff
         bands: plateaus are broad areas of the sheet, cliffs are the narrower
         faces inside them. */
      const psx = contourFeaturePeriod(tw, bcell, 1.6)
      const psy = contourFeaturePeriod(th, bcell, 1.6)
      const pbx = contourFeaturePeriod(tw, bcell, 2.6)
      const pby = contourFeaturePeriod(th, bcell, 2.6)
      const pcx = contourFeaturePeriod(tw, bcell, 1.8)
      const pcy = contourFeaturePeriod(th, bcell, 1.8)
      const reliefR = relief > 0.65 ? 0.65 : relief
      const hasStairs = plateau > 0 || cliff > 0
      for (let j = 0; j < rows; j++) {
        const y = j * step
        const row = j * cols
        for (let i = 0; i < cols; i++) {
          const idx = row + i
          const x = i * step
          const u0 = U[idx]
          let u = u0
          if (shape > 0) {
            const m = contourNoise((x / tw) * psx, (y / th) * psy, psx, psy) * CONTOUR_NOISE_NORM
            u = contourShapeWarp(u, Math.max(0.35, Math.min(2.8, 1 + shape * m)))
          }
          if (reliefR > 0) u = contourReliefWarp(u, reliefR)
          if (hasStairs) {
            /* Two landforms, two masks, one staircase per cell: a cell inside a
               plateau region gets the wide-tread staircase, a cell inside a cliff
               band the thin-ramp one (the sharper of the two wins where they
               overlap). Everything outside both keeps the terrain it had. */
            let s = 0
            let isCliff = false
            if (plateau > 0) {
              const b = contourNoise((x / tw) * pbx, (y / th) * pby, pbx, pby) * CONTOUR_NOISE_NORM
              const a = b < 0 ? -b : b
              if (a < CONTOUR_PLATEAU_BAND) s = plateau * (1 - contourSmooth(a / CONTOUR_PLATEAU_BAND))
            }
            if (cliff > 0) {
              const c = contourNoise((x / tw) * pcx, (y / th) * pcy, pcx, pcy) * CONTOUR_NOISE_NORM
              const a = c < 0 ? -c : c
              const bandW = prof.cliffBand > 0 ? prof.cliffBand : CONTOUR_CLIFF_BAND
              if (a < bandW) {
                const t = cliff * (1 - contourSmooth(a / bandW))
                if (t > s) { s = t; isCliff = true }
              }
            }
            if (s > 0) {
              u = isCliff ? contourCliff(u, s) : contourTerrace(u, s)
              const diff = u > u0 ? u - u0 : u0 - u
              if (diff > amt[idx]) {
                amt[idx] = diff
                kind[idx] = isCliff ? CONTOUR_FEAT_CLIFF : CONTOUR_FEAT_PLATEAU
              }
            }
          }
          U[idx] = u
        }
      }
      /* --- stage 5: the water plane ------------------------------------------- */
      const wl = prof.water
      if (wl >= 0 && wl < 1) {
        for (let i = 0; i < n; i++) {
          if (U[i] < wl) {
            const diff = wl - U[i]
            U[i] = wl
            if (diff >= amt[i]) {
              amt[i] = diff
              kind[i] = CONTOUR_FEAT_WATER
            }
          }
        }
      }
      /* --- stage 6: back into the base range, with the real extremes ---------- */
      let mnF = Infinity
      let mxF = -Infinity
      for (let i = 0; i < n; i++) {
        const v = baseMn + U[i] * baseSpan
        F[i] = v
        if (v < mnF) mnF = v
        if (v > mxF) mxF = v
      }
      /* The grid carries one padded row/column past the tile edge (cols is
         ceil(tw/step)+1). When the tile is a whole number of cells that sample IS
         the tile boundary -- the same physical point as index 0 -- so it has to
         carry the same value, or the repeat would show a hairline where the sheet
         wraps. Idempotent on the plain fBm, which is already exactly periodic. */
      if (Math.abs((cols - 1) * step - tw) < 1e-6) {
        for (let j = 0; j < rows; j++) F[j * cols + cols - 1] = F[j * cols]
      }
      if (Math.abs((rows - 1) * step - th) < 1e-6) {
        for (let i = 0; i < cols; i++) F[(rows - 1) * cols + i] = F[i]
      }
      field.mn = mnF
      field.mx = mxF
    }
    /* How many octaves of that ladder are actually usable on a texture of tw x th
       CSS px: octave o has period (px0 * 2^o), and the lattice indices must stay
       inside the 512-entry permutation table, so CONTOUR_PERIOD_MAX is a hard
       ceiling. An octave that would exceed it on BOTH axes adds no new scale (it
       repeats the clamped 240-period pattern), so the ladder ends there; at least
       one octave is always kept so a degenerate size can never yield a flat
       field. At the shipped default this yields exactly CONTOUR_OCTAVES. */
    const contourOctaveLadder = (px0, py0, want) => {
      let n = 0
      let ox = px0
      let oy = py0
      while (n < want && Math.max(ox, oy) <= CONTOUR_PERIOD_MAX) {
        n++
        ox *= 2
        oy *= 2
      }
      return n < 1 ? 1 : n
    }
    /* Levels sit inside the field's ACTUAL [min, max] with this margin trimmed
       from both ends. This is what makes blank patches structurally impossible
       (the old accept-or-reroll machinery existed because gaussian bumps decayed
       to exactly zero; a Perlin field is nowhere flat, and levels derived from
       its own range always cross the terrain): every region with any slope gets
       its crossings. */
    const CONTOUR_LEVEL_MARGIN = 0.04
    /* Speck rejection, kept at the thresholds the render suite was calibrated
       against (test/contour-specks.test.js mirrors both numbers). Two rules only:
         - a chain shorter than MIN_LEN px is debris, not a stroke;
         - a CLOSED ring whose whole bounding box is under one line spacing
           cannot read as a nested island - there is no room for a neighbour
           inside it - so it reads as a dot.
       OPEN chains are always legal: an open contour is simply a stroke that
       continues past a ridge into neighbouring terrain, and clipping one would
       punch a hole in a line the user can see. The thresholds below are the RAW
       path limits; they sit above the test's drawn-length bar with headroom
       because the smoothing pass lands slightly shorter than the raw polyline. */
    const CONTOUR_MIN_LEN = 40      // px of stroke; below this it is a speck
    const CONTOUR_MIN_RING_BOX = 21 // px; the measured median line gap
    const CONTOUR_KEEP_LEN = CONTOUR_MIN_LEN * 1.35
    const CONTOUR_KEEP_RING = CONTOUR_MIN_RING_BOX * 1.5
    /* Regenerate the texture on resize only when the quantised target size
       actually changed; otherwise the existing texture keeps tiling the new
       viewport with zero work and zero visual change. */
    const CONTOUR_RESIZE_DEBOUNCE = 200
    /* A roughness slider drag crosses several detents before it settles; this is
       the settle window before the terrain is rebuilt once for the final value.
       Long enough to swallow a drag, short enough to feel immediate on a click. */
    const CONTOUR_ROUGHNESS_DEBOUNCE = 140

    /* ---- contour engine state ----------------------------------------------
       All mutable engine state lives here; the functions below read/write it.
       contourWrap / contourHost / contourLineCv: the mounted layer (null = not
       mounted). contourRaf: pending rAF id (null = loop stopped). contourRo: the
       viewport ResizeObserver. contourPaths: extracted polylines, in cache-space
       CSS px. contourField: the generated height field, kept so a density change
       can re-extract without regenerating terrain. contourTex: the rendered cache
       canvas + its CSS-space size. contourView: last viewport size + dpr.
       contourOffsetX/Y: scroll offset in device px, kept inside the texture
       period. contourVelX/Y + contourSpeedPx: direction/speed cached from prefs
       (re-read only on change, never per frame). contourLastT: previous frame
       timestamp (-1 = first frame). contourDpr: DPR the cache was built for.
       contourSwitchSig: signature of the last applied switch state. The rest is
       pause bookkeeping (page scroll + boot plate). */
    let contourHost = null
    let contourWrap = null
    let contourLineCv = null
    let contourRaf = null
    let contourRo = null
    let contourResizeTimer = null
    let contourResizePending = false
    let contourScrollPaused = false
    let contourScrollTimer = null
    let contourRoughTimer = null
    let contourLoaderActive = false
    let contourPaths = []
    let contourField = null
    let contourTex = null
    let contourView = null
    let contourOffsetX = 0
    let contourOffsetY = 0
    let contourVelX = 0
    let contourVelY = 0
    let contourSpeedPx = CONTOUR_SPEEDS[CONTOUR_SPEED_DEFAULT]
    let contourDpr = 1
    let contourLastT = -1
    let contourSwitchSig = ''

    const isDarkScheme = () => typeof document !== 'undefined'
      && document.body
      && document.body.hasAttribute('data-ds-dark-theme')

    /* Someone who asked the OS for less motion gets the pattern without the
       motion. The boot plate already honours this (see finish()), so the contour
       sheet must not be the one animated surface that ignores it. The layer
       itself still renders - a static topographic texture is not motion - but
       the scroll loop is never started.

       Read LIVE rather than from a MediaQueryList cached at load time. An earlier
       revision of the tileable-terrain engine cached the query for the per-frame
       check; that silently broke the contract thunder-edges.test.js asserts (the
       theme must follow the preference as it changes) and ignored a user who
       flips the OS setting with the page open. matchMedia is cheap next to the
       blit it gates, and the query object is not retained. */
    const prefersReducedMotion = () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /* The scroll loop wants: scroll switch on, the OS reduced-motion preference
       not set, the boot plate not on screen, and the sheet not frozen by an
       active page scroll. thunderWantsAnim() is the announcement layer's copy of
       the reduced-motion rule. Checked live at every reconciliation, so flipping
       the OS setting takes effect without a reload. */
    const contourWantsScroll = () => isContourAnimOn()
      && !prefersReducedMotion()
      && !contourLoaderActive
      && !contourScrollPaused

    /* Deterministic PRNG (mulberry32), used with a PER-PAGE-LOAD seed.
       Determinism is required WITHIN one load: the field is rebuilt on real
       size changes, and the same seed + same size must reproduce the same
       landscape (spec: resize must not reshuffle the terrain). Across loads the
       seed is fresh, so every visit draws new terrain. */
    const contourRng = (seed) => {
      let a = seed >>> 0
      return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }
    /* One random uint32 per call. crypto.getRandomValues() when available, else a
       time/Math.random mix -- neither global is guaranteed in this sandbox, so
       both are probed rather than assumed. Forced to a non-zero uint32 because
       mulberry32 seeded with 0 is a legal but needlessly degenerate start. */
    const contourRollSeed = () => {
      let s = 0
      const c = (typeof crypto !== 'undefined' && crypto
        && typeof crypto.getRandomValues === 'function') ? crypto : null
      if (c !== null) {
        try {
          const buf = new Uint32Array(1)
          c.getRandomValues(buf)
          s = buf[0]
        } catch (e) { s = 0 }
      }
      if (s === 0) {
        const t = (typeof Date !== 'undefined' && typeof Date.now === 'function') ? Date.now() : 0
        const r = (typeof Math !== 'undefined' && typeof Math.random === 'function') ? Math.random() : 0
        s = ((t ^ Math.floor(r * 0xFFFFFFFF)) >>> 0)
      }
      return (s >>> 0) || 0x5eed4242
    }

    /* Permutation table for the Perlin gradients (doubled to 512 entries so the
       hash below never needs a mask). It is the ONLY carrier of terrain
       randomness -- contourNoise() reads nothing else -- so "a new terrain" means
       exactly "a new permutation table".
       It is allocated once and REFILLED IN PLACE by contourReseed(), rather than
       rebound: every reader keeps pointing at the same array, and the seed can be
       re-rolled per enable (see the mount path) without touching them. Because the
       table is seed-derived and not rebuilt on resize, the SAME seed at a new size
       reproduces the identical landscape: same perm, same lattice. */
    const contourPerm = new Uint16Array(512)
    const contourReseed = (seed) => {
      const rnd = contourRng((seed ^ 0x1F123BB5) >>> 0)
      const p = new Uint8Array(256)
      for (let i = 0; i < 256; i++) p[i] = i
      for (let i = 255; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0
        const t = p[i]; p[i] = p[j]; p[j] = t
      }
      for (let i = 0; i < 512; i++) contourPerm[i] = p[i & 255]
      return seed
    }
    /* Seeded now so the terrain is valid even before the layer mounts, and
       re-rolled by every mount: each time the background is switched on it draws a
       NEW landscape (spec: a fresh seed per start), while anything that merely
       re-renders the same session -- resize, direction, speed, scroll on/off --
       keeps this seed and therefore the same terrain. */
    let contourSeed = contourReseed(contourRollSeed())
    /* Eight gradient directions (axes + diagonals), unit length. */
    const CONTOUR_GRAD_X = new Float32Array([1, 0, -1, 0, 0.70710678, -0.70710678, 0.70710678, -0.70710678])
    const CONTOUR_GRAD_Y = new Float32Array([0, 1, 0, -1, 0.70710678, 0.70710678, -0.70710678, -0.70710678])

    /* One octave of TILEABLE classic Perlin (gradient) noise.

       Tileability: the lattice indices wrap modulo the octave's integer period
       (px, py), so the gradient at lattice point 0 equals the gradient at lattice
       point px. Combined with the coordinate mapping (x/tw)*px -- which lands
       exactly on px when x reaches the texture width -- the function is exactly
       periodic in both axes. Index bound: px, py <= CONTOUR_PERIOD_MAX (240), so
       perm[x0] < 256 and perm[perm[x0] + y0] <= perm[255 + 239] < perm[512]. */
    const contourNoise = (x, y, px, py) => {
      const xi = Math.floor(x), yi = Math.floor(y)
      const xf = x - xi, yf = y - yi
      // Quintic fade (Perlin's improved interpolant): C2-continuous, so the
      // extracted contours have no lattice-shaped kinks.
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
      const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
      const x0 = xi % px, x1 = (x0 + 1 === px) ? 0 : x0 + 1
      const y0 = yi % py, y1 = (y0 + 1 === py) ? 0 : y0 + 1
      const h00 = contourPerm[contourPerm[x0] + y0] & 7
      const h10 = contourPerm[contourPerm[x1] + y0] & 7
      const h01 = contourPerm[contourPerm[x0] + y1] & 7
      const h11 = contourPerm[contourPerm[x1] + y1] & 7
      const n00 = CONTOUR_GRAD_X[h00] * xf + CONTOUR_GRAD_Y[h00] * yf
      const n10 = CONTOUR_GRAD_X[h10] * (xf - 1) + CONTOUR_GRAD_Y[h10] * yf
      const n01 = CONTOUR_GRAD_X[h01] * xf + CONTOUR_GRAD_Y[h01] * (yf - 1)
      const n11 = CONTOUR_GRAD_X[h11] * (xf - 1) + CONTOUR_GRAD_Y[h11] * (yf - 1)
      const a = n00 + u * (n10 - n00)
      const b = n01 + u * (n11 - n01)
      return a + v * (b - a)
    }

    /** Fractal Brownian motion over the tileable octaves, into a fresh field. */
    const contourGenerateField = (tw, th) => {
      const step = CONTOUR_STEP
      const cols = Math.ceil(tw / step) + 1
      const rows = Math.ceil(th / step) + 1
      /* The terrain character is the ROUGHNESS stop (see CONTOUR_ROUGHNESS_*):
         the largest cell, the octave-to-octave amplitude ratio and the octave
         budget. Nothing below is per-sample; the profile is read once per build,
         so a density change can still re-extract from the SAME field. */
      const prof = contourTerrainProfile()
      /* Integer base periods. Rounding (not flooring) keeps the largest octave
         near prof.baseCell CSS px; clamping keeps perm indexing safe. */
      const px0 = Math.max(3, Math.min(CONTOUR_PERIOD_MAX, Math.round(tw / prof.baseCell)))
      const py0 = Math.max(3, Math.min(CONTOUR_PERIOD_MAX, Math.round(th / prof.baseCell)))
      const octaves = contourOctaveLadder(px0, py0, prof.octaves)
      const persist = prof.persist
      const F = new Float32Array(cols * rows)
      let norm = 0
      for (let o = 0, a = 1; o < octaves; o++) { norm += a; a *= persist }
      let mn = Infinity, mx = -Infinity
      for (let j = 0; j < rows; j++) {
        const row = j * cols
        const y = j * step
        for (let i = 0; i < cols; i++) {
          const x = i * step
          let v = 0
          let a = 1
          let ox = px0, oy = py0
          for (let o = 0; o < octaves; o++) {
            /* Per-octave period, clamped to the perm-safe maximum. The ladder
               above already guarantees every octave used here stays inside it on
               at least one axis, so the clamp only ever trims a mixed-scale
               octave on its coarser axis; tileability stays EXACT because the
               coordinate (x/tw)*opx still lands on opx when x reaches tw. */
            const opx = Math.min(CONTOUR_PERIOD_MAX, ox)
            const opy = Math.min(CONTOUR_PERIOD_MAX, oy)
            v += a * contourNoise((x / tw) * opx, (y / th) * opy, opx, opy)
            a *= persist
            ox *= 2
            oy *= 2
          }
          v /= norm
          F[row + i] = v
          if (v < mn) mn = v
          if (v > mx) mx = v
        }
      }
      /* The landform layer is applied below, once the field object exists (it
         writes the feature bookkeeping the tests measure).
         Marching-squares scratch buffers, allocation-free across levels (the
         stitched walk reuses them for every level of one extraction).

         hCount MUST be returned: the extractor destructures it to build the
         vertical-edge ids (hCount + ...). Without it those ids evaluate to NaN,
         which a typed array silently stores as 0 and which never stamps es[],
         so walks start from bogus ids and reuse the previous level's stale
         vertices -- the exact defect the cusps test caught as duplicated rings. */
      const hCount = (cols - 1) * rows
      const eCount = hCount + cols * (rows - 1)
      /* The field object is built first because the landform layer needs it (it
         writes the feature bookkeeping the tests measure). uScratch / featAmt /
         featKind are per-build: nothing of the previous terrain survives. */
      const field = {
        cols, rows, step, tw, th, F, mn, mx, hCount,
        uScratch: new Float32Array(cols * rows),
        featAmt: new Float32Array(cols * rows),
        featKind: new Uint8Array(cols * rows),
        ex: new Float32Array(eCount),
        ey: new Float32Array(eCount),
        es: new Int32Array(eCount).fill(-1),
        n1: new Int32Array(eCount).fill(-1),
        n2: new Int32Array(eCount).fill(-1),
        seen: new Int32Array(eCount).fill(-1),
        touched: new Int32Array(eCount),
        seq: 0,
      }
      contourApplyLandforms(field, prof)
      return field
    }

    /** Iso-level heights for the current density, from the field's own range. */
    const contourLevels = () => {
      const f = contourField
      const count = CONTOUR_DENSITIES[contourDensityIndex()]
      const pad = (f.mx - f.mn) * CONTOUR_LEVEL_MARGIN
      const lo = f.mn + pad
      const hi = f.mx - pad
      const out = new Array(count)
      for (let n = 1; n <= count; n++) out[n - 1] = lo + ((hi - lo) * n) / (count + 1)
      return out
    }

    /* Marching squares for one level, stitched into polylines.
       Adjacency uses EDGE IDS in two Int32Arrays rather than float-position
       matching or a Map: a contour edge has at most two neighbours, adjacent cells
       address the identical edge id, so joins are exact and allocation-free.
       (Kept from the previous implementation, which verified it at scale.) */
    const contourExtractLevel = (L, out) => {
      const f = contourField
      const { cols, rows, step, F, ex, ey, es, n1, n2, seen, touched, hCount } = f
      const st = ++f.seq
      let tn = 0
      const pt = (id, i0, j0, i1, j1) => {
        if (es[id] === st) return id
        const a = F[j0 * cols + i0]
        const b = F[j1 * cols + i1]
        let t = (L - a) / (b - a)
        if (!(t >= 0)) t = 0
        else if (t > 1) t = 1
        ex[id] = (i0 + (i1 - i0) * t) * step
        ey[id] = (j0 + (j1 - j0) * t) * step
        es[id] = st
        n1[id] = -1
        n2[id] = -1
        touched[tn++] = id
        return id
      }
      const link = (a, b) => {
        if (n1[a] < 0) n1[a] = b
        else if (n2[a] < 0) n2[a] = b
        if (n1[b] < 0) n1[b] = a
        else if (n2[b] < 0) n2[b] = a
      }
      for (let j = 0; j < rows - 1; j++) {
        const row = j * cols
        for (let i = 0; i < cols - 1; i++) {
          const p0 = row + i
          const p1 = p0 + 1
          const p3 = p0 + cols
          const p2 = p3 + 1
          const v0 = F[p0], v1 = F[p1], v2 = F[p2], v3 = F[p3]
          let mn = v0, mx = v0
          if (v1 < mn) mn = v1; else if (v1 > mx) mx = v1
          if (v2 < mn) mn = v2; else if (v2 > mx) mx = v2
          if (v3 < mn) mn = v3; else if (v3 > mx) mx = v3
          // Whole cell on one side of the level: nothing crosses it.
          if (L <= mn || L > mx) continue
          const idx = (v0 > L ? 1 : 0) | (v1 > L ? 2 : 0) | (v2 > L ? 4 : 0) | (v3 > L ? 8 : 0)
          const T = () => pt(j * (cols - 1) + i, i, j, i + 1, j)
          const B = () => pt((j + 1) * (cols - 1) + i, i, j + 1, i + 1, j + 1)
          const Le = () => pt(hCount + j * cols + i, i, j, i, j + 1)
          const Ri = () => pt(hCount + j * cols + i + 1, i + 1, j, i + 1, j + 1)
          switch (idx) {
            case 1: case 14: link(T(), Le()); break
            case 2: case 13: link(T(), Ri()); break
            case 3: case 12: link(Le(), Ri()); break
            case 4: case 11: link(Ri(), B()); break
            case 6: case 9: link(T(), B()); break
            case 7: case 8: link(Le(), B()); break
            // Saddles: two independent crossings in one cell.
            case 5: link(T(), Ri()); link(Le(), B()); break
            case 10: link(T(), Le()); link(Ri(), B()); break
          }
        }
      }
      const walk = (start) => {
        const path = []
        let cur = start
        let prev = -1
        for (;;) {
          path.push(ex[cur], ey[cur])
          seen[cur] = st
          const a = n1[cur]
          const b = n2[cur]
          let nx = -1
          if (a >= 0 && a !== prev && seen[a] !== st) nx = a
          else if (b >= 0 && b !== prev && seen[b] !== st) nx = b
          if (nx < 0) {
            // Closed loop: step back onto the first point so the ring has no gap.
            if ((a === start || b === start) && path.length > 4) path.push(ex[start], ey[start])
            break
          }
          prev = cur
          cur = nx
        }
        return path
      }
      /* Reject debris before it reaches the draw list. The field covers the
         texture exactly (that is what makes the scroll seamless), so there is no
         "off-canvas" case any more: every vertex is on the texture. What remains
         is raw length and the apex-ring rule -- and open chains are ALWAYS kept:
         an open contour is the legal signature of a ridge running out of the
         frame, not an error. */
      const keep = (p) => {
        if (p.length < 8) return false
        let vis = 0
        for (let k = 2; k < p.length; k += 2) {
          const dx = p[k] - p[k - 2], dy = p[k + 1] - p[k - 1]
          vis += Math.sqrt(dx * dx + dy * dy)
        }
        if (vis < CONTOUR_KEEP_LEN) return false
        const gapx = p[0] - p[p.length - 2]
        const gapy = p[1] - p[p.length - 1]
        if (gapx * gapx + gapy * gapy < 4) {
          let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
          for (let k = 0; k < p.length; k += 2) {
            if (p[k] < minx) minx = p[k]
            if (p[k] > maxx) maxx = p[k]
            if (p[k + 1] < miny) miny = p[k + 1]
            if (p[k + 1] > maxy) maxy = p[k + 1]
          }
          if (maxx - minx < CONTOUR_KEEP_RING && maxy - miny < CONTOUR_KEEP_RING) return false
        }
        return true
      }
      // Open chains first (they have a free end), then whatever remains is a loop.
      // Doing it in this order stops a ring being entered mid-way and split in two.
      for (let k = 0; k < tn; k++) {
        const id = touched[k]
        if (seen[id] !== st && n2[id] < 0) {
          const p = walk(id)
          if (keep(p)) out.push(p)
        }
      }
      for (let k = 0; k < tn; k++) {
        const id = touched[k]
        if (seen[id] !== st) {
          const p = walk(id)
          if (keep(p)) out.push(p)
        }
      }
    }

    /** Extract every level of the current density into contourPaths (one-time). */
    const contourExtractAll = () => {
      if (contourField === null) return
      contourPaths = []
      const levels = contourLevels()
      for (let n = 0; n < levels.length; n++) contourExtractLevel(levels[n], contourPaths)
    }

    /* Stroke colour. Values are measured, not guessed: on cream the pure signal
       yellow #fff500 is almost invisible (it is nearly as light as the paper), so
       light mode uses a darkened olive-yellow at higher alpha, while dark mode can
       use the signal yellow itself at low alpha. Both were checked by sampling a
       render: the pattern reads as texture and body text keeps full contrast
       because the sheet sits BEHIND it.

       A canvas stroke cannot be a CSS variable -- this is the ONE accent surface the
       palette switch cannot reach declaratively, so the palette is read here and
       the cache is re-rendered when it changes (see the palette MutationObserver).

       The cyan alphas are NOT copied from the yellow ones. Equal alpha does not
       mean equal presence; each palette is tuned to the same composited contrast
       (see the palette-contrast test). The tags below are what that test greps
       for, so renaming them breaks the check loudly instead of silently. */
    const contourStroke = () => {
      const cyan = isWulingPalette()
      if (isDarkScheme()) {
        // EDGE_STROKE_DARK_CYAN: #14d0d045
        // EDGE_STROKE_DARK_YELLOW: #fff50033
        return cyan ? '#14d0d045' : '#fff50033'
      }
      // EDGE_STROKE_LIGHT_CYAN: #14d0d07a
      // EDGE_STROKE_LIGHT_YELLOW: #beaf006b
      return cyan ? '#14d0d07a' : '#beaf006b'
    }

    /* Render the extracted polylines into the CACHE canvas, once per build /
       density change / palette change.

       Geometry stays in CSS px; the transform maps it onto the backing store that
       contourBuildTexture sized at (capped) devicePixelRatio, so strokes
       rasterise at device resolution instead of being upsampled into blur on
       HiDPI screens. The scale is derived from the canvas itself (device/css),
       which also guarantees the rendered content is exactly periodic in device
       pixels -- the property the wrap-around blit relies on. Skipped entirely at
       a 1x store or when the context has no setTransform (the spliced-in test
       harnesses), so a 1x render is byte-identical to a plain draw. */
    const contourRenderCache = () => {
      if (contourTex === null) return
      const ctx = contourTex.cv.getContext('2d')
      if (!ctx) return
      const sx = (contourTex.wCss > 0 && contourTex.cv.width !== contourTex.wCss)
        ? contourTex.cv.width / contourTex.wCss : 1
      const sy = (contourTex.hCss > 0 && contourTex.cv.height !== contourTex.hCss)
        ? contourTex.cv.height / contourTex.hCss : 1
      if ((sx !== 1 || sy !== 1) && typeof ctx.setTransform === 'function') {
        ctx.setTransform(sx, 0, 0, sy, 0, 0)
      } else if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }
      ctx.clearRect(0, 0, contourTex.wCss, contourTex.hCss)
      ctx.strokeStyle = contourStroke()
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      /* Marching squares emits one vertex per grid-cell edge. Three Chaikin passes
         cut local corners before the clamped cubic B-spline rounds broad bends.
         This reduces angularity without changing the field or adding another
         extraction pass. Open endpoints remain fixed; closed rings wrap
         cyclically. (The smoother is carried over verbatim from the previous
         engine, which tuned and tested it.) */
      const smoothPath = (source) => {
        const count = source.length / 2
        if (count < 3) return source
        let points = []
        for (let k = 0; k < source.length; k += 2) points.push([source[k], source[k + 1]])
        const closed = (points[0][0] - points[points.length - 1][0]) ** 2
          + (points[0][1] - points[points.length - 1][1]) ** 2 < 4
        if (closed) points.pop()
        /* Collapse degenerate spans BEFORE smoothing.
           WHY: marching squares emits two crossings that can sit arbitrarily
           close together when a level grazes a grid node, so the raw polyline
           carries sub-pixel legs. The Catmull-Rom handles below are sized from
           the neighbouring segments (~10px), so a 0.03px leg got handles ~100x
           its own length and the cubic bulged into a sub-pixel thorn sticking
           out of the contour. Dropping points closer than 0.1px cannot change
           the drawn shape (the stroke is 1px with round joins) and removes the
           only input that could make the handles overshoot. */
        const dedup = []
        for (const point of points) {
          const last = dedup[dedup.length - 1]
          if (last !== undefined
            && Math.abs(point[0] - last[0]) < 0.1
            && Math.abs(point[1] - last[1]) < 0.1) continue
          dedup.push(point)
        }
        if (closed) {
          // A ring must not end on its own start point either.
          while (dedup.length > 2
            && Math.abs(dedup[dedup.length - 1][0] - dedup[0][0]) < 0.1
            && Math.abs(dedup[dedup.length - 1][1] - dedup[0][1]) < 0.1) dedup.pop()
        }
        if (dedup.length < 3) return source
        points = dedup
        for (let pass = 0; pass < 3; pass++) {
          const next = []
          const limit = closed ? points.length : points.length - 1
          if (!closed) next.push(points[0])
          for (let k = 0; k < limit; k++) {
            const a = points[k]
            const b = points[(k + 1) % points.length]
            next.push([
              a[0] * 0.75 + b[0] * 0.25,
              a[1] * 0.75 + b[1] * 0.25,
            ], [
              a[0] * 0.25 + b[0] * 0.75,
              a[1] * 0.25 + b[1] * 0.75,
            ])
          }
          if (!closed) next.push(points[points.length - 1])
          points = next
        }
        const result = []
        for (const point of points) result.push(point[0], point[1])
        if (closed) result.push(result[0], result[1])
        return result
      }
      /* Chaikin removes local grid noise. A constrained Catmull-Rom cubic then
         gives each join one shared tangent. The handle cap prevents overshoot at
         narrow saddles while the larger tangent factor removes long
         rounded-polygon bends that remain visible with midpoint quadratics. */
      const drawSmoothPath = (source) => {
        const count = source.length / 2
        if (count < 3) {
          ctx.moveTo(source[0], source[1])
          for (let k = 2; k < source.length; k += 2) ctx.lineTo(source[k], source[k + 1])
          return
        }
        const closed = (source[0] - source[source.length - 2]) ** 2
          + (source[1] - source[source.length - 1]) ** 2 < 4
        const limit = closed ? count - 1 : count
        const point = (index) => {
          const k = closed
            ? (index + limit) % limit
            : Math.max(0, Math.min(limit - 1, index))
          return [source[k * 2], source[k * 2 + 1]]
        }
        const tangent = (index) => {
          const current = point(index)
          const previous = point(index - 1)
          const next = point(index + 1)
          let tx, ty, cap
          const incomingX = current[0] - previous[0]
          const incomingY = current[1] - previous[1]
          const outgoingX = next[0] - current[0]
          const outgoingY = next[1] - current[1]
          if (!closed && index === 0) {
            tx = outgoingX * 0.4
            ty = outgoingY * 0.4
            cap = Math.hypot(outgoingX, outgoingY) * 0.55
          } else if (!closed && index === limit - 1) {
            tx = incomingX * 0.4
            ty = incomingY * 0.4
            cap = Math.hypot(incomingX, incomingY) * 0.55
          } else {
            tx = (next[0] - previous[0]) * 0.32
            ty = (next[1] - previous[1]) * 0.32
            cap = Math.min(
              Math.hypot(incomingX, incomingY),
              Math.hypot(outgoingX, outgoingY),
            ) * 0.62
          }
          const length = Math.hypot(tx, ty)
          if (length > cap && length > 0) {
            tx *= cap / length
            ty *= cap / length
          }
          return [tx, ty]
        }
        ctx.moveTo(source[0], source[1])
        const segments = closed ? limit : limit - 1
        for (let k = 0; k < segments; k++) {
          const start = point(k)
          const end = point(k + 1)
          const startTangent = tangent(k)
          const endTangent = tangent(k + 1)
          ctx.bezierCurveTo(
            start[0] + startTangent[0], start[1] + startTangent[1],
            end[0] - endTangent[0], end[1] - endTangent[1],
            end[0], end[1],
          )
        }
        if (closed) ctx.closePath()
      }
      ctx.beginPath()
      for (let i = 0; i < contourPaths.length; i++) drawSmoothPath(smoothPath(contourPaths[i]))
      ctx.stroke()
    }

    /* Blit the cached texture onto the visible viewport canvas with wrap-around.
       Offsets are FLOORED to integers: a fractional drawImage would resample the
       texture and blur the 1px strokes, while 1px quantisation at 12-192 px/s is
       far below the perception threshold (at 12 px/s a step lands every ~83ms).
       The wrap is seamless by construction: the texture's noise periods equal its
       CSS size, the transform maps that exactly onto device pixels, so the left
       edge continues the right edge exactly. */
    const contourBlit = () => {
      if (contourLineCv === null || contourTex === null) return
      const ctx = contourLineCv.getContext('2d')
      if (!ctx) return
      const w = contourLineCv.width
      const h = contourLineCv.height
      const tw = contourTex.cv.width
      const th = contourTex.cv.height
      const sx = ((Math.floor(contourOffsetX) % tw) + tw) % tw
      const sy = ((Math.floor(contourOffsetY) % th) + th) % th
      ctx.clearRect(0, 0, w, h)
      for (let y = -sy; y < h; y += th) {
        for (let x = -sx; x < w; x += tw) {
          ctx.drawImage(contourTex.cv, x, y)
        }
      }
    }

    /* The app frame: the only ancestor that is both position:relative and free of a
       stacking context, so an inset:0 child paints above the frame's own background
       and below every positioned descendant.

       It is located via its CENTRE COLUMN child, not by matching '_frame' directly.
       Verified against the installed bundles: '_frame' as a CSS-module suffix is
       used by three different components (the layout frame, two user-question
       components), so a [class*='_frame'] match is ambiguous and could attach the
       layer to a question card. '_centerCol' and '_sidebarCol' are each unique to
       the layout frame, so the frame is identified as their parent. Matching on the
       module SUFFIX rather than the current hash keeps this working across an app
       rebuild that rehashes the module. */
    const findAppFrame = () => {
      if (typeof document === 'undefined') return null
      const col = document.querySelector('[class$="_centerCol"], [class*="_centerCol "]')
      const frame = col !== null ? col.parentElement : null
      if (frame === null) return null
      const r = frame.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      return frame
    }

    /** Pure texture-size target for a viewport (quantised, capped), in CSS px
     *  and the device-px backing-store size it maps to at the current DPR. */
    const contourTargetTexture = (w, h, dpr) => {
      const tw0 = w * CONTOUR_TEX_MULT
      const th0 = h * CONTOUR_TEX_MULT
      const scale = Math.min(1,
        Math.sqrt(CONTOUR_TEX_MAX_AREA / (tw0 * th0)),
        CONTOUR_TEX_MAX_DIM / (tw0 * dpr),
        CONTOUR_TEX_MAX_DIM / (th0 * dpr))
      const q = (v) => Math.max(CONTOUR_TEX_QUANT * 2, Math.min(CONTOUR_TEX_MAX_DIM / dpr, Math.round(v / CONTOUR_TEX_QUANT) * CONTOUR_TEX_QUANT))
      const twCss = q(tw0 * scale)
      const thCss = q(th0 * scale)
      return { twCss, thCss, twDev: Math.round(twCss * dpr), thDev: Math.round(thCss * dpr) }
    }

    /* Build the whole texture for a viewport: size -> field -> contours -> cache.
       This is the ONLY place the expensive work happens (mount, first enable, or
       a resize that actually changes the target size). The seed and the perm
       table are fixed for the page, so the same size rebuilds byte-identically
       and a different size regenerates deterministically instead of randomly. */
    const contourBuildTexture = (wCss, hCss) => {
      const t = contourTargetTexture(wCss, hCss, contourDpr)
      contourField = contourGenerateField(t.twCss, t.thCss)
      contourExtractAll()
      let cv = contourTex !== null ? contourTex.cv : null
      if (cv === null) cv = document.createElement('canvas')
      cv.width = t.twDev
      cv.height = t.thDev
      /* A degenerate backing store (0 or non-finite) would silently stroke nothing
         and leave the sheet blank with no error anywhere — the one failure mode of
         this pipeline that is invisible without a read-back. */
      if (!(cv.width > 0) || !(cv.height > 0)) {
        dbg('texture build got a degenerate canvas', cv.width, cv.height, 'viewport', wCss, hCss, 'dpr', contourDpr)
      }
      contourTex = { cv, wCss: t.twCss, hCss: t.thCss }
      contourRenderCache()
      // Keep the scroll offset inside the (possibly new) texture period.
      contourOffsetX = ((contourOffsetX % t.twDev) + t.twDev) % t.twDev
      contourOffsetY = ((contourOffsetY % t.thDev) + t.thDev) % t.thDev
    }

    const contourDprNow = () => {
      const ratio = (typeof window !== 'undefined'
        && typeof window.devicePixelRatio === 'number'
        && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1
      return Math.min(2, ratio)
    }

    const contourSizeTo = (host) => {
      const r = host.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width))
      const h = Math.max(1, Math.round(r.height))
      const dpr = contourDprNow()
      /* Backing store at device resolution (capped at 2): the sheet is 1px
         strokes, and a 1x store on a HiDPI screen upsamples them into blur. */
      const changed = contourView === null || contourView.w !== w || contourView.h !== h || contourView.dpr !== dpr
      contourView = { w, h, dpr }
      contourDpr = dpr
      /* The visible canvas is viewport-sized; resizing it is cheap and must be
         immediate (the next blit repaints it from the existing texture, so the
         resize shows no flash). */
      if (contourLineCv !== null) {
        const bw = Math.max(1, Math.round(w * dpr))
        const bh = Math.max(1, Math.round(h * dpr))
        if (contourLineCv.width !== bw || contourLineCv.height !== bh) {
          contourLineCv.width = bw
          contourLineCv.height = bh
          contourLineCv.style.width = w + 'px'
          contourLineCv.style.height = h + 'px'
        }
      }
      return changed
    }

    const contourFrame = () => {
      contourRaf = null
      if (contourWrap === null || contourTex === null) return
      /* Off means OFF: the loop is not re-scheduled, it does not tick-and-return.
         (contourRaf was already cleared above, so nothing is pending.) */
      if (!contourWantsScroll()) return
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now() : Date.now()
      let dt = contourLastT < 0 ? 0 : (now - contourLastT) / 1000
      contourLastT = now
      if (dt > 0.1) dt = 0.1 // clamp tab-switch gaps so the sheet never jumps
      const twDev = contourTex.cv.width
      const thDev = contourTex.cv.height
      /* Space-based motion: px/second * seconds, identical on every refresh
         rate. Offsets live in device px and are kept inside the texture period
         so float precision and the modulo in contourBlit both stay trivial. */
      const vx = contourVelX * contourSpeedPx * contourDpr
      const vy = contourVelY * contourSpeedPx * contourDpr
      contourOffsetX = (((contourOffsetX + vx * dt) % twDev) + twDev) % twDev
      contourOffsetY = (((contourOffsetY + vy * dt) % thDev) + thDev) % thDev
      contourBlit()
      if (typeof requestAnimationFrame === 'function') contourRaf = requestAnimationFrame(contourFrame)
    }

    const contourStartLoop = () => {
      if (contourRaf !== null) return
      if (typeof requestAnimationFrame !== 'function') return
      if (!contourWantsScroll()) return
      contourLastT = -1
      contourRaf = requestAnimationFrame(contourFrame)
    }
    const contourStopLoop = () => {
      if (contourRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(contourRaf)
      contourRaf = null
    }

    /* Re-read the direction/speed settings into the loop's cached velocity. The
       frame deliberately does NOT touch the pref store: settings handlers call
       this once per change, the loop just adds two multiplies per frame. */
    const contourRefreshMotion = () => {
      const d = CONTOUR_DIRS[contourDirIndex()]
      contourVelX = d[0]
      contourVelY = d[1]
      contourSpeedPx = CONTOUR_SPEEDS[contourSpeedIndex()]
    }

    /* Density change: same field, new levels. Re-extract + re-render + one blit;
       never called per frame, never regenerates the terrain. */
    const contourRetune = () => {
      if (contourField === null || contourTex === null) return
      contourExtractAll()
      contourRenderCache()
      contourBlit()
    }

    /* Roughness change: the terrain ITSELF is regenerated -- the one setting that
       does that (density only re-extracts, direction/speed only retime). The
       build runs from the SAME seed, so the landscape is re-tuned, never re-rolled
       (a slider drag must not shuffle the map on every detent). Coalesced through
       a short timer because a drag fires one event per detent crossed and a full
       build is ~90ms at 1920x1080: the last detent is what has to land, and the
       intermediate ones would otherwise pile up as visible jank. */
    const contourRebuildForRoughness = () => {
      if (contourWrap === null || contourView === null) return
      /* No timer service (a sliver of the test environments): rebuild now rather
         than dropping the change on the floor. Normal browsers always have one. */
      if (typeof setTimeout !== 'function') {
        contourBuildTexture(contourView.w, contourView.h)
        contourBlit()
        return
      }
      if (contourRoughTimer !== null) clearTimeout(contourRoughTimer)
      contourRoughTimer = setTimeout(() => {
        contourRoughTimer = null
        if (contourWrap === null || contourView === null) return
        contourBuildTexture(contourView.w, contourView.h)
        contourBlit()
      }, CONTOUR_ROUGHNESS_DEBOUNCE)
    }
    /* Drop a pending roughness rebuild (unmount, or a second change landing
       first). The callbacks above re-check the mount state, so this is only about
       not doing the work at all. */
    const contourCancelRoughnessRebuild = () => {
      if (contourRoughTimer === null) return
      if (typeof clearTimeout === 'function') clearTimeout(contourRoughTimer)
      contourRoughTimer = null
    }

    /* Rebuild the texture if (and only if) the quantised target size for the
       CURRENT viewport differs from the cached one -- the deterministic rebuild
       keeps the same seed, so the landscape's character is stable while its
       period tracks the viewport. Debounced so a drag-resize does one rebuild,
       not one per pixel. */
    const contourScheduleRebuildCheck = () => {
      if (contourResizeTimer !== null) return
      if (typeof setTimeout !== 'function') return
      contourResizeTimer = setTimeout(() => {
        contourResizeTimer = null
        if (contourWrap === null || contourView === null || contourTex === null) return
        const t = contourTargetTexture(contourView.w, contourView.h, contourView.dpr)
        if (t.twDev === contourTex.cv.width && t.thDev === contourTex.cv.height) return
        contourBuildTexture(contourView.w, contourView.h)
        contourBlit()
      }, CONTOUR_RESIZE_DEBOUNCE)
    }

    const contourTeardown = () => {
      contourStopLoop()
      contourCancelRoughnessRebuild()
      if (contourResizeTimer !== null) {
        clearTimeout(contourResizeTimer)
        contourResizeTimer = null
      }
      if (contourScrollTimer !== null) {
        clearTimeout(contourScrollTimer)
        contourScrollTimer = null
      }
      if (contourRo !== null) {
        contourRo.disconnect()
        contourRo = null
      }
      if (contourWrap !== null && contourWrap.parentNode) contourWrap.parentNode.removeChild(contourWrap)
      contourWrap = null
      contourLineCv = null
      contourHost = null
      contourPaths = []
      contourField = null
      contourTex = null
      contourView = null
      contourResizePending = false
      contourScrollPaused = false
      contourOffsetX = 0
      contourOffsetY = 0
      // Nothing is drawn any more, so the next mount must re-apply the switch rather
      // than trust a signature describing a canvas that no longer exists.
      contourSwitchSig = ''
    }

    /* Reconcile the scroll switch against what is currently on screen.
       Separated from mounting because the two have very different costs and very
       different triggers: mounting needs layout reads, while this only needs to run
       when the switch actually changed. The last applied state is cached so the
       common case (called from a subtree MutationObserver, i.e. on every streaming
       token) is a single string compare. */
    const contourApplySwitches = () => {
      const scroll = contourWantsScroll()
      const sig = scroll ? 's' : '-'
      if (sig === contourSwitchSig) return
      contourSwitchSig = sig
      contourRefreshMotion()
      if (scroll) contourStartLoop()
      else {
        contourStopLoop()
        /* Scroll just switched off: one final blit keeps the sheet a complete
           picture (it already is one -- the loop never leaves it half-drawn --
           so this is a cheap no-op repaint for safety after rebuilds). */
        if (contourWrap !== null && contourTex !== null) contourBlit()
      }
    }

    /** Build/refresh/remove the layer to match the switches and the current page. */
    const syncContour = () => {
      const on = isEnabled() && isContourOn()
      if (!on) {
        if (contourWrap !== null) contourTeardown()
        contourSwitchSig = ''
        return
      }
      /* Fast path for the ALREADY-MOUNTED case. This runs from a subtree
          MutationObserver, so the common case must not touch layout: skipping
          findAppFrame() here is what avoids forcing a synchronous reflow on every
          mutation. Note it skips only the mount work -- the switch reconciliation
          below still runs, because that is how a settings toggle takes effect while
          the layer is already on screen. */
      const attached = contourWrap !== null && contourHost !== null
        && contourWrap.parentNode === contourHost && contourHost.isConnected
      if (!attached) {
        const host = findAppFrame()
        if (host === null) {
          // The frame is not on screen yet (very early boot): a later mutation will
          // bring us back here rather than the layer never mounting.
          if (contourWrap !== null) contourTeardown()
          contourSwitchSig = ''
          return
        }
        if (contourWrap !== null && contourHost !== host) contourTeardown()
        if (contourWrap === null) {
          const wrap = document.createElement('div')
          wrap.setAttribute('data-endfield-contour', '')
          wrap.setAttribute('aria-hidden', 'true')
          const line = document.createElement('canvas')
          line.setAttribute('data-endfield-contour-lines', '')
          wrap.appendChild(line)
          contourLineCv = line
          // First child: keeps the layer at the bottom of the frame's paint order.
          if (host.firstChild) host.insertBefore(wrap, host.firstChild)
          else host.appendChild(wrap)
          contourWrap = wrap
          contourHost = host
          contourSizeTo(host)
          /* A mount is a START, so it draws fresh terrain: re-seed and refill the
             permutation table BEFORE the build. Toggling the background off and on
             therefore gives a new landscape, while a resize (which only re-runs
             contourBuildTexture from the debounce) re-derives the same one. */
          contourSeed = contourReseed(contourRollSeed())
          /* One-time build: field, contours, cache, first blit. After this the
             page's own observer keeps the sheet fed and nothing regenerates
             unless a real size change lands. */
          contourBuildTexture(contourView.w, contourView.h)
          contourBlit()
          // A fresh mount has drawn nothing switch-specific yet, so force the
          // reconciliation below to run rather than trusting a stale signature.
          contourSwitchSig = ''
          if (typeof ResizeObserver !== 'undefined') {
            contourRo = new ResizeObserver(() => {
              if (contourHost === null) return
              if (contourScrollPaused) {
                // Frozen by an active page scroll: remember that the viewport
                // moved and let contourResumeAfterScroll() do the work, so the
                // pause really does cost nothing while it lasts.
                contourResizePending = true
                return
              }
              /* The existing texture already tiles any viewport (it wraps), so
                 the new size shows instantly with zero regeneration work. */
              if (contourSizeTo(contourHost)) {
                contourBlit()
                // Regenerate only if the quantised target size changed.
                contourScheduleRebuildCheck()
              }
            })
            contourRo.observe(host)
          }
        }
      }
      contourApplySwitches()
    }

    /* Pause the sheet while the user scrolls the page, resume shortly after the
       scroll ends. Kept from the previous engine because a fixed background
       moving UNDER a scrolling document is exactly the kind of motion that reads
       as jank; the freeze makes the page scroll feel native. contourScrollHook /
       contourScrollEndHook are declared (and wired to window listeners) just
       above this block, and are assigned to these handlers below it. */
    const contourPauseOnScroll = () => {
      if (!isEnabled() || contourWrap === null || !isContourScrollPauseOn() || !isContourAnimOn()) return
      if (contourScrollPaused) return
      contourScrollPaused = true
      contourSwitchSig = ''
      if (contourRaf !== null) contourStopLoop()
    }
    const contourResumeAfterScroll = () => {
      if (!contourScrollPaused) return
      if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
      const resume = () => {
        contourScrollTimer = null
        contourScrollPaused = false
        contourSwitchSig = ''
        if (contourResizePending && contourHost !== null) {
          contourResizePending = false
          if (contourSizeTo(contourHost)) {
            contourBlit()
            contourScheduleRebuildCheck()
          }
        }
        contourApplySwitches()
      }
      if (typeof setTimeout === 'function') contourScrollTimer = setTimeout(resume, 10)
      else resume()
    }
    const onContourScroll = () => { contourPauseOnScroll() }
    const onContourScrollEnd = () => { contourResumeAfterScroll() }
    contourScrollHook = onContourScroll
    contourScrollEndHook = onContourScrollEnd

    /* The boot plate covers the whole screen, so scrolling the sheet underneath
       it is wasted motion. These are called by the loader half; while the plate
       is up the sheet freezes, and it resumes (with the current switches) when
       the plate is gone. */
    const contourPauseForLoader = () => {
      contourLoaderActive = true
      if (contourWrap !== null && contourRaf !== null) {
        contourSwitchSig = ''
        contourStopLoop()
      }
    }
    const contourResumeAfterLoader = () => {
      contourLoaderActive = false
      if (contourWrap !== null) {
        contourSwitchSig = ''
        contourApplySwitches()
      }
    }

    /* Re-render the cache and repaint the viewport. Used when only the STROKE
       COLOUR changed (scheme/palette flip): geometry and extraction are
       untouched, so this is one stroke pass into the cache plus one blit, never
       a rebuild. */
    const contourRepaint = () => {
      if (contourWrap === null || contourTex === null) return
      contourRenderCache()
      contourBlit()
    }

    /* Colour scheme changes are a token flip on <body>, not a resize, so the
       stroke colour has to be re-derived when the attribute changes.
       The palette is a CLASS on the same element and has exactly the same
       consequence for the canvas, so one observer watches both: 'class' is added to
       the filter rather than building a second observer. This is also what makes a
       palette change in ANOTHER tab (or a browser restoring the class) repaint the
       sheet, not just a click in this tab's settings panel. Only the CACHE needs
       re-rendering (the strokes live there); the blit then repaints the viewport
       from it. */
    let contourSchemeObserver = null
    /* Deferred install for the same early-boot reason as the page observer above:
       body may not exist at apply() time, and a missed install here would leave a
       later-mounted sheet stuck on its first colour across a scheme flip. */
    const installContourSchemeObserver = () => {
      if (contourSchemeObserver !== null) return
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || document.body === null) return
      contourSchemeObserver = new MutationObserver(() => {
        if (contourWrap === null) return
        contourRepaint()
      })
      contourSchemeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] })
    }
    const contourSchemeObserverLate = () => {
      installContourSchemeObserver()
      // Catch up: the scheme may have settled while the observer was absent.
      if (contourSchemeObserver !== null && contourWrap !== null) contourRepaint()
    }
    if (typeof document !== 'undefined' && document.body !== null) installContourSchemeObserver()
    else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', contourSchemeObserverLate, { once: true })
    }
    // Let the page observer declared above re-attach the layer as the app renders.
    contourSyncHook = syncContour

    /* ---------- boot loading screen (settings-toggleable, default OFF) ----------
       Recreates the Endfield launcher boot screen: a full-viewport black plate with
       an 8px signal-yellow progress rail down the left edge, a meter group (tick +
       percentage + status line) that rides the fill end, and the centred ENDFIELD
       wordmark. It plays once per page load, then fades out and removes itself.

       Default OFF as requested: a loading plate that covers the app is opt-in, and
       an off switch must cost nothing, so nothing is built or timed until enabled.

       Geometry is not guessed — it is measured off the reference frame (1340x731):
         rail width 8px, fill 57.5% of viewport height at the captured moment,
         meter left edge x=24, tick 4x15px, digits cap-height 28px (~39px Arial),
         status line 15px below the digits in #666.
       Those ratios are reproduced here as em/percentage values so they hold at any
       viewport size. */
    const LOADER_KEY = PREFS_NS + '-loader'
    // Default OFF (=== '1' rather than !== '0'): opt-in, per the request.
    const isLoaderOn = () => prefsGet(LOADER_KEY) === '1'
    let loaderEl = null
    let loaderRaf = null
    let loaderTick = null
    let loaderFuse = null
    let loaderExitTimer = null
    let loaderPlateH = 0
    let loaderMeterH = 0
    // Last-resort hard kill. Deliberately NOT cleared by clearLoaderTimers(): the
    // completion flourish calls that to stop the progress clocks, and this timer has
    // to outlive it so a stalled flourish can still never leave the app covered.
    let loaderKill = null
    let loaderDone = false
    const clearLoaderTimers = () => {
      if (loaderRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(loaderRaf)
      loaderRaf = null
      if (loaderTick !== null && typeof clearInterval === 'function') clearInterval(loaderTick)
      loaderTick = null
      if (loaderFuse !== null && typeof clearTimeout === 'function') clearTimeout(loaderFuse)
      loaderFuse = null
      if (loaderExitTimer !== null && typeof clearTimeout === 'function') clearTimeout(loaderExitTimer)
      loaderExitTimer = null
    }
    /** Remove the plate and release every timer/handle it owns. Idempotent. */
    const destroyLoader = () => {
      clearLoaderTimers()
      if (loaderKill !== null && typeof clearTimeout === 'function') clearTimeout(loaderKill)
      loaderKill = null
      if (loaderEl && loaderEl.parentNode) loaderEl.parentNode.removeChild(loaderEl)
      loaderEl = null
      loaderPlateH = 0
      loaderMeterH = 0
      contourResumeAfterLoader()
    }
    /* One boot animation. The progress value is derived from elapsed WALL-CLOCK time,
       never accumulated per frame, so it cannot drift.

       Two clocks drive the same `step`, deliberately:
         requestAnimationFrame — smooth, vsync-aligned updates while the tab paints;
         setInterval           — a coarse fallback that keeps advancing when rAF is
                                 throttled or suspended (background/occluded tab, an
                                 embedded webview, a headless renderer that stops
                                 painting after first paint).
       rAF alone is NOT safe here: when it stalls, a full-screen plate would stay on
       screen forever. Because progress is time-based and `step` is idempotent for a
       given instant, running from both clocks is harmless — whichever fires first
       just renders the current value.

       `loaderFuse` is the last line of defence: a single timeout that force-finishes
       the plate even if both clocks stop, so the app can never stay covered. */
    const runLoader = () => {
      // The plate is themed BY this theme: with the master switch off its
      // stylesheet is gone and the plate would render as stray unstyled text in
      // the page flow (the percentage and status rows are real DOM text), so an
      // off switch must not be able to start it — including the settings 预览
      // button and the toggle-on path, which both land here.
      if (!isEnabled()) return
      if (loaderDone || loaderEl !== null) return
      if (typeof document === 'undefined') return
      // The plate is a <body> child. If the client bundle is evaluated before the
      // body exists, defer to DOMContentLoaded instead of silently skipping the
      // animation (loaderDone stays false, so the retry is the real first run).
      if (!document.body) {
        if (typeof document.addEventListener === 'function') {
          document.addEventListener('DOMContentLoaded', () => { runLoader() }, { once: true })
        }
        return
      }
      loaderDone = true
      contourPauseForLoader()

      const el = document.createElement('div')
      el.setAttribute('data-endfield-loader', '')
      // Same translation-proofing as the watermark: every glyph the plate shows is
      // brand/UI chrome drawn from CSS `content` or set as textContent on elements
      // marked notranslate, so "translate this page" cannot rewrite ENDFIELD.
      el.setAttribute('translate', 'no')
      el.setAttribute('lang', 'en')
      el.setAttribute('aria-hidden', 'true')
      el.className = 'notranslate'
      /* Poster layout, following the supplied key-art reference (1184x685).
         The brand block is a LEFT-aligned stack that sits in the right third of
         the plate: kicker, END, FIELD, then a detail cluster and the tagline, all
         sharing one left rhythm line. No localized chip — the reference wordmark is
         latin-only, so every glyph here comes from CSS content() and the plate
         carries no translatable DOM text at all.
         The meter (tick + percent + status) RIDES THE FILL END: its top follows the
         rail's fill height, matching the launcher reference where the readout sits
         just under the leading edge of the yellow bar.
         `-wipe` is the completion flourish: once the rail reaches 100% it expands
         from the rail into a full-screen yellow sweep to the right, then the whole
         plate fades out. It is a separate layer so the sweep can cover the brand
         block and meter without disturbing their layout. */
      el.innerHTML =
        '<div data-endfield-loader-tex></div>' +
        '<div data-endfield-loader-track></div>' +
        '<div data-endfield-loader-fill></div>' +
        '<div data-endfield-loader-meter>' +
        '<span data-endfield-loader-tick></span>' +
        '<span data-endfield-loader-pct></span>' +
        '<span data-endfield-loader-status></span>' +
        '</div>' +
        '<div data-endfield-loader-brand>' +
        '<span data-endfield-loader-kicker></span>' +
        '<span data-endfield-loader-word data-endfield-loader-word1></span>' +
        '<span data-endfield-loader-word data-endfield-loader-word2></span>' +
        '<span data-endfield-loader-detail>' +
        '<span data-endfield-loader-chev></span>' +
        '<span data-endfield-loader-sub></span>' +
        '<span data-endfield-loader-seq></span>' +
        '<span data-endfield-loader-squares>' +
        '<i data-on></i><i data-on></i><i data-on></i><i></i><i></i><i></i>' +
        '<i data-on></i><i data-on></i><i></i><i></i><i></i><i></i>' +
        '</span>' +
        '</span>' +
        '<span data-endfield-loader-tag></span>' +
        '</div>' +
        '<div data-endfield-loader-wipe></div>'
      document.body.appendChild(el)
      loaderEl = el

      const fill = el.querySelector('[data-endfield-loader-fill]')
      const meter = el.querySelector('[data-endfield-loader-meter]')
      const pct = el.querySelector('[data-endfield-loader-pct]')
      const status = el.querySelector('[data-endfield-loader-status]')
      const DURATION = 1750
      const start = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now()
      loaderPlateH = el.clientHeight || Math.ceil(el.getBoundingClientRect().height) || 0
      loaderMeterH = meter ? Math.ceil(meter.getBoundingClientRect().height) : 0
      const now = () => ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now())
      /* Completion sequence, in order:
           WIPE_MS  the rail expands rightward into a full-screen yellow sweep;
           EXIT_MS  the whole plate (yellow included) fades to transparent.
         The fuse below must outlast WIPE_MS + EXIT_MS, or it would tear the plate
         down mid-flourish. */
      const WIPE_MS = 520
      const EXIT_MS = 620
      let finished = false
      /* Play the yellow sweep, then fade out, then remove. Guarded so the two clocks
         plus the fuse can all reach the end without stacking timers, restarting the
         sweep, or double-removing the node.

         Both phases are driven from JS on the same dual-clock/wall-clock basis as
         the progress ramp, NOT from a CSS transition. Measured reason: a CSS
         transition is not a reliable animation primitive in every renderer this
         plate can run in — in the verification renderer a transition declared this
         way emitted no transitionrun/start/end events at all and the computed width
         stayed pinned at its start value indefinitely, which would leave a 10px
         stub on screen instead of a sweep. Driving it here means the flourish
         advances wherever the progress ramp advances, and it stays measurable. */
      const finish = () => {
        if (finished) return
        finished = true
        // Stop the progress clocks but keep the plate: the flourish reuses these
        // handles, so clearLoaderTimers() must not be what tears the node down.
        clearLoaderTimers()
        if (!loaderEl) return
        const el = loaderEl
        const wipeEl = el.querySelector('[data-endfield-loader-wipe]')
        const hasRaf = typeof requestAnimationFrame === 'function'
        const hasTimeout = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        // Someone who asked for less motion gets the plate gone, not a flourish.
        const reduceMotion = typeof window !== 'undefined'
          && typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduceMotion || (!hasRaf && !hasTimeout)) { destroyLoader(); return }
        el.setAttribute('data-endfield-loader-wiping', '')
        // JS owns opacity from here, so the stylesheet transition must not fight it.
        el.style.transition = 'none'
        const t0 = now()
        const plateW = el.clientWidth || 0
        const RAIL = 10
        let exitMarked = false
        const flourish = () => {
          if (!loaderEl) return
          const elapsed = now() - t0
          // phase 1 — sweep out of the rail across the full width
          const wt = Math.min(1, elapsed / WIPE_MS)
          const eased = 1 - Math.pow(1 - wt, 3)
          if (wipeEl) {
            wipeEl.style.opacity = '1'
            wipeEl.style.width = (RAIL + eased * Math.max(0, plateW - RAIL)).toFixed(1) + 'px'
          }
          // phase 2 — fade the whole plate, yellow included
          const fadeMs = elapsed - WIPE_MS
          if (fadeMs > 0) {
            if (!exitMarked) { exitMarked = true; el.setAttribute('data-endfield-loader-exit', '') }
            el.style.opacity = Math.max(0, 1 - fadeMs / EXIT_MS).toFixed(3)
          }
          if (elapsed >= WIPE_MS + EXIT_MS) { destroyLoader(); return }
          loaderRaf = hasRaf ? requestAnimationFrame(flourish) : null
        }
        // First frame synchronously so the sweep never starts from a blank frame.
        flourish()
        if (typeof setInterval === 'function') loaderTick = setInterval(flourish, 30)
        if (hasTimeout) loaderExitTimer = window.setTimeout(destroyLoader, WIPE_MS + EXIT_MS + 400)
      }
      const step = () => {
        if (finished || !loaderEl) return
        const t = Math.min(1, (now() - start) / DURATION)
        // easeOutCubic: quick climb, gentle settle onto 100%.
        const eased = 1 - Math.pow(1 - t, 3)
        const value = Math.round(eased * 100)
        const shown = value + '%'
        if (fill) fill.style.height = (eased * 100).toFixed(2) + '%'
        if (pct && pct.textContent !== shown) pct.textContent = shown
        if (status) {
          const label = value < 45 ? 'Connecting...' : (value < 99 ? 'Updating...' : 'Ready')
          if (status.textContent !== label) status.textContent = label
        }
        /* Meter follows the fill's leading edge, driven by the SAME eased value so
           the bar and its readout can never disagree. Positioned in px and clamped:
           the group is ~90px tall, so a raw percentage would push it off the bottom
           of the screen as the fill nears 100%. GAP keeps the tick just below the
           leading edge (per the reference, the readout trails the edge). Measure
           after updating the text: the initial empty meter is much shorter than the
           completed percentage/status group and would otherwise make 100% overflow.
           Keep extra room below the line box because the percentage uses a compact
           line-height and its glyphs can paint below that box. */
        if (meter) {
          const SAFE_BOTTOM = 64
          if (value >= 100) {
            /* Anchor the completed readout from the bottom. At this point the
               percentage and status have their final font metrics, so bottom
               anchoring is more reliable than clamping a cached top position. */
            meter.style.setProperty('top', 'auto', 'important')
            meter.style.setProperty('bottom', SAFE_BOTTOM + 'px', 'important')
          } else {
            meter.style.removeProperty('bottom')
            meter.style.removeProperty('top')
            const plateRect = el.getBoundingClientRect()
            loaderMeterH = Math.ceil(meter.getBoundingClientRect().height)
            const GAP = 10
            const raw = eased * (plateRect.height || loaderPlateH) + GAP
            const maxTop = Math.max(0, (plateRect.height || loaderPlateH) - loaderMeterH - SAFE_BOTTOM)
            meter.style.top = Math.min(raw, maxTop).toFixed(1) + 'px'
            /* Use the rendered rectangle as the final authority. Font metrics and
               fractional viewport sizes can make the line box differ from the
               cached height, especially in a narrow window. Correct any remaining
               overflow instead of allowing the readout to be clipped. */
            const meterRect = meter.getBoundingClientRect()
            const allowedBottom = plateRect.bottom - SAFE_BOTTOM
            if (meterRect.bottom > allowedBottom) {
              const currentTop = parseFloat(meter.style.top) || 0
              meter.style.top = Math.max(0, currentTop - meterRect.bottom + allowedBottom).toFixed(1) + 'px'
            }
          }
        }
        if (t >= 1) {
          el.setAttribute('data-endfield-loader-complete', '')
          // Hold the completed frame for a beat so 100% is actually readable.
          if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            if (loaderExitTimer === null) loaderExitTimer = window.setTimeout(finish, 220)
          } else finish()
          return
        }
        loaderRaf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(step) : null
      }
      // Paint the first frame synchronously: the plate must never flash at 0%/empty.
      step()
      // Clock 2: coarse fallback that survives rAF throttling.
      if (typeof setInterval === 'function') loaderTick = setInterval(step, 60)
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        // Fuse: if both progress clocks stall, force the completion sequence.
        loaderFuse = window.setTimeout(() => { finished = false; finish() }, DURATION + 1600)
        // Hard kill: covers the flourish itself stalling (a suspended tab can hold a
        // CSS transition indefinitely). Outlasts fuse + wipe + fade, then removes the
        // node unconditionally, so the app can never stay covered.
        loaderKill = window.setTimeout(destroyLoader, DURATION + 1600 + WIPE_MS + EXIT_MS + 400)
      } else if (loaderRaf === null && loaderTick === null) {
        destroyLoader()
      }
    }

    /* ---------- 雷霆大字 (娱乐模式, default OFF) ----------
       A task-boundary announcement: when a turn starts, 「任务开始」 slams into the
       middle of the screen in heavy white type; when it ends, 「任务完成」 does the
       same. Each stays for exactly 3s and removes itself.

       WHERE THE SIGNAL COMES FROM. This is turn-level state, not tool-level, so it
       reads the ONE authoritative bit: ConversationSnapshot.running on the current
       session (@deepseek-ai/dsh-client-runtime — the same field the app's own
       turn-status label and stop button switch on). No DOM sniffing: the class
       hashes those surfaces carry are not a contract, and a spinner appearing is
       not the same event as a turn starting.

       Reached through ctx.get('sessions'), NOT inject: the theme must still mount
       when the sessions service is absent (the in-process settings tests supply a
       ctx with only theme/slots), and a missing service means "no announcements",
       not "no theme".

       EDGES, NOT LEVELS. Only a false->true / true->false transition announces. The
       first readable value of a session is recorded as a BASELINE and stays silent,
       which is what stops 「任务开始」 from firing merely because the user switched
       into a session that was already running. */
    const THUNDER_KEY = PREFS_NS + '-thunder'
    /* The slam-in animation is its OWN switch, default OFF — same shape as
       等高线背景 → 动态等高线: the layer is one decision, animating it is another.
       With it off the word still appears instantly, holds 3s and leaves; only the
       scale punch and the fade are dropped. */
    const THUNDER_ANIM_KEY = PREFS_NS + '-thunder-anim'
    const THUNDER_START = '任务开始'
    const THUNDER_DONE = '任务完成'
    // Hold time, per the request: visible for 3s, then gone.
    const THUNDER_MS = 3000
    // Default OFF (=== '1' rather than !== '0'): opt-in, like the boot animation.
    const isThunderOn = () => prefsGet(THUNDER_KEY) === '1'
    // Default OFF for the same reason, and read independently of the parent switch.
    const isThunderAnimOn = () => prefsGet(THUNDER_ANIM_KEY) === '1'
    /* The OS preference still wins over an enabled animation switch, exactly as
       contourWantsScroll() does for the contour sheet. Checked live rather than
       cached, so changing the OS setting takes effect on the next announcement. */
    const thunderWantsAnim = () => isThunderAnimOn() && !prefersReducedMotion()
    let thunderEl = null
    let thunderTimer = null
    // Detaches the click-to-dismiss listener; null when none is armed.
    let thunderDismiss = () => {}
    /** Remove the plate and release its timer and listener. Idempotent. */
    const destroyThunder = () => {
      if (thunderTimer !== null && typeof clearTimeout === 'function') clearTimeout(thunderTimer)
      thunderTimer = null
      /* Detach BEFORE removing the node, and reset the handle first so the listener
         calling back into here cannot re-enter this line. */
      const detach = thunderDismiss
      thunderDismiss = () => {}
      detach()
      if (thunderEl && thunderEl.parentNode) thunderEl.parentNode.removeChild(thunderEl)
      thunderEl = null
    }
    /* Announce one word. A second call inside the 3s window REPLACES the first
       (turn/end immediately followed by a queued turn/start is a real sequence), so
       the node is rebuilt rather than reused — that restarts the CSS animation,
       which merely re-setting textContent would not. */
    const showThunder = (text) => {
      if (!isEnabled() || !isThunderOn()) return
      if (typeof document === 'undefined' || !document.body) return
      destroyThunder()
      const el = document.createElement('div')
      el.setAttribute('data-endfield-thunder', '')
      // Pure decoration over content the user is already reading: never announced,
      // never hit-tested (pointer-events:none lives in the stylesheet).
      el.setAttribute('aria-hidden', 'true')
      /* No animation: the word appears at full size and full opacity, holds, then is
         removed by the timer below. Two independent reasons land on this same static
         path — the animation switch being off (the default) and the OS asking for
         reduced motion — so both go through thunderWantsAnim(). */
      if (!thunderWantsAnim()) el.setAttribute('data-endfield-thunder-still', '')
      const word = document.createElement('span')
      word.setAttribute('data-endfield-thunder-word', '')
      word.textContent = text
      el.appendChild(word)
      document.body.appendChild(el)
      thunderEl = el
      /* CLICK ANYWHERE TO DISMISS EARLY, without waiting out the 3s.

         Listening on the DOCUMENT rather than on the plate is the whole point. The
         plate is pointer-events:none on purpose (it is a caption laid over text the
         user may be mid-sentence in, not a modal), and making it clickable would turn
         it into a full-screen click-eater for 3 seconds: the dismissing click would
         be swallowed instead of reaching whatever the user actually aimed at. With a
         document listener the click BOTH dismisses the word and lands normally, so
         clicking blank space costs nothing and clicking a control still works.

         pointerdown, not click, for two reasons: it covers mouse/touch/pen in one
         event, and it fires on press so the word disappears the instant the user
         acts. It also cannot self-dismiss when 预览 triggers this from a button's
         click handler — that interaction's pointerdown has already been dispatched
         before this listener exists, and a later click event does not re-fire it.

         Capture phase so an app handler calling stopPropagation cannot make the word
         undismissable. */
      if (typeof document.addEventListener === 'function' && typeof document.removeEventListener === 'function') {
        const onPointerDown = () => { destroyThunder() }
        document.addEventListener('pointerdown', onPointerDown, true)
        thunderDismiss = () => { document.removeEventListener('pointerdown', onPointerDown, true) }
      }
      // No timer available (a stripped test host) must not leave the plate up.
      if (typeof setTimeout === 'function') thunderTimer = setTimeout(destroyThunder, THUNDER_MS)
      else destroyThunder()
    }

    /* Resolved LAZILY, never cached at apply() time. The web boot mounts every
       plugin row concurrently (`Promise.all` over the manifest in dsh-web-frontend)
       and this theme declares no `inject`, so apply() can legitimately run before
       dsh-client-runtime has provided `sessions`. A one-shot `const sessions =
       ctx.get('sessions')` here would capture undefined for the whole session and
       the feature would be permanently dead depending on load order — the exact
       kind of race that only shows up on a slow or cold page load.

       Declaring inject: ['sessions'] is the other valid fix, but it would put the
       WHOLE THEME into cordis' pending state until that service appears, which
       would delay the token/stylesheet mount that everything else here depends on.
       A theme must paint even if the announcement feature never gets its service,
       so the lookup is deferred instead and re-tried on the retry timer below. */
    const getSessions = () => {
      const s = ctx.get('sessions')
      return (s === undefined || s === null) ? undefined : s
    }
    let thunderUnsubList = null
    let thunderUnsubSession = null
    let thunderRebindTimer = null
    let thunderWatchedId = null
    // null = nothing readable observed yet, so the next value is a baseline.
    let thunderLastRunning = null
    /** The running bit of one session face, or null when it cannot be read. */
    const thunderReadRunning = (face) => {
      try {
        const snap = face.getSnapshot()
        if (snap === null || typeof snap !== 'object') return null
        return snap.running === true
      } catch (e) {
        return null
      }
    }
    const thunderDetach = () => {
      if (thunderUnsubSession !== null) {
        try { thunderUnsubSession() } catch (e) { /* already torn down */ }
        thunderUnsubSession = null
      }
      thunderWatchedId = null
      thunderLastRunning = null
    }
    /** Subscribe to selection changes once; idempotent. */
    const thunderSubscribeList = (sessions) => {
      if (thunderUnsubList !== null) return
      let unsub = null
      try { unsub = sessions.list.subscribe(() => { thunderRebind() }) } catch (e) { unsub = null }
      thunderUnsubList = (typeof unsub === 'function') ? unsub : null
    }
    /* Follow the CURRENT session. `sessions.list` publishes the selection, and the
       runtime's own list subscriber (registered at construction, so it runs first)
       stages the session that makes binding() resolve. A miss here is therefore
       ordinary timing rather than an error, so it retries on a short timer instead
       of giving up — that single deferred retry is also what covers the very first
       reconcile during boot, before any session is staged. */
    const thunderRebind = () => {
      const sessions = getSessions()
      if (thunderRebindTimer !== null && typeof clearTimeout === 'function') clearTimeout(thunderRebindTimer)
      thunderRebindTimer = null
      /* Service not there yet: keep retrying rather than giving up for good, since
         the only reason to be here is that the feature is switched on. */
      if (sessions === undefined) {
        if (typeof setTimeout === 'function') thunderRebindTimer = setTimeout(thunderRebind, 120)
        return
      }
      // The list subscription may have been skipped earlier (no service then), so
      // attach it as soon as one exists.
      thunderSubscribeList(sessions)
      let id
      try {
        const snap = sessions.list.getSnapshot()
        id = (snap === null || typeof snap !== 'object') ? undefined : snap.current
      } catch (e) {
        return
      }
      if (id === undefined || id === null) {
        thunderDetach()
        return
      }
      /* Already watching this one: skip the detach/resubscribe churn. `sessions.list`
         publishes for every unrelated reason (a title change, a job row, a sidebar
         refresh), and rebinding on each one would tear down and re-add the same
         subscription constantly.

         Deliberately NOT claimed as an edge-correctness guard: the reseed would be
         synchronous, so `running` cannot change inside the gap and the baseline
         would land on the value it already held. Verified by removing this line —
         the edge assertions still pass. It is a cost guard, and it is honest about
         being one. */
      if (id === thunderWatchedId && thunderUnsubSession !== null) return
      thunderDetach()
      let face = null
      try {
        const binding = sessions.binding(id)
        if (binding !== undefined && binding !== null) face = binding.session
      } catch (e) {
        face = null
      }
      if (face === null || typeof face.subscribe !== 'function' || typeof face.getSnapshot !== 'function') {
        if (typeof setTimeout === 'function') thunderRebindTimer = setTimeout(thunderRebind, 120)
        return
      }
      thunderWatchedId = id
      thunderLastRunning = thunderReadRunning(face)
      let unsub = null
      try {
        unsub = face.subscribe(() => {
          const next = thunderReadRunning(face)
          if (next === null || next === thunderLastRunning) return
          const prev = thunderLastRunning
          thunderLastRunning = next
          // First readable value is the baseline, not an edge — see the note above.
          if (prev === null) return
          showThunder(next ? THUNDER_START : THUNDER_DONE)
        })
      } catch (e) {
        unsub = null
      }
      thunderUnsubSession = (typeof unsub === 'function') ? unsub : null
      if (thunderUnsubSession === null) thunderWatchedId = null
    }
    const thunderStopWatch = () => {
      if (thunderRebindTimer !== null && typeof clearTimeout === 'function') clearTimeout(thunderRebindTimer)
      thunderRebindTimer = null
      if (thunderUnsubList !== null) {
        try { thunderUnsubList() } catch (e) { /* already torn down */ }
        thunderUnsubList = null
      }
      thunderDetach()
    }
    /* Switched off costs nothing: no subscription, no timer, no plate. This mirrors
       the contour layer's rule — an off switch must not leave a listener behind that
       wakes on every streamed token just to return early. */
    const syncThunder = () => {
      if (!(isEnabled() && isThunderOn())) {
        thunderStopWatch()
        destroyThunder()
        return
      }
      // thunderRebind() resolves the service itself and re-arms its own retry, so
      // there is nothing to check here — being switched on is the whole condition.
      thunderRebind()
    }

    let disposeToken = () => {}
    let disposeStyles = () => {}
    let mounted = false
    const mount = () => {
      if (mounted) return
      mounted = true
      disposeToken = theme.overrideTokens('edge-intelligence-theme', {
      '--dsw-alias-bg-base': {
        light: '#e8e8e2',
        dark: '#101110',
      },
      '--dsw-alias-bg-layer-1': {
        light: '#f2f2ec',
        dark: '#181a18',
      },
      '--dsw-alias-bg-layer-2': {
        light: '#dcddd6',
        dark: '#1e201d',
      },
      '--dsw-alias-bg-overlay': {
        light: '#f2f2ec',
        dark: '#1c1e1c',
      },
      '--dsw-alias-border-l1': {
        light: '#d8d9d5',
        dark: '#343633',
      },
      '--dsw-alias-border-l2': {
        light: '#b6b8b3',
        dark: '#4a4d49',
      },
      '--dsw-alias-brand-primary': {
        light: '#101110',
        /* The one ACCENT-carrying token in this layer, so it is the one that must
           not be a literal. A token value may itself be a var() reference: the app
           writes these as inline properties on <body>, the palette variables are
           declared on <body> too, so the reference resolves on the same element and
           re-resolves when the palette class flips — no re-registration of this
           layer, no JS repaint. Verified by test/palette-switch.test.js, which
           caught exactly this token still reading #fff500 after a flip. */
        dark: 'var(--edge-accent)',
      },
      '--dsw-alias-label-primary': {
        light: '#101110',
        dark: '#f5f5f0',
      },
      '--dsw-alias-label-secondary': {
        light: '#4a4c48',
        dark: '#898d89',
      },
      '--dsw-alias-state-error-primary': {
        light: '#ff3b30',
        dark: '#ff6b61',
      },
      '--dsw-alias-state-success-primary': {
        light: '#2f9e44',
        dark: '#4fbf5c',
      },
      '--dsw-alias-state-warn-primary': {
        light: '#d9822b',
        dark: '#ffb700',
      },
      '--dsw-specific-sidebar-fill': {
        light: '#e8e8e2',
        dark: '#101110',
      },
    })

    disposeStyles = insertCss(`
      :root {
        --dsw-font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
        --ds-font-family-code: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei';
      }
      /* ================= accent palette =================================
         Every accent value in this stylesheet reads from the variables below
         instead of a literal, so the whole theme repaints from ONE declaration
         block. Two palettes ship:

           谷地黄 (default)  signal yellow  #fff500 — the Endfield site accent
           武陵青            teal-cyan      #14d0d0

         WHY THIS BLOCK IS ON body AND NOT :root. The app applies its theme
         tokens as INLINE STYLES ON <body> (dsh-client-ui-layout does
         body.style.setProperty(name, value) for every token in the snapshot).
         A custom property declared at :root that substitutes one of those
         tokens is resolved AT THE html ELEMENT, where the token does not
         exist, so it becomes guaranteed-invalid and computes to nothing.
         That was not theory: the shipped --edge-line / --edge-paper /
         --edge-soft were declared at :root and measured EMPTY in a real
         browser, which silently disabled the themed scrollbar
         (scrollbar-color computed to 'auto') and left the table/hairline
         rules falling back. Moving them onto body is what makes them resolve
         (see test/probe-edge-line.js).

         The same fact is what makes the palette switch free: the theme's
         token overrides are values like var(--edge-accent), body carries the
         palette class, so flipping the class re-resolves every token and
         every rule below with NO JavaScript repaint at all — verified in a
         real browser (test/probe-css.js), not assumed.

         --edge-accent-rgb is the same colour as a bare comma list, because
         rgba() needs channels rather than a hex; substituting a comma-list
         custom property inside rgba() is legal and was verified in the same
         probe. Keeping both in one place is why the ~30 translucent washes
         did not have to become 60 declarations.

         Values are MEASURED, not chosen — see test/palette-contrast.test.js,
         which fails the build if any of them stops clearing its bar:
           ink #101110 on 谷地黄 16.50:1 · on 武陵青 6.62:1   (AA, solid chips)
           accent as dark-mode icon ink   15.26:1  ·  6.12:1  (>=3 icon floor) */
      body {
        --edge-accent: #fff500;
        --edge-accent-rgb: 255, 245, 0;
        /* Hover/pressed step of the accent, still carrying ink-coloured text:
           谷地黄 13.60:1 · 武陵青 5.31:1. */
        --edge-accent-deep: #e8e000;
        /* The one place the accent must survive on CREAM as a fill (the light
           deepseek-450 slot): pure signal yellow is nearly paper-white there,
           so light mode uses a darkened step of the same hue. */
        --edge-accent-onpaper: #d9c700;
        /* Turn-status gradient text stops — see the long note on that rule.
           Gradient text paints glyphs with EVERY stop, and reduced-motion pins
           the mid band permanently inside the letters, so all four clear AA
           against both surfaces of their mode:
             谷地黄 light #6b5d00 5.35 / mid #3f3600 9.82
                    dark  #fff500 15.26 / mid #a08a00 5.11
             武陵青 light #006a6a 5.22 / mid #003f3f 9.58
                    dark  #14d0d0 9.14 / mid #7ee7e7 12.06 */
        --edge-status-light: #6b5d00;
        --edge-status-light-mid: #3f3600;
        --edge-status-dark: #fff500;
        --edge-status-dark-mid: #a08a00;
        /* Hero backdrop glow alpha, per scheme. These are the measured values
           from the note on that rule: the replacement must not change how deep
           the hero reads compared with the app's own #6187D8 at 8%. */
        --edge-glow-light: 0.08;
        --edge-glow-dark: 0.05;
      }
      /* ---------- 武陵青 (teal-cyan, #14d0d0) ----------
         Only the palette changes here; paper, ink, borders and the semantic
         state colours (error red, success green, warn amber) are shared, so
         this block is exactly the set of values that carry the accent hue.

         BRIGHTNESS. The first version shipped #0daaaa (the literal
         rgb(13, 170, 170) that was asked for) and read as too dark next to the
         signal yellow it alternates with — measured, that is not a matter of
         taste: relative luminance was 31.7% against the yellow's 86.6%, so on a
         near-black page the cyan chip carried barely a third of the presence.
         #14d0d0 keeps the same hue axis (R low, G == B, so it is still the same
         teal rather than drifting toward grey-cyan) and lifts luminance to
         49.8% — 57% brighter — while every measured invariant still holds:
           ink #101110 on the chip   6.62 -> 9.88:1   (AA, and now better)
           chip as dark-mode ink     6.62 -> 9.88:1   (icon floor is 3)
         It is deliberately NOT taken to the yellow's luminance: past ~#16dcdc
         the light-mode chip stops separating from cream (1.39:1 at #16dcdc
         versus 1.56:1 here), and a cyan that pale reads white-ish rather than
         teal. This is the brightest step that still looks like 武陵青 in both
         schemes. */
      body.theme-endfield-wuling {
        --edge-accent: #14d0d0;
        /* Same colour, channel-list form, for the ~30 rgba() washes. Derived from
           the hex above and kept beside it so the two cannot drift. */
        --edge-accent-rgb: 20, 208, 208;
        /* Hover step. Chosen to match the PERCEPTUAL drop the yellow palette uses
           (#fff500 -> #e8e000 is ΔY 19.9) rather than a copied percentage, so
           hover feels equally strong in both palettes: ΔY 19.7 here, 7.72:1 under
           ink text. */
        --edge-accent-deep: #10b8b8;
        /* Cyan is still far darker than yellow under ink (9.88 vs 16.50), so it
           needs no separate on-cream step — the accent itself reads on paper. */
        --edge-accent-onpaper: #14d0d0;
        /* Light mode dips deep, exactly as the yellow palette does: on cream no
           tint above #007070 clears AA on both surfaces, and that is a property of
           the paper, not of how bright the accent is — so these two are unchanged
           by the brightening. */
        --edge-status-light: #006a6a;
        --edge-status-light-mid: #003f3f;
        --edge-status-dark: #14d0d0;
        /* Dark mode LIFTS for its mid band instead of dipping like yellow's
           #a08a00: a darker cyan mid stop measured 3.54:1 and failed, because cyan
           at this lightness has less headroom below it than yellow does. Raised
           with the accent so the shimmer keeps a visible band: #7ee7e7 is 12.06:1
           and ΔY 40.6 from the accent (the old #4fd6d6 would now sit only ΔY 27.8
           away and read flatter). */
        --edge-status-dark-mid: #7ee7e7;
        /* Cyan carries real luminance where yellow is nearly neutral on cream, so
           the glow alphas are measured rather than inherited. Both stay inside the
           depth of the #6187D8 glow they replace (budget: light 9.90, dark 11.28).
           Dark comes down from 0.05 to 0.04 because the brighter accent lifts a
           near-black page faster: 0.05 now measures |ΔY| 7.6 where the old cyan
           measured 6.0. */
        --edge-glow-light: 0.08;
        --edge-glow-dark: 0.04;
      }
      /* Token-derived aliases. These MUST be on body, not :root — see above. */
      body {
        --edge-signal: var(--edge-accent);
        --edge-signal-dim: rgba(var(--edge-accent-rgb), 0.7);
        --edge-paper: var(--dsw-alias-bg-base);
        --edge-panel: var(--dsw-alias-bg-layer-1);
        --edge-line: var(--dsw-alias-border-l1);
        --edge-soft: var(--dsw-alias-bg-layer-2);
      }
      body {
        font-feature-settings: "tnum" 1, "ss01" 1;
        font-variant-ligatures: no-common-ligatures;
      }
      /* The persist-mode watermark is a z-index:-1 child of the conversation column.
         Two properties are needed on that column, and only while the mark is mounted
         there (the :has() guard makes this a no-op whenever the feature is off):
           isolation: isolate — without a stacking context, z-index:-1 escapes to the
             nearest ancestor context and paints behind the column's own opaque
             background, i.e. invisible.
           position: relative — the column ships as position:static, so an absolutely
             positioned child would resolve against the app frame instead and spill
             across the sidebar. This makes the column the containing block so
             inset:0 means "exactly this column".
         Every absolute descendant the app itself renders (header:after, tab:after,
         heroGlow, the overlay composer seat) already has a positioned ancestor
         nearer than this column, so their containing blocks are unchanged. */
      [class*='wSkVaW_root']:has(> [data-endfield-watermark]) {
        isolation: isolate;
        position: relative;
      }
      /* The persist FALLBACK mounts inside the app FRAME on pages with no
         conversation column (a full-page settings view). Same reason as the rule
         above: without isolation, the mark's z-index:-1 escapes to the root
         stacking context and paints below the frame's own opaque background —
         i.e. it never shows, which is exactly what the old body-level fallback
         did. The frame is already position:relative (see the contour notes), so
         isolation alone is enough here. The :has() guard keeps the frame's
         stacking behaviour stock whenever the mark is not mounted in it. */
      [class*='_frame']:has(> [data-endfield-watermark]) {
        isolation: isolate;
      }
      /* The mark sits behind text, so it must never intercept selection or clicks. */
      [data-endfield-watermark] {
        pointer-events: none !important;
      }
      /* ---------- watermark strength, per colour scheme ----------
         One variable per scheme instead of one number in JS, because the two
         schemes genuinely need different alphas and a scheme flip must re-resolve
         with no JS involved.

         Computed, not eyeballed — contrast of the composited ink against its own
         background (the mark is always BEHIND text, so this measures how loudly
         the decoration competes for attention, never foreground readability):

              alpha | dark #101110  | light #e8e8e2
              0.07  | 1.171 : 1     | 1.152 : 1
              0.085 | 1.215 : 1     | 1.186 : 1
              0.10  | 1.278 : 1     | 1.225 : 1
              0.13  | 1.406 : 1     | 1.310 : 1   <- previous dark value
              0.16  | 1.541 : 1     | 1.398 : 1   <- previous persist value

         Dark mode is the reported problem: adding luminance to a near-black page
         makes the wordmark read far louder than the same alpha subtracted from
         cream, and at 0.13/0.16 it visibly cluttered the UI. Dark therefore drops
         to 0.085 (1.215:1) — still clearly present, no longer competing. Light
         keeps more strength (0.13) because cream needs it to register at all;
         1.310:1 there looks quieter than 1.215:1 on black.
         Floor is ~1.06:1, below which the mark reads as absent. */
      body {
        --edge-wm-alpha: 0.13;
      }
      body[data-ds-dark-theme] {
        --edge-wm-alpha: 0.085;
      }
      /* Translation-proof glyphs: the wordmark is drawn from the CSS 'content'
         property, not a DOM text node, so page translators (which walk text nodes)
         have nothing to rewrite — the brand name cannot be turned into "终末地" or
         similar. The element's own text stays empty; ::before carries the letters. */
      [data-endfield-watermark]::before {
        content: 'ENDFIELD';
        display: block;
        white-space: nowrap;
      }
      /* ================= contour background sheet =================
         The layer is a child of the app frame. Every rule here is gated on the
         frame actually CONTAINING the layer, so with the feature off none of it
         matches and the app keeps its stock backgrounds exactly.

         The wrapper is inset:0 / z-index:0 inside a frame that is position:relative
         and creates no stacking context, so it paints above the frame's own
         background and below every positioned descendant. */
      [data-endfield-contour] {
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
      }
      [data-endfield-contour] canvas {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
      }
      /* Why these three transparency rules exist. Measured from the app's own
         stylesheets: the frame, the conversation column and the details column each
         paint an OPAQUE var(--dsw-alias-bg-base). Any of them left opaque hides the
         sheet completely on a real page, which is exactly why the existing
         watermark has to mount INSIDE the conversation column instead.
         Clearing them is safe and colour-neutral: the frame itself still supplies
         bg-base underneath, so the composited result is unchanged except that the
         contour is now visible through it. */
      [class*='_frame']:has(> [data-endfield-contour]) {
        background: transparent !important;
      }
      [class*='_frame']:has(> [data-endfield-contour]) [class*='wSkVaW_root'],
      [class*='_frame']:has(> [data-endfield-contour]) [class*='ydkMvW_root'] {
        background: transparent !important;
      }
      /* The sidebar reads --dsw-specific-sidebar-fill, which this theme sets to the
         SAME value as --dsw-alias-bg-base, so clearing it shifts no colour and
         simply lets the sheet run behind the sidebar as one continuous field. */
      [class*='_frame']:has(> [data-endfield-contour]) [class$='_sidebarCol'] {
        background: transparent !important;
      }
      /* The composer seat fades content out behind the input with a gradient to
         bg-base. Left alone it would show as an opaque band cutting across the
         sheet, so it fades to the base colour with alpha instead — same visual
         falloff, but the contour stays continuous underneath. */
      [class*='_frame']:has(> [data-endfield-contour]) [class$='_composerSeat'] {
        background: linear-gradient(180deg,
          rgba(0, 0, 0, 0) 0px,
          color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent) 36px) !important;
      }
      ::selection {
        color: #000;
        background: var(--edge-signal, var(--edge-accent));
      }
      /* Square corners (default): zero EVERY classed element, then restore circles/pills below.
         body.theme-endfield-round disables all of this and restores app-native rounding. */
      body:not(.theme-endfield-round) button,
      body:not(.theme-endfield-round) input,
      body:not(.theme-endfield-round) textarea,
      body:not(.theme-endfield-round) select,
      body:not(.theme-endfield-round) [role='button'],
      body:not(.theme-endfield-round) [role='dialog'],
      body:not(.theme-endfield-round) [role='menu'],
      body:not(.theme-endfield-round) [role='tooltip'],
      body:not(.theme-endfield-round) [role='tab'] {
        border-radius: 0 !important;
      }
      body:not(.theme-endfield-round) [class] {
        border-radius: 0 !important;
      }
      body:not(.theme-endfield-round) [class*='avatar'],
      body:not(.theme-endfield-round) [class*='Avatar'],
      body:not(.theme-endfield-round) [class*='spinner'],
      body:not(.theme-endfield-round) [class*='Spinner'],
      body:not(.theme-endfield-round) [class*='dot'],
      body:not(.theme-endfield-round) [class*='Dot'],
      body:not(.theme-endfield-round) [class*='actionButton' i],
      body:not(.theme-endfield-round) [class$='_iconButton'] {
        border-radius: 50% !important;
      }
      /* Hover feedback should track the pointer immediately; the app's broad
         transition rule otherwise makes colour changes feel delayed. */
      button,
      [role='button'] {
        transition: none !important;
      }
      body:not(.theme-endfield-round) [class*='scrollbar'],
      body:not(.theme-endfield-round) [class*='Scrollbar'] {
        border-radius: 0 !important;
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: var(--edge-line) transparent;
      }
      /* ---------- Light mode: deepen tertiary/secondary labels for icon visibility ---------- */
      body:not([data-ds-dark-theme]) {
        --dsw-alias-label-tertiary: #6a6d68;
        --dsw-alias-label-caption: #5a5d58;
        --dsw-alias-label-dimmed: #9a9d98;
        --edge-btn-muted: #dcddd6;
      }
      /* ---------- Neutralize remaining DeepSeek brand blues ---------- */
      body {
        --dsw-static-deepseek-50: #dcddd6;
        --dsw-static-deepseek-100: #dcddd6;
        --dsw-static-deepseek-200: #d8d9d5;
        --dsw-static-deepseek-300: #c8cac5;
        --dsw-static-deepseek-400: #757874;
        --dsw-static-deepseek-450: var(--edge-accent-onpaper);
        --dsw-static-deepseek-500: #101110;
        --dsw-static-deepseek-600: #101110;
        --dsw-static-deepseek-800: #3a3c38;
        --dsw-static-deepseek-900: #2a2c2a;
        --dsw-static-blue-900: #101110;
        --dsw-alias-button-info-fill: #101110;
        --dsw-alias-button-info-hover: #2a2b28;
        --dsw-alias-state-business-primary: #101110;
        --dsw-alias-state-business-tertiary: rgba(var(--edge-accent-rgb), 0.14);
        --dsw-alias-brand-primary-new-colorprimary-new-color: #101110;
        --dsw-alias-label-primary-bluish: #101110;
        --dsw-specific-bubble: #f2f2ec;
        --dsw-specific-bubble-highlight: #dcddd6;
        --dsw-specific-sidebar-nav-item-active-accent: #101110;
        --dsw-alias-interactive-bg-hover-accent: rgba(var(--edge-accent-rgb), 0.14);
        --dsw-alias-border-l3: #b6b8b3;
        --dsw-alias-border-l4: #9a9d98;
      }
      body[data-ds-dark-theme] {
        --dsw-static-deepseek-50: #242624;
        --dsw-static-deepseek-100: #242624;
        --dsw-static-deepseek-200: #2f312e;
        --dsw-static-deepseek-300: #3a3c38;
        --dsw-static-deepseek-400: #898d89;
        --dsw-static-deepseek-450: var(--edge-accent);
        --dsw-static-deepseek-500: #f5f5f0;
        --dsw-static-deepseek-600: #d8d9d5;
        --dsw-static-deepseek-800: #343633;
        --dsw-static-deepseek-900: #242624;
        --dsw-static-blue-900: #f5f5f0;
        --dsw-alias-button-info-fill: var(--edge-accent);
        --dsw-alias-button-info-hover: var(--edge-accent);
        --dsw-alias-state-business-primary: var(--edge-accent);
        --dsw-alias-state-business-tertiary: rgba(var(--edge-accent-rgb), 0.22);
        --dsw-alias-brand-primary-new-colorprimary-new-color: var(--edge-accent);
        --dsw-alias-label-primary-bluish: #f5f5f0;
        --dsw-specific-bubble: #181a18;
        --dsw-specific-bubble-highlight: #242624;
        --dsw-specific-sidebar-nav-item-active-accent: var(--edge-accent);
        --dsw-alias-interactive-bg-hover-accent: rgba(var(--edge-accent-rgb), 0.22);
        --dsw-alias-border-l3: #4f534f;
        --dsw-alias-border-l4: #5f6460;
        --edge-btn-muted: #3a3c38;
      }
      /* ---------- Signal yellow everywhere (light: visible but soft) ---------- */
      body {
        --dsw-alias-interactive-bg-hover: rgba(var(--edge-accent-rgb), 0.16);
        --dsw-alias-interactive-bg-active: rgba(var(--edge-accent-rgb), 0.26);
        --dsw-alias-interactive-bg-hover-solid: var(--edge-accent);
        --dsw-alias-bg-multi-select: rgba(var(--edge-accent-rgb), 0.16);
        --dsw-alias-bg-skeleton: rgba(var(--edge-accent-rgb), 0.12);
        --dsw-alias-markdown-citation: rgba(var(--edge-accent-rgb), 0.16);
        --dsw-alias-markdown-code-block-banner: rgba(var(--edge-accent-rgb), 0.10);
        --dsw-alias-markdown-code-segment-selected: rgba(var(--edge-accent-rgb), 0.22);
        --dsw-alias-markdown-code-segment-unselected: rgba(var(--edge-accent-rgb), 0.06);
        --dsw-alias-markdown-inline-code: rgba(var(--edge-accent-rgb), 0.14);
        --dsw-alias-markdown-tag: rgba(var(--edge-accent-rgb), 0.18);
        --dsw-alias-scrollbar-bg-l1: transparent;
        --dsw-alias-scrollbar-bg-l2: transparent;
        --dsw-alias-scrollbar-hover-l1: var(--edge-accent);
        --dsw-alias-scrollbar-hover-l2: var(--edge-accent);
        --dsw-specific-sidebar-nav-item-active: rgba(var(--edge-accent-rgb), 0.16);
        --dsw-specific-sidebar-nav-item-hover: rgba(var(--edge-accent-rgb), 0.12);
      }
      body[data-ds-dark-theme] {
        --dsw-alias-interactive-bg-hover: rgba(var(--edge-accent-rgb), 0.18);
        --dsw-alias-interactive-bg-active: rgba(var(--edge-accent-rgb), 0.28);
        --dsw-alias-interactive-bg-hover-solid: var(--edge-accent);
        --dsw-alias-bg-multi-select: rgba(var(--edge-accent-rgb), 0.18);
        --dsw-alias-bg-skeleton: rgba(var(--edge-accent-rgb), 0.14);
        --dsw-alias-markdown-citation: rgba(var(--edge-accent-rgb), 0.20);
        --dsw-alias-markdown-code-block-banner: rgba(var(--edge-accent-rgb), 0.12);
        --dsw-alias-markdown-code-segment-selected: rgba(var(--edge-accent-rgb), 0.26);
        --dsw-alias-markdown-code-segment-unselected: rgba(var(--edge-accent-rgb), 0.08);
        --dsw-alias-markdown-inline-code: rgba(var(--edge-accent-rgb), 0.18);
        --dsw-alias-markdown-tag: rgba(var(--edge-accent-rgb), 0.22);
        --dsw-alias-scrollbar-bg-l1: transparent;
        --dsw-alias-scrollbar-bg-l2: transparent;
        --dsw-alias-scrollbar-hover-l1: var(--edge-accent);
        --dsw-alias-scrollbar-hover-l2: var(--edge-accent);
        --dsw-specific-sidebar-nav-item-active: rgba(var(--edge-accent-rgb), 0.20);
        --dsw-specific-sidebar-nav-item-hover: rgba(var(--edge-accent-rgb), 0.16);
      }
      input, textarea, [contenteditable='true'] {
        caret-color: var(--edge-accent);
      }
      :focus-visible {
        outline: 2px solid var(--edge-accent) !important;
        outline-offset: 1px;
      }
      a {
        text-decoration-thickness: 1px;
      }
      a:hover {
        text-decoration-color: var(--edge-accent);
      }
      body[data-ds-dark-theme] a:hover {
        color: var(--edge-accent);
      }
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      ::-webkit-scrollbar-thumb {
        border-radius: 0;
        background: var(--edge-line);
      }
      ::-webkit-scrollbar-thumb:hover {
        background: var(--edge-accent) !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      /* ---------- Hover text contrast (reference page inversion) ---------- */
      /* Note: plain buttons are excluded — their own fill/text color must survive hover
         (e.g. yellow toggle button keeps black text; white-on-dark send button stays white). */
      :is([role='tab'], [role='menuitem'], [role='option'], [role='link'], [role='treeitem'], [role='checkbox'], [role='switch'], [role='radio'], [role='combobox'], [class*='nav-item' i], [class*='menu-item' i], [class*='list-item' i], [class*='session-item' i], [class*='workspace-item' i], [class*='search-result' i], [class*='item' i], [class*='tab' i], [class*='card' i], [class*='row' i], [class*='tool' i], [class*='composer' i]):hover {
        color: var(--dsw-alias-label-primary) !important;
      }
      /* ---------- Workspace browser rows (YDXeBa) ---------- */
      .YDXeBa_slot {
        color: var(--dsw-alias-brand-primary) !important;
      }
      .YDXeBa_projectRow:hover,
      .YDXeBa_sessionRow:hover,
      .YDXeBa_sessionRow.YDXeBa_selected,
      .YDXeBa_searchResultRow:hover,
      .YDXeBa_searchResultRow.YDXeBa_selected {
        background: rgba(var(--edge-accent-rgb), 0.22) !important;
      }
      .YDXeBa_projectRow:hover *,
      .YDXeBa_sessionRow:hover *,
      .YDXeBa_sessionRow.YDXeBa_selected *,
      .YDXeBa_searchResultRow:hover *,
      .YDXeBa_searchResultRow.YDXeBa_selected * {
        color: #000 !important;
      }
      /* ---------- Light mode: workspace folder / icon buttons ink ---------- */
      body:not([data-ds-dark-theme]) .YDXeBa_folder,
      body:not([data-ds-dark-theme]) .YDXeBa_folderActive,
      body:not([data-ds-dark-theme]) .YDXeBa_chevron,
      body:not([data-ds-dark-theme]) .YDXeBa_arrow,
      body:not([data-ds-dark-theme]) .YDXeBa_iconButton,
      body:not([data-ds-dark-theme]) .qDHVXG_iconButton,
      body:not([data-ds-dark-theme]) .qDHVXG_searchButton,
      body:not([data-ds-dark-theme]) .qDHVXG_clearButton {
        color: #101110 !important;
      }
      /* ---------- Dark mode: solid signal-yellow inversions ---------- */
      body[data-ds-dark-theme] .YDXeBa_projectRow:hover,
      body[data-ds-dark-theme] .YDXeBa_sessionRow:hover,
      body[data-ds-dark-theme] .YDXeBa_sessionRow.YDXeBa_selected,
      body[data-ds-dark-theme] .YDXeBa_searchResultRow:hover,
      body[data-ds-dark-theme] .YDXeBa_searchResultRow.YDXeBa_selected {
        background: var(--edge-accent) !important;
      }
      body[data-ds-dark-theme] [class*='badge' i]:hover,
      body[data-ds-dark-theme] [class*='badge' i][data-active] {
        background: var(--edge-accent) !important;
      }
      /* ---------- Dark mode: icon buttons (plus / ellipsis / stop / actions) ---------- */
      /* The cordis approval trio is EXCLUDED here. Those three buttons carry their own
         solid fill (signal yellow for approve, error red for decline) from the approval
         block below, so a signal-yellow glyph renders yellow-on-yellow — an invisible
         check. A 'body[data-ds-dark-theme] [attr]' selector (0,2,1) also outranks the
         plain '[data-cordis-approve]' (0,1,0) rules below, so source order cannot undo it:
         the exclusion has to happen in this selector. Their ink is set below. */
      body[data-ds-dark-theme] [class$='_iconButton'],
      body[data-ds-dark-theme] [data-cordis-switch],
      body[data-ds-dark-theme] [class*='actionButton' i]:not([data-cordis-approve]):not([data-cordis-approve-plugin]):not([data-cordis-decline]) {
        color: var(--edge-accent) !important;
      }
      body[data-ds-dark-theme] [class$='_iconButton']:hover:not(:disabled),
      body[data-ds-dark-theme] [data-cordis-switch]:hover:not(:disabled),
      body[data-ds-dark-theme] [class*='actionButton' i]:not([data-cordis-approve]):not([data-cordis-approve-plugin]):not([data-cordis-decline]):hover:not(:disabled) {
        color: #000 !important;
        background: var(--edge-accent) !important;
      }
      /* ---------- Cordis approval buttons (allow once / allow plugin / decline) ---------- */
      /* Each button is a solid chip, so its glyph must contrast with its OWN fill:
         black check on signal yellow, white X on error red. The icons are
         fill="currentColor" svg paths, so 'color' alone drives the glyph — but the
         svg/path are also targeted explicitly, because any inherited-color rule that
         wins on a descendant would otherwise repaint the glyph and hide it again. */
      [data-cordis-approve],
      [data-cordis-approve-plugin],
      [data-cordis-approve] svg,
      [data-cordis-approve-plugin] svg,
      [data-cordis-approve] svg path,
      [data-cordis-approve-plugin] svg path {
        color: #101110 !important;
        fill: currentColor !important;
      }
      [data-cordis-approve],
      [data-cordis-approve-plugin] {
        background: var(--edge-accent) !important;
      }
      [data-cordis-decline],
      [data-cordis-decline] svg,
      [data-cordis-decline] svg path {
        color: #fff !important;
        fill: currentColor !important;
      }
      [data-cordis-decline] {
        background: var(--dsw-alias-state-error-primary) !important;
      }
      /* The second check of the double-check icon is dimmed to .7 opacity by the panel's
         own stylesheet; on the solid chip keep both strokes at full ink. */
      [data-cordis-approve-plugin] [class$='_doubleCheck'] svg {
        opacity: 1 !important;
      }
      [data-cordis-approve]:hover:not(:disabled),
      [data-cordis-approve-plugin]:hover:not(:disabled) {
        background: var(--edge-accent-deep) !important;
      }
      [data-cordis-decline]:hover:not(:disabled) {
        background: #d6281d !important;
      }
      /* ---------- Tables: bright signal-yellow hover (reference .data-table) ---------- */
      [class*='tableScroll' i] th,
      [class*='table' i] th {
        background: var(--edge-soft) !important;
        border-bottom-color: var(--edge-line) !important;
      }
      [class*='tableScroll' i] td,
      [class*='table' i] td {
        border-bottom-color: var(--edge-line) !important;
      }
      tbody tr:hover,
      tbody tr:hover *,
      [class*='table' i] tbody tr:hover,
      [class*='table' i] tbody tr:hover *,
      [class*='tableScroll' i] tbody tr:hover,
      [class*='tableScroll' i] tbody tr:hover * {
        color: #000 !important;
        background: var(--edge-accent) !important;
      }
      /* ---------- New session button (sidebar) ---------- */
      [class$='_newSession'] {
        color: #000 !important;
        background: var(--edge-accent) !important;
        border-color: var(--edge-accent) !important;
      }
      body:not(.theme-endfield-round) [class$='_newSession'] {
        border-radius: 0 !important;
      }
      [class$='_newSession']:hover,
      [class$='_newSession']:focus-visible {
        color: #000 !important;
        background: var(--edge-accent-deep) !important;
        border-color: var(--edge-accent-deep) !important;
      }
      [class$='_newSession'] svg {
        color: #000 !important;
      }
      [class$='_newSessionLabel'] {
        color: #000 !important;
      }
      /* ---------- Badge hover: signal-yellow inversion (reference .kpi:hover) ---------- */
      [class*='badge' i]:hover,
      [class*='badge' i]:hover *,
      [class*='badge' i][data-active],
      [class*='badge' i][data-active] * {
        color: #000 !important;
      }
      /* ---------- Cordis action buttons (run/stop) ---------- */
      /* Approval chips excluded again: they already own a solid fill, and this blanket
         hover would repaint the decline chip yellow and re-tint the approve glyphs. */
      [data-cordis-switch]:hover:not(:disabled),
      [class*='actionButton' i]:not([data-cordis-approve]):not([data-cordis-approve-plugin]):not([data-cordis-decline]):hover:not(:disabled) {
        color: #000 !important;
        background: var(--edge-accent) !important;
      }
      body:not(.theme-endfield-round) [data-cordis-switch],
      body:not(.theme-endfield-round) [class*='actionButton' i] {
        border-radius: 999px !important;
      }
      /* ---------- Session header actions (agent preset / subagent / jobs) ---------- */
      [class$='_trigger']:hover:not(:disabled),
      [class$='_trigger'][aria-expanded='true'],
      [class$='_trigger']:focus-visible {
        color: #000 !important;
        background: var(--edge-accent) !important;
      }
      /* ---------- Agent-preset header chip: signal yellow, stretches to fill the action row ---------- */
      /* (scoped: the old broad [class$='_label'] rule yellowed plain text labels like 产物/settings/jobs names) */
      .SVAs4q_label {
        color: #000 !important;
        background: var(--edge-accent) !important;
        flex: 1 1 auto !important;
        max-width: none !important;
        justify-content: center !important;
        padding: 0 12px !important;
      }
      body:not(.theme-endfield-round) .SVAs4q_label {
        border-radius: 0 !important;
      }
      .SVAs4q_label .SVAs4q_icon,
      .SVAs4q_label svg {
        opacity: 1 !important;
        color: #000 !important;
      }
      /* ================= dark compaction notice + residual blues ================= */
      /* Dark mode: warm label grays (compaction notice title/summary/sep used bluish defaults) */
      body[data-ds-dark-theme] {
        --dsw-alias-label-tertiary: #9a9d98;
        --dsw-alias-label-caption: #a4a6a1;
        --dsw-alias-label-dimmed: #70736f;
        --dsw-alias-label-primary-dimmed: #d8d9d5;
        --dsw-alias-label-primary-inverted: #101110;
      }
      /* Preset menu descriptions readable without hover in dark */
      body[data-ds-dark-theme] [class$='_itemDesc'] {
        color: #c5c7c2 !important;
      }
      /* Light + dark: warm the remaining bluish-gray surfaces / buttons / code blocks */
      body {
        --dsw-alias-bg-layer-3: #dcddd6;
        --dsw-alias-bg-module-platform: #f2f2ec;
        --dsw-alias-markdown-code-block: #ecece6;
        --dsw-alias-button-elevated-fill: #f2f2ec;
        --dsw-alias-button-floating-fill: #f2f2ec;
        --dsw-alias-button-floating-hover: #e8e8e2;
        --dsw-alias-button-ghost-active-fill: #dcddd6;
        --dsw-alias-button-ghost-active-hover: #d8d9d5;
        --dsw-alias-button-ghost-active-border: #b6b8b3;
        --dsw-alias-button-primary-hover: #2a2b28;
        --dsw-alias-button-contrast-fill: #3a3c38;
        --dsw-alias-tooltip-bg: #2a2b28;
        --dsw-specific-input-major: #f2f2ec;
        --dsw-specific-selector: #e8e8e2;
        --dsw-specific-tip: #e8e8e2;
        --dsw-static-blue-400: #757874;
        --dsw-static-blue-450: var(--edge-accent);
        --dsw-static-blue-500: #101110;
        --dsw-alias-label-quaternary: #6a6d68;
        --dsw-alias-label-error: #ff3b30;
        --dsw-alias-label-inverse: #101110;
        --dsw-alias-line-secondary: #d8d9d5;
        --dsw-alias-separator-primary: #9a9d98;
        --dsw-alias-border-secondary: #b6b8b3;
        --dsw-alias-bg-primary: #f2f2ec;
        --dsw-alias-interactive-bg-primary: var(--edge-accent);
        --dsw-alias-fill-l2: #dcddd6;
        --dsw-alias-fill-tsp-secondary: #dcddd6;
      }
      body[data-ds-dark-theme] {
        --dsw-alias-bg-layer-3: #2c2e2a;
        --dsw-alias-bg-module-platform: #2c2e2a;
        --dsw-alias-bg-layer-2: #1e201d;
        --dsw-alias-markdown-code-block: #181a18;
        --dsw-alias-button-elevated-fill: #3a3c38;
        --dsw-alias-button-floating-fill: #343633;
        --dsw-alias-button-floating-hover: #3a3c38;
        --dsw-alias-button-ghost-active-fill: #343633;
        --dsw-alias-button-ghost-active-hover: #3f413d;
        --dsw-alias-button-ghost-active-border: #5f6460;
        --dsw-alias-button-primary-hover: var(--edge-accent-deep);
        --dsw-alias-button-contrast-fill: #f5f5f0;
        --dsw-alias-tooltip-bg: #2a2b28;
        --dsw-specific-input-major: #202220;
        --dsw-specific-selector: #2c2e2a;
        --dsw-specific-tip: #2c2e2a;
        --dsw-static-blue-400: #9a9d98;
        --dsw-static-blue-450: var(--edge-accent);
        --dsw-static-blue-500: #f5f5f0;
        --dsw-alias-label-quaternary: #9a9d98;
        --dsw-alias-label-error: #ff6b61;
        --dsw-alias-label-inverse: #101110;
        --dsw-alias-line-secondary: #343633;
        --dsw-alias-separator-primary: #70736f;
        --dsw-alias-border-secondary: #4a4d49;
        --dsw-alias-bg-primary: #181a18;
        --dsw-alias-interactive-bg-primary: var(--edge-accent);
        --dsw-alias-fill-l2: #242624;
        --dsw-alias-fill-tsp-secondary: #242624;
      }
      /* Token meter: messages segment signal yellow, system warm gray (tools keeps purple) */
      .JObwrW_colorMessages {
        --meter-tint: var(--edge-accent) !important;
      }
      .JObwrW_colorSystem {
        --meter-tint: #9a9d98 !important;
      }
      /* Appearance theme cube selected border: warm */
      ._8HJdBW_selected {
        border-color: var(--dsw-alias-border-l2) !important;
      }
      /* Hero preview badge: solid signal-yellow + black (reference accent chip) */
      .pXSMma_previewBadge {
        color: #101110 !important;
        background: var(--edge-accent) !important;
        border-color: var(--edge-accent) !important;
      }
      /* ---------- Hero backdrop glow: brand blue -> signal yellow ----------
         The empty-conversation hero paints one large blurred ellipse behind the
         composer card (ConversationRoot's <HeroGlow>, class *_heroGlow, figma
         313:14109; feGaussianBlur stdDeviation 50, ellipse 135% of the column
         width centred 92px above its bottom edge).
         Its colour is an SVG PRESENTATION ATTRIBUTE — fill="#6187D8"
         fill-opacity="0.08" — not a token, so the whole "neutralize remaining
         DeepSeek brand blues" variable block above could never reach it: a soft
         periwinkle haze survived the theme on that one page. A presentation
         attribute loses to ANY author CSS declaration, so restyling the ellipse
         here is sufficient and no app source is touched.

         Opacity is per scheme, and the two values are MEASURED, not picked: the
         app's exact glow svg was rendered headless over each --dsw-alias-bg-base
         and the ellipse core sampled, so the replacement can be matched to the
         presence of the glow it replaces (Y = 0.2126R+0.7152G+0.0722B):
           light #e8e8e2 (Y 231.5): 8% #6187D8 -> #DDE0E1 (Y 223.3, -8.2)
                                    8% #fff500 -> #E9E8D0 (Y 230.4, -1.1)
           dark  #101110 (Y  16.8): 8% #6187D8 -> #161A1F (Y  25.0, +8.2)
                                    5% #fff500 -> #1C1C0F (Y  27.1, +10.3)
         Light keeps 8%: yellow there is almost luminance-NEUTRAL and shifts only
         chroma (blue channel -18), i.e. a warm breath on the paper rather than
         the blue's grey-blue darkening — gentler than what it replaces, not
         louder. Dark had to come down from 8%/7%: over near-black, added
         luminance reads far more readily than subtracted blue does over cream
         (7% measured #20200E, Y +13.4 — about 1.6x the blue's lift), and 5%
         lands within ~2 Y of the original glow. So the hero keeps exactly the
         depth it had, in the theme's own accent.
         Matched on the '_heroGlow' CSS-module suffix rather than the current
         'wSkVaW' hash, so an app rebuild that rehashes the module cannot silently
         bring the blue back. */
      [class*='_heroGlow'] ellipse {
        fill: var(--edge-signal, var(--edge-accent)) !important;
        fill-opacity: var(--edge-glow-light) !important;
      }
      body[data-ds-dark-theme] [class*='_heroGlow'] ellipse {
        fill-opacity: var(--edge-glow-dark) !important;
      }
      /* Brand wordmark HARNESS chip: signal-yellow box + black letters (both modes) */
      body {
        --dsw-alias-label-primary-inverted: #101110;
      }
      [class*='brand'] svg rect,
      [class$='_newSession'] svg rect {
        fill: var(--edge-accent) !important;
      }
      /* Compaction notice row: soft yellow wash + accent in dark, hover = solid inversion */
      body[data-ds-dark-theme] [class$='_compactionRow'] {
        background: rgba(var(--edge-accent-rgb), 0.08) !important;
        border-left: 2px solid rgba(var(--edge-accent-rgb), 0.55) !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover:not(:disabled),
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible {
        background: var(--edge-accent) !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover *,
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible * {
        color: #000 !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover [class$='_compactionSep'],
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible [class$='_compactionSep'] {
        background: #000 !important;
      }
      /* ================= composer add (+) button hover inversion ================= */
      /* Dark: + icon signal yellow at rest; on hover solid yellow bg + black icon */
      body[data-ds-dark-theme] .uV2eYG_add {
        color: var(--edge-accent) !important;
      }
      body[data-ds-dark-theme] .uV2eYG_add:hover:not(:disabled),
      body[data-ds-dark-theme] .uV2eYG_add:focus-visible {
        color: #000 !important;
        background: var(--edge-accent) !important;
      }
      /* ================= composer primary send/stop button ================= */
      /* Dark: hardcoded #fff icon on yellow info-fill -> black icon; hover deeper yellow */
      body[data-ds-dark-theme] .uV2eYG_primary {
        color: #101110 !important;
      }
      body[data-ds-dark-theme] .uV2eYG_primary:hover:not(:disabled) {
        color: #101110 !important;
        background: var(--edge-accent-deep) !important;
      }
      /* ================= light-mode white-on-dark buttons keep white icon ================= */
      /* Generic hover inversion would make the white send icon black on the dark fill */
      body:not([data-ds-dark-theme]) :is(.uV2eYG_primary, .zGbnIq_primaryButton),
      body:not([data-ds-dark-theme]) :is(.uV2eYG_primary, .zGbnIq_primaryButton):hover:not(:disabled) {
        color: #fff !important;
      }
      /* ================= buttons the theme fills with the SOLID accent =================
         Settings > 模型 draws its row actions with .zGbnIq_secondaryButton, whose
         upstream rule is:
             color:      var(--dsw-alias-label-primary)
             background: var(--dsw-alias-interactive-bg-hover-solid)   (on :hover)
         This theme maps that background token to the solid accent but upstream keeps
         owning the foreground — so in dark mode the label stayed label-primary
         (#f5f5f0) on signal yellow. Measured from a real screenshot of the 编辑
         button: 63 px of #f5f5f0 sitting on #fff500 = 1.05:1, i.e. the word was
         invisible. On 武陵青 the same pairing is 2.61:1 — still failing, just less
         obviously, which is how it stayed hidden.

         Why the existing hover-inversion rule did not already cover it: that
         selector deliberately EXCLUDES plain buttons, because a button's own fill
         and text must survive hover (the yellow toggle keeps black text, the
         white-on-dark send button keeps white). This button is the case where the
         fill comes from the THEME and the text from the APP, so it has to be named.

         Scoped to the accent-filled states only, so the resting transparent button
         keeps label-primary and stays correct in both schemes (measured 16.00:1
         dark / 16.84:1 light). Guarded by test/settings-buttons.test.js.

         .HOVERPROBE is included deliberately: a screenshot/computed-style test
         cannot trigger :hover, so the test swaps in that class, which has the same
         0,1,0 specificity as the pseudo-class and therefore the same cascade
         outcome. Naming it here keeps the rule the test verifies identical to the
         rule that ships, instead of testing a near-copy. It never matches in the
         real app, since nothing renders that class.

         The class list is not just the reported button. Auditing the installed
         bundles for elements whose hover background is that token found SIX, and
         three of them additionally re-assert color:label-primary in the same rule
         (so they would fight a token-level fix):
           .zGbnIq_secondaryButton   settings > 模型 row actions   <- reported
           .gNWCoW_inspectButton     inspect panels (cordis)
           .iWrAna_inspectButton     inspect panels (skill)
           .o3BgMG_inspectButton     inspect panels (tool)
           .JVDQca_arrow             attachment carousel arrow
           .uV2eYG_add               composer + (already handled above)
         All are the same defect on different screens, so they are fixed together
         rather than one bug report at a time.

         '_inspectButton' is matched on the CLASS TOKEN, not with [class$=...], and
         that distinction is load-bearing: an attribute-suffix match requires the
         WHOLE class attribute to end with the string, so it silently misses any
         element that carries a second class after it (measured: it failed on
         class="gNWCoW_inspectButton HOVERPROBE"). Upstream composes class lists
         freely, so [class$=] is the wrong tool here. [class~='...'] matches a
         whitespace-separated token in any position, but the token includes the
         build hash, so each of the three is listed explicitly — they are stable
         names in installed bundles, and the audit above is what keeps the list
         honest. '_arrow' is NOT matched by suffix either: two other components
         (trajectory, workspace) also end in _arrow and take NO hover fill, so a
         suffix match there would force ink onto elements that keep their normal
         background — inventing a new contrast bug while fixing this one. */
      :is(.zGbnIq_secondaryButton, .gNWCoW_inspectButton, .iWrAna_inspectButton, .o3BgMG_inspectButton, .JVDQca_arrow):hover:not(:disabled),
      :is(.zGbnIq_secondaryButton, .gNWCoW_inspectButton, .iWrAna_inspectButton, .o3BgMG_inspectButton, .JVDQca_arrow):hover:not(:disabled) svg,
      :is(.zGbnIq_secondaryButton, .gNWCoW_inspectButton, .iWrAna_inspectButton, .o3BgMG_inspectButton, .JVDQca_arrow):hover:not(:disabled) svg path,
      :is(.zGbnIq_secondaryButton, .gNWCoW_inspectButton, .iWrAna_inspectButton, .o3BgMG_inspectButton, .JVDQca_arrow).HOVERPROBE:not(:disabled),
      :is(.zGbnIq_secondaryButton, .gNWCoW_inspectButton, .iWrAna_inspectButton, .o3BgMG_inspectButton, .JVDQca_arrow).HOVERPROBE:not(:disabled) svg,
      :is(.zGbnIq_secondaryButton, .gNWCoW_inspectButton, .iWrAna_inspectButton, .o3BgMG_inspectButton, .JVDQca_arrow).HOVERPROBE:not(:disabled) svg path {
        /* Ink on accent: 16.50:1 on 谷地黄, 6.62:1 on 武陵青 — both AA. */
        color: #101110 !important;
        fill: currentColor !important;
      }
      /* ---------- light mode: the danger (移除) button needs a darker red ----------
         Not part of the accent work, but measured by the same test and failing:
         --dsw-alias-state-error-primary is #ff3b30, which on the settings panel
         (#f2f2ec) is only 3.16:1 — below AA for the 12px label it paints. iOS-style
         reds are tuned for white-on-red fills, not red-on-paper text. Darkening the
         TEXT colour alone (the token keeps its value for fills/dots elsewhere)
         brings it to 5.12:1 while staying unmistakably red. */
      body:not([data-ds-dark-theme]) .zGbnIq_dangerButton {
        color: #c62016 !important;
      }
      /* ================= dark mode: selected rows = solid signal-yellow + black text ================= */
      /* The translucent yellow wash makes white text look muddy olive; the reference
         inverts to black-on-signal-yellow, so selected rows get the full inversion. */
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) {
        color: #000 !important;
        background: var(--edge-accent) !important;
        border-color: var(--edge-accent) !important;
      }
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) *:not(svg):not(path) {
        color: #000 !important;
      }
      /* ================= ask_user_question option chips ================= */
      /* Two contrast collisions in the question card (@deepseek-ai/dsh-client-ui-user-questions),
         both measured on a real card rather than guessed.

         1) The recommended chip. Upstream paints it with
              color: var(--dsw-alias-button-info-fill)
              background: var(--dsw-specific-sidebar-nav-item-active-accent)
            i.e. it uses info-fill as a FOREGROUND. This theme maps that token and the
            nav accent to the SAME value in both modes (#101110 light / #fff500 dark),
            so the label painted itself onto its own fill and the chip measured as a
            single flat colour with ZERO glyph pixels. Broken in BOTH modes, not just
            dark. Pin the pair explicitly instead of retuning either token, because
            both are consumed as real background fills elsewhere. */
      :is([role='radio'], [role='checkbox']) [class*='badge' i] {
        color: #101110 !important;
        background: var(--edge-accent) !important;
      }
      /* On a selected row the row itself is already solid signal yellow, so the chip
         inverts to keep its edge instead of dissolving into the row. */
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) [class*='badge' i] {
        color: var(--edge-accent) !important;
        background: #101110 !important;
      }
      /* 2) The option number ("1", "2", ...). The blanket dark inversion above
            recolours descendant TEXT to black but cannot touch a descendant's own
            background, so this chip kept its overlay fill
            (--dsw-alias-bg-overlay = #1c1e1c) and rendered a black digit on
            near-black: measured 1.25:1, i.e. the numbering vanished on the selected
            row. Wash the chip rather than filling it, so the digit reads on yellow
            and the chip still looks like a chip. */
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) [class*='number' i] {
        color: #101110 !important;
        background: rgba(16, 17, 16, 0.16) !important;
      }
      /* ---------- Turn-status label ("Deep diving...") ----------
         Owner: @deepseek-ai/dsh-client-ui-conversation, class Md3f7G_turnStatus.

         This label is GRADIENT TEXT, not coloured text. Upstream paints a
         linear-gradient background, sets -webkit-text-fill-color: transparent plus
         background-clip: text, and animates background-position to shimmer:

           background: linear-gradient(90deg,
             var(--dsw-static-deepseek-500) 0%   40%,
             var(--dsw-static-deepseek-200) 50%,
             var(--dsw-static-deepseek-500) 60% 100%);
           color: #0000; -webkit-text-fill-color: transparent;

         Two consequences drive the rules below:
           1. A plain 'color:' CANNOT recolour this label — the transparent text
              fill wins, so the glyphs would stay whatever the gradient paints. The
              recolour therefore has to go through the gradient itself.
           2. Retinting the shared --dsw-static-deepseek-* tokens is the wrong lever:
              --dsw-static-deepseek-500/200 also back --dsw-alias-button-info-fill,
              --dsw-alias-state-business-primary and --dsw-specific-bubble-highlight
              (verified in dsh-client-ui-theme/styles/design-platform.css), so the
              theme already maps them to ink/paper on purpose. Only
              background-image is overridden here, which leaves upstream's
              background-size, background-position and shimmer animation untouched.

         COLOUR CHOICE IS MEASURED, NOT PICKED BY EYE. Every gradient stop must
         clear WCAG AA 4.5:1 against BOTH backgrounds the label can sit on in its
         mode (bg-base and bg-layer-1), because the mid-band sweeps through the
         glyphs — and under prefers-reduced-motion upstream pins background-size to
         100%, leaving that mid-band permanently inside the text. Measured:
           light bg #e8e8e2 / #f2f2ec —  #fff500 scores 1.02:1 (invisible; the naive
             "just make it yellow" reading of this request), #8f7c00 3.38, #7d6c00
             4.25, and #6b5d00 5.35 is the FIRST gold that clears AA;
           dark  bg #101110 / #181a18 —  #fff500 15.26, #a08a00 5.11, while #8f7c00
             falls to 4.21 and fails.
         Hence the sweep DIPS deeper in both modes instead of lifting brighter:
         in light mode no gold above #6b5d00 can clear AA, and in dark mode a pale
         lift band desaturates to near-white and loses the yellow entirely.
         Light mode is a deep gold rather than signal yellow for the same reason the
         watermark and rail are not: on cream, #fff500 is not a colour choice, it is
         an erasure. */
      body [class*='turnStatus']:not([class*='turnStatusClock']) {
        background-image: linear-gradient(90deg,
          var(--edge-status-light) 0%, var(--edge-status-light) 40%, var(--edge-status-light-mid) 50%, var(--edge-status-light) 60%, var(--edge-status-light) 100%) !important;
      }
      body[data-ds-dark-theme] [class*='turnStatus']:not([class*='turnStatusClock']) {
        background-image: linear-gradient(90deg,
          var(--edge-status-dark) 0%, var(--edge-status-dark) 40%, var(--edge-status-dark-mid) 50%, var(--edge-status-dark) 60%, var(--edge-status-dark) 100%) !important;
      }
      /* ================= boot loading screen ================= */
      /* Fixed plate above everything, including the shell overlay layer. It exists
         only while the boot animation plays and is removed afterwards, so none of
         these rules match during normal use. Measurements come from the reference
         frame (1340x731) expressed as ratios so they scale with the viewport. */
      [data-endfield-loader] {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: #101110;
        /* Not inherited from the app: the plate can paint before tokens resolve. */
        color: #f5f5f0;
        font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-feature-settings: "tnum" 1;
        overflow: hidden;
        /* Never trap the user: even mid-animation the app underneath stays usable. */
        pointer-events: none;
        opacity: 1;
        /* No opacity transition: the fade is driven from JS (see finish()) because a
           CSS transition proved not to run in every renderer this plate targets.
           finish() also sets inline transition:none so nothing can fight it. */
      }
      /* Kept as a state hook (and a fallback for a renderer that never runs the JS
         fade) — the inline opacity written by finish() is what actually animates. */
      [data-endfield-loader][data-endfield-loader-exit] {
        opacity: 0;
      }
      /* Faint industrial grid, matching the reference backdrop texture. */
      [data-endfield-loader-tex] {
        position: absolute;
        inset: 0;
        opacity: 0.55;
        background-image:
          repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 4px),
          repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.010) 0 1px, transparent 1px 120px);
      }
      /* 8px rail: dim track full height, signal-yellow fill from the top down. */
      /* 10px rail, measured from the reference (10/1184 of the width). */
      [data-endfield-loader-track] {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 10px;
        background: rgba(var(--edge-accent-rgb), 0.10);
      }
      [data-endfield-loader-fill] {
        position: absolute;
        left: 0;
        top: 0;
        width: 10px;
        height: 0%;
        background: var(--edge-accent);
      }
      /* Meter RIDES THE FILL END: its top offset is set per frame from the same eased
         progress value that drives the fill height (see step()), so the readout
         descends with the bar. The exact offset and the clamping are done in JS,
         where the group's real height is known — a pure CSS percentage would let the
         readout hang off the bottom of the screen as the fill approaches 100%.
         Deliberately no CSS transition on the top offset: it is already updated every
         frame, and a transition would make the readout visibly lag the bar. */
      [data-endfield-loader-meter] {
        position: absolute;
        left: 26px;
        top: 0;
        will-change: top;
      }
      [data-endfield-loader][data-endfield-loader-complete] [data-endfield-loader-meter] {
        position: fixed !important;
        left: 26px !important;
        top: auto !important;
        bottom: 64px !important;
      }
      /* ---- completion flourish: yellow sweep to the right, then fade ----
         Starts as the rail itself (same 10px width, same colour, same left edge) and
         widens to cover the viewport, so the sweep reads as the finished bar flooding
         the screen rather than a new element appearing.
         Width and opacity are animated from JS (see finish()), deliberately NOT by a
         CSS transition: measured in the verification renderer, a transition declared
         here never started — no transitionrun/start/end events fired and the computed
         width stayed at 10px well past its duration — which would leave a thin stub
         instead of a sweep. These rules therefore only describe the resting state and
         must not declare a width/opacity transition that would fight the JS. */
      [data-endfield-loader-wipe] {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 10px;
        background: var(--edge-accent);
        opacity: 0;
      }
      [data-endfield-loader-tick] {
        display: block;
        width: 4px;
        height: 15px;
        background: var(--edge-accent);
      }
      [data-endfield-loader-pct] {
        display: block;
        margin-top: 7px;
        color: var(--edge-accent);
        font-size: 39px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
      }
      [data-endfield-loader-status] {
        display: block;
        margin-top: 12px;
        color: #666;
        font-size: 11px;
        font-weight: 400;
        letter-spacing: 0.02em;
      }
      /* ---- Poster brand block --------------------------------------------------
         Measured from the supplied key-art (1184x685) by scanning its pixels, not
         estimated — the ink bands on the right half of the reference are:
           block left ink edge  x=868  -> 868/1184 = 73.3% of the width
           right-most ink       x=1098 -> right gap 86px = 7.3% of the width
           kicker band          y 258..260   h=3    (ratio to cap 0.10)
           END band             y 265..293   h=29   -> cap 4.23% of plate height
           FIELD band           y 297..325   h=29   -> line pitch 32px, 32/29 = 1.10
           chevron band         y 498..506   x=841  -> outdent 868-841 = 27px
           tagline band         y 543..551   h=9, run width 231px
         The block is LEFT-aligned internally (all rows share x=868) but placed on
         the right — that combination is what gives the reference its look; a
         right-aligned (ragged-left) block reads completely differently.

         GEOMETRY MODEL — the block is anchored by its RIGHT margin, not by a left
         percentage. That is deliberate and is what fixes two measured faults:
           1. A left percentage (the old --edge-rail: 73%) sets where the block
              STARTS and lets its width run toward the right edge, so the margin
              that a viewer actually reads as "too far right" was never controlled.
              Anchoring 'right' makes that margin the declared quantity, and the
              rhythm line falls out of the widest row instead of being guessed.
           2. Sizing purely in vh made the wordmark shrink on a wide-but-short
              window and, at the old 4.2vh, rendered the cap at 3.01% of plate
              height against the reference's 4.23% — measurably ~70% of reference,
              which is why it read as too small.
         --edge-word is therefore clamp(26px, min(5.2vh, 4.8vw), 64px):
           min(5.2vh, 4.8vw)  scales with the SMALLER axis, so neither a short nor
                              a narrow window can push the block into the rail;
           26px floor         keeps the sub-rows legible on a tiny plate;
           64px ceiling       measured: without it, cap-height fell to 2.69% of H
                              at 2560x1440 (the block visibly shrank on a large
                              display); 64px holds it at ~3.2% and up.
         Verified across 13 viewports from 520x900 to 2560x1440: cap-height stays
         within 3.1-3.9% of plate height (reference 4.23%, intentionally a touch
         under — see below) with no overflow past any edge and >=150px clearance
         from the progress rail and its meter.
         The block still renders slightly under reference scale on purpose: the
         key-art is a full-bleed poster, whereas this plate flashes over an app.
         Every row is a ratio of --edge-word, so this one value rescales the whole
         block without disturbing the measured proportions above. The small rows
         additionally carry a px floor — see the max() calls below. */
      [data-endfield-loader] {
        --edge-word: clamp(26px, min(5.2vh, 4.8vw), 64px);
        /* Distance from the plate's right edge to the block's right edge. The %
           term keeps it proportional on a wide display; the px term stops it
           collapsing on a narrow one. */
        --edge-gap: max(64px, 12%);
      }
      [data-endfield-loader-brand] {
        position: absolute;
        right: var(--edge-gap);
        top: 50%;
        transform: translateY(-50%);
        /* No max-width: every row sets white-space: nowrap, so a width cap cannot
           wrap them — it only clips. The block moves instead (see the --edge-gap
           media queries) so the longest row always fits. */
      }
      /* Anchor to --edge-word like every other row. Without this the em below
         resolves against the inherited root font-size (16px), which rendered the
         kicker at 2.25x its reference size and bloated the whole block. */
      [data-endfield-loader-kicker] {
        display: block;
        font-size: var(--edge-word);
      }
      [data-endfield-loader-kicker]::before {
        content: 'DEEPSEEK HARNESS';
        display: block;
        margin-bottom: 0.5em;
        color: #f5f5f0;
        /* max() floor: the reference ratio alone (0.135em of the wordmark) computes
           to ~4px on a short plate, which renders as an illegible grey smudge
           rather than text. 9px is the smallest size this still reads at. */
        font-size: max(9px, 0.155em);
        font-weight: 600;
        letter-spacing: 0.26em;
        white-space: nowrap;
        opacity: 0.95;
      }
      /* Both rows: the negative margin cancels Arial's left side bearing so the
         INK edge lands on the rhythm line, not the glyph box edge. */
      [data-endfield-loader-word] {
        display: block;
        margin-left: -0.055em;
        color: #f5f5f0;
        font-size: var(--edge-word);
        font-weight: 900;
        /* 0.80, not 1.10: the reference pitch/cap of 1.10 is measured between
           INK tops, while line-height spans the full em box (ascender+descender),
           which for Arial-900 is ~1.38x the cap height. 1.10 as a line-height
           renders a visibly loose 1.52 ink pitch. */
        line-height: 0.80;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }
      [data-endfield-loader-word1]::before { content: 'END'; }
      [data-endfield-loader-word2]::before { content: 'FIELD'; }
      /* ---- detail cluster: chevron outdented into the left margin ---- */
      [data-endfield-loader-detail] {
        display: block;
        position: relative;
        margin-top: 1.9em;
        font-size: var(--edge-word);
      }
      [data-endfield-loader-chev] {
        position: absolute;
        left: -0.26em;
        top: 0.02em;
        width: 0.12em;
        height: 0.24em;
      }
      /* Two stacked chevrons drawn from borders — no glyph, no font dependency. */
      [data-endfield-loader-chev]::before,
      [data-endfield-loader-chev]::after {
        content: '';
        position: absolute;
        left: 0;
        width: 0.10em;
        height: 0.10em;
        border-left: 0.028em solid var(--edge-accent);
        border-bottom: 0.028em solid var(--edge-accent);
        transform: rotate(-45deg);
      }
      [data-endfield-loader-chev]::before { top: 0; }
      [data-endfield-loader-chev]::after { top: 0.09em; }
      [data-endfield-loader-sub]::before {
        content: 'EDGE INTELLIGENCE THEME';
        display: block;
        color: #8a8d88;
        /* Same legibility floor as the kicker: measured, the bare ratio rendered
           this row 3px tall — visible as a blur, not readable as words. */
        font-size: max(9px, 0.135em);
        font-weight: 500;
        letter-spacing: 0.12em;
        white-space: nowrap;
      }
      [data-endfield-loader-seq]::before {
        content: 'TERRA RESEARCH COMMISSION / BOOT SEQUENCE';
        display: block;
        margin-top: 0.4em;
        color: #6a6d64;
        font-size: max(8px, 0.125em);
        font-weight: 500;
        letter-spacing: 0.10em;
        white-space: nowrap;
      }
      [data-endfield-loader-squares] {
        display: grid;
        grid-template-columns: repeat(6, 0.115em);
        gap: 0.04em;
        margin-top: 0.30em;
      }
      [data-endfield-loader-squares] i {
        display: block;
        height: 0.05em;
        background: #2e302d;
      }
      [data-endfield-loader-squares] i[data-on] {
        background: var(--edge-accent);
      }
      /* Tagline closes the block on the same rhythm line.
         Reference: cap 11px across 232px, i.e. cap/width 0.38 — unreachable in
         Arial, where an 11px-cap run of this string measures 299px (340px at the
         reference's tracking). The source art uses a condensed face, and probing
         the renderer showed Arial Narrow genuinely resolves here (245px vs Arial's
         299px on the same probe), so it is used with Arial as the fallback: on a
         host without it the run simply sets wider in Arial and still fits, because
         the size below is a ratio of the wordmark rather than a fixed px. */
      [data-endfield-loader-tag]::before {
        content: 'OVER THE FRONTIER / INTO THE FRONT';
        display: block;
        margin-top: 1.05em;
        color: #f5f5f0;
        font-family: "Arial Narrow", Arial, sans-serif;
        font-size: max(10px, 0.34em);
        font-weight: 500;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }
      [data-endfield-loader-tag] {
        display: block;
        font-size: var(--edge-word);
      }
      /* Narrow windows: pull the block toward the right edge so the measured ratios
         survive instead of the text clipping. Only the margin changes — --edge-word
         already scales itself off the smaller viewport axis, so the wordmark needs
         no per-breakpoint override. */
      @media (max-width: 1100px) {
        [data-endfield-loader] { --edge-gap: max(48px, 9%); }
      }
      @media (max-width: 760px) {
        [data-endfield-loader] { --edge-gap: max(28px, 5%); }
      }
      /* Reduced motion is handled in finish(), which skips the sweep/fade entirely
         and removes the plate outright; nothing here needs to disable a transition,
         since the plate no longer declares one. */
      /* Settings page group headers (rendered by the settings.section slot).
         The label is accent ink that stays AA on both surfaces: light mode uses
         the darkened accent stops (--edge-status-light: #6b5d00 / #006a6a),
         dark mode the bright ones (--edge-status-dark: #fff500 / #14d0d0) — the
         same measured pairs the turn-status shimmer uses. The palette class
         flips both variables, so the header follows the palette for free. */
      .endfield-settings-group-title {
        color: var(--edge-status-light);
      }
      body[data-ds-dark-theme] .endfield-settings-group-title {
        color: var(--edge-status-dark);
      }
      /* ================= 雷霆大字 (娱乐模式) =================
         The task-boundary announcement. Fixed, centred, above the shell overlay
         layer and the app's own dialogs but BELOW the boot plate (2147483000), so
         a boot animation still wins the screen it owns.

         WHITE, EXPLICITLY. The request asks for white text, and white is the one
         thing this theme's own tokens cannot promise: --dsw-alias-label-primary is
         INK (#101110) in light mode, so inheriting it would print the word in near
         black on cream. The glyph colour is therefore a literal #fff in both
         schemes, and legibility over unknown page content is bought by the plate's
         own scrim plus a dark text shadow rather than by the page background.

         THE SCRIM ALPHA IS MEASURED, NOT PICKED BY EYE — and the first value was
         WRONG. Shipping 0.28 looked fine in dark mode (18.92:1) and was almost
         invisible in light: white on ink-over-cream measured 2.29:1 on bg-base and
         2.11:1 on bg-layer-1, i.e. the same "on cream, #fff500 is not a colour
         choice, it is an erasure" failure this theme already documents for the
         watermark and the turn-status label — except here it was pure white. Caught
         by rendering the plate and measuring the pixels (test/thunder-shot.js), not
         by reading the CSS.

         Measured white-vs-scrimmed-surface, ink #101110 over each light surface:
             alpha   bg-base #e8e8e2   bg-layer-1 #f2f2ec   dark #101110
             0.28         2.29:1            2.11:1            18.92:1
             0.40         3.13:1            2.90:1            18.92:1
             0.50         4.17:1            3.89:1            18.92:1
             0.55         4.85:1            4.55:1            18.92:1
         0.55 is the first step where BOTH light surfaces clear 4.5:1 — the AA bar
         for ordinary body text, which is deliberate headroom for a word whose own
         bar is only the 3:1 large-text floor. Dark mode is unaffected either way
         (ink over near-black is the same colour), so the light surfaces are what
         set this number.

         pointer-events:none on both layers keeps every click, selection and scroll
         underneath working while the word is up — the plate is a caption, not a
         modal. Click-to-dismiss does NOT change that: the listener lives on the
         DOCUMENT in the capture phase (see showThunder), so a press both clears the
         word and reaches whatever the user aimed at. Giving this layer
         'pointer-events: auto' to catch the click itself would turn it into a
         full-screen click-eater for 3 seconds — verified by injecting exactly that
         and watching test/thunder-dismiss.test.js fail on hit-testing. */
      [data-endfield-thunder] {
        position: fixed;
        inset: 0;
        z-index: 2147482000;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        background: rgba(16, 17, 16, 0.55);
        animation: endfield-thunder-plate 3000ms linear 1 both;
      }
      [data-endfield-thunder-word] {
        /* 大字: heavy, oversized, and scaled off the viewport so it stays a
           screen-filling statement at any window size rather than a fixed 48px that
           looks large on a phone and small on a 4K panel. Same clamp discipline as
           --edge-word on the boot plate. */
        font-family: "Arial Black", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: clamp(44px, 13vw, 176px);
        font-weight: 900;
        line-height: 1;
        letter-spacing: 0.12em;
        /* The trailing letter-spacing would otherwise push the word off-centre. */
        text-indent: 0.12em;
        color: #fff;
        white-space: nowrap;
        text-align: center;
        /* Ink halo: what makes white type survive on cream paper, where a pure
           white glyph would otherwise have almost no edge. */
        text-shadow:
          0 0 2px rgba(16, 17, 16, 0.55),
          0 4px 18px rgba(16, 17, 16, 0.65),
          0 0 46px rgba(var(--edge-accent-rgb), 0.45);
        animation: endfield-thunder-word 3000ms cubic-bezier(0.16, 1, 0.3, 1) 1 both;
      }
      /* The slam: overshoot in, hold, then fade. Keyframe percentages are the 3s
         hold expressed as one timeline, so a single animation covers entry, hold and
         exit and nothing has to be re-timed in JS. */
      @keyframes endfield-thunder-word {
        0%   { opacity: 0; transform: scale(2.4); }
        7%   { opacity: 1; transform: scale(0.94); }
        12%  { transform: scale(1); }
        80%  { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.06); }
      }
      @keyframes endfield-thunder-plate {
        0%   { opacity: 0; }
        5%   { opacity: 1; }
        80%  { opacity: 1; }
        100% { opacity: 0; }
      }
      /* The STATIC path: the word appears at full size and opacity, holds its 3s,
         then the JS timer removes it. Two independent reasons reach this attribute
         (see showThunder): the 动画 sub-switch being off — which is the DEFAULT — and
         the OS asking for reduced motion. Driving it from an attribute rather than a
         media query alone is what makes the default state testable in a browser that
         cannot toggle the OS preference from script.

         'opacity: 1' is load-bearing, not redundant: the animated rules start at
         'opacity: 0' and rely on the keyframes to bring the word in, so cancelling
         only 'animation' would leave a permanently invisible plate. */
      [data-endfield-thunder][data-endfield-thunder-still],
      [data-endfield-thunder][data-endfield-thunder-still] [data-endfield-thunder-word] {
        animation: none;
        opacity: 1;
        transform: none;
      }
      /* Belt-and-braces for reduced motion: the attribute above already covers it,
         but this keeps the guarantee in CSS even if a future edit reaches the DOM
         without going through showThunder(). */
      @media (prefers-reduced-motion: reduce) {
        [data-endfield-thunder],
        [data-endfield-thunder] [data-endfield-thunder-word] {
          animation: none;
          opacity: 1;
          transform: none;
        }
      }
    `)
      syncRadiusMode()
      syncPaletteClass()
    }
    const unmount = () => {
      if (!mounted) return
      mounted = false
      disposeToken()
      disposeStyles()
      disposeToken = () => {}
      disposeStyles = () => {}
      // Guarded like every other body touch: an unload race must not throw here.
      if (typeof document !== 'undefined' && document.body !== null) {
        document.body.classList.remove('theme-endfield-round')
        /* The palette class must go with the stylesheet that gives it meaning:
           left behind it would be a class nothing defines, and it would make
           isWulingPalette() report a palette the page is no longer using. The
           stored preference is untouched, so re-enabling restores it. */
        document.body.classList.remove(PALETTE_CLASS)
      }
      // The plate is styled by the theme stylesheet just torn down — an orphaned
      // plate would sit there as an unstyled black-less div, so drop it too.
      destroyLoader()
      // Same reasoning for the contour sheet: its positioning and the background
      // transparency rules it depends on both live in that stylesheet, so leaving
      // it mounted would drop two raw canvases into the app's layout flow.
      contourTeardown()
      /* The announcement plate is styled entirely by that stylesheet too, so an
         in-flight word would become an unstyled, un-positioned block of text in the
         document flow. Stop watching as well: with the theme off there is nothing to
         announce into. */
      thunderStopWatch()
      destroyThunder()
    }

    if (isEnabled()) {
      mount()
      syncWatermarkVisibility()
      // The contour sheet needs the stylesheet mount() just inserted, and the app
      // frame to exist; syncContour is a no-op until both are true and the
      // watermark's MutationObserver retries it as the app renders.
      syncContour()
      // Boot animation: only on a real page load, only when switched on, and only
      // after the stylesheet above exists (mount() inserted it).
      if (isLoaderOn()) runLoader()
      // Task announcements: subscribes only while switched on, and the first value
      // it reads is a baseline, so enabling mid-turn stays silent.
      syncThunder()
    }

    /* Live preference reconciler. The namespace scope subscription in the store
       block near the top of apply() calls this every time an authoritative
       section change lands (our own committed writes echo back, another window /
       device edits the same profile's <settings.yaml>, or the host reverts a
       value). It mirrors the initial mount block above so a runtime change re-
       paints exactly the live surfaces it can: the master switch mounts/unmounts
       the token + stylesheet layers, then radius/palette/watermark/contour/
       thunder re-derive from the new value. The boot loader is deliberately not
       replayed here — it is a once-per-page-load plate that only its own toggle
       and 预览 button may start. Every layer entry point is idempotent (mount()
       and unmount() guard on `mounted`, syncContour is a no-op until the frame
       and stylesheet exist), so repeated echoes are cheap and safe. */
    reconcileFromPrefs = () => {
      const enabledNext = isEnabled()
      const enabledNow = mounted
      if (enabledNext && !enabledNow) mount()
      else if (!enabledNext && enabledNow) unmount()
      if (enabledNext) {
        // These sync helpers read the store on each call, so no snapshot passing.
        syncRadiusMode()
        syncPaletteClass()
        syncWatermarkVisibility()
        syncContour()
        syncThunder()
      }
    }

    /* ---------- Settings page copy: zh / en dictionaries ----------
       The panel followed DSH's language setting for nothing before this: every
       label was a hardcoded Chinese literal, so an English UI showed a wholly
       Chinese settings page.

       The texts go through the app's own `locale` service (@deepseek-ai/dsh-client-
       locale) rather than a private language guess: it already owns the user's
       preference, its own durable storage and the re-render channel, and reading
       navigator.language here would drift from the setting the user actually chose.

       zh is the source of truth for the key set (this repo's convention) and en is
       kept complete against it — a key present in one and missing in the other would
       silently fall back to the raw key string in the UI, which is why the test suite
       compares the two key sets rather than trusting review.

       Naming: keys are grouped by row (`theme*`, `palette*`, `thunder*`) so a row's
       copy stays discoverable next to its switch. */
    const ENDFIELD_NS = 'settings.theme-endfield'
    const LOCALE_ZH = {
      nav: '终末地主题设置',
      /* The separator between a row label and its value. It is a DICTIONARY KEY, not
         a literal: Chinese uses the full-width '：' with no trailing space, English
         the ASCII ': '. Hardcoding the full-width form (as the first version did) put
         a Chinese colon into every English row — subtle, but exactly the kind of
         thing that makes a localized page feel machine-translated. */
      sep: '：',
      on: '开启',
      off: '关闭',
      groupTheme: '主题',
      groupBg: '背景',
      groupAnim: '动画',
      groupFun: '娱乐',
      themeRow: '终末地主题',
      themeOn: '开启主题',
      themeOff: '关闭主题',
      paletteRow: '主题配色',
      paletteValley: '谷地黄',
      paletteWuling: '武陵青',
      paletteToValley: '切换谷地黄',
      paletteToWuling: '切换武陵青',
      paletteHintValley: '默认信号黄 #fff500（终末地官网强调色）',
      paletteHintWuling: '青碧色强调 #14d0d0，用于按钮、悬停、选中行与等高线',
      radiusRow: '主题圆角',
      radiusRound: '圆角',
      radiusSquare: '直角',
      radiusToRound: '切换圆角',
      radiusToSquare: '切换直角',
      contourRow: '等高线背景',
      contourOn: '开启背景',
      contourOff: '关闭背景',
      contourHintOn: '当前配色的地形等高线铺满界面底层（置于所有内容之下）',
      contourHintOff: '默认关闭；开启后在界面底层绘制等高线地形纹理',
      contourAnimRow: '等高线滚动',
      contourAnimOn: '开启滚动',
      contourAnimOff: '切为静态',
      contourAnimHintOn: '等高线地形向所选方向匀速平移（地形本身永不变形）',
      contourAnimHintOff: '静态等高线，不做任何逐帧计算',
      contourAnimHintReduced: '系统已开启「减少动态效果」，当前保持静态',
      contourDirRow: '滚动方向',
      contourDirHint: '选择等高线滚动方向（8 方向，对角线与正方向速度一致）',
      contourSpeedRow: '滚动速度',
      contourSpeedHint: '以像素/秒为单位，任何屏幕刷新率下速度一致',
      contourDensityRow: '等高线密度',
      contourDensityHint: '选择等值线数量（只改变线条疏密，不改变地形）',
      contourDensitySparse: '稀疏',
      contourDensityMedium: '适中',
      contourDensityDense: '密集',
      contourDensityVeryDense: '极密',
      contourRoughnessRow: '地形粗糙度',
      contourRoughnessHint: '低=平原（线条宽阔平缓），高=极端山地（等高线密集、多峰多谷）；改变地形本身，不是线距',
      contourRoughnessNeedLayer: '请先开启等高线背景',
      contourRoughPlains: '平原',
      contourRoughSlope: '缓坡',
      contourRoughHills: '丘陵',
      contourRoughKnolls: '缓丘',
      contourRoughUpland: '高地',
      contourRoughSloping: '坡地',
      contourRoughFoothills: '浅山',
      contourRoughHighland: '山地',
      contourRoughSteep: '陡山',
      contourRoughRidges: '峻岭',
      contourRoughCraggy: '险峰',
      contourRoughExtreme: '极峰',
      contourScrollPauseRow: '滚动窗口动画暂停',
      contourScrollPauseOn: '开启暂停',
      contourScrollPauseOff: '关闭暂停',
      contourScrollPauseHintOn: '滚动上下文窗口时暂停等高线动画，停止滚动后约 10ms 恢复',
      contourScrollPauseHintOff: '警告：关闭后可能出现滚动卡顿',
      contourAnimNeedLayer: '请先开启等高线背景',
      watermarkRow: '背景水印',
      watermarkOn: '开启水印',
      watermarkOff: '关闭水印',
      wmPersistRow: '水印保持显示',
      wmPersistOn: '保持显示',
      wmPersistOff: '仅新建页',
      wmPersistHintOn: '在对话等非新建会话页面也显示水印（置于正文之下）',
      wmPersistHintOff: '仅在新建会话页显示水印',
      wmPersistNeedWm: '请先开启背景水印',
      loaderRow: '启动加载动画',
      loaderOn: '开启动画',
      loaderOff: '关闭动画',
      loaderHintOn: '刷新页面时播放 ENDFIELD 启动加载屏（左侧进度轨 + 百分比，跟随当前配色）',
      loaderHintOff: '默认关闭；开启后每次刷新页面播放一次',
      loaderNeed: '请先开启启动加载动画',
      preview: '预览',
      thunderRow: '雷霆大字',
      thunderOn: '开启大字',
      thunderOff: '关闭大字',
      thunderHintOn: '任务开始/结束时，在屏幕中央用白色粗体大字显示「任务开始」/「任务完成」，3 秒后自动隐藏；点击屏幕任意处可立即关闭',
      thunderHintOff: '默认关闭；开启后任务开始/结束时在屏幕中央显示「任务开始」/「任务完成」白色大字，3 秒后自动隐藏，点击任意处可立即关闭',
      thunderNeed: '请先开启雷霆大字',
      thunderAnimRow: '大字入场动画',
      thunderAnimOn: '开启动画',
      thunderAnimOff: '关闭动画',
      thunderAnimHintOn: '大字由大缩小砸入并淡出（关闭后为直接显示，仍保持 3 秒）',
      thunderAnimHintOff: '默认关闭；大字直接出现、3 秒后消失，不做缩放与淡入淡出',
      thunderAnimHintReduced: '系统已开启「减少动态效果」，当前直接显示',
    }
    const LOCALE_EN = {
      nav: 'Endfield Theme',
      sep: ': ',
      /* Capitalised: these are VALUES in a "Label: Value" readout, not sentence
         fragments, and the screenshot showed lowercase reading like a typo there. */
      on: 'On',
      off: 'Off',
      groupTheme: 'THEME',
      groupBg: 'BACKGROUND',
      groupAnim: 'ANIMATION',
      groupFun: 'ENTERTAINMENT',
      themeRow: 'Endfield theme',
      themeOn: 'Turn on',
      themeOff: 'Turn off',
      paletteRow: 'Accent palette',
      paletteValley: 'Valley Yellow',
      paletteWuling: 'Wuling Cyan',
      paletteToValley: 'Use Valley Yellow',
      paletteToWuling: 'Use Wuling Cyan',
      paletteHintValley: 'Default signal yellow #fff500 (the Endfield site accent)',
      paletteHintWuling: 'Teal-cyan accent #14d0d0 for buttons, hover, selected rows and contours',
      radiusRow: 'Corners',
      radiusRound: 'Rounded',
      radiusSquare: 'Square',
      radiusToRound: 'Use rounded',
      radiusToSquare: 'Use square',
      contourRow: 'Contour background',
      contourOn: 'Turn on',
      contourOff: 'Turn off',
      contourHintOn: 'Topographic contour lines fill the lowest layer, beneath all content',
      contourHintOff: 'Off by default; draws a contour terrain texture behind the interface',
      contourAnimRow: 'Contour scrolling',
      contourAnimOn: 'Start scrolling',
      contourAnimOff: 'Stop',
      contourAnimHintOn: 'The terrain sheet scrolls steadily in the chosen direction (the terrain itself never morphs)',
      contourAnimHintOff: 'Static contours, with no per-frame work at all',
      contourAnimHintReduced: 'Your system asks for reduced motion, so it stays static',
      contourDirRow: 'Scroll direction',
      contourDirHint: 'Choose the scroll direction (8 ways; diagonals move at the same speed)',
      contourSpeedRow: 'Scroll speed',
      contourSpeedHint: 'In pixels per second, identical at every refresh rate',
      contourDensityRow: 'Contour density',
      contourDensityHint: 'Choose the number of iso-lines (changes line spacing only, not the terrain)',
      contourDensitySparse: 'Sparse',
      contourDensityMedium: 'Medium',
      contourDensityDense: 'Dense',
      contourDensityVeryDense: 'Very dense',
      contourRoughnessRow: 'Terrain roughness',
      contourRoughnessHint: 'Low = plains (wide, gentle lines); high = extreme mountains (dense contours, many peaks and valleys). This changes the terrain itself, not the line spacing',
      contourRoughnessNeedLayer: 'Turn on the contour background first',
      contourRoughPlains: 'Plains',
      contourRoughSlope: 'Gentle slope',
      contourRoughHills: 'Hills',
      contourRoughKnolls: 'Knolls',
      contourRoughUpland: 'Upland',
      contourRoughSloping: 'Sloping land',
      contourRoughFoothills: 'Foothills',
      contourRoughHighland: 'Highland',
      contourRoughSteep: 'Steep hills',
      contourRoughRidges: 'Ridges',
      contourRoughCraggy: 'Craggy peaks',
      contourRoughExtreme: 'Extreme peaks',
      contourScrollPauseRow: 'Pause animation while scrolling',
      contourScrollPauseOn: 'Pause on scroll',
      contourScrollPauseOff: 'Keep animating',
      contourScrollPauseHintOn: 'Pauses contour animation while scrolling and resumes about 10ms after it stops',
      contourScrollPauseHintOff: 'Warning: scrolling may stutter when this is off',
      contourAnimNeedLayer: 'Turn on the contour background first',
      watermarkRow: 'Background wordmark',
      watermarkOn: 'Turn on',
      watermarkOff: 'Turn off',
      wmPersistRow: 'Keep wordmark visible',
      wmPersistOn: 'Keep visible',
      wmPersistOff: 'New session only',
      wmPersistHintOn: 'Also shown on conversations and other pages, behind the text',
      wmPersistHintOff: 'Shown only on the new-session screen',
      wmPersistNeedWm: 'Turn on the background wordmark first',
      loaderRow: 'Boot animation',
      loaderOn: 'Turn on',
      loaderOff: 'Turn off',
      loaderHintOn: 'Plays the ENDFIELD boot screen on reload (progress rail + percentage, following the palette)',
      loaderHintOff: 'Off by default; plays once on every page reload when enabled',
      loaderNeed: 'Turn on the boot animation first',
      preview: 'Preview',
      thunderRow: 'Task announcement',
      thunderOn: 'Turn on',
      thunderOff: 'Turn off',
      thunderHintOn: 'Slams 任务开始 / 任务完成 across the screen centre in heavy white type for 3s; click anywhere to dismiss',
      thunderHintOff: 'Off by default; shows 任务开始 / 任务完成 in heavy white type at the screen centre for 3s, dismissable by clicking anywhere',
      thunderNeed: 'Turn on the task announcement first',
      thunderAnimRow: 'Announcement entry animation',
      thunderAnimOn: 'Animate',
      thunderAnimOff: 'Turn off',
      thunderAnimHintOn: 'The word punches in from oversized and fades out (appears instantly when off, still held 3s)',
      thunderAnimHintOff: 'Off by default; the word appears instantly and leaves after 3s, with no scaling or fading',
      thunderAnimHintReduced: 'Your system asks for reduced motion, so it appears instantly',
    }

    /* The locale service is optional, exactly like `theme` and `sessions`: the
       in-process settings tests mount this theme with a ctx carrying only
       theme/slots, and a composition without the locale plugin must still get a
       working (Chinese) settings page rather than a crash. `t` therefore falls back
       to the zh dictionary, and only the key itself as a last resort — a visible
       key beats a blank row. */
    const locale = ctx.get('locale')
    let t = (key) => (Object.prototype.hasOwnProperty.call(LOCALE_ZH, key) ? LOCALE_ZH[key] : key)
    let localeReady = false
    if (locale !== undefined && typeof locale.register === 'function' && typeof locale.bind === 'function') {
      /* Registered through ctx.effect so the dictionaries retire with the run;
         re-applying the bundle would otherwise throw on the duplicate (ns, locale)
         the service rejects by design. */
      ctx.effect(() => locale.register(ENDFIELD_NS, { zh: LOCALE_ZH, en: LOCALE_EN }))
      const bound = locale.bind(ENDFIELD_NS)
      if (typeof bound === 'function') {
        t = bound
        localeReady = true
      }
    }

    /* ---------- Settings page: 主题 (own settings.section) ---------- */
    const slots = ctx.get('slots')
    const disposeRows = []
    let disposeSettings = () => { disposeRows.forEach((d) => d()) }
    if (slots !== undefined) {
      slots.inject('settings.section', () => {
        const d = slots.register(
        /* `label` is a THUNK, not a string: the slot contract re-evaluates it per
           read, so the nav row follows a language switch with no re-registration.

           `locale` is declared ONLY when a locale service actually exists. It is not
           what drives the re-render — ui-renderer's useLocaleRevision subscribes
           EVERY outlet to the locale revision, so this panel re-renders on a language
           switch either way, and the body reads `t` from the apply closure rather than
           from the injected seat. What declaring it buys is the framework's own
           re-derivation of that seat; what it COSTS when the service is missing is a
           hard failure — ui-renderer throws SlotAssemblyError ("entry declares locale
           namespace ... but no locale face is installed") for an entry declaring a
           namespace with no installed face. Declaring it unconditionally would turn a
           composition without the locale plugin from "settings page in Chinese" into
           "settings page crashes", so the key is spread in only when present. */
        Object.assign(
          { name: 'settings.section', id: 'theme-endfield', order: 35, label: () => t('nav') },
          localeReady ? { locale: ENDFIELD_NS } : {}
        ),
        () => {
          const R = (typeof React !== 'undefined') ? React : ((typeof require === 'function') ? require('react') : null)
          if (!R) return null
          const [enabled, setEnabled] = R.useState(isEnabled())
          const [wmOn, setWmOn] = R.useState(isWatermarkOn())
          const [wmPersist, setWmPersist] = R.useState(isWatermarkPersistOn())
          const [loaderOn, setLoaderOn] = R.useState(isLoaderOn())
          const [contourOn, setContourOn] = R.useState(isContourOn())
          const [contourAnim, setContourAnim] = R.useState(isContourAnimOn())
          const [contourDir, setContourDir] = R.useState(contourDirIndex())
          const [contourSpeed, setContourSpeed] = R.useState(contourSpeedIndex())
          const [contourDensity, setContourDensity] = R.useState(contourDensityIndex())
          const [contourRoughness, setContourRoughness] = R.useState(contourRoughnessIndex())
          const [contourScrollPause, setContourScrollPause] = R.useState(isContourScrollPauseOn())
          const [thunderOn, setThunderOn] = R.useState(isThunderOn())
          const [thunderAnim, setThunderAnim] = R.useState(isThunderAnimOn())
          const [palette, setPalette] = R.useState(readPalette())
          const [mode, setMode] = R.useState(prefsGet(RADIUS_KEY) || 'square')
          /* UI-only labels for the 8 scroll directions (clockwise from up, the
             same order as the engine's CONTOUR_DIRS) and the 4 density names. */
          const CONTOUR_DIR_LABELS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']
          const CONTOUR_DENSITY_KEYS = ['contourDensitySparse', 'contourDensityMedium', 'contourDensityDense', 'contourDensityVeryDense']
          /* Names for the 12 roughness stops, plains -> extreme mountains, in the
             same order as the engine's CONTOUR_ROUGHNESS_* tables. */
          const CONTOUR_ROUGHNESS_KEYS = ['contourRoughPlains', 'contourRoughSlope', 'contourRoughHills', 'contourRoughKnolls', 'contourRoughUpland', 'contourRoughSloping', 'contourRoughFoothills', 'contourRoughHighland', 'contourRoughSteep', 'contourRoughRidges', 'contourRoughCraggy', 'contourRoughExtreme']
          const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' }
          const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', fontWeight: 500, lineHeight: '1.5' }
          // Sub-label explaining what a switch does, so the row is self-describing.
          const hintStyle = { display: 'block', color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', fontWeight: 400, lineHeight: '1.5', marginTop: '2px' }
          const btnStyleFor = (on, disabled) => {
            /* The switches are themed BY the theme they configure, so while the
               theme is ON the "on" fill reads from the palette variable rather
               than a literal — an inline #fff500 here would keep every enabled
               button yellow while the rest of the UI turned cyan.

               But --edge-accent / --edge-btn-muted live in the theme's own
               stylesheet, which unmount() removes when the theme is switched
               OFF. The hardcoded ink (#000) would then sit on a transparent
               button — invisible in dark mode, where the app panel is dark.
               So when the theme is OFF these buttons fall back to app-native
               tokens (filled chip for "on", outline for "off"), which are the
               same surfaces the rest of the settings page uses. */
            const themed = enabled
            return {
              color: !themed ? 'var(--dsw-alias-label-primary)' : (on ? '#000' : 'var(--dsw-alias-label-primary)'),
              background: !themed
                ? (on ? 'var(--dsw-alias-interactive-bg-hover-solid)' : 'transparent')
                : (on ? 'var(--edge-accent)' : 'var(--edge-btn-muted)'),
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: mode === 'round' ? '999px' : '0',
              padding: '4px 14px',
              fontSize: '12px',
              // A disabled control has to look disabled, not merely ignore clicks.
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              whiteSpace: 'nowrap',
            }
          }
          const toggleTheme = () => {
            const next = !enabled
            prefsSet(ENABLED_KEY, next ? '1' : '0')
            setEnabled(next)
            if (next) { mount(); syncWatermarkVisibility(); syncContour() }
            else { unmount(); syncWatermarkVisibility() }
            /* The announcement watcher is gated on the master switch too, so it has
               to be reconciled here. unmount() already stops it, but turning the
               theme back ON must restart it — otherwise the feature would stay dead
               until the next page load. */
            syncThunder()
          }
          const toggleContour = () => {
            const next = !contourOn
            prefsSet(CONTOUR_KEY, next ? '1' : '0')
            setContourOn(next)
            syncContour()
          }
          /* Palette switch. Everything visual is carried by the class flip inside
             syncPaletteClass(); the only thing that needs explicit work is the
             contour canvas, because a canvas stroke cannot read a CSS variable.
             The redraw is called directly rather than left to the MutationObserver
             so the sheet changes in the same frame as the rest of the UI. */
          const togglePalette = () => {
            const next = palette === 'wuling' ? 'valley' : 'wuling'
            prefsSet(PALETTE_KEY, next)
            setPalette(next)
            syncPaletteClass()
            if (contourWrap !== null) contourRepaint()
          }
          const toggleContourAnim = () => {
            const next = !contourAnim
            prefsSet(CONTOUR_ANIM_KEY, next ? '1' : '0')
            setContourAnim(next)
            if (!next) {
              contourScrollPaused = false
              if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
              contourScrollTimer = null
            }
            syncContour()
          }
          const setContourDirValue = (value) => {
            const next = Number(value)
            if (!Number.isInteger(next) || next < 0 || next >= CONTOUR_DIRS.length) return
            prefsSet(CONTOUR_DIR_KEY, String(next))
            setContourDir(next)
            // Only the loop's cached velocity changes; nothing is regenerated.
            contourRefreshMotion()
          }
          const setContourSpeedValue = (value) => {
            const next = Number(value)
            if (!Number.isInteger(next) || next < 0 || next >= CONTOUR_SPEEDS.length) return
            prefsSet(CONTOUR_SPEED_KEY, String(next))
            setContourSpeed(next)
            contourRefreshMotion()
          }
          const setContourDensityValue = (value) => {
            const next = Number(value)
            if (!CONTOUR_DENSITIES.includes(next)) return
            const index = CONTOUR_DENSITIES.indexOf(next)
            prefsSet(CONTOUR_DENSITY_KEY, String(index))
            setContourDensity(index)
            // Same field, new iso-levels: re-extract + re-render the cache once.
            contourRetune()
          }
          const setContourRoughnessValue = (value) => {
            const next = Number(value)
            if (!Number.isInteger(next) || next < 0 || next >= CONTOUR_ROUGHNESS_BASE.length) return
            prefsSet(CONTOUR_ROUGHNESS_KEY, String(next))
            setContourRoughness(next)
            // New terrain (same seed): rebuild field + contours + cache once.
            contourRebuildForRoughness()
          }
          const toggleContourScrollPause = () => {
            const next = !contourScrollPause
            prefsSet(CONTOUR_SCROLL_PAUSE_KEY, next ? '1' : '0')
            setContourScrollPause(next)
            if (!next) {
              contourScrollPaused = false
              if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
              contourScrollTimer = null
              contourSwitchSig = ''
              contourApplySwitches()
            }
          }
          const toggleWm = () => {
            const next = !wmOn
            prefsSet(WATERMARK_KEY, next ? '1' : '0')
            setWmOn(next)
            syncWatermarkVisibility()
          }
          const toggleWmPersist = () => {
            const next = !wmPersist
            prefsSet(WATERMARK_PERSIST_KEY, next ? '1' : '0')
            setWmPersist(next)
            syncWatermarkVisibility()
          }
          const toggleLoader = () => {
            const next = !loaderOn
            prefsSet(LOADER_KEY, next ? '1' : '0')
            setLoaderOn(next)
            // Turning it on plays it once right away, so the switch shows what it
            // bought instead of making the user reload to find out.
            if (next) { loaderDone = false; destroyLoader(); runLoader() }
            else destroyLoader()
          }
          const replayLoader = () => {
            loaderDone = false
            destroyLoader()
            runLoader()
          }
          const toggleThunder = () => {
            const next = !thunderOn
            prefsSet(THUNDER_KEY, next ? '1' : '0')
            setThunderOn(next)
            /* syncThunder() reads the pref store, so the write above is what it acts
               on. Turning it ON also shows the word once: a switch whose effect only
               appears at some unpredictable later moment gives the user no way to
               tell whether it worked. The preview runs BEFORE the watcher attaches,
               so it cannot be mistaken for a real edge. */
            if (next) showThunder(THUNDER_START)
            else destroyThunder()
            syncThunder()
          }
          const previewThunder = () => { showThunder(THUNDER_DONE) }
          const toggleThunderAnim = () => {
            const next = !thunderAnim
            prefsSet(THUNDER_ANIM_KEY, next ? '1' : '0')
            setThunderAnim(next)
            /* Nothing to reconcile: the next showThunder() reads the switch and marks
               the plate accordingly. Replaying now is what makes the change legible —
               the difference between the two modes is only visible during the entry,
               so a silent toggle would look like it did nothing. */
            showThunder(THUNDER_START)
          }
          const toggleMode = () => {
            const next = mode === 'round' ? 'square' : 'round'
            prefsSet(RADIUS_KEY, next)
            setMode(next)
            if (next === 'round') document.body.classList.add('theme-endfield-round')
            else document.body.classList.remove('theme-endfield-round')
          }
          const pageStyle = { maxWidth: '640px', padding: '4px 0 16px' }
          /* The ten switches are grouped into four concerns so the page can be
             scanned instead of read as a flat list: 主题 (master switch +
             appearance), 背景 (contour sheet + watermark), 动画 (boot loader),
             娱乐 (雷霆大字 announcements + their entry animation).
             Each group is an editorial numbered header; rows keep their stable
             React keys. The last row of each group drops its divider so the next
             group header's own rule is the only line between groups.

             The header shows the group name in the ACTIVE language plus a latin
             all-caps line. Under English both would collapse to the same word, so
             the second line is dropped there rather than printed twice — the latin
             line is editorial styling for the Chinese name, not a translation. */
          const groupTitle = (no, key, first) => {
            const name = t(key)
            const latin = LOCALE_EN[key]
            const parts = [
              R.createElement('span', { key: 'mark', 'aria-hidden': 'true', style: { width: '4px', height: '14px', flex: '0 0 auto', background: 'currentColor' } }),
              R.createElement('span', { key: 'cn', style: { fontSize: '12px', fontWeight: 600, letterSpacing: '0.14em', lineHeight: '1.5' } }, no + ' ' + name),
            ]
            if (latin !== undefined && latin !== name) {
              parts.push(R.createElement('span', { key: 'en', style: { fontSize: '10px', fontWeight: 500, letterSpacing: '0.2em', opacity: 0.72, lineHeight: '1.5' } }, latin))
            }
            return R.createElement('div', {
              key: 'group-title-' + no,
              className: 'endfield-settings-group-title',
              style: {
                display: 'flex', alignItems: 'center', gap: '8px',
                marginTop: first ? '0' : '26px', paddingBottom: '8px',
                borderBottom: '1px solid var(--dsw-alias-border-l1)',
              },
            }, parts)
          }
          /** "<row label>: <on|off>" — one spelling for every status row. */
          const stateOf = (on) => t(on ? 'on' : 'off')
          const row = (key, last, children) => R.createElement('div', { key, style: last ? { ...rowStyle, borderBottom: 'none' } : rowStyle }, children)
          return R.createElement('div', { style: pageStyle }, [
            /* --- 01 主题：总开关在最前，随后是配色与圆角 --- */
            R.createElement('div', { key: 'group-theme' }, [
              groupTitle('01', 'groupTheme', true),
              row('theme', false, [
                R.createElement('span', { style: labelStyle }, t('themeRow') + t('sep') + stateOf(enabled)),
                R.createElement('button', { type: 'button', onClick: toggleTheme, style: btnStyleFor(enabled) }, t(enabled ? 'themeOff' : 'themeOn'))
              ]),
              row('palette', false, [
                R.createElement('span', { style: labelStyle },
                  t('paletteRow') + t('sep') + t(palette === 'wuling' ? 'paletteWuling' : 'paletteValley'),
                  R.createElement('span', { style: hintStyle },
                    t(palette === 'wuling' ? 'paletteHintWuling' : 'paletteHintValley')
                  )
                ),
                // A colour switch should show the colour it offers, not only name it.
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto', alignItems: 'center' } },
                  R.createElement('span', {
                    'aria-hidden': 'true',
                    style: {
                      width: '14px',
                      height: '14px',
                      flex: '0 0 auto',
                      // --edge-accent only exists while the theme stylesheet is
                      // mounted; with the theme off the chip falls back to the
                      // app's own filled surface so it stays visible.
                      background: enabled ? 'var(--edge-accent)' : 'var(--dsw-alias-interactive-bg-hover-solid)',
                      border: '1px solid var(--dsw-alias-border-l2)',
                      borderRadius: mode === 'round' ? '999px' : '0',
                    },
                  }),
                  R.createElement('button', {
                    type: 'button',
                    onClick: togglePalette,
                    style: btnStyleFor(true),
                  }, t(palette === 'wuling' ? 'paletteToValley' : 'paletteToWuling'))
                )
              ]),
              row('radius', true, [
                R.createElement('span', { style: labelStyle }, t('radiusRow') + t('sep') + t(mode === 'round' ? 'radiusRound' : 'radiusSquare')),
                R.createElement('button', { type: 'button', onClick: toggleMode, style: btnStyleFor(mode === 'round') }, t(mode === 'round' ? 'radiusToSquare' : 'radiusToRound'))
              ]),
            ]),
            /* --- 02 背景：等高线 + 水印，各自的主开关在前、附属开关在后 --- */
            R.createElement('div', { key: 'group-bg' }, [
              groupTitle('02', 'groupBg', false),
              row('contour', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourRow') + t('sep') + stateOf(contourOn),
                  R.createElement('span', { style: hintStyle },
                    // The sheet follows the palette, so the hint must not name one colour.
                    t(contourOn ? 'contourHintOn' : 'contourHintOff')
                  )
                ),
                R.createElement('button', { type: 'button', onClick: toggleContour, style: btnStyleFor(contourOn) }, t(contourOn ? 'contourOff' : 'contourOn'))
              ]),
              row('contour-anim', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourAnimRow') + t('sep') + stateOf(contourAnim),
                  R.createElement('span', { style: hintStyle },
                    // Say so when the OS preference is overriding the switch, rather
                    // than letting it look like the toggle is broken.
                    (contourAnim && prefersReducedMotion())
                      ? t('contourAnimHintReduced')
                      : t(contourAnim ? 'contourAnimHintOn' : 'contourAnimHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleContourAnim,
                  style: btnStyleFor(contourAnim, !contourOn),
                  // Only meaningful while the layer itself is on.
                  disabled: !contourOn,
                  title: contourOn ? '' : t('contourAnimNeedLayer'),
                }, t(contourAnim ? 'contourAnimOff' : 'contourAnimOn'))
              ]),
              row('contour-dir', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourDirRow') + t('sep') + CONTOUR_DIR_LABELS[contourDir],
                  R.createElement('span', { style: hintStyle }, t('contourDirHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '4px', flex: '0 0 auto' } },
                  ...CONTOUR_DIR_LABELS.map((label, index) => R.createElement('button', {
                    key: 'dir-' + index,
                    type: 'button',
                    onClick: () => setContourDirValue(index),
                    style: btnStyleFor(contourDir === index, !contourOn),
                    disabled: !contourOn,
                    title: contourOn ? '' : t('contourAnimNeedLayer'),
                  }, label))
                )
              ]),
              row('contour-speed', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourSpeedRow') + t('sep') + CONTOUR_SPEEDS[contourSpeed] + ' px/s',
                  R.createElement('span', { style: hintStyle }, t('contourSpeedHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '4px', flex: '0 0 auto' } },
                  ...CONTOUR_SPEEDS.map((speed, index) => R.createElement('button', {
                    key: 'speed-' + speed,
                    type: 'button',
                    onClick: () => setContourSpeedValue(index),
                    style: btnStyleFor(contourSpeed === index, !contourOn),
                    disabled: !contourOn,
                    title: contourOn ? '' : t('contourAnimNeedLayer'),
                  }, String(speed)))
                )
              ]),
              row('contour-density', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourDensityRow') + t('sep') + t(CONTOUR_DENSITY_KEYS[contourDensity]),
                  R.createElement('span', { style: hintStyle }, t('contourDensityHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '4px', flex: '0 0 auto' } },
                  ...CONTOUR_DENSITIES.map((count, index) => R.createElement('button', {
                    key: 'density-' + count,
                    type: 'button',
                    onClick: () => setContourDensityValue(count),
                    style: btnStyleFor(contourDensity === index, !contourOn),
                    disabled: !contourOn,
                    title: contourOn ? '' : t('contourAnimNeedLayer'),
                  }, t(CONTOUR_DENSITY_KEYS[index])))
                )
              ]),
              row('contour-roughness', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourRoughnessRow') + t('sep') + t(CONTOUR_ROUGHNESS_KEYS[contourRoughness])
                    + ' ' + (contourRoughness + 1) + '/' + CONTOUR_ROUGHNESS_KEYS.length,
                  R.createElement('span', { style: hintStyle }, t('contourRoughnessHint'))
                ),
                /* A real slider: 12 detents, so the middle of the terrain range is
                   reachable by dragging and by the keyboard (a native range input
                   is arrow-key operable and announces its value), which fourteen
                   buttons would not give. Only this rail is styled, and only with
                   tokens that exist whether or not the theme stylesheet is mounted
                   (--edge-accent falls back to the app ink with the theme off). */
                R.createElement('input', {
                  type: 'range',
                  min: 0,
                  max: CONTOUR_ROUGHNESS_KEYS.length - 1,
                  step: 1,
                  value: contourRoughness,
                  onChange: (e) => setContourRoughnessValue(e && e.target ? e.target.value : e),
                  disabled: !contourOn,
                  'aria-label': t('contourRoughnessRow'),
                  'aria-valuetext': t(CONTOUR_ROUGHNESS_KEYS[contourRoughness]),
                  title: contourOn ? t('contourRoughnessHint') : t('contourRoughnessNeedLayer'),
                  style: {
                    flex: '0 0 auto',
                    width: '156px',
                    height: '18px',
                    margin: 0,
                    accentColor: 'var(--edge-accent, currentColor)',
                    // Same disabled affordance as the switches (see btnStyleFor).
                    cursor: contourOn ? 'pointer' : 'not-allowed',
                    opacity: contourOn ? 1 : 0.45,
                  },
                }),
              ]),
              row('contour-scroll-pause', true, [
                R.createElement('span', { style: labelStyle },
                  t('contourScrollPauseRow') + t('sep') + stateOf(contourScrollPause),
                  R.createElement('span', { style: hintStyle },
                    t(contourScrollPause ? 'contourScrollPauseHintOn' : 'contourScrollPauseHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleContourScrollPause,
                  style: btnStyleFor(contourScrollPause, !contourOn),
                  disabled: !contourOn,
                  title: contourOn ? '' : t('contourAnimNeedLayer'),
                }, t(contourScrollPause ? 'contourScrollPauseOff' : 'contourScrollPauseOn'))
              ]),
              row('watermark', false, [
                R.createElement('span', { style: labelStyle }, t('watermarkRow') + t('sep') + stateOf(wmOn)),
                R.createElement('button', { type: 'button', onClick: toggleWm, style: btnStyleFor(wmOn) }, t(wmOn ? 'watermarkOff' : 'watermarkOn'))
              ]),
              row('watermark-persist', true, [
                R.createElement('span', { style: labelStyle },
                  t('wmPersistRow') + t('sep') + stateOf(wmPersist),
                  R.createElement('span', { style: hintStyle },
                    t(wmPersist ? 'wmPersistHintOn' : 'wmPersistHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleWmPersist,
                  style: btnStyleFor(wmPersist, !wmOn),
                  // The switch only has meaning while the watermark itself is on.
                  disabled: !wmOn,
                  title: wmOn ? '' : t('wmPersistNeedWm'),
                }, t(wmPersist ? 'wmPersistOff' : 'wmPersistOn'))
              ]),
            ]),
            /* --- 03 动画：启动加载动画 --- */
            R.createElement('div', { key: 'group-anim' }, [
              groupTitle('03', 'groupAnim', false),
              row('loader', true, [
                R.createElement('span', { style: labelStyle },
                  t('loaderRow') + t('sep') + stateOf(loaderOn),
                  R.createElement('span', { style: hintStyle },
                    t(loaderOn ? 'loaderHintOn' : 'loaderHintOff')
                  )
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  // Replay only makes sense while the feature is on; it lets the user
                  // re-watch the animation without reloading the page.
                  R.createElement('button', {
                    type: 'button',
                    onClick: replayLoader,
                    // The master switch gates this too: the plate is styled by the
                    // stylesheet the master switch removes, so previewing while the
                    // theme is off has nothing to show (runLoader refuses as well).
                    style: btnStyleFor(false, !loaderOn || !enabled),
                    disabled: !loaderOn || !enabled,
                    title: loaderOn ? '' : t('loaderNeed'),
                  }, t('preview')),
                  R.createElement('button', { type: 'button', onClick: toggleLoader, style: btnStyleFor(loaderOn) }, t(loaderOn ? 'loaderOff' : 'loaderOn'))
                )
              ]),
            ]),
            /* --- 04 娱乐：雷霆大字（主开关 + 入场动画子开关） --- */
            R.createElement('div', { key: 'group-fun' }, [
              groupTitle('04', 'groupFun', false),
              row('thunder', false, [
                R.createElement('span', { style: labelStyle },
                  t('thunderRow') + t('sep') + stateOf(thunderOn),
                  R.createElement('span', { style: hintStyle },
                    t(thunderOn ? 'thunderHintOn' : 'thunderHintOff')
                  )
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  // Same affordance as the boot animation: let the user see the
                  // effect now instead of waiting for the next task boundary.
                  R.createElement('button', {
                    type: 'button',
                    onClick: previewThunder,
                    style: btnStyleFor(false, !thunderOn),
                    disabled: !thunderOn,
                    title: thunderOn ? '' : t('thunderNeed'),
                  }, t('preview')),
                  R.createElement('button', { type: 'button', onClick: toggleThunder, style: btnStyleFor(thunderOn) }, t(thunderOn ? 'thunderOff' : 'thunderOn'))
                )
              ]),
              row('thunder-anim', true, [
                R.createElement('span', { style: labelStyle },
                  t('thunderAnimRow') + t('sep') + stateOf(thunderAnim),
                  R.createElement('span', { style: hintStyle },
                    // Say so when the OS preference is overriding the switch, rather
                    // than letting it look like the toggle is broken.
                    (thunderAnim && prefersReducedMotion())
                      ? t('thunderAnimHintReduced')
                      : t(thunderAnim ? 'thunderAnimHintOn' : 'thunderAnimHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleThunderAnim,
                  style: btnStyleFor(thunderAnim, !thunderOn),
                  // Only meaningful while the announcement itself is on.
                  disabled: !thunderOn,
                  title: thunderOn ? '' : t('thunderNeed'),
                }, t(thunderAnim ? 'thunderAnimOff' : 'thunderAnimOn'))
              ]),
            ]),
          ])
        }
      )
      disposeRows.push(d)
      return d
    })
    }

    ctx.effect(() => () => {
      unmount()
      // Release the idempotency flag so a re-apply after this dispose can mount
      // the theme again; leaving it set killed the theme until a hard reload.
      if (typeof window !== 'undefined') window.__dshThemeEndfieldApplied = false
      if (watermarkObserver) watermarkObserver.disconnect()
      /* A deferred observer install may still be waiting on DOMContentLoaded when
         the run ends; drop the pending listener so a disposed run is not wired
         back into the page. removeEventListener is a no-op when it never fired
         or already ran ({ once }), so both branches are safe. */
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('DOMContentLoaded', watermarkObserverLate)
        document.removeEventListener('DOMContentLoaded', contourSchemeObserverLate)
      }
      if (watermarkRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(watermarkRaf)
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('resize', onWatermarkResize)
      if (watermarkEl && watermarkEl.parentNode) watermarkEl.parentNode.removeChild(watermarkEl)
      if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
      contourScrollTimer = null
      contourScrollPaused = false
      // Both scroll listeners went on in capture mode, so both have to come off the
      // same way — dropping only 'scroll' leaks a scrollend listener per plugin run.
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('scroll', onContourScrollEvent, true)
        window.removeEventListener('scrollend', onContourScrollEndEvent, true)
      }
      // The plate owns a rAF handle and a fixed DOM node; both must go with the run.
      destroyLoader()
      // The contour layer owns a rAF handle, a ResizeObserver, a MutationObserver
      // and two canvases — every one of them has to go with the run.
      contourTeardown()
      if (contourSchemeObserver) contourSchemeObserver.disconnect()
      /* The announcement feature owns two store subscriptions, a retry timeout and
         a hide timeout, all of which outlive the DOM node — unmount() covers the
         switched-off path, but a fiber unload while the theme is ON must release
         them here too, or the callbacks keep firing against a dead run. */
      thunderStopWatch()
      destroyThunder()
      disposeSettings()
    })
  }

		exports.name = "dsh-theme-endfield-contour-rework";
		exports.inject = ["theme"];
		exports.apply = apply;
		return module.exports;
	}
});
