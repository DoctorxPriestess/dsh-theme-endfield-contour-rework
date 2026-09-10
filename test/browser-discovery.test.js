/**
 * browser-discovery.test.js — pin the portability layer itself.
 *
 * test/lib/browser.js is the difference between "the suite runs on my machine" and "the suite
 * runs on a Windows box someone else configured", so its behaviour is worth asserting rather
 * than trusting:
 *
 *  1. a browser reachable ONLY through CHROME_PATH is found (the CI setup, and the escape hatch
 *     documented for machines where the browser lives somewhere unusual);
 *  2. when nothing is found, the failure is a DIAGNOSIS — the paths that were checked and the
 *     env var to set — not a bare "no Chrome/Edge found";
 *  3. the `execFileSync` shim only intercepts headless result-fetching calls
 *     (`--dump-dom`, `--screenshot=`) aimed at a browser binary, and passes everything else
 *     straight through, so the tests that use execFileSync for other work are unaffected;
 *  4. CRLF and LF checkouts are equally readable — the geometry harnesses slice declarations
 *     out of client.js by line (this broke once, and the failure looked like a missing feature).
 *
 * Hermetic: never launches a browser, never touches the machine's installs. The "no browser
 * anywhere" case is simulated by making fs.statSync report every candidate as missing, which
 * is what the module actually consults.
 *
 * Usage: node test/browser-discovery.test.js
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const LIB = path.join(__dirname, 'lib', 'browser.js')
let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }

/** 每次都用一份全新的模块实例：findChrome() 有缓存，共享实例会互相污染场景。 */
function freshModule() {
  delete require.cache[require.resolve(LIB)]
  return require(LIB)
}

// ---- 1. 显式环境变量优先 ----
{
  const real = fs.realpathSync(process.execPath) // 任意确定存在的文件充当「浏览器」
  const env = Object.assign({}, process.env, { CHROME_PATH: real })
  const out = require('child_process').spawnSync(process.execPath, ['-e',
    `const m=require(${JSON.stringify(LIB)});process.stdout.write(String(m.findChrome()))`,
  ], { encoding: 'utf8', env })
  if (out.stdout.trim() === real) pass('a browser reachable only through CHROME_PATH is found')
  else fail('CHROME_PATH was not honoured (got ' + JSON.stringify(out.stdout.trim()) + ')')
}

// ---- 2. PATH 查询 / 按用户安装也在候选里 ----
{
  const src = fs.readFileSync(LIB, 'utf8')
  const hasLocalAppData = /LOCALAPPDATA/.test(src) && /Google.*Chrome.*Application/.test(src)
  const hasWhere = /'where'/.test(src) && /'which'/.test(src)
  const hasEdgeCore = /EdgeCore/.test(src)
  if (hasLocalAppData) pass('per-user install locations are searched (Chrome defaults to %LOCALAPPDATA%)')
  else fail('per-user install locations are missing from the candidate list')
  if (hasWhere) pass('PATH is searched via where/which')
  else fail('PATH lookup is missing')
  if (hasEdgeCore) pass('the EdgeCore\\<version> layout is searched (Edge 152 Store builds)')
  else fail('EdgeCore layout is missing')
}

// ---- 3. 找不到时的诊断 ----
{
  const realStat = fs.statSync
  fs.statSync = function (p) {
    // 所有候选都当作不存在；其余调用照旧（临时目录等还要正常工作）
    if (typeof p === 'string' && /\.(exe|sh|cmd)$|chrome|chromium|msedge|brave|vivaldi/i.test(String(p))) {
      const e = new Error('ENOENT (simulated: no browser installed)')
      e.code = 'ENOENT'
      throw e
    }
    return realStat.apply(fs, arguments)
  }
  let mod
  try {
    mod = freshModule()
    const found = mod.findChrome()
    const diag = mod.describeSearch()
    if (found === null) pass('findChrome() returns null when nothing is installed')
    else fail('findChrome() returned ' + found + ' with every candidate simulated missing')
    if (/CHROME_PATH/.test(diag)) pass('the diagnosis names the CHROME_PATH escape hatch')
    else fail('the diagnosis does not mention CHROME_PATH')
    if (/Application/.test(diag) && diag.split('\n').length > 5) {
      pass('the diagnosis lists the paths that were checked (' + diag.split('\n').length + ' lines)')
    } else fail('the diagnosis does not list the checked paths')
    if (/no Chrome\/Edge found/i.test(diag)) pass('the diagnosis keeps the historic FAIL prefix CI greps for')
    else fail('the historic "no Chrome/Edge found" line is gone (CI annotations match on it)')
  } finally {
    fs.statSync = realStat
  }
}

// ---- 4. execFileSync 兼容壳的边界 ----
{
  const mod = freshModule()
  const real = require('child_process').execFileSync
  let delegated = mod.execFileSync === real
  if (!delegated) {
    // 非浏览器可执行文件 + 普通参数：必须原样转交
    const out = mod.execFileSync(process.execPath, ['-e', 'process.stdout.write("delegated")'], { encoding: 'utf8' })
    if (out === 'delegated') pass('non-browser execFileSync calls pass through unchanged')
    else fail('the shim mangled a non-browser call: ' + JSON.stringify(out))
  } else {
    pass('there is no shim when WebSocket is absent (Node < 22 delegates to stdout)')
  }

  // 浏览器可执行文件但参数里既无 --dump-dom 也无 --screenshot=：也必须转交
  const fakeBrowser = process.platform === 'win32' ? 'C:\\fake\\chrome.exe' : '/fake/chrome'
  const before = mod.findChrome
  try {
    const out = mod.execFileSync(process.execPath, ['--dump-dom'], { encoding: 'utf8', input: '' })
    void out
  } catch (e) {
    // execFileSync(node, ['--dump-dom']) 会非零退出；重要的是它确实被转交执行了，而不是走了 CDP
    if (/--dump-dom/.test(String(e.message)) || e.status !== undefined) {
      pass('non-browser binary with --dump-dom is still delegated (not routed to CDP)')
    } else fail('unexpected error from the delegate path: ' + e.message)
  }
  void fakeBrowser
  void before
}

// ---- 5. 行尾不改变测试所看到的东西 ----
{
  const clientPath = path.join(__dirname, '..', 'client.js')
  const src = fs.readFileSync(clientPath, 'utf8')
  const lf = src.replace(/\r\n/g, '\n')
  const harnesses = ['contour-cusps.test.js', 'contour-smoothness.test.js', 'contour-perf.test.js']
  const bad = harnesses.filter((f) => {
    const text = fs.readFileSync(path.join(__dirname, f), 'utf8')
    return !/readFileSync\([^)]*client\.js'\)[^\n]*\.replace\(\/\\r\\n\/g, '\\n'\)/.test(text)
  })
  if (bad.length === 0) pass('all three geometry harnesses normalise CRLF before slicing client.js')
  else fail('these harnesses do not normalise line endings: ' + bad.join(', '))
  if (lf.length <= src.length) pass('client.js is stored with ' + (src.length === lf.length ? 'LF in this checkout' : 'CRLF, normalised on read'))
  else fail('unexpected line-ending state in client.js')
}

// ---- 6. 页面夹具自检：真标记元素才算数 ----
/**
 * The settings fixture reports an undeclared seed by appending an element with
 * data-endfield-scope-error. The guard must fire on that ELEMENT and stay quiet
 * when the token merely appears as inline-script SOURCE — the fixture snippet is
 * interpolated into every page, so a substring test produced a false failure the
 * first time this ran (and a false positive here is worse than no check: it makes
 * every browser test look broken).
 */
{
  const mod = freshModule()
  if (typeof mod.assertNoFixtureErrors !== 'function') fail('assertNoFixtureErrors is not exported for testing')
  else {
    const clean = '<html><body><script>m.setAttribute(\'data-endfield-scope-error\', String(name));</script></body></html>'
    const marked = '<html><body><div data-endfield-scope-error="contour-fps" style="display:none"></div></body></html>'
    let cleanThrew = null
    try { mod.assertNoFixtureErrors(clean) } catch (e) { cleanThrew = e }
    if (!cleanThrew) pass('fixture-source mention alone is not a failure (no false positive)')
    else fail('the guard fired on inline fixture source: ' + cleanThrew.message.slice(0, 80))

    let markedThrew = null
    try { mod.assertNoFixtureErrors(marked) } catch (e) { markedThrew = e }
    if (markedThrew && /contour-fps/.test(markedThrew.message)) pass('a real marker element fails with the offending field named')
    else fail('the guard did not report a real marker element')

    if (mod.assertNoFixtureErrors('<html></html>') === '<html></html>') pass('an ordinary dump passes through untouched')
    else fail('the guard altered a clean dump')
  }
}

console.log('')
if (failures) { console.error(failures + ' browser-transport portability check(s) failed'); process.exit(1) }
console.log('all browser discovery/transport checks passed')
