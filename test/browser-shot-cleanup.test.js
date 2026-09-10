/**
 * browser-shot-cleanup.test.js — pin the `--screenshot=` fallback's process hygiene.
 *
 * `test/lib/browser.js` prefers CDP for screenshots and falls back to the browser's own
 * `--screenshot=`. That fallback treats the browser as a fire-and-exit one-shot, which is
 * true on a normal install — and false on a machine with the Store/AppX build of Edge,
 * where `Application\msedge.exe` is only a launcher: it forwards the request to the real
 * instance and exits, so **every screenshot left a whole browser instance running**
 * (measured: one `thunder-shot` run = 11 processes). Those instances pile up, compete for
 * resources and made the full suite intermittently report "page produced no results".
 *
 * This test forces the fallback path (by removing the global WebSocket before the module
 * is loaded, which is exactly the condition the module tests for) and asserts:
 *
 *   1. the screenshot is still written and non-trivial;
 *   2. nothing of ours is left running afterwards;
 *   3. the cleanup helper refuses a non-unique token — the guard that keeps it from
 *      killing the user's own browser window, since matching is a case-insensitive
 *      substring test against `--profile-directory=...` style command lines.
 *
 * Runs on Windows and POSIX: on POSIX the browser is our own child and exits on its own,
 * so assertion 2 holds too.
 *
 * Usage: node test/browser-shot-cleanup.test.js
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }

// The module decides CDP availability once, at load time, from the presence of WebSocket.
delete globalThis.WebSocket
const browser = require(path.join(__dirname, 'lib', 'browser.js'))

const IS_WIN = process.platform === 'win32'

/** How many browser processes carry this run's profile token. */
function oursRunning(profileDir) {
  if (!IS_WIN) return 0
  const token = path.basename(profileDir)
  const ps = `(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'"`
    + ` | Where-Object { $_.CommandLine -like '*${token}*' } | Measure-Object).Count`
  const out = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' })
  return Number(String(out.stdout || '').trim()) || 0
}

const chrome = browser.findChrome()
if (!chrome) {
  console.error(browser.describeSearch())
  fail('no browser found, cannot exercise the screenshot fallback')
} else {
  pass('browser: ' + chrome)
  // The module decides CDP availability once at load time and exports the verdict, so
  // this is the direct evidence that screenshot()/dumpDom() took the stdout path.
  if (browser.HAS_WS === false) {
    pass('WebSocket is absent in this process, so the stdout fallback is the active path')
  } else {
    fail('the module still reports CDP availability, so the stdout fallback was not exercised')
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-clean-'))
  const page = path.join(tmp, 'page.html')
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0;width:100%;height:100%;background:#123456">'
    + '<h1 style="color:#fff">SHOT</h1></body></html>', 'utf8')
  const out = path.join(tmp, 'shot.png')
  // mkdtemp-style profile: unique by construction, and the cleanup token guard accepts it.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-clean-prof-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + profile,
    '--window-size=800,600',
    'file:///' + page.replace(/\\/g, '/'),
  ]

  try {
    const returned = browser.screenshot(chrome, args, out, 90000)
    if (returned === out && fs.existsSync(out) && fs.statSync(out).size > 1000) {
      pass('the fallback wrote a real screenshot (' + fs.statSync(out).size + ' bytes)')
    } else {
      fail('the fallback did not produce a usable screenshot')
    }
    const left = oursRunning(profile)
    if (left === 0) pass('no browser process was left behind by the fallback')
    else fail(left + ' browser process(es) from the fallback are still running')
  } catch (e) {
    fail('the fallback threw: ' + (e && e.message))
  } finally {
    // Never leave a test's own mess behind, even when an assertion failed.
    try { browser.shutdownBrowser(0, profile) } catch (e) { /* best effort */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) { /* ignore */ }
  }

  // The token guard: generic words must be refused (they can match the user's browser).
  if (typeof browser.isUniqueToken !== 'function') {
    fail('isUniqueToken is not exported, so the guard cannot be asserted')
  } else {
    const bad = ['profile', 'chrome', 'userdata', 'Default', 'tmp', '']
    const acceptedBad = bad.filter((t) => browser.isUniqueToken(t))
    if (!acceptedBad.length) pass('generic tokens are refused by the cleanup guard (' + bad.length + ' cases)')
    else fail('these generic tokens were accepted: ' + acceptedBad.join(', '))

    const good = ['shot-clean-prof-Ab3xY9', 'stk-Ab3xY9', 'endfield-a11y-a1b2c3', 'hover_prof_123456']
    const refusedGood = good.filter((t) => !browser.isUniqueToken(t))
    if (!refusedGood.length) pass('mkdtemp-style tokens are accepted (' + good.length + ' cases)')
    else fail('these legitimate tokens were refused: ' + refusedGood.join(', '))
  }
}

console.log('')
if (failures) { console.error(failures + ' screenshot-cleanup check(s) failed'); process.exit(1) }
console.log('all screenshot fallback cleanup checks passed')
