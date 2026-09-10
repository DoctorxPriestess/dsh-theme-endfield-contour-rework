#!/usr/bin/env node
/**
 * fork-identity-check.js — fork 的「包身份」是否处处一致。
 *
 * 这个 fork 把包名从 `dsh-theme-endfield` 改成了 `dsh-theme-endfield-contour-rework`。
 * 改名不是一处编辑：同一个字符串同时是
 *
 *   1) npm 包名 / bundle 栈里的挂载行（cordis.patch.yml）
 *   2) client bundle 的 ModuleLoader module id
 *   3) host 的设置命名空间 `ctx.settings.register(NAMESPACE, ...)`
 *   4) client 侧每一个偏好键的前缀（`<namespace>-<field>`）
 *   5) 浏览器端 prefs 存储键（`<namespace>:prefs`）
 *   6) 测试夹具与 CI 脚本里对上面这些的断言
 *
 * 漏掉任何一处都是**静默故障**：挂载行名字不对 → 插件装上但不挂载；前缀不对 →
 * 设置写值被拒、开关看起来点了没反应。语法检查和像素测试都发现不了。所以这里
 * 按「同一份事实的多个投影」逐条比对，而不是只查字符串出现过。
 */
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const PKG = require(path.join(ROOT, 'package.json'))
const PLUGIN = PKG.name                                  // 唯一事实来源：package.json 的 name
const UPSTREAM_SLUG = 'ymh0000123/dsh-theme-endfield'    // 上游仓库（出处声明里保留）
const UPSTREAM_REPO = 'https://github.com/' + UPSTREAM_SLUG
const EXPECTED_ROW_ID = 'theme-endfield-contour-rework'
/* 本 fork 的仓库简写。它自己也以上游包名 `dsh-theme-endfield` 开头，所以扫描「旧包名
   残留」时必须先把它剥掉，否则每处安装命令都会被误报。仓库名与包名在本项目中相同，
   但规则不假设这一点——将来任一侧改名都不该让这里失效。 */
const REPO_URL = (PKG.repository && PKG.repository.url) || ''
const REPO_MATCH = REPO_URL.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
const REPO_SLUG = REPO_MATCH ? REPO_MATCH[1] + '/' + REPO_MATCH[2] : ''
/* 仓库名本身（不带 owner）也会出现在 README 标题与正文里，同样要剥掉。
   剥的是「仓库名」这个完整字符串，因此不会掩盖真正的旧设置键：
   例如旧键 `dsh-theme-endfield-contour-dir` 并不包含 `...-contour-rework`。 */
const REPO_NAME = REPO_MATCH ? REPO_MATCH[2] : ''
// 代码与配置：身份字符串是**功能性**的，裸旧名一律是漏改。
const CODE_EXT = /\.(js|yml)$/
// package.json 的 description / keywords 里写「Fork of dsh-theme-endfield」是正常
// 表述，所以 JSON 只查旧的命名空间键。
const JSON_EXT = /\.json$/
// 文档：作者会自然地写「本 fork 来自 dsh-theme-endfield」，这也不算漏改；但文档里
// 出现旧的**命名空间键**（`dsh-theme-endfield-<字段>` / `dsh-theme-endfield:prefs`）
// 就是读者照着配会失败的死链接，必须报。
const DOC_EXT = /\.md$/
const STALE_KEY = /dsh-theme-endfield(-[a-zA-Z]|:)/
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

const problems = []
const checked = []
const check = (label, cond, detail) => {
  checked.push({ label, ok: !!cond })
  if (!cond) problems.push(label + (detail ? ` -> ${detail}` : ''))
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

// ---------------------------------------------------------------------------
// 1) 旧包名不得以**功能性**形式残留。
//    功能性 = 会真的被当作标识使用的字符串（包名、模块 id、命名空间、键前缀、路径）。
//    非功能性 = 出处声明里提到上游叫什么。两者的区分按行做：
//      - 代码/配置的**代码行**：任何裸旧名都算漏改；
//      - **注释行**（// 、/* 、* 、<!--）与 JSON/Markdown：只有当它形如命名空间键
//        （`dsh-theme-endfield-<字段>` / `dsh-theme-endfield:prefs`）时才报——那才是
//        读者照着配会失败的死链接，而「Fork 自 dsh-theme-endfield」是正常写法。
//    本脚本因为要在注释里讨论旧名而自我排除——唯一的例外。
// ---------------------------------------------------------------------------
const leftovers = []
const staleDocKeys = []
const seenFiles = []
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|<!--)/
/* 逐行豁免标记。有一些上游名是**合法**的：迁移工具默认读取上游命名空间、夹具里要放一段
   上游的 settings.yaml、变更日志要写明改名前叫什么。与其整文件放行（那会同时放过该文件里
   真正的漏改），不如让每一处豁免都是一个显式、可审的行内标记——和 lint 的 disable 注释同理。
   标记必须与该行同时出现，且只影响这一行。 */
const ALLOW_UPSTREAM = /identity-check:\s*allow-upstream/
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (p === __filename) continue
    const isCode = CODE_EXT.test(e.name)
    const isCompat = JSON_EXT.test(e.name) || DOC_EXT.test(e.name)
    if (!isCode && !isCompat) continue
    seenFiles.push(rel(p))
    read(rel(p)).split('\n').forEach((line, i) => {
      if (ALLOW_UPSTREAM.test(line)) return
      const stripped = line.split(PLUGIN).join('')
        .split(UPSTREAM_SLUG).join('')
        .split(REPO_SLUG).join('')
        .split(REPO_NAME).join('')
      const at = `${rel(p)}:${i + 1}: ${line.trim().slice(0, 100)}`
      const inComment = COMMENT_LINE.test(line)
      if (isCode && !inComment && stripped.includes('dsh-theme-endfield')) leftovers.push(at)
      else if (STALE_KEY.test(stripped)) staleDocKeys.push(at)
    })
  }
}
walk(ROOT)
check('代码与配置的代码行里没有残留旧的裸包名', leftovers.length === 0, leftovers.slice(0, 3).join(' | ') + (leftovers.length > 3 ? ` (+${leftovers.length - 3})` : ''))
check('注释与文档里没有残留旧的命名空间键', staleDocKeys.length === 0, staleDocKeys.slice(0, 3).join(' | ') + (staleDocKeys.length > 3 ? ` (+${staleDocKeys.length - 3})` : ''))

// ---------------------------------------------------------------------------
// 1b) 署名合规（正向断言）：LICENSE 必须原样保留上游 MIT 版权行，README 与
//     NOTICE 必须写明上游出处。fork 的法定义务，值得一条测试盯着。
// ---------------------------------------------------------------------------
const license = read('LICENSE')
check('LICENSE 保留上游 MIT 版权行', license.includes('MIT License') && license.includes('Copyright (c) 2026 ymh0000123'))
const readme = read('README.md')
check('README 写明上游仓库地址', readme.includes(UPSTREAM_REPO))
check('README 写明上游版权归属', /Copyright \(c\)[^\n]*ymh0000123/.test(readme))
const notice = fs.existsSync(path.join(ROOT, 'NOTICE.md')) ? read('NOTICE.md') : ''
check('NOTICE.md 存在且写明上游仓库与版权', notice.includes(UPSTREAM_REPO) && /Copyright \(c\)[^\n]*ymh0000123/.test(notice))

// ---------------------------------------------------------------------------
// 1c) 安装命令的一致性与「二次替换」防护。
//     `add` 用的是**仓库**，`rm` 用的是**包名**。本 fork 里两者同名
//     （仓库 dsh-theme-endfield-contour-rework，包 dsh-theme-endfield-contour-rework），
//     但规则不依赖这一点：它从 package.json 的 repository 反推 owner/repo，再要求每处
//     `add` 与之逐字相等、每处 `rm` 等于包名——把两者搞混会让用户装不上或卸不掉，
//     而「同名」只是当下的取值，不是这两条命令的语义。
//
//     二次替换的保险是被真实事故加上的：改名脚本先替换了上游 `github:` 简写、又替换了一次
//     裸包名，于是三处安装命令都变成了 `...-ai-contour-fork-ai-contour-fork`；当时的检查只做
//     子串包含，看不出来。
// ---------------------------------------------------------------------------
const repoUrl = REPO_URL
const slugMatch = REPO_MATCH
if (!slugMatch) {
  check('package.json 里有可解析的 GitHub repository', false, repoUrl || '(缺失)')
} else {
  const [, owner, repo] = slugMatch
  const EXPECTED_SLUG = `github:${owner}/${repo}`
  const hintFiles = ['cordis.patch.yml', 'index.js', 'client.js']
  const hints = []
  for (const f of hintFiles) for (const m of read(f).matchAll(/github:([^\s`'")\]]+)/g)) hints.push(`${f}: github:${m[1]}`)
  const wrong = hints.filter((h) => !h.endsWith(EXPECTED_SLUG))
  check(`代码与配置里的安装命令与 repository 一致（${EXPECTED_SLUG}）`, hints.length > 0 && wrong.length === 0, wrong.join(' | ') || '未找到安装命令')
  // README 是用户实际照抄的地方，两行都要对：add 取仓库，rm 取包名。
  for (const f of ['README.md', 'README.zh-CN.md']) {
    const t = read(f)
    const add = t.match(/dsh plugin --profile web add (\S+)/)
    const rm = t.match(/dsh plugin --profile web rm (\S+)/)
    check(`${f} 的 add 命令指向 repository`, !!add && add[1] === EXPECTED_SLUG, add ? add[1] : '未找到')
    check(`${f} 的 rm 命令使用包名`, !!rm && rm[1] === PLUGIN, rm ? rm[1] : '未找到')
  }
  const doubled = []
  for (const f of seenFiles) {
    read(f).split('\n').forEach((l, i) => {
      if (l.includes(PLUGIN + '-ai-contour-fork') || l.includes(PLUGIN + '-' + PLUGIN)) doubled.push(`${f}:${i + 1}`)
    })
  }
  check('没有二次替换出的重复包名', doubled.length === 0, doubled.join(', '))
}

// ---------------------------------------------------------------------------
// 2) 挂载入口：cordis.patch.yml 的行名必须等于包名，否则 `dsh plugin add` 之后
//    插件会静默地装上但不挂载。
// ---------------------------------------------------------------------------
const patchSrc = read('cordis.patch.yml')
const rowName = patchSrc.match(/^\s*name: '([^']+)'/m)
const rowId = patchSrc.match(/^\s*- id: (\S+)/m)
check('cordis.patch.yml 的 name 等于包名', rowName && rowName[1] === PLUGIN, rowName && rowName[1])
check('cordis.patch.yml 的 id 已随 fork 改名', rowId && rowId[1] === EXPECTED_ROW_ID, rowId && rowId[1])

// ---------------------------------------------------------------------------
// 3) host 半：NAME / NAMESPACE。
// ---------------------------------------------------------------------------
const indexSrc = read('index.js')
const hostName = indexSrc.match(/const NAME = '([^']+)'/)
const hostNs = indexSrc.match(/const NAMESPACE = '([^']+)'/)
check('index.js 的 NAME 等于包名', hostName && hostName[1] === PLUGIN, hostName && hostName[1])
check('index.js 的 NAMESPACE 等于包名', hostNs && hostNs[1] === PLUGIN, hostNs && hostNs[1])

// ---------------------------------------------------------------------------
// 4) client 半：module id，以及所有以命名空间开头的键。
// ---------------------------------------------------------------------------
const clientSrc = read('client.js')
const modId = clientSrc.match(/__ModuleLoader__\.load\(\{\s*\n\s*id: "([^"]+)"/)
check('client.js 的 ModuleLoader id 等于包名', modId && modId[1] === PLUGIN, modId && modId[1])
const clientKeys = [...new Set(clientSrc.match(new RegExp(PLUGIN + '[a-zA-Z:-]*', 'g')) || [])]
const strayKeys = clientKeys.filter((k) => k !== PLUGIN && !k.startsWith(PLUGIN + '-') && !k.startsWith(PLUGIN + ':'))
check('client 侧所有命名空间键都是 <包名>-<字段> 或 <包名>:prefs 形式', strayKeys.length === 0, strayKeys.join(', '))

// ---------------------------------------------------------------------------
// 5) host schema 的字段必须覆盖 client 用到的每一个键尾巴。
//    这是改名真正会咬人的地方：前缀对了、字段名对不上，写值照样被拒。
//
//    client 侧的键现在从 PREFS_NS 派生（单一真源），所以尾巴有两个来源，两个都要读：
//      - `PREFS_NS + '-<suffix>'` 表达式：每个 *_KEY 常量的定义；
//      - 映射表 `const raw = ['<suffix>', ...].map(...)` 里的后缀数组。
//    另外明确断言 client 里**不再有**硬编码的完整键字面量——那正是「改名只做一半」
//    会留下 14 处需要手工同步的地方。
// ---------------------------------------------------------------------------
const hostFields = [...indexSrc.matchAll(/^\s{2}([a-zA-Z]+):\s*'/gm)].map((m) => m[1])
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
const known = new Set(hostFields.map(kebab))

const exprTails = [...new Set([...clientSrc.matchAll(/PREFS_NS \+ '-([a-zA-Z-]+)'/g)].map((m) => m[1]))]
const rawArray = clientSrc.match(/const raw = \[([\s\S]*?)\]\s*\.map\(/)
const rawTails = rawArray
  ? [...new Set([...rawArray[1].matchAll(/'([a-zA-Z-]+)'/g)].map((m) => m[1]))]
  : []
const literalTails = [...new Set(
  (clientSrc.match(new RegExp("'" + PLUGIN + "-([a-zA-Z-]+)'", 'g')) || []).map((s) => s.slice(1, -1).replace(PLUGIN + '-', '')),
)]
const clientTails = [...new Set([...exprTails, ...rawTails])]

// 抽取形状变了就必须报错，否则下面两条规则会在「读到空集合」时静默通过。
check('能从 client 侧抽到键尾巴（抽取形状未变）', clientTails.length > 0,
  'expr=' + exprTails.length + ' raw=' + rawTails.length + ' (检查器的抽取规则需要跟着 client 的写法更新)')
const uncovered = clientTails.filter((t) => !known.has(t))
check('client 用到的每个键都在 host schema 里有字段', uncovered.length === 0, uncovered.join(', '))
check('client 不硬编码完整键字面量（键从 PREFS_NS 派生）', literalTails.length === 0,
  literalTails.slice(0, 5).join(', '))

// ---------------------------------------------------------------------------
// 6) 其余投影：CI 的 patch 校验脚本、设置夹具、以及 —— 反向 —— 引用检查，
//    host 声明的字段也不能是「没人读」的死字段（改名时容易连带漏掉 client 侧）。
// ---------------------------------------------------------------------------
const ciPlugin = read('.github/scripts/check-patch-yml.js').match(/const PLUGIN = '([^']+)'/)
check('CI 的 check-patch-yml.js 使用同一个包名', ciPlugin && ciPlugin[1] === PLUGIN, ciPlugin && ciPlugin[1])
check('设置夹具使用同一个命名空间', read('test/fixtures/settings-scope.js').includes(PLUGIN))
const unused = hostFields.filter((f) => !clientTails.includes(kebab(f)))
check('host schema 里没有 client 从不读的字段', unused.length === 0, unused.join(', '))

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------
for (const c of checked) console.log((c.ok ? 'ok    ' : 'FAIL  ') + c.label)
for (const p of problems) console.log(`::error file=package.json,line=1,title=fork 身份不一致::${esc(p)}`)

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
  const out = ['## fork 身份一致性', '']
  out.push(problems.length === 0
    ? `✅ ${checked.length} 项投影全部一致（包名 \`${PLUGIN}\`，${hostFields.length} 个设置字段）。`
    : `❌ ${problems.length} 项不一致。`)
  out.push('', '| 检查 | 结果 |', '| --- | --- |')
  for (const c of checked) out.push(`| ${c.label} | ${c.ok ? '✅' : '❌'} |`)
  fs.appendFileSync(summary, out.join('\n') + '\n')
}

if (problems.length > 0) {
  console.error(`\n${problems.length} 项身份不一致`)
  process.exit(1)
}
console.log(`\nok  ${checked.length} 项投影一致：包名 ${PLUGIN}，${hostFields.length} 个设置字段`)
