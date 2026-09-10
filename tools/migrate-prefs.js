#!/usr/bin/env node
/**
 * tools/migrate-prefs.js — 把一个主题设置段迁移到另一个命名空间，并把历史的
 * 连字符字段名转成 schema 的驼峰字段名。
 *
 * 为什么需要它：
 *   - 本 fork 的设置命名空间等于包名，包名改过一次
 *     （`dsh-theme-endfield-ai-contour-fork` → `dsh-theme-endfield-contour-rework`），  // identity-check: allow-upstream
 *     改名后旧段不会再被读取；
 *   - 从上游 `dsh-theme-endfield` 换用本 fork 时，命名空间同样不同；
 *   - 修复「连字符键永远存不住」之前，插件把连字符名写进了文件（`contour-speed`），
 *     那些值从来读不回来，但确实躺在文件里。`--kebab` 可以把它们转成 `contourSpeed`。
 *
 * 安全性：
 *   - **默认 dry-run**，只打印将要写入的段；`--write` 才落盘；
 *   - 落盘前先在同目录写一份带时间戳的备份（`settings.yaml.bak-<ts>`）；
 *   - 纯文本插入/替换，**不重新序列化整个 YAML**，所以其它段、注释、锚点都逐字保留；
 *   - 只迁移当前 schema 声明过的字段，其余列出来但不写（避免把死键带进新命名空间）；
 *   - 目标段已存在时拒绝写入（除非 `--force`）。
 *
 * 用法：
 *   node tools/migrate-prefs.js                                   # dry-run，上游段 -> 本包命名空间
 *   node tools/migrate-prefs.js --kebab --write                   # 连字符键一并转换并落盘
 *   node tools/migrate-prefs.js --from dsh-theme-endfield-ai-contour-fork --write  // identity-check: allow-upstream
 *   node tools/migrate-prefs.js --settings C:\path\to\settings.yaml --write
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const pkg = require(path.join(ROOT, 'package.json'))
const plugin = require(path.join(ROOT, 'index.js'))

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, dflt) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}

const TARGET_NS = val('--to', plugin.NAMESPACE || pkg.name)
const SOURCE_NS = val('--from', 'dsh-theme-endfield')  // identity-check: allow-upstream
const SETTINGS = val('--settings', path.join(os.homedir(), '.dsh', 'settings.yaml'))
const CONVERT_KEBAB = has('--kebab')
const WRITE = has('--write')
const FORCE = has('--force')

const FIELDS = Object.keys(plugin.FIELD_DEFAULTS || {})
const kebabToCamel = (s) => String(s).replace(/-([a-z])/g, (_, c) => c.toUpperCase())

/** 取出一个顶层段的行范围（含该段标题行），找不到返回 null。 */
function sectionRange(lines, ns) {
  const head = new RegExp('^' + ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*$')
  const start = lines.findIndex((l) => head.test(l))
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end++
  // 结尾的空行不属于该段
  while (end > start + 1 && lines[end - 1].trim() === '') end--
  return { start, end }
}

/** 解析段内的 `key: value`，返回 [{key, raw}]（保持出现顺序）。 */
function sectionPairs(lines, range) {
  const out = []
  for (let i = range.start + 1; i < range.end; i++) {
    const m = lines[i].match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    let raw = m[2].trim()
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1)
    out.push({ key: m[1], raw })
  }
  return out
}

const quote = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

function main() {
  if (!fs.existsSync(SETTINGS)) {
    console.log('settings file not found: ' + SETTINGS)
    console.log('(pass --settings <path>, or create it by changing any setting in DSH first)')
    process.exit(1)
  }
  const text = fs.readFileSync(SETTINGS, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const src = sectionRange(lines, SOURCE_NS)
  if (!src) {
    console.log('section "' + SOURCE_NS + '" not found in ' + SETTINGS + ' — nothing to migrate')
    process.exit(0)
  }
  const pairs = sectionPairs(lines, src)
  console.log('source section: ' + SOURCE_NS + ' (' + pairs.length + ' key(s), lines ' + (src.start + 1) + '-' + src.end + ')')

  const kept = []
  const dropped = []
  const seen = new Set()
  for (const p of pairs) {
    const field = CONVERT_KEBAB ? kebabToCamel(p.key) : p.key
    if (!FIELDS.includes(field)) { dropped.push(p.key + (field !== p.key ? ' -> ' + field : '')); continue }
    if (seen.has(field)) continue
    seen.add(field)
    kept.push({ field, raw: p.raw })
  }
  if (!kept.length) {
    console.log('no migratable key: every key is either a field of the target schema or a duplicate')
    if (dropped.length) console.log('  skipped (not a declared field): ' + dropped.join(', '))
    process.exit(0)
  }
  console.log('will write section: ' + TARGET_NS + ' (' + kept.length + ' field(s))')
  for (const k of kept) console.log('  ' + k.field + ': ' + quote(k.raw))
  if (dropped.length) console.log('  skipped (not a declared field): ' + dropped.join(', '))

  const existing = sectionRange(lines, TARGET_NS)
  if (existing && !FORCE) {
    console.log('\nsection "' + TARGET_NS + '" already exists (lines ' + (existing.start + 1) + '-' + existing.end + ').')
    console.log('Refusing to touch it: pass --force to replace it with the migrated values.')
    process.exit(2)
  }

  const block = [TARGET_NS + ':'].concat(kept.map((k) => '  ' + k.field + ': ' + quote(k.raw)))
  let out
  if (existing) {
    out = lines.slice(0, existing.start).concat(block, lines.slice(existing.end))
    console.log('\n(replacing existing target section at lines ' + (existing.start + 1) + '-' + existing.end + ')')
  } else {
    // 插到源段之后，其余内容逐字保留
    out = lines.slice(0, src.end).concat([''], block, lines.slice(src.end))
    console.log('\n(inserting the target section after the source section)')
  }
  void eol

  if (!WRITE) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to apply.')
    return
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = SETTINGS + '.bak-' + stamp
  fs.copyFileSync(SETTINGS, backup)
  fs.writeFileSync(SETTINGS, out.join(eol), 'utf8')
  console.log('\nbackup: ' + backup)
  console.log('wrote:  ' + SETTINGS)
  console.log('Restart or reload the DSH profile, then open the theme settings: the migrated values should be in effect.')
}

main()
