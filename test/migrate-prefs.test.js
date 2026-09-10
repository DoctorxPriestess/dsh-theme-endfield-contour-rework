/**
 * migrate-prefs.test.js — pin tools/migrate-prefs.js.
 *
 * The tool edits a user's real `settings.yaml` while they are switching package names or
 * coming from upstream, so its promises are asserted rather than assumed:
 *
 *   1. dry-run writes NOTHING (the default has to be safe);
 *   2. --write copies the section under the target namespace, converts the historic
 *      kebab keys only when asked, drops fields the current schema does not declare, and
 *      leaves every other byte of the file — other sections, comments, ordering — intact;
 *   3. a timestamped backup exists before the file is replaced;
 *   4. an existing target section is refused without --force (never silently clobbered);
 *   5. a missing source section is a clear message, not a crash.
 *
 * No DSH and no browser: the tool is a text transformer plus the plugin's own field list.
 *
 * Usage: node test/migrate-prefs.test.js
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TOOL = path.join(ROOT, 'tools', 'migrate-prefs.js')
const plugin = require(path.join(ROOT, 'index.js'))

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }

const FIXTURE = [
  '# DSH settings — hand-written comments must survive',
  'language: zh',
  'dsh-theme-endfield:',  // identity-check: allow-upstream
  '  radius: round',
  '  palette: wuling',
  '  contour: "1"',
  '  contour-speed: "0"',        // pre-fix kebab key (never readable, still on disk)
  '  contour-scroll-pause: "0"',
  '  thunder-anim: "1"',
  '  something-unknown: "9"',    // not a declared field
  '',
  'other-plugin:',
  '  keep: me',
  '',
].join('\n')

function run(args, settings) {
  return spawnSync(process.execPath, [TOOL, '--settings', settings].concat(args), { encoding: 'utf8' })
}

function makeFixture(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-' + label + '-'))
  const file = path.join(dir, 'settings.yaml')
  fs.writeFileSync(file, FIXTURE, 'utf8')
  return { dir, file }
}

// ---- 1. dry-run 不落盘 ----
{
  const { dir, file } = makeFixture('dry')
  const before = fs.readFileSync(file, 'utf8')
  const r = run([], file)
  const after = fs.readFileSync(file, 'utf8')
  if (r.status === 0 && after === before) pass('dry-run leaves the file byte-identical')
  else fail('dry-run changed the file (status ' + r.status + ')')
  if (/will write section: /.test(r.stdout)) pass('dry-run prints the section it would write')
  else fail('dry-run printed no plan: ' + r.stdout.slice(0, 120))
  if (/something-unknown/.test(r.stdout)) pass('dry-run names the keys it will skip')
  else fail('dry-run did not report the undeclared key')
  const backups = fs.readdirSync(dir).filter((f) => f.includes('.bak-'))
  if (!backups.length) pass('dry-run creates no backup (nothing was written)')
  else fail('dry-run created a backup: ' + backups.join(', '))
  fs.rmSync(dir, { recursive: true, force: true })
}

// ---- 2. --write：复制到目标命名空间，其余逐字保留 ----
{
  const { dir, file } = makeFixture('write')
  const r = run(['--write'], file)
  const text = fs.readFileSync(file, 'utf8')
  if (r.status === 0) pass('--write exits 0')
  else fail('--write exited ' + r.status + ': ' + r.stderr.slice(0, 160))

  const target = plugin.NAMESPACE || require(path.join(ROOT, 'package.json')).name
  if (new RegExp('^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':$', 'm').test(text)) {
    pass('target section written: ' + target)
  } else fail('target section missing from the file')

  // 源段、其它段、注释、顺序都要原样在
  const preserved = ['# DSH settings — hand-written comments must survive', 'language: zh', 'other-plugin:', '  keep: me', 'dsh-theme-endfield:']  // identity-check: allow-upstream
  const missing = preserved.filter((s) => !text.includes(s))
  if (!missing.length) pass('comments, unrelated sections and the source section are untouched')
  else fail('these lines disappeared: ' + missing.join(' | '))

  // 未声明的键不能进入目标段
  const targetBlock = text.slice(text.indexOf(target + ':'))
  const targetKeys = [...targetBlock.matchAll(/^\s+([A-Za-z0-9_-]+):/gm)].map((m) => m[1])
  if (!targetKeys.includes('something-unknown')) pass('undeclared fields are not carried over')
  else fail('undeclared field leaked into the target section')

  // 不加 --kebab 时键名原样保留（此时它们不是声明字段，应当被跳过并明确报告）
  if (!targetKeys.includes('contour-speed')) pass('pre-fix kebab keys are skipped without --kebab (they are not declared fields)')
  else fail('kebab key was carried over without --kebab')

  const declared = targetKeys.filter((k) => Object.prototype.hasOwnProperty.call(plugin.FIELD_DEFAULTS, k))
  if (declared.length >= 3) pass('declared fields carried over: ' + declared.join(', '))
  else fail('too few declared fields carried over: ' + declared.join(', '))

  const backups = fs.readdirSync(dir).filter((f) => f.includes('.bak-'))
  if (backups.length === 1) pass('exactly one timestamped backup: ' + backups[0])
  else fail('expected one backup, found ' + backups.length)
  fs.rmSync(dir, { recursive: true, force: true })
}

// ---- 3. --kebab：历史连字符键转成 schema 字段 ----
{
  const { dir, file } = makeFixture('kebab')
  const r = run(['--kebab', '--write'], file)
  const text = fs.readFileSync(file, 'utf8')
  const target = plugin.NAMESPACE || require(path.join(ROOT, 'package.json')).name
  const block = text.slice(text.indexOf(target + ':'))
  if (r.status === 0 && /^\s+contourSpeed: "0"$/m.test(block)) pass('--kebab converts contour-speed -> contourSpeed: "0"')
  else fail('--kebab did not convert the key (' + block.split('\n').slice(0, 8).join(' / ') + ')')
  if (/^\s+contourScrollPause: "0"$/m.test(block) && /^\s+thunderAnim: "1"$/m.test(block)) {
    pass('the other two pre-fix kebab keys convert too')
  } else fail('some kebab keys were not converted')
  if (/^\s+radius: "round"$/m.test(block) && /^\s+palette: "wuling"$/m.test(block)) {
    pass('string values keep their exact contents (quoted, so the schema still sees strings)')
  } else fail('values were altered or unquoted')
  fs.rmSync(dir, { recursive: true, force: true })
}

// ---- 4. 目标段已存在：默认拒绝，--force 才覆盖 ----
{
  const { dir, file } = makeFixture('existing')
  const target = plugin.NAMESPACE || require(path.join(ROOT, 'package.json')).name
  fs.appendFileSync(file, '\n' + target + ':\n  radius: "square"\n', 'utf8')
  const before = fs.readFileSync(file, 'utf8')
  const r1 = run(['--write'], file)
  if (r1.status === 2 && fs.readFileSync(file, 'utf8') === before) {
    pass('an existing target section is refused (exit 2) and the file is untouched')
  } else fail('existing target section handling is wrong (exit ' + r1.status + ')')

  const r2 = run(['--write', '--force'], file)
  const text = fs.readFileSync(file, 'utf8')
  const blocks = text.split(target + ':').length - 1
  if (r2.status === 0 && blocks === 1 && /^\s+radius: "round"$/m.test(text.slice(text.indexOf(target + ':')))) {
    pass('--force replaces the target section in place (no duplicate section)')
  } else fail('--force did not replace cleanly (sections=' + blocks + ')')
  fs.rmSync(dir, { recursive: true, force: true })
}

// ---- 5. 缺源段 / 缺文件：清晰信息，不崩 ----
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-missing-'))
  const file = path.join(dir, 'settings.yaml')
  fs.writeFileSync(file, 'language: zh\n', 'utf8')
  const r = run([], file)
  if (r.status === 0 && /nothing to migrate/.test(r.stdout)) pass('a missing source section is reported, not fatal')
  else fail('missing source section handling wrong (status ' + r.status + ')')
  const missing = run([], path.join(dir, 'nope.yaml'))
  if (missing.status === 1 && /not found/.test(missing.stdout + missing.stderr)) pass('a missing settings file is reported, not fatal')
  else fail('missing settings file handling wrong (status ' + missing.status + ')')
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('')
if (failures) { console.error(failures + ' migrate-prefs check(s) failed'); process.exit(1) }
console.log('all migrate-prefs checks passed')
