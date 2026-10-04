'use strict';
/**
 * dsh-theme-endfield-contour-rework — installed (bundle) HOST half.
 *
 * Fork 自 dsh-theme-endfield — https://github.com/ymh0000123/dsh-theme-endfield
 * Copyright (c) ymh0000123（原始作品）。MIT 许可证，原文见仓库根的 LICENSE；
 * 出处与改动说明见 NOTICE.md / CHANGELOG.md。
 *
 * This module is the cordis plugin the loader mounts when the package is
 * installed through the official CLI:
 *
 *   dsh plugin --profile web add github:DoctorxPriestess/dsh-theme-endfield-contour-rework
 *
 * The `dsh.bundle.patch` layer (cordis.patch.yml) inserts this package's row;
 * the loader requires this main entry and uses its `name` + `apply` exports.
 * The theme itself is pure client-side (browser): token overrides via the
 * `theme` service and a global stylesheet via the `styles` builtin, both
 * registered in the client half (`exports["./client"]` -> client.js).
 *
 * Host-side settings registration (menu: Settings › 终末地主题设置)
 * -------------------------------------------------------------------
 * The theme's preferences used to be kept in the browser's localStorage, which
 * is scoped to a single origin. DSH Desktop binds a fresh, random localhost
 * port on every launch, so a change of port changed the origin and the stored
 * settings silently reset to defaults on restart. The durable authority for
 * the theme's switches now lives with DSH's own user-settings service instead:
 *
 *   - This HOST half registers a persisted settings *namespace*
 *     (`dsh-theme-endfield-contour-rework`) through `ctx.settings.register(ns, schema)`, which
 *     `@deepseek-ai/dsh-settings-file` persists to the profile harness home
 *     (`~/.dsh/.../settings.yaml`). Path and persistence are decided by DSH
 *     itself and are completely independent of the web origin/port.
 *   - The CLIENT half (client.js) reads and writes that namespace through the
 *     browser `ctx.settingsScope` service, and live-reacts to changes via the
 *     scope's subscription. See the comments there for the client side.
 *
 * The namespace fields mirror exactly the setting keys, defaults and polarity
 * the theme has always shipped (see docs/features.md): default-ON switches
 * default to the string '1' and are read with `!== '0'`, default-OFF switches
 * default to '0' and are read with `=== '1'`. Choosing string-typed schema
 * fields keeps the wire section byte-for-byte equivalent to the old stored
 * values, so an existing <settings.yaml> section written by an older build of
 * this plugin would still validate and load without a migration step.
 *
 * `schemastery` is deliberately imported lazily and only from the host realm:
 * this package otherwise ships no runtime dependency beyond the optional
 * cordis peer, so the theme degrades to a no-op the same way it always did in
 * any profile that does not supply a settings service.
 */
const NAME = 'dsh-theme-endfield-contour-rework';

/**
 * Settings namespace owned by this plugin, and schema defaults for every
 * field. Field names are the short tails of the original localStorage keys
 * (the `dsh-theme-endfield-contour-rework-` prefix is implied by the namespace). Keeping the
 * actual stored values as strings means old persisted values stay valid with
 * no migration.
 *
 * Default polarity (same rules as before, now enforced by the schema defaults
 * instead of by an "absent key" check, and documented in docs/features.md):
 *   - default-ON switches store '1' and the client reads them as `!== '0'`;
 *   - default-OFF switches store '0' and the client reads them as `=== '1'`;
 *   - palette / radius store one of their documented literals ('valley' /
 *     'wuling'; 'square' / 'round');
 *   - the contour DIRECTION, SPEED, DENSITY and ROUGHNESS store integer indices
 *     into the client's option tables (0..7 compass directions, 0..4 speeds in
 *     px/s, 0..3 iso-level counts, 0..11 terrain-roughness stops), not the
 *     literals themselves, so a stored index can never go stale when the tables
 *     are retuned. There is no frame-rate field: the tileable-terrain engine
 *     renders once and only translates the cached texture, so frames cost
 *     nothing to configure. Roughness is the one setting that regenerates the
 *     terrain, and it does so from the SAME seed (the landscape is re-tuned,
 *     never re-rolled).
 */
const NAMESPACE = 'dsh-theme-endfield-contour-rework';
const FIELD_DEFAULTS = {
  enabled: '1',             // 终末地主题 —— default on
  palette: 'valley',        // 主题配色 —— 谷地黄 (walley default)
  radius: 'square',         // 主题圆角 —— 直角
  contour: '0',             // 等高线背景 —— default off
  contourAnim: '1',         // 等高线滚动 —— default on
  contourDir: '0',          // 滚动方向 —— 0 = 向上（index into CONTOUR_DIRS）
  contourSpeed: '2',        // 滚动速度 —— index 2 = 48 px/s
  contourDensity: '1',      // 等高线密度 —— index 1 = 14 条等值线
  contourRoughness: '7',    // 地形粗糙度 —— index 7 = 出厂地形（平原..极端山地共 12 档）
  contourScrollPause: '1',  // 滚动暂停 —— default on
  watermark: '1',           // 背景水印 —— default on
  watermarkPersist: '0',    // 水印保持显示 —— default off
  loader: '0',              // 启动加载动画 —— default off
  thunder: '0',             // 雷霆大字 —— default off
  thunderAnim: '0',         // 大字入场动画 —— default off
};

/* Schemastery resolution — see loadSchemastery() below for the strategy order
   and the DSH 0.2.0-rc.2 host behaviour that makes the fallbacks necessary.
   Kept guarded throughout: a profile with no schemastery anywhere degrades to
   a no-op rather than crashing the host half. */
/* Resolution diagnostics: every strategy this module tried and how it ended.
   Read by tests / support only — DSH itself never looks at it. */
const SCHEMA_RESOLUTION = { attempts: [], host: {} };

/** The Host loads plugin entries through its own internal importer, which may
    wrap this module WITHOUT exposing `require` (observed on DSH 0.2.0-rc.2
    desktop: node v24.18.1, `runtime.Config` came out undefined while the same
    require worked from a plain node process). `module` and the Module class
    behind it always exist in a CJS module, so rebuild a working loader from
    `Module._load` when `require` is not available. */
function hostLoader() {
  try { if (typeof require === 'function') return { load: require, how: 'require' }; } catch (e) { /* not exposed */ }
  try {
    const Mod = module.constructor;
    if (Mod && typeof Mod._load === 'function') return { load: (id) => Mod._load(id, module, false), how: 'Module._load' };
  } catch (e) { /* fall through */ }
  return { load: undefined, how: 'none' };
}

/** require.resolve-style lookup built on createRequire so it works even when
    this module's own `require` is missing. */
function resolveFrom(load, spec, base) {
  try {
    const Mod = module.constructor;
    if (Mod && typeof Mod.createRequire === 'function') return Mod.createRequire(base).resolve(spec);
  } catch (e) { /* fall back to the plain loader */ }
  try { return load(spec); } catch (e) { return undefined; }
}

/** Normalize a CJS/ESM/Schema-CJS module shape into the { string, object } API. */
function asSchemaBuilder(mod) {
  let found = mod;
  if (found && found.default && !found.object && found.default.object && found.default.string) {
    found = { string: (v) => found.default.string(v), object: (o) => found.default.object(o) };
  }
  return (found && typeof found.object === 'function' && typeof found.string === 'function') ? found : undefined;
}

/** Try one candidate location, recording the outcome for diagnosis. */
function tryCandidate(load, how, target, get) {
  try {
    const z = asSchemaBuilder(get());
    SCHEMA_RESOLUTION.attempts.push(how + ' ' + target + ' -> ' + (z ? 'ok' : 'no schema API'));
    return z;
  } catch (e) {
    SCHEMA_RESOLUTION.attempts.push(how + ' ' + target + ' -> ' + String((e && e.message) || e).slice(0, 160));
    return undefined;
  }
}

/** Load a Node core module through the same loader (never schema-checked). */
function tryCore(load, name) {
  try {
    const mod = load(name);
    SCHEMA_RESOLUTION.attempts.push('core ' + name + ' -> ' + (mod ? 'ok' : 'empty'));
    return mod || undefined;
  } catch (e) {
    SCHEMA_RESOLUTION.attempts.push('core ' + name + ' -> ' + String((e && e.message) || e).slice(0, 160));
    return undefined;
  }
}

/* Resolve a Schemastery namespace builder.
   1) Published profile installs put schemastery / @deepseek-ai/schemastery on
      this package's OWN require path (real bundles like dsh-better-sidebar do
      `import z from "schemastery"` and it resolves).
   2) A DEV-LINK bundle (this repo symlinked into the profile's node_modules)
      does not: its files resolve from the repo path, where no schemastery
      lives.
   3) The desktop Host may wrap this module so that `require` itself is absent
      or rebound away from the profile's node_modules — then `Module._load`,
      createRequire search bases, the app archive and the bundled runtimes are
      tried in turn, and each attempt is recorded in SCHEMA_RESOLUTION.
   Kept guarded throughout: a profile with no schemastery anywhere degrades to
   a no-op rather than crashing the host half. */
function loadSchemastery() {
  let load;
  try {
    const host = hostLoader();
    load = host.load;
    SCHEMA_RESOLUTION.host.loader = host.how;
    SCHEMA_RESOLUTION.host.node = typeof process !== 'undefined' && process.version;
    SCHEMA_RESOLUTION.host.execPath = typeof process !== 'undefined' && process.execPath;
    SCHEMA_RESOLUTION.host.resourcesPath = typeof process !== 'undefined' && process.resourcesPath;
    SCHEMA_RESOLUTION.host.mainModule = !!(typeof process !== 'undefined' && process.mainModule);
    SCHEMA_RESOLUTION.host.file = typeof __filename === 'string' ? __filename : null;
  } catch (e) { /* keep going with a null loader */ }
  if (typeof load !== 'function') { SCHEMA_RESOLUTION.host.loader = 'none'; return undefined; }

  const specs = ['@deepseek-ai/schemastery', 'schemastery'];

  // 1) plain module-relative resolution (a normal profile install)
  for (const spec of specs) {
    const z = tryCandidate(load, 'load', spec, () => load(spec));
    if (z) return z;
  }

  // Everything else needs a filesystem: build one through the same loader.
  const core = {};
  for (const name of ['fs', 'path', 'os']) {
    const mod = tryCore(load, name);
    if (mod) core[name] = mod;
  }
  const fs = core.fs, path = core.path, os = core.os;

  // 2) Retry the plain specs before walking the disk. The first attempt can fail
  //    RE-ENTRANTLY on DSH 0.2.0-rc.2: this module is imported from inside the
  //    loader's import of the schema builder's own dependency graph, so the CJS
  //    build's `require('@deepseek-ai/cosmokit')` meets the ESM module while it
  //    is still evaluating —
  //      "Cannot require() ES Module …/cosmokit/lib/index.js because it is not
  //       yet fully loaded"
  //    — and the very same require succeeds a moment later. `Config` is computed
  //    once, at module load, so missing this retry leaves the settings namespace
  //    unserved for the entire app run (the 1.5.x "settings never persist" bug).
  for (const spec of specs) {
    const z = tryCandidate(load, 'retry', spec, () => load(spec));
    if (z) return z;
  }

  if (!fs || !path) return undefined;
  const join = (...parts) => path.join(...parts);

  // 3) explicit search bases: this plugin's dir, its DSH roots, DSH_HOME and
  //    every profile in it.
  const bases = [];
  const pushBase = (b) => { if (b && bases.indexOf(b) < 0) bases.push(b); };
  try { pushBase(join(__dirname, 'noop.js')); } catch (e) { /* ignore */ }
  const dshHome = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME)
    || (os && typeof os.homedir === 'function' ? join(os.homedir(), '.dsh') : null);
  const profileNames = [];
  if (dshHome) {
    pushBase(join(dshHome, 'noop.js'));
    pushBase(join(dshHome, 'profiles', 'noop.js'));
    pushBase(join(dshHome, 'node_modules', 'noop.js'));
    try {
      const profDir = join(dshHome, 'profiles');
      if (fs.existsSync(profDir)) {
        for (const name of fs.readdirSync(profDir)) {
          profileNames.push(name);
          pushBase(join(profDir, name, 'noop.js'));
        }
      }
    } catch (e) { /* ignore */ }
  }
  for (const spec of specs) {
    for (const base of bases) {
      const z = tryCandidate(load, 'createRequire', spec + ' from ' + base, () => {
        const resolved = resolveFrom(load, spec, base);
        if (resolved === undefined) throw new Error('not resolvable from this base');
        return load(resolved);
      });
      if (z) return z;
    }
  }

  // 3) absolute-path scan of the module roots that physically exist on disk,
  //    including the running app's archive and its bundled runtimes.
  const appRoots = [];
  const pushAppRoot = (p) => { if (p && appRoots.indexOf(p) < 0) appRoots.push(p); };
  try {
    if (typeof process !== 'undefined' && process.resourcesPath) pushAppRoot(process.resourcesPath);
    if (typeof process !== 'undefined' && process.execPath) {
      const dir = path.dirname(process.execPath);
      pushAppRoot(join(dir, 'resources'));
      pushAppRoot(dir);
    }
  } catch (e) { /* ignore */ }
  const roots = [];
  for (const spec of specs) {
    const tail = spec.split('/');
    if (dshHome) {
      roots.push(join(dshHome, 'profiles', 'node_modules', ...tail));
      for (const name of profileNames) roots.push(join(dshHome, 'profiles', name, 'node_modules', ...tail));
    }
    for (const res of appRoots) {
      roots.push(join(res, 'app.asar', 'dsh', 'node_modules', ...tail));
      roots.push(join(res, 'app.asar', 'node_modules', ...tail));
      roots.push(join(res, 'node_modules', ...tail));
      try {
        const rt = join(res, 'runtime');
        if (fs.existsSync(rt)) {
          for (const name of fs.readdirSync(rt)) {
            roots.push(join(rt, name, 'node_modules', ...tail));
            roots.push(join(rt, name, 'dependencies', 'node_modules', ...tail));
          }
        }
      } catch (e) { /* ignore */ }
    }
  }
  for (const root of roots) {
    let present = false;
    try { present = fs.existsSync(join(root, 'package.json')); } catch (e) { present = false; }
    if (!present) continue;
    const z = tryCandidate(load, 'absolute', root, () => load(root));
    if (z) return z;
  }
  return undefined;
}

function apply(ctx) {
  // Register the durable namespace the moment the Host settings service stands.
  //
  // Deliberately NO early `ctx.get('settings')` bail here: mounting plugins run
  // concurrently and the settings service can legitimately settle AFTER this
  // apply() — a synchronous probe at that instant would see it absent and make
  // us `return`, so the namespace would never be registered and browser writes
  // would hit a scope that reports `status:'unavailable'` (settings "won't
  // save"). Cordis `ctx.inject(['settings'], ...)` instead WAITS for the service
  // (same convention as @deepseek-ai/dsh-client-ui-theme, dsh-client-locale,
  // dsh-agent-presets, …), so registration is reliable however they interleave.
  ctx.inject(['settings'], (settingsCtx) => {
    if (!settingsCtx || !settingsCtx.settings) return;
    // Registration requires a Schemastery schema. Resolve lazily (only now, when
    // the host settings service is real); a profile with no schema builder keeps
    // the theme a no-op instead of crashing on require.
    const z = loadSchemastery();
    if (z === undefined || typeof z.object !== 'function' || typeof z.string !== 'function') return;
    // 0.2.0-rc.2 removed settings.register(): the settings service serves forms
    // straight from each entry's exported Config schema (see buildConfigSchema
    // below), so on 0.2.0+ this legacy registration is simply a no-op. On 0.1.x
    // builds this call is still THE way the browser mirror learns the namespace,
    // so it must keep running there.
    if (typeof settingsCtx.settings.register !== 'function') return;
    const fields = {};
    for (const [field, fallback] of Object.entries(FIELD_DEFAULTS)) {
      fields[field] = z.string().default(fallback);
    }
    const schema = z.object(fields);
    try {
      // Registration is scoped to this plugin's fiber and disposed with the run.
      settingsCtx.settings.register(NAMESPACE, schema, { applies: 'live' });
    } catch (e) {
      // A throw here must not kill the whole theme; leaving it unregistered just
      // means browser prefs stay page-local (no durable document to write to).
    }
  });
}

/**
 * 0.2.0-rc.2 settings integration (the `settings.register` replacement).
 *
 * The 0.2.0 settings service (`@deepseek-ai/dsh-settings`) no longer accepts
 * runtime registrations. It derives the served form of a plugin DIRECTLY from
 * the module's exported `Config` Schemastery schema, and serves it to the
 * browser mirror under the profile ENTRY id (ours: `theme-endfield-contour-
 * rework`, declared by cordis.patch.yml) — see `describe()` in that package:
 * an entry whose schema has no `.volatile()` field is not served AT ALL, and
 * only volatile fields are projected into the served section. Writes persist
 * through the active profile's cordis patch (cordis.patch.yml), which is
 * origin-independent exactly like the old settings.yaml was.
 *
 * Every theme field is therefore declared `.volatile()` (guarded: a schemastery
 * without the method keeps the plain field, and an older DSH simply ignores
 * this export and keeps using the register() path above). The field set and
 * defaults are the same FIELD_DEFAULTS the client half mirrors, so a section
 * written by either era reads back identically.
 */
function buildConfigSchema() {
  const z = loadSchemastery();
  if (z === undefined || typeof z.object !== 'function' || typeof z.string !== 'function') return undefined;
  const fields = {};
  for (const [field, fallback] of Object.entries(FIELD_DEFAULTS)) {
    let f = z.string().default(fallback);
    try {
      if (f && typeof f.volatile === 'function') f = f.volatile();
    } catch (e) { /* keep the plain field */ }
    fields[field] = f;
  }
  return z.object(fields);
}

const Config = buildConfigSchema();

module.exports = {
  name: NAME,
  apply,
  // 0.2.0+: the loader reads this export (fiber.runtime.Config) and the
  // settings service serves it under the profile entry id. Undefined when no
  // schemastery could be resolved — the theme then degrades to a no-op exactly
  // as it always did on a profile without a settings service.
  Config,
  // Exposed for tests/documentation.
  NAMESPACE,
  FIELD_DEFAULTS,
  // Resolution trace of the schema builder (empty attempts = resolved on the
  // very first try). Diagnostics only.
  __schemaResolution: SCHEMA_RESOLUTION,
};
